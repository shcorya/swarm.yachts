# OpenSearch (ELK Stack)

Create label.
```bash
export OPENSEARCH_LABEL="yachts.swarm.opensearch"
```

Read nodes.
```bash
read -a OPENSEARCH_NODES -p "Enter the OpenSearch node array (space-seperated): "
```

Apply label.
```bash
#!/bin/bash
for i in "${!OPENSEARCH_NODES[@]}"
do
  docker node update --label-add $OPENSEARCH_LABEL=true ${OPENSEARCH_NODES[i]}
done
```

Define an administrator password.
```bash
export OPENSEARCH_INITIAL_ADMIN_PASSWORD=$(pwgen -y 24 1) && echo $OPENSEARCH_INITIAL_ADMIN_PASSWORD
```

Select a domian.
```bash
export OPENSEARCH_WEB_DOMAIN='dashboards.swarm.yachts'
```

Optionally, name the cluster.
```bash
export OPENSEARCH_CLUSTER_NAME="Swarm"
```

```bash
cat << EOL | docker stack deploy -c - elk --detach=true
version: '3.8'
services:
  node:
    image: bitnami/opensearch:1.3.18
    hostname: "{{.Node.ID}}.opensearch.host"
    environment:
      - cluster.name=${OPENSEARCH_CLUSTER_NAME:=Swarm}
      - node.name="{{.Node.ID}}.opensearch.host"
      - discovery.seed_hosts=$(docker node ls -q --filter node.label=$OPENSEARCH_LABEL=true | tr '\n' ' ' | sed -e "s/ /.opensearch.host /g" | awk '{$1=$1};1' | tr ' ' ',')
      - cluster.initial_cluster_manager_nodes=$(docker node ls -q --filter node.label=$OPENSEARCH_LABEL=true | tr '\n' ' ' | sed -e "s/ /.opensearch.host /g" | awk '{$1=$1};1' | tr ' ' ',')
      - bootstrap.memory_lock=true
      - "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m"
#      - OPENSEARCH_INITIAL_ADMIN_PASSWORD=${OPENSEARCH_INITIAL_ADMIN_PASSWORD:=Yachts1!}
#      - plugins.security.ssl.transport.resolve_hostname=false
#      - plugins.security.ssl.transport.enforce_hostname_verification=false
#      - plugins.security.audit.config.enable_ssl=false
#      - plugins.security.audit.config.verify_hostnames=false
#      - plugins.security.ssl.http.clientauth_mode=NONE
    sysctls:
      - net.ipv6.conf.all.disable_ipv6=1
    ulimits:
      memlock:
        soft: -1
        hard: -1
      nofile:
        soft: 65536
        hard: 65536
    volumes:
      - data:/bitnami/opensearch/data
    networks:
      default:
        aliases:
          - opensearch.host
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.$OPENSEARCH_LABEL == true"

  dashboards:
    image: opensearchproject/opensearch-dashboards:1.3.18
    hostname: dashboards.opensearch.host
    environment:
      OPENSEARCH_HOSTS: '["http://opensearch.host:9200"]'
      # this disables login security
      DISABLE_SECURITY_DASHBOARDS_PLUGIN: "true"
    networks:
      - default
      - www
    deploy:
      resources:
        reservations:
          memory: "1073741824"
      replicas: 1
      placement:
        constraints:
          - "node.role == worker"
      labels:
        caddy: $OPENSEARCH_WEB_DOMAIN
        caddy.reverse_proxy: http://dashboards.opensearch.host:5601
        caddy.basicauth.admin: $MY_BASIC_AUTH

volumes:
  data:
    driver: local

networks:
  default:
    name: opensearch
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"
    ipam:
      driver: default
      config:
        - subnet: "10.249.0.0/16"
  www:
    external: true
EOL
```
