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
      - OPENSEARCH_CLUSTER_NAME=${OPENSEARCH_CLUSTER_NAME:=Swarm}
      - OPENSEARCH_NODE_NAME={{.Node.Hostname}}
      - OPENSEARCH_ENABLE_SECURITY="true"
      - OPENSEARCH_TLS_USE_PEM="true"
      - OPENSEARCH_TLS_VERIFICATION_MODE="certonly"
      - OPENSEARCH_NODE_CERT_LOCATION="/run/secrets/opensearch_node_cert:"
      - OPENSEARCH_NODE_KEY_LOCATION="/run/secrets/opensearch_node_key"
      - OPENSEARCH_CA_CERT_LOCATION="/run/secrets/opensearch_ca_cert"
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
    secrets:
      - opensearch_node_cert
      - opensearch_node_key
      - opensearch_ca_cert
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.$OPENSEARCH_LABEL == true"

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

  dashboards:
    image: opensearchproject/opensearch-dashboards:1.3.18
    hostname: dashboards.opensearch.host
    environment:
      OPENSEARCH_HOSTS: '["http://opensearch.host:9200"]'
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

volumes:
  data:
    driver: local

secrets:
  opensearch_node_cert:
    external: true
  opensearch_node_key:
    external: true
  opensearch_ca_cert:
    external: true

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
