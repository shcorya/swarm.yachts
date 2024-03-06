# etcd

[etcd](https://etcd.io/) is a distributed key-value store that uses raft consensus to maintain a consistent state among a group of nodes. It is highly versatile, and it has become an integral element of many other distributed stacks. Deploying etcd to Docker Swarm is straightforward, thanks in part to a feature which enables automatic bootstrapping.

## Setup

To employ automatic bootstrapping, one needs a unique URL from an existing etcd cluster. A cluster for the bootstrapping process been made publically available. More information about etcd discovery can be found [here](https://etcd.io/docs/v3.5/op-guide/clustering/#discovery).

To obtain a unique bootstrap URL:
```bash
export DISCOVERY_URL=$(curl -s https://discovery.etcd.io/new?size=3)

Note the size parameter passed to the URL. Raft clusters should generally contain three, five, or seven nodes. The compose file in this guide will assume a cluster size of three.
```

## Compose
```yaml
services:
  member:
    image: quay.io/coreos/etcd:v3.4.28
    hostname: "{{.Node.ID}}.etcd.host"
    networks:
      etcd:
        aliases:
          - etcd
    environment:
      ETCD_DISCOVERY: ${DISCOVERY_URL}
      ETCD_LOG_LEVEL: debug
      ETCD_INITIAL_ELECTION_TICK_ADVANCE: "false"
      ETCD_NAME: "{{.Node.Hostname}}"
      ETCD_DATA_DIR: /data
      ETCD_LISTEN_CLIENT_URLS: http://0.0.0.0:2379
      ETCD_LISTEN_PEER_URLS: http://0.0.0.0:2380
      ETCD_ADVERTISE_CLIENT_URLS: "http://{{.Node.ID}}.etcd.host:2379"
      ETCD_INITIAL_ADVERTISE_PEER_URLS: "http://{{.Node.ID}}.etcd.host:2380"
      ETCD_HEARTBEAT_INTERVAL: 100
      ETCD_ELECTION_TIMEOUT: 1000

    volumes:
      - data:/data
    deploy:
      mode: global
      placement:
        constraints:
          - node.labels.enterprises.corya.etcd==true
      resources:
        reservations:
          cpus: '0.25'
          memory: 256M

  browser:
    image: rustyx/etcdv3-browser
    networks:
      etcd:
      www:
        aliases:
          - browser.etcd.host
    deploy:
      replicas: 1
      placement:
        constraints:
          - "node.role==worker"
      labels:
        caddy: etcd.example.com
        caddy.basicauth.user: JDJhJDE0JFIyV0JteTNnZU02cExwZGhNc0MwQmVycGNST0VjcU9YYkh2TklDR1NhL2MyLnZpc3NrdHFLCg==
        caddy.reverse_proxy: http://browser.etcd.host:8081

networks:
  etcd:
    external: true
  www:
    external: true

volumes:
  data:
    driver: local
```
