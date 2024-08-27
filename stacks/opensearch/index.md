# OpenSearch (ELK Stack)

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

```bash
cat << EOL | docker stack deploy -c - elk --detach=true
version: '3.8'
services:
#   node:
#     image: bitnami/opensearch:1.3.18
#     hostname: "{{.Node.ID}}.opensearch.host"
#     environment:
#       - OPENSEARCH_CLUSTER_NAME=${OPENSEARCH_CLUSTER_NAME:=Swarm}
#       - OPENSEARCH_NODE_NAME={{.Node.ID}}.opensearch.host
#       - OPENSEARCH_CLUSTER_HOSTS=$(docker node ls -q --filter node.label=$OPENSEARCH_LABEL=true | tr '\n' ' ' | sed -e "s/ /.opensearch.host /g" | awk '{$1=$1};1' | tr ' ' ',')
#       - OPENSEARCH_CLUSTER_MASTER_HOSTS=1agq36mrqbenr5fuld3e93vni.opensearch.host
#       - OPENSEARCH_BIND_ADDRESS=0.0.0.0
#       - OPENSEARCH_ADVERTISED_HOSTNAME={{.Node.ID}}.opensearch.host
#       - OPENSEARCH_NODE_ROLES=cluster_manager,data,ingest,remote_cluster_client
#     sysctls:
#       - net.ipv6.conf.all.disable_ipv6=1
#     ulimits:
#       memlock:
#         soft: -1
#         hard: -1
#       nofile:
#         soft: 65536
#         hard: 65536
#     networks:
#       default:
#         aliases:
#           - opensearch.host
#     deploy:
#       mode: global
#       placement:
#         constraints:
#           - "node.labels.$OPENSEARCH_LABEL == true"

#   node:
#     image: opensearchproject/opensearch:2.16.0
#     hostname: "{{.Node.ID}}.opensearch.host"
#     environment:
#       - network.bind_host=0.0.0.0
#       - network.publish_host={{.Node.ID}}.opensearch.host
#       - cluster.name=${OPENSEARCH_CLUSTER_NAME:=Swarm}
#       - node.name="{{.Node.ID}}.opensearch.host"
#       - discovery.seed_hosts=$(docker node ls -q --filter node.label=$OPENSEARCH_LABEL=true | tr '\n' ' ' | sed -e "s/ /.opensearch.host:9300 /g" | awk '{$1=$1};1' | tr ' ' ',')
#       - cluster.initial_cluster_manager_nodes=1agq36mrqbenr5fuld3e93vni.opensearch.host
#       - bootstrap.memory_lock=true
#       - "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m"
#       - OPENSEARCH_INITIAL_ADMIN_PASSWORD=${OPENSEARCH_INITIAL_ADMIN_PASSWORD:=yachts}
#     ulimits:
#       memlock:
#         soft: -1
#         hard: -1
#       nofile:
#         soft: 65536
#         hard: 65536
#     networks:
#       default:
#         aliases:
#           - opensearch.host
#     deploy:
#       mode: global
#       placement:
#         constraints:
#           - "node.labels.$OPENSEARCH_LABEL == true"

  node:
    image: bitnami/opensearch:1.3.18
    hostname: "{{.Node.ID}}.opensearch.host"
    environment:
      - OPENSEARCH_CLUSTER_NAME=${OPENSEARCH_CLUSTER_NAME:=Swarm}
      - OPENSEARCH_NODE_NAME={{.Node.ID}}.opensearch.host
      - OPENSEARCH_CLUSTER_HOSTS=$(docker node ls -q --filter node.label=$OPENSEARCH_LABEL=true | tr '\n' ' ' | sed -e "s/ /.opensearch.host /g" | awk '{$1=$1};1' | tr ' ' ',')
      - OPENSEARCH_CLUSTER_MASTER_HOSTS=1agq36mrqbenr5fuld3e93vni.opensearch.host
      - OPENSEARCH_BIND_ADDRESS=0.0.0.0
      - OPENSEARCH_ADVERTISED_HOSTNAME={{.Node.ID}}.opensearch.host
      - OPENSEARCH_NODE_ROLES=cluster_manager,data,ingest,remote_cluster_client
    sysctls:
      - net.ipv6.conf.all.disable_ipv6=1
    ulimits:
      memlock:
        soft: -1
        hard: -1
      nofile:
        soft: 65536
        hard: 65536
    networks:
      default:
        aliases:
          - opensearch.host
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.$OPENSEARCH_LABEL == true"

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
EOL
```
**This works:**
```yaml
version: '3.8'
services:
  node:
    image: bitnami/opensearch:1.3.18
    hostname: "{{.Node.ID}}.opensearch.host"
    environment:
      - OPENSEARCH_CLUSTER_NAME=${OPENSEARCH_CLUSTER_NAME:=Swarm}
      - OPENSEARCH_NODE_NAME={{.Node.ID}}.opensearch.host
      - OPENSEARCH_CLUSTER_HOSTS=$(docker node ls -q --filter node.label=$OPENSEARCH_LABEL=true | tr '\n' ' ' | sed -e "s/ /.opensearch.host /g" | awk '{$1=$1};1' | tr ' ' ',')
      - OPENSEARCH_CLUSTER_MASTER_HOSTS=1agq36mrqbenr5fuld3e93vni.opensearch.host
      - OPENSEARCH_BIND_ADDRESS=0.0.0.0
      - OPENSEARCH_ADVERTISED_HOSTNAME={{.Node.ID}}.opensearch.host
      - OPENSEARCH_NODE_ROLES=cluster_manager,data,ingest,remote_cluster_client
    sysctls:
      - net.ipv6.conf.all.disable_ipv6=1
    ulimits:
      memlock:
        soft: -1
        hard: -1
      nofile:
        soft: 65536
        hard: 65536
    networks:
      default:
        aliases:
          - opensearch.host
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.$OPENSEARCH_LABEL == true"
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
```
```yaml
version: '3.8'
services:
  node:
    image: opensearchproject/opensearch:2.16.0
    hostname: "{{.Node.ID}}.opensearch.host"
    environment:
      - network.bind_host=0.0.0.0
      - network.publish_host={{.Node.ID}}.opensearch.host
      - cluster.name=${OPENSEARCH_CLUSTER_NAME:=Swarm}
      - node.name="{{.Node.Hostname}}"
      - discovery.seed_hosts=$(docker node ls -q --filter node.label=$OPENSEARCH_LABEL=true | tr '\n' ' ' | sed -e "s/ /.opensearch.host:9300 /g" | awk '{$1=$1};1' | tr ' ' ',')
      - cluster.initial_cluster_manager_nodes=us-buf-021-01,us-chi-021-04,us-lax-021-02
      - bootstrap.memory_lock=true
      - "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m"
      - OPENSEARCH_INITIAL_ADMIN_PASSWORD=${OPENSEARCH_INITIAL_ADMIN_PASSWORD:=yachts}
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
      OPENSEARCH_HOSTS: '["http://opensearch.host:9200"]'
    networks:
      - default
      - www
    deploy:
      replicas: 1
      placement:
        constraints:
          - "node.role == worker"
      labels:
        caddy: $OPENSEARCH_WEB_DOMAIN
        caddy.reverse_proxy: http://dashboards.opensearch.host:5601

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
```

```yaml
version: '3.8'
services:

#   node:
#     image: bitnami/opensearch:1.3.18
#     hostname: "{{.Node.ID}}.opensearch.host"
#     environment:
#       - OPENSEARCH_CLUSTER_NAME=${OPENSEARCH_CLUSTER_NAME:=Swarm}
#       - OPENSEARCH_NODE_NAME={{.Node.Hostname}}
#       - OPENSEARCH_CLUSTER_HOSTS=$(docker node ls -q --filter node.label=$OPENSEARCH_LABEL=true | tr '\n' ' ' | sed -e "s/ /.opensearch.host /g" | awk '{$1=$1};1' | tr ' ' ',')
#       - OPENSEARCH_CLUSTER_MASTER_HOSTS=$(docker node ls -q --filter node.label=$OPENSEARCH_LABEL=true | tr '\n' ' ' | sed -e "s/ /.opensearch.host /g" | awk '{$1=$1};1' | tr ' ' ',')
#       - OPENSEARCH_BIND_ADDRESS=0.0.0.0
#       - OPENSEARCH_ADVERTISED_HOSTNAME={{.Node.ID}}.opensearch.host
#     sysctls:
#       - net.ipv6.conf.all.disable_ipv6=1
#     ulimits:
#       memlock:
#         soft: -1
#         hard: -1
#       nofile:
#         soft: 65536
#         hard: 65536
# #    volumes:
# #      - data:/bitnami/opensearch/data
#     networks:
#       default:
#         aliases:
#           - opensearch.host
#     deploy:
#       mode: global
#       placement:
#         constraints:
#           - "node.labels.$OPENSEARCH_LABEL == true"


#   dashboards:
#     image: opensearchproject/opensearch-dashboards:1.3.18
#     hostname: dashboards.opensearch.host
#     environment:
#       OPENSEARCH_HOSTS: '["http://opensearch.host:9200"]'
#     networks:
#       - default
#       - www
#     deploy:
#       resources:
#         reservations:
#           memory: "1073741824"
#       replicas: 1
#       placement:
#         constraints:
#           - "node.role == worker"
#       labels:
#         caddy: $OPENSEARCH_WEB_DOMAIN
#         caddy.reverse_proxy: http://dashboards.opensearch.host:5601

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
```
