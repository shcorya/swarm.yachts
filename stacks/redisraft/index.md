---
prev:
  text: 'Stacks Overview'
  link: '/stacks/'
---

*This stack is not suitable for production. It was previously used for the Caddy TLS storage backend.*

# RedisRaft
[Redis](https://redis.io/) is an in-memory storage for various data types. It includes support for sets, lists, simple key-value pairs, and hash maps. RedisRaft is an extension to Redis that provides a strong-consistency deployment option.

Like with all raft clusters, an odd number of nodes should be deployed. Three to seven is recommended. A greater number of nodes increases the number of failures that the system can tolerate at the expense of speed.

## Before Deployment
Label the nodes that will store RedisRaft data (you may wish to change `yachts.swarm` to the reverse DNS notation of the user's domain.) This label will be used in the compose file to deploy the stack to select nodes.
```bash
export REDISRAFT_LABEL="yachts.swarm.redisraft"
```

Select which nodes will run RedisRaft, for example `worker-01 worker-02 worker-03`.
```bash
read -a REDISRAFT_NODES -p "Enter the RedisRaft node array (space-seperated): "
```

Apply the label to the selected nodes.
```bash
#!/bin/bash
for i in "${!REDISRAFT_NODES[@]}"
do
  docker node update --label-add $REDISRAFT_LABEL=true ${REDISRAFT_NODES[i]}
done
```

## Config
Create the swarm config template for the RedisRaft nodes. This allows passing the swarm node's ID to the Redis server. The ID, which is also set in the containers' hostname, is in turn advertised to the other servers.

```bash
cat << EOL | docker config create --template-driver golang redisraft_conf -
# GENERAL OPTIONS
dir /data
bind 0.0.0.0

# REDISRAFT REQUIREMENTS
databases 1
save ""
dbfilename dump.rdb
maxmemory-policy noeviction
appendonly no
cluster-enabled no
loadmodule /redisraft.so

# REDISRAFT OPTIONS
raft.follower-proxy yes
raft.addr {{.Node.ID}}.redisraft.host:6379
EOL
```

## Compose
```bash
cat << EOL | docker stack deploy -c - redisraft
version: "3.8"

services:
  server:
    image: redislabs/ng-redis-raft
    hostname: "{{.Node.ID}}.redisraft.host"
    networks:
      default:
        aliases:
          - redisraft.host
    configs:
      - redisraft_conf
    command: redis-server /redisraft_conf
    volumes:
      - data:/data
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.$REDISRAFT_LABEL == true"
      resources:
        reservations:
          cpus: '0.25'
          memory: 32M

configs:
  redisraft_conf:
    external: true

networks:
  default:
    name: redisraft
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"

volumes:
  data:
    driver: local
EOL
```

## Clustering
Now that the stack is deployed, one must initialize the cluster and connect the other nodes. Clustering can be achieved by running a script or with a few manual steps.

### Automatic
This script will automatically initialize a RedisRaft cluster on a primary node and connect each other node. Ensure that the `REDISRAFT_LABEL` variable is still set, and that *each RedisRaft node is running* before running the script. The script can be run multiple times without issue.
```bash
#!/bin/bash
REDISRAFT_NODE_IDS=($(docker node ls -q --filter node.label=$REDISRAFT_LABEL=true | tr '\n' ' '))
for i in "${!REDISRAFT_NODE_IDS[@]}"
do
  if [[ $i == 0 ]]
  then
    PRIMARY_ID=${REDISRAFT_NODE_IDS[i]}
    docker run --rm --network redisraft redis redis-cli -h ${REDISRAFT_NODE_IDS[i]}.redisraft.host RAFT.CLUSTER INIT
  else
    docker run --rm --network redisraft redis redis-cli -h ${REDISRAFT_NODE_IDS[i]}.redisraft.host RAFT.CLUSTER JOIN $PRIMARY_ID.redisraft.host:6379
  fi
done
```

### Manual
It is also possible to run some manual steps to initialize the cluster. Following these steps may help the user become more familiar with Docker Swarm.

List the nodes on which RedisRaft is running:
```bash
docker node ls --filter "node.label=$REDISRAFT_LABEL=true"
```

The output should look like this:
```
ID                            HOSTNAME    STATUS    AVAILABILITY   MANAGER STATUS   ENGINE VERSION
saeSh9chue6aoqu1ahv3Mah1t     worker-01   Ready     Active                          25.0.3
Zoowou7een6aey9eici6Vaiz9     worker-02   Ready     Active                          25.0.3
aocaingaish5eepoh4aeTh9eo     worker-03   Ready     Active                          25.0.3
```

Next, initialize the cluster with the node ID's. Replace the service ID (`saeSh9chue6aoqu1ahv3Mah1t.redisraft.host`) with the output of the `docker node ls` command. For the first node, run:
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
