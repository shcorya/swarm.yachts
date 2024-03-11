# Bedrock
[Bedrock](https://bedrockdb.com/) is a distributed data layer that implements the MySQL wire protocol across a WAN network. It can also be used to store other types of data. It is designed to run with three to six nodes.

## Setup
Label three nodes with `com.example.bedrock == true`, replacing `com.example` with the user's domain. Bedrock requires that its list of peers be specified before starting. This can be obtained by running `docker node ls --filter node.label=com.example.bedrock=true`. Append each ID with `.bedrock.host`, and put each hostname in the `BEDROCK_PEER_LIST` environmental variable, seperated by commas.

## Compose
```yaml
version: '3.8'

services:
  instance:
    image: coryaent/bedrocked:master
    hostname: "{{.Node.ID}}.bedrock.host"
    environment:
      BEDROCK_NODE_NAME: "{{.Node.Hostname}}_{{.Node.ID}}"
      BEDROCK_SERVER_HOST: "0.0.0.0:3306" # listen for client connections
      BEDROCK_NODE_HOST: "0.0.0.0:9000" # listen for cluster connections
      BEDROCK_PEER_LIST: "cah0ceiTovaeX8aec9iichiej.bedrock.host,Ongahx1oihu9oop1oa3sienga.bedrock.host,eozofii8eo6xei6haiYishung.bedrock.host"
      BEDROCK_PLUGINS: mysql
      BEDROCK_CACHE_SIZE: 262144 # 256 MB
      BEDROCK_WORKER_THREADS: 1
    networks:
      bedrock:
        aliases:
          - bedrock.host
          - mysql.host
    volumes:
      - data:/db
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.com.example.bedrock == true"
      resources:
        reservations:
          cpus: '0.25'
          memory: 393216K # 384 MB
        limits:
          cpus: '0.50'
          memory: 524288K # 512 MB

networks:
  bedrock:
    name: mysql
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"

volumes:
  data:
    driver: local
```
