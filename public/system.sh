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
    image: registry.gitlab.com/egos-tech/cioban:3.0.7
    environment:
      DOCKER_HOST: tcp://mgmt.internal:2375
      FILTER_SERVICES: label=yachts.swarm.auto-update=true
    networks:
      - mgmt
    deploy:
      placement:
        constraints:
          - node.role == worker

networks:
  mgmt:
    external: true

EOF
