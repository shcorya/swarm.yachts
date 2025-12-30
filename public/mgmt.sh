#!/bin/sh
cat << EOL | docker stack deploy -c - mgmt --detach=true
version: "3.2"

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
    attachable: false
    name: mgmt
    driver: overlay
    driver_opts:
      encrypted: "true"
EOL
