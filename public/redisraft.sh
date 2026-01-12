#!/bin/bash

export REDISRAFT_LABEL=yahts.swarm.redisraft

# read variables
export REDISRAFT_NODES
read -a REDISRAFT_NODES -p "Enter the RedisRaft node array (space-seperated): "

# apply the label to the selected nodes.
```bash
#!/bin/bash
for i in "${!REDISRAFT_NODES[@]}"
do
  docker node update --label-add $REDISRAFT_LABEL=true ${REDISRAFT_NODES[i]}
done

# create the docker configuration
cat <<EOF | docker config create --template-driver golang redisraft_conf -
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
raft.addr {{.Node.ID}}.redisraft.internal:6379
EOF

# deploy the stack
cat <<EOF | docker stack deploy --detach=true -c - redisraft
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
EOF