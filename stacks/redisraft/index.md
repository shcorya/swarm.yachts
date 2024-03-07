---
prev:
  text: 'Stacks Overview'
  link: '/stacks/'
---

# RedisRaft
Redis is an in-memory storage for various data types. It includes support for sets, lists, simple key-value pairs, and hash maps.

## Before Deployment
Before deploying RedisRaft, it is prudent to create a network for other services to attach to the Caddy reverse proxy. This will allow the deployment of the RedisRaft stack prior to deploying the reverse proxy stack.

Create the web overlay network:
```bash
docker network create --attachable --driver overlay --opt encrypted --subnet 10.255.0.0/16 www
```

Label the nodes that will store RedisRaft data (change `com.example` to the reverse DNS notation of the user's domain):
```bash
export REDISRAFT_NODE_LABEL=com.example.redisraft=true &&\
docker node update --label-add $REDISRAFT_NODE_LABEL worker-01 &&\
docker node update --label-add $REDISRAFT_NODE_LABEL worker-02 &&\
docker node update --label-add $REDISRAFT_NODE_LABEL worker-03 &&\
unset REDISRAFT_NODE_LABEL
```

Set a CNAME record pointing to the swarm network, e.g. `redisraft.example.com` -> `swarm.example.com`.

## Compose
```yaml
version: "3.8"

services:
  server:
    image: redislabs/ng-redis-raft
    hostname: "{{.Node.ID}}.redisraft.host"
    networks:
      default:
        aliases:
          - redisraft
    command: >
      redis-server
      --loadmodule /redisraft.so
      --bind 0.0.0.0
      --raft.follower-proxy yes
    volumes:
      - data:/data
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.com.example.redisraft == true"
      resources:
        reservations:
          cpus: '0.25'
          memory: 32M

  browser:
    image: erikdubbelboer/phpredisadmin
    hostname: browser.redisraft.host
    environment:
      - REDIS_1_HOST=redisraft
      - REDIS_1_PORT=6379
    networks:
      - default
      - www
    deploy:
      replicas: 1
      placement:
        constraints:
          - "node.role == worker"
      labels:
        # More info about these labels in the Caddy stack section
        caddy: redisraft.example.com
        caddy.basicauth.myusername: JDJhJDE0JG92UG1yc3VRYjBxTGdQTzh6RmxnOWV6dXhvUEpXeTMzendLR3FXcWhFNHd5UVE3d1cvcEh5Cg==
        caddy.reverse_proxy: http://browser.redisraft.host:80


networks:
  default:
    name: redisraft
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"
  www:
    external: true

volumes:
  data:
    driver: local
```

## Setup
Now that the stack is deployed, one must initialize the cluster and connect the other nodes.

List the nodes on which RedisRaft is running:
```bash
docker node ls --filter "node.label=com.example.redisraft=true"
```

The output should look like this:
```
ID                            HOSTNAME    STATUS    AVAILABILITY   MANAGER STATUS   ENGINE VERSION
saeSh9chue6aoqu1ahv3Mah1t     worker-01   Ready     Active                          25.0.3
Zoowou7een6aey9eici6Vaiz9     worker-02   Ready     Active                          25.0.3
aocaingaish5eepoh4aeTh9eo     worker-03   Ready     Active                          25.0.3
```

Next, initialize the cluster with the node ID's. Replace the service ID (`saeSh9chue6aoqu1ahv3Mah1t.redisraft.host`) with the output of the `docker node ls` command. For the first node, run (on any manager):
```bash
docker run -it --rm --network redisraft redis \
redis-cli -h saeSh9chue6aoqu1ahv3Mah1t.redisraft.host RAFT.CLUSTER INIT

```
Then, to set up the other nodes:
```bash
docker run -it --rm --network redisraft redis \
redis-cli -h Zoowou7een6aey9eici6Vaiz9.redisraft.host \
RAFT.CLUSTER JOIN saeSh9chue6aoqu1ahv3Mah1t.redisraft.host:6379 &&\
docker run -it --rm --network redisraft redis \
redis-cli -h aocaingaish5eepoh4aeTh9eo.redisraft.host \
RAFT.CLUSTER JOIN saeSh9chue6aoqu1ahv3Mah1t.redisraft.host:6379
```

To check that the cluster has been properly set up:
```bash
docker run -it --rm --network redisraft redis \
redis-cli -h redisraft INFO raft
```
