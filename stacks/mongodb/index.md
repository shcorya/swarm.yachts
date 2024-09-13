*This stack depends on certbot.*

# MongoDB
MongoDB is a NoSQL database that is used to store JSON-like documents. With the use of a [Caddy plugin](https://github.com/root-sector/caddy-storage-mongodb), it can be used to store Caddy TLS data.

## Setup
Chose a label to distinguish the MongoDB nodes.
```bash
export MONGO_LABEL="yachts.swarm.mongodb"
```

Select which nodes will run MongoDB, for example `worker-01 worker-02 worker-03`.
```bash
read -a MONGO_NODES -p "Enter the array of MongoDB nodes (space-seperated): "
```

Apply the label to the selected nodes.
```bash
#!/bin/bash
for i in "${!MONGO_NODES[@]}"
do
  docker node update --label-add $MONGO_LABEL=true ${MONGO_NODES[i]}
done
```

Create a password file that will be used for basic authentication into mongo-express.
```bash
pwgen 24 1 | tee /dev/stderr | docker secret create mongo_express_pw - > /dev/null
```
Take note of the password (store it in a password manager.)

## Initialization Script
Use this script to create a swarm config that will automatically initialize the replica set.
```bash
cat << EOL | docker config create mongo_init -
#!/bin/bash
mongosh mongodb://$(docker node ls -q --filter node.label=$MONGO_LABEL=true | head -n 1 | tr -d '\n').mongodb.host:27017 --eval "rs.initiate({_id: \"swarm\", version: 1, members: [{ _id: 0, host : \"$(docker node ls -q --filter node.label=$MONGO_LABEL=true | head -n 1 | tr -d '\n').mongodb.host:27017\" }, { _id: 1, host : \"$(docker node inspect ${MONGO_NODES[1]} | jq -r .[].ID | tr -d '\n').mongodb.host:27017\" }, { _id: 2, host : \"$(docker node inspect ${MONGO_NODES[2]} | jq -r .[].ID | tr -d '\n').mongodb.host:27017\" }]})"
EOL
```

## Compose
```bash
cat << EOL | docker stack deploy -c - mongo --detach=true
version: '3.8'

services:
  init:
    image: mongo
    networks:
      - mongodb
    entrypoint: bash
    configs:
      - source: mongo_init
        mode: 0555
    command: /mongo_init
    deploy:
      mode: replicated-job

  db:
    image: mongo
    hostname: "{{.Node.ID}}.mongodb.host"
    command: >
      --nounixsocket
      --bind_ip_all
      --replSet swarm
    networks:
      mongodb:
        aliases:
          - mongodb.host
#    volumes:
#      - data:/data/db
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.$MONGO_LABEL == true"

  express:
    image: mongo-express
    hostname: mongo.corya.enterprises
    networks:
      - mongodb
    ports:
      - "8081:8081"
    secrets:
      - mongo_express_pw
    volumes:
      - certs:/opt/certs/
    environment:
      ME_CONFIG_MONGODB_URL: mongodb://mongodb.host:27017
      ME_CONFIG_BASICAUTH_USERNAME: mongo
      ME_CONFIG_BASICAUTH_PASSWORD_FILE: /run/secrets/mongo_express_pw
      ME_CONFIG_SITE_SSL_ENABLED: "true"
      ME_CONFIG_SITE_SSL_CRT_PATH: /opt/certs/live/$SWARM_DOMAIN/cert.pem
      ME_CONFIG_SITE_SSL_KEY_PATH: /opt/certs/live/$SWARM_DOMAIN/privkey.pem
    deploy:
      placement:
        constraints:
          - node.role == worker

networks:
  mongodb:
    name: mongodb
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"
    ipam:
      driver: default
      config:
        - subnet: "10.144.0.0/16"

configs:
  mongo_init:
    external: true

secrets:
  mongo_express_pw:
    external: true

volumes:
  data:
    driver: local
  certs:
    external: true
EOL
```
