#!/bin/sh
read -p "Enter timezone: " TIMEZONE
cat << EOF | docker stack deploy -c - cron --detach=true
services:
  scheduler:
    image: crazymax/swarm-cronjob
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
    environment:
      - "TZ=${TIMEZONE:=America/Indiana/Indianapolis}"
      - "LOG_LEVEL=info"
      - "LOG_JSON=false"
      - "DOCKER_HOST=tcp://socket:2375"
    networks:
      - internal
    deploy:
      placement:
        constraints:
          - node.role == worker

networks:
  mgmt:
    external: true
EOF