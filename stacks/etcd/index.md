*The web interface for this stack depends on Caddy.*

# etcd
[etcd](https://etcd.io/) is a distributed key-value store that uses raft consensus to maintain a consistent state among a group of nodes. It is highly versatile, and it has become an integral element of many other distributed stacks. Deploying etcd to Docker Swarm is straightforward, thanks in part to a feature which enables automatic bootstrapping.

## Discovery
To employ automatic bootstrapping, one needs a unique URL from an existing etcd cluster. A service for the bootstrapping process been made publicly available. This service will be utilized within the compose file below. More information about etcd discovery can be found [here](https://etcd.io/docs/v3.5/op-guide/clustering/#discovery).

## Setup
Setup for etcd is similar to RedisRaft.

First, define the label name which will be applied to the etcd nodes.
```bash
export ETCD_LABEL="yachts.swarm.etcd"
```

Define the array of nodes that will run etcd, for example `worker-01 worker-02 worker-03`.
```bash
read -a ETCD_NODES -p "Enter the array of etcd nodes (space-seperated): "
```

Apply the label to the selected nodes.
```bash
#!/bin/bash
for i in "${!ETCD_NODES[@]}"
do
  docker node update --label-add $ETCD_LABEL=true ${ETCD_NODES[i]}
done
```

## Tuning
Depending on the geographical distribution of the etcd nodes, etcd may need to be tuned. More information is available [here](https://etcd.io/docs/v3.5/tuning/). The compose file below uses values which should work with a globally distributed environment.

## Web UI
It may be useful to visualize etcd keys without the need to run `etcdctl` from the command line. The compose file includes a browser which can be accessed with a web interface. Take care to add [basic authentication](https://swarm.yacts/stacks/caddy/#basic-authentication).
```bash
ETCD_WEB_AUTH=$(caddy hash-password | base64 -w 0)
```

Set a CNAME record and define the domain for the compose file.
```bash
export ETCD_WEB_DOMAIN=etcd.example.com
```

## Compose
```bash
cat << EOL | docker stack deploy -c - etcd --detach=true
services:
  member:
    image: quay.io/coreos/etcd:v3.4.28
    hostname: "{{.Node.ID}}.etcd.host"
    networks:
      etcd:
        aliases:
          - etcd
          - etcd.host
    environment:
      ETCD_DISCOVERY: $(curl -s https://discovery.etcd.io/new?size=${#ETCD_NODES[@]})
      ETCD_LOG_LEVEL: debug
      ETCD_INITIAL_ELECTION_TICK_ADVANCE: "false"
      ETCD_NAME: "{{.Node.Hostname}}"
      ETCD_DATA_DIR: /data
      ETCD_LISTEN_CLIENT_URLS: http://0.0.0.0:2379
      ETCD_LISTEN_PEER_URLS: http://0.0.0.0:2380
      ETCD_ADVERTISE_CLIENT_URLS: "http://{{.Node.ID}}.etcd.host:2379"
      ETCD_INITIAL_ADVERTISE_PEER_URLS: "http://{{.Node.ID}}.etcd.host:2380"
      ETCD_HEARTBEAT_INTERVAL: 300
      ETCD_ELECTION_TIMEOUT: 3000
    volumes:
      - data:/data
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.$ETCD_LABEL == true"
      resources:
        reservations:
          cpus: '0.25'
          memory: 256M

  browser:
    image: rustyx/etcdv3-browser
    environment:
      ETCD: etcd.host:2379
    networks:
      etcd:
      www:
        aliases:
          - browser.etcd.host
    deploy:
      replicas: 1
      placement:
        constraints:
          - "node.role == worker"
      labels:
        caddy: $ETCD_WEB_DOMAIN
        caddy.reverse_proxy: http://browser.etcd.host:8081
        caddy.basic_auth.admin: $ETCD_WEB_AUTH

networks:
  www:
    external: true
  etcd:
    name: etcd
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"
    ipam:
      driver: default
      config:
        - subnet: "10.254.0.0/16"

volumes:
  data:
    driver: local
EOL
```
