# OpenSearch (ELK Stack)

```bash
cat << EOL | docker stack deploy -c - elk
version: '3.8'
services:
  node: # This is also the hostname of the container within the Docker network (i.e. https://opensearch-node1/)
    image: opensearchproject/opensearch:2.16.0
    hostname: "{{.Node.ID}}.opensearch.host"
    environment:
      - cluster.name=$OPENSEARCH_CLUSTER_NAME
      - node.name={{.Node.Hostname}}
      - discovery.seed_hosts=$OPENSEARCH_HOSTS
      - cluster.initial_cluster_manager_nodes=$OPENSEARCH_HOSTS
      - bootstrap.memory_lock=true
      - "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m"
      - OPENSEARCH_INITIAL_ADMIN_PASSWORD=${OPENSEARCH_INITIAL_ADMIN_PASSWORD} # Sets the demo admin user password when using demo configuration (for OpenSearch 2.12 and later)
    ulimits:
      memlock:
        soft: -1 # Set memlock to unlimited (no soft or hard limit)
        hard: -1
      nofile:
        soft: 65536 # Maximum number of open files for the opensearch user - set to at least 65536
        hard: 65536
    volumes:
      - data:/usr/share/opensearch/data # Creates volume called opensearch-data1 and mounts it to the container
    networks:
      default:
        aliases:
          - opensearch.host

  dashboards:
    image: opensearchproject/opensearch-dashboards:2.16.0
    hostname: dashboards.opensearch.host
    environment:
      OPENSEARCH_HOSTS: '["https://opensearch-node1:9200","https://opensearch-node2:9200"]'
    networks:
      - default
      - web
    deploy:
      replicas: 1
      placement:
        constraints:
          - "node.role == worker"
      labels:
        caddy: $ETCD_WEB_DOMAIN
        caddy.reverse_proxy: http://dashboards.opensearch.host:5601
        caddy.basicauth.admin: $ETCD_WEB_AUTH

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
EOL
```
