# Bedrock
[Bedrock](https://bedrockdb.com/) is a distributed data layer that implements the MySQL wire protocol across a WAN network. It can also be used to store other types of data. It is designed to run with three to six nodes.

## Setup
Bedrock requires that its list of peers be specified before starting. Label three nodes with `com.example.bedrock=true`, replacing `com.example` with the user's domain.

### Defining Labels
Label the nodes that will store Bedrock data (change `com.example` to the reverse DNS notation of the user's domain.) This label will be used in the compose file to deploy the stack to select nodes.
```bash
export BEDROCK_LABEL="com.example.bedrock"
```

Select which nodes will run Bedrock.
```bash
export BEDROCK_NODES=(worker-01 worker-02 worker-03)
```

Apply the label to the selected nodes.
```bash
#!/bin/bash
for i in "${!BEDROCK_NODES[@]}"
do
  docker node update --label-add $BEDROCK_LABEL=true ${BEDROCK_NODES[i]}
done
```

Compile the newly labeled nodes to a list of peers.
```bash
#!/bin/bash
BEDROCK_PEER_LIST=""
BEDROCK_NODE_IDS=($(docker node ls -q --filter node.label=$BEDROCK_LABEL=true | tr '\n' ' '))
for i in "${!BEDROCK_NODE_IDS[@]}"
do
  BEDROCK_PEER_LIST="$BEDROCK_PEER_LIST,${BEDROCK_NODE_IDS[i]}.bedrock.host:9000"
done
export BEDROCK_PEER_LIST
```

### Adminer

```bash
cat << EOL | docker config create adminer_password_less -
<?php
require_once('plugins/login-password-less.php');

/** Set allowed password
  * @param string result of password_hash
  */
return new AdminerLoginPasswordLess(
  \$password_hash = ???
);
EOL
```

## Compose
```bash
cat << EOL | docker stack deploy -c - bedrock
version: '3.8'

services:
  instance:
    image: coryaent/bedrock:dev
    hostname: "{{.Node.ID}}.bedrock.host"
    ports:
      - target: 8888
        published: 8888
        mode: host
      - target: 3306
        published: 3306
        mode: host
    environment:
      BEDROCK_NODE_NAME: "{{.Node.ID}}.bedrock.host"
      BEDROCK_SERVER_HOST: "0.0.0.0:8888" # listen for client connections
      BEDROCK_NODE_HOST: "0.0.0.0:9000" # listen for cluster connections
      BEDROCK_MYSQL_HOST: "0.0.0.0:3306" # listen for MySQL connections
      BEDROCK_PEER_LIST: "$BEDROCK_PEER_LIST"
      BEDROCK_CACHE_SIZE: 262144 # 256 MB
      BEDROCK_WORKER_THREADS: 1
      BEDROCK_DB: /db/bedrock.db
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
          - "node.labels.$BEDROCK_LABEL == true"
      resources:
        reservations:
          cpus: '0.25'
          memory: 393216K # 384 MB
        limits:
          cpus: '0.50'
          memory: 524288K # 512 MB

  adminer:
    image: adminer
    hostname: adminer.bedrock.host
    environment:
      ADMINER_DEFAULT_SERVER: bedrock.host
      ADMINER_PLUGINS: 'login-password-less'
    configs:
      - source: adminer_password_less
        target: /var/www/html/plugins-enabled/login-password-less.php
    networks:
      - www
      - bedrock
    deploy:
      labels:
        caddy: mysql.staging.corya.enterprises
        caddy.reverse_proxy: http://adminer.bedrock.host:8080

configs:
  adminer_password_less:
    external: true

networks:
  www:
    external: true
  bedrock:
    name: mysql
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"

volumes:
  data:
    driver: local
EOL
```
