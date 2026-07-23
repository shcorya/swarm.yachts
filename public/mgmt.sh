#!/bin/sh
cat << EOF | docker stack deploy -c - mgmt --detach=true
services:
  socket:
    image: alpine/socat
    command: "-dd TCP-L:2375,fork UNIX:/var/run/docker.sock"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      mgmt:
        aliases:
          - mgmt.internal
          - management.internal
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
      com.docker.network.driver.mtu: "1200"
    ipam:
      driver: default
      config:
        - subnet: "10.253.0.0/16"
EOF
