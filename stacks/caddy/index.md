# Caddy

Caddy is an open-source web server that supports automatic, signed SSL/TLS certificate fetching. It can be administered while running allowing for near-zero downtime configuration changes. It can be used as a reverse proxy for Docker Swarm.

Leveraging work from [Lucas Lorentz](https://github.com/lucaslorentz) and his [Caddy-Docker-Proxy](https://github.com/lucaslorentz/caddy-docker-proxy) plugin, Caddy can be configured on-the-fly with Swarm labels.

Caddy does not natively support high-availabiliy data storage, thus, in order to use it in a high-availability mode we must use a plugin. GitHub user [Gamalan](https://github.com/gamalan) has published a [plugin](https://github.com/gamalan/caddy-tlsredis) for storing Caddy certificates in a Redis database. Leveraging RedisRaft for high-availability, one can set up a reverse proxy for Docker Swarm with automatic certificate provisioning without a single point of failure.

## Compose
```yaml
version: '3.7'
x-common-env: &common-env
  CADDY_CONTROLLER_NETWORK: 10.201.200.0/24
  CADDY_INGRESS_NETWORKS: www

services:
  socket:
    image: alpine/socat
    command: "-dd TCP-L:2375,fork UNIX:/var/run/docker.sock"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - internal
    deploy:
      mode: global
      placement:
        constraints:
          - "node.role==manager"

  proxy:
    image: coryaent/lowery:master
    ports:
      - target: 80
        published: 80
        mode: host
      - target: 443
        published: 443
        mode: host
    networks:
      - www
      - control
      - redisraft
    environment:
      <<: *common-env
      CADDY_DOCKER_MODE: server
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.enterprises.corya.ingress==true"
      labels:
        caddy_controlled_server:

  controller:
    image: coryaent/lowery:master
    configs:
      - Caddyfile
    networks:
      - control
      - internal
    environment:
      <<: *common-env
      CADDY_DOCKER_MODE: controller
      DOCKER_HOST: tcp://socket:2375
      CADDY_DOCKER_CADDYFILE_PATH: /Caddyfile
    deploy:
      placement:
        constraints:
          - "node.role==worker"
      labels:
        caddy.email: stephen@corya.net
        caddy.log: default
        caddy.log.output: stdout
        caddy.log.format: console
        caddy.storage: redis
        caddy.storage.redis.host: redisraft

  whoami2:
    image: traefik/whoami
    networks:
      - www
    deploy:
      labels:
        caddy: whoami.corya.co
        caddy.reverse_proxy: "{{upstreams 80}}"

  whoami3:
    image: traefik/whoami
    networks:
      - www
    deploy:
      labels:
        caddy: ingress.corya.enterprises
        caddy.reverse_proxy: "{{upstreams 80}}"

  whoami4:
    image: traefik/whoami
    networks:
      - www
    deploy:
      labels:
        caddy: anycast.corya.enterprises
        caddy.reverse_proxy: "{{upstreams 80}}"

configs:
  Caddyfile:
    external: true

networks:
  redisraft:
    external: true
  www:
    external: true
  control:
    attachable: false
    driver: overlay
    driver_opts:
      encrypted: "true"
    ipam:
      driver: default
      config:
        - subnet: "10.201.200.0/24"
  internal:
    attachable: false
    driver: overlay
    driver_opts:
      encrypted: "true"
```
