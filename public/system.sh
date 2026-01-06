#!/bin/sh
cat << EOF | docker stack deploy -c - system --detach=true
services:
  prune:
    image: docker
    command: ["docker", "system", "prune", "-f"]
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
    deploy:
      mode: global
      labels:
        - "swarm.cronjob.enable=true"
        - "swarm.cronjob.schedule=0 0 0 * * *"
        - "swarm.cronjob.skip-running=false"
      restart_policy:
        condition: none

  updates:
    image: ixdotai/cioban
    volumes:
      - '/var/run/docker.sock:/var/run/docker.sock'
    deploy:
      placement:
        constraints:
          - node.role == manager

EOF