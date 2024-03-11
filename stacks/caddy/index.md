*This stack depends on RedisRaft.*

# Caddy

Caddy is an open-source web server that supports automatic, signed SSL/TLS certificate fetching. It can be administered while running allowing for near-zero downtime configuration changes. It can be used as a reverse proxy for Docker Swarm.

Leveraging work from [Lucas Lorentz](https://github.com/lucaslorentz) and his [Caddy-Docker-Proxy](https://github.com/lucaslorentz/caddy-docker-proxy) plugin, Caddy can be configured on-the-fly with Swarm labels.

Caddy does not natively support high-availabiliy data storage, thus, in order to use it in a high-availability mode we must use a plugin. GitHub user [Gamalan](https://github.com/gamalan) has published a [plugin](https://github.com/gamalan/caddy-tlsredis) for storing Caddy certificates in a Redis database. Leveraging RedisRaft for high-availability, one can set up a reverse proxy for Docker Swarm with automatic certificate provisioning without a single point of failure.

## Configuration
To enable CORS, create a new Caddyfile at `/tmp/Caddyfile`:
```
(cors) {
        @cors_preflight{args.0} method OPTIONS
        @cors{args.0} header Origin {args.0}

        handle @cors_preflight{args.0} {
                header {
                        Access-Control-Allow-Origin "{args.0}"
                        Access-Control-Allow-Methods "GET, POST, PUT, PATCH, DELETE, OPTIONS"
                        Access-Control-Allow-Headers *
                        Access-Control-Max-Age "3600"
                        defer
                }
                respond "" 204
        }

        handle @cors{args.0} {
                header {
                        Access-Control-Allow-Origin "{args.0}"
                        Access-Control-Expose-Headers *
                        defer
                }
        }
}
```
Source: https://gist.github.com/ryanburnette/d13575c9ced201e73f8169d3a793c1a3

Create a new Swarm config:
```bash
docker config create Caddyfile /tmp/Caddyfile
```

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
          - "node.role == manager"

  proxy:
    image: coryaent/lowery:master
    ports:
      - target: 80
        published: 80
        mode: host
      - target: 443
        published: 443
        mode: host
    extra_hosts:
      - "node.docker.host:host-gateway"
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
          - "node.labels.enterprises.corya.ingress == true"
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
          - "node.role == worker"
      labels:
        caddy.email: swarm@example.com
        caddy.log: default
        caddy.log.output: stdout
        caddy.log.format: console
        caddy.storage: redis
        caddy.storage.redis.host: redisraft
        caddy.order: "cache before rewrite"
        caddy.cache.allowed_http_verbs: "GET HEAD"

  whoami:
    image: traefik/whoami
    networks:
      - www
    deploy:
      labels:
        caddy: swarm.example.com
        caddy.reverse_proxy: "http://whoami:80"

configs:
  Caddyfile:
    external: true

networks:
  redisraft:
    external: true
  www:
    name: www
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"
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

## Basic Authentication

Basic access authentication can be enabled for a site, configurable by labels. Caddy uses `bcrypt` encryption, optionally encoded with `base64`. Authontication hashes can safely be stored in service labels.

To generate a basic auntentication string:
```bash
echo $(caddy hash-password | base64 -w 0)
```
