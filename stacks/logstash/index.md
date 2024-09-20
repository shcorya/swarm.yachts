# Logstash
Logstash is used to collect data from various sources including but not limited to logs.

## Configuration
A change to the system configuration will be required so that all containers will log to Logstash. Additionally, a swarm config will define our Logstash pipeline.

### Docker Daemon
We need to configure the docker daemon to log to the gelf format on a proxy that will run on each host and output to Logstash. Replace `/etc/docker/daemon.json` with the following. If the file does not exist, create it, then restart the docker daemon.
```json
{
  "log-driver": "gelf",
  "log-opts": {
    "gelf-address": "udp://127.0.0.1:12201"
  }
}
```

### Swarm Config
Logstash uses configuration files called pipelines that define inputs and outputs. Create the following config template, which uses the swarm secret password that we created in the OpenSearch section.
```bash
cat << EOL | docker config create --template-driver=golang logstash_conf -
input {
  gelf {}
}

output {
  opensearch {
    hosts => ["https://opensearch.host:9200"]
    index => "docker_logs_%{+YYYY-MM-dd}"
    ssl => true
    ssl_certificate_verification => false
    user => "logstash"
    password => "{{ secret "opensearch_logstash_pw" }}"
  }
}
EOL
```


## Compose
```bash
cat << EOL | docker stack deploy --detach=true -c - logstash
version: '3.8'

services:
  localhost:
    image: coryaent/socat
    command: "-dd UDP-L:12201,fork,bind=127.0.0.1 UNIX:/opt/swarm/sockets/logstash.sock"
    volumes:
      - /opt/swarm/sockets:/opt/swarm/sockets
    networks:
      - public
    deploy:
      mode: global

  ingress:
    image: coryaent/socat
    command: "-dd UNIX-L:/opt/swarm/sockets/logstash.sock,fork UDP:pipe:12201"
    volumes:
      - /opt/swarm/sockets:/opt/swarm/sockets
    networks:
      - internal
    deploy:
      mode: global

  pipe:
    image: opensearchproject/logstash-oss-with-opensearch-output-plugin:7.16.2
    secrets:
      - opensearch_logstash_pw
    networks:
      - internal
      - opensearch
    configs:
      - source: logstash_conf
        target: /usr/share/logstash/pipeline/logstash.conf
    deploy:
      mode: replicated
      replicas: 2
      placement:
        constraints:
          - "node.role == worker"
      resources:
        reservations:
          memory: "986513408"

secrets:
  opensearch_logstash_pw:
    external: true

configs:
  logstash_conf:
    external: true

networks:
  public:
    name: host
    external: true
  opensearch:
    external: true
  internal:
    name: logstash
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"
    ipam:
      driver: default
      config:
        - subnet: "10.248.0.0/16"
EOL
```
