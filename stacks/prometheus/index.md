## Authentication
```bash
htpasswd -n swarm | docker secret create hostmetrics_auth -
```

Do not use echo.
```bash
printf password | docker secret create hostmetrics_pswd -
```

## Config
```bash
cat << EOL | docker config create --template-driver golang prometheus -
scrape_configs:

  # Swarm nodes and prometheus
  # https://github.com/swarmlibs/promstack/blob/main/prometheus/prometheus/scrape-configs/dockerswarm-nodes.yaml
  
  # Prometheus scrapes itself
  - job_name: prometheus
    static_configs:
      - targets: ["127.0.0.1:9090"]
        labels:
          dockerswarm_service_id: '{{ .Service.ID }}'
          dockerswarm_service_name: '{{ .Service.Name }}'
          dockerswarm_node_id: '{{ .Node.ID }}'
          dockerswarm_node_hostname: '{{ .Node.Hostname }}'
          dockerswarm_task_id: '{{ .Task.ID }}'
          dockerswarm_task_name: '{{ .Task.Name }}'
          dockerswarm_task_slot: '{{ .Task.Slot }}'
          dockerswarm_stack_namespace: '{{ index .Service.Labels "com.docker.stack.namespace" }}'
  
  # Create a job for Docker daemons.
  # https://prometheus.io/docs/guides/dockerswarm/#adding-a-docker_node-label-to-the-targets
  - job_name: 'dockerd'
    scheme: https
    basic_auth:
      username: 'swarm'
      password: '{{ secrets "hostmetrics_pswd" }}'
    dockerswarm_sd_configs:
      - host: tcp://socket:2375
        role: nodes
    relabel_configs:
      # Fetch metrics on port 9323.
      - source_labels: [__meta_dockerswarm_node_address]
        target_label: __address__
        replacement: "{$1}:9323"
      # Set hostname as instance label
      - source_labels: [__meta_dockerswarm_node_hostname]
        target_label: instance

        
  # Tasks
  # https://github.com/sam-mosleh/swarm-monitoring/blob/master/prometheus/conf/prometheus.yml
        
  # Global tasks
  - job_name: 'dockerswarm'
    dockerswarm_sd_configs:
      - host: tcp://socket:2375
        role: tasks
        
    relabel_configs:
      # Labels to enable/disable metrics
      # From https://github.com/swarmlibs/promstack/raw/4f6b8dbd04e63963171fe67e73a73042be553725/prometheus/prometheus/scrape-configs/dockerswarm-services-endpoints-ingress.yaml
      # prometheus.enabled=<true|false>
      - source_labels: [__meta_dockerswarm_service_label_prometheus_enabled]
        regex: 'false'
        action: drop
      # prometheus.disabled=<true|false>
      - source_labels: [__meta_dockerswarm_service_label_prometheus_disabled]
        regex: 'true'
        action: drop

      # Only keep containers with service mode global.
      - source_labels: [__meta_dockerswarm_service_mode]
        regex: global
        action: keep
      # Only keep containers that should be running.
      - source_labels: [__meta_dockerswarm_task_desired_state]
        regex: running
        action: keep
      # Use Swarm service name as Prometheus job label.
      - source_labels: [__meta_dockerswarm_service_name]
        target_label: job
      # Save swarm stack name
      - source_labels: [__meta_dockerswarm_service_label_com_docker_stack_namespace]
        target_label: stack
      # Set hostname as instance label
      - source_labels: [__meta_dockerswarm_node_hostname]
        target_label: instance
      # Default (prometheus.port label) should be 80
      - source_labels: [__meta_dockerswarm_service_label_prometheus_port]
        target_label: __meta_dockerswarm_service_label_prometheus_port
        regex: '()'
        replacement: '80'
      # Extract container ip from address
      - source_labels: [__address__]
        regex: '([^:]+):\d+'
        target_label: __container_ip
      # Set address to container ip:(prometheus.port label)
      - source_labels: [__container_ip, __meta_dockerswarm_service_label_prometheus_port]
        target_label: __address__
        regex: '(.+);(.+)'
        replacement: "${1}:${2}"
      # Default (prometheus.path label) should be /metrics
      - source_labels: [__meta_dockerswarm_service_label_prometheus_path]
        target_label: __meta_dockerswarm_service_label_prometheus_path
        regex: '()'
        replacement: '/metrics'
      - source_labels: [__meta_dockerswarm_service_label_prometheus_path]
        target_label: __metrics_path__
        
        
remote_write:
  - url: "http://m3db.internal:7201/api/v1/prom/remote/write"
EOL
```

## Compose
```bash
cat << EOL | docker stack deploy -c - prometheus --detach=true
version: '3.9'

services:
  socket:
    image: alpine/socat
    command: "-dd TCP-L:2375,fork UNIX:/var/run/docker.sock"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - internal
    deploy:
      mode: global
      placement:
        constraints:
          - "node.role == manager"
          
  hostsecure:
    image: nginx
    secrets:
      - hostmetrics_auth
    networks:
      - public
    environment:
      LISTEN_PORT: 9329
      SSL_CERT_PATH: /opt/certs/live/corya.enterprises/fullchain.pem
      SSL_KEY_PATH: /opt/certs/live/corya.enterprises/privkey.pem
      TARGET: "http://127.0.0.1:19329"
      AUTH_BASIC_REALM: Enterprises
      AUTH_BASIC_USER_FILE: /run/secrets/hostmetrics_auth
    volumes:
      - certs:/opt/certs/
    configs:
      - source: nginx_auth_proxy_template
        target: /etc/nginx/nginx.conf
    deploy:
      mode: global
      resources:
        limits:
          cpus: '0.125'
          memory: 32M
          
  agent:
    image: prom/prometheus
    configs: --config-file=/etc/prometheus/prometheus.yml --log.level=debug
      - source: prometheus
        target: /etc/prometheus/prometheus.yml
    hostname: prometheus.internal
    secrets:
      - hostmetrics_pswd
    networks:
      - internal
      - prometheus
      - www
      - m3db
    deploy:
      labels:
        caddy: prometheus.corya.enterprises
        caddy.reverse_proxy: prometheus.internal:9090
      placement:
        constraints:
          - "node.role == worker"
          
volumes:
  certs:
    external: true
      
secrets:
  hostmetrics_pswd:
    external: true
  hostmetrics_auth:
    external: true

configs:
  prometheus:
    external: true
  nginx_auth_proxy_template:
    external: true

networks:
  public:
    name: host
    external: true
  internal:
    attachable: false
    driver: overlay
    driver_opts:
      encrypted: "true"
  m3db:
    external: true
  www:
    external: true
  prometheus:
    name: prometheus
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"
    ipam:
      driver: default
      config:
        - subnet: "10.239.0.0/16"
EOL
```
