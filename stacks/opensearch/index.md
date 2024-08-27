# OpenSearch (ELK Stack)

## Setup
Create label.
```bash
export OPENSEARCH_LABEL="yachts.swarm.opensearch"
```

Read nodes.
```bash
read -a OPENSEARCH_NODES -p "Enter the OpenSearch node array (space-seperated): " &&\
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

## Compose
```bash
cat << EOL | docker stack deploy -c - elk --detach=true

version: '3.8'
services:
  node:
    image: opensearchproject/opensearch:2.16.0
    hostname: "{{.Node.ID}}.opensearch.host"
    environment:
      - network.bind_host=0.0.0.0
      - network.publish_host={{.Node.ID}}.opensearch.host
      - cluster.name=${OPENSEARCH_CLUSTER_NAME:=Swarm}
      - node.name={{.Node.Hostname}}
      - discovery.seed_hosts=$(docker node ls -q --filter node.label=$OPENSEARCH_LABEL=true | tr '\n' ' ' | sed -e "s/ /.opensearch.host /g" | awk '{$1=$1};1' | tr ' ' ',')
      - cluster.initial_cluster_manager_nodes=us-buf-021-01
      - bootstrap.memory_lock=true
      - "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m"
      - OPENSEARCH_INITIAL_ADMIN_PASSWORD=${OPENSEARCH_INITIAL_ADMIN_PASSWORD:=lo9Chivahn5mai&w}
    ulimits:
      memlock:
        soft: -1
        hard: -1
      nofile:
        soft: 65536
        hard: 65536
#    volumes:
#      - data:/usr/share/opensearch/data
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
    image: opensearchproject/opensearch-dashboards:2.16.0
    hostname: dashboards.opensearch.host
    environment:
      OPENSEARCH_HOSTS: '["https://opensearch.host:9200"]'
    networks:
      - default
      - www
    deploy:
      replicas: 1
      placement:
        constraints:
          - "node.role == worker"
      labels:
        caddy: corya.enterprises
        caddy.reverse_proxy: dashboards:5601

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
