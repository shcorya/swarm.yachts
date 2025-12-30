#!/bin/sh
cat << EOF | docker stack deploy -c - mgmt --detach=true
services:
  socket:
    image: alpine/socat
    command: "-dd TCP-L:2375,fork UNIX:/var/run/docker.sock"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - mgmt
    deploy:
      mode: global
      placement:
        constraints:
          - "node.role == manager"

networks:
  mgmt:
    name: mgmt
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"
EOF