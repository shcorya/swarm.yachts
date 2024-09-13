*This stack depends on RedisRaft.*

# Caddy

[Caddy](https://caddyserver.com/) is an open-source web server that supports automatic, signed SSL/TLS certificate fetching. It can be administered while running allowing for near-zero downtime configuration changes. It can be used as a reverse proxy for Docker Swarm.

Leveraging work from [Lucas Lorentz](https://github.com/lucaslorentz) and his [Caddy-Docker-Proxy](https://github.com/lucaslorentz/caddy-docker-proxy) plugin, Caddy can be configured on-the-fly with Swarm labels. The [Caddy-Docker-Proxy](https://github.com/lucaslorentz/caddy-docker-proxy) README contains extensive documentation and many examples.

Caddy does not natively support high-availabiliy data storage, thus, in order to use it in a high-availability mode we must use a plugin. GitHub user [Gamalan](https://github.com/gamalan) has published a [plugin](https://github.com/gamalan/caddy-tlsredis) for storing Caddy certificates in a Redis database. Leveraging RedisRaft for high-availability, one can set up a reverse proxy for Docker Swarm with automatic certificate provisioning without a single point of failure.

## CNAME DNS Records
Ensure that the requisate alias records have been set in accordance with the [Getting Started](/getting-started/#setting-dns-records) page.

For additional sites, a CNAME record should be set, pointing to the reverse proxy servers. For example, if proxy servers have alias record `swarm.example.com`, and the user wishes to setup a new service at `whoami.example.com`, a CNAME record should be created pointing `whoami.example.com` to `swarm.example.com`.

In order to confirm that the Caddy setup works, `whoami.example.com` is set in the compose file. The `traefik/whoami` image is a simple web server which shows some useful information.

## Environment Setup
Several environment variables need to be set to deploy Caddy properly. First, set up an "ingress" label. This can be changed to reflect the your domain. If the domain is `example.com`, perhaps use `com.example.swarm.ingress`.
```bash
export CADDY_INGRESS_LABEL="yachts.swarm.ingress"
```

Define an array of nodes which will host the reverse proxy.
```bash
read -a CADDY_PROXY_NODES -p "Enter the Caddy proxy node array (space-seperated): "
```

Run this script to apply the label to each node.
```bash
#!/bin/bash
for i in "${!CADDY_PROXY_NODES[@]}"
do
  docker node update --label-add \
  $CADDY_INGRESS_LABEL=true ${CADDY_PROXY_NODES[i]}
done
```

Set the `CADDY_INGRESS_DOMAIN` variable to the domain of the A records that were setup previously. Changing this domain is imperative.
```bash
export CADDY_INGRESS_DOMAIN="swarm.example.com"
```
---
Optionally, set an email address. This email will be used to alert the user of issues with certificate renewals.
```bash
export CADDY_EMAIL="me@example.com"
```

## Create Database
Use the mongo-express UI to create a database `caddy`. Then create a collection within that database `certificates`.

## Configuration
In order to configure CORS in the future, create a new Caddyfile config.
```bash
cat << EOF | docker config create Caddyfile -
# from https://gist.github.com/ryanburnette/d13575c9ced201e73f8169d3a793c1a3
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
EOF
```
Other configuration options can be set by swarm labels.

## Compose
```bash
cat << EOL | docker stack deploy -c - caddy --detach=true
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
      - mongodb
    volumes:
      - /opt/swarm/sockets:/opt/swarm/sockets
    environment:
      <<: *common-env
      CADDY_DOCKER_MODE: server
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.$CADDY_INGRESS_LABEL == true"
      labels:
        caddy_controlled_server:

  controller:
    image: coryaent/lowery:master
    configs:
      - Caddyfile_2
    secrets:
      - caddy_gandi_pat
    networks:
      - control
      - internal
    environment:
      <<: *common-env
      CADDY_DOCKER_MODE: controller
      DOCKER_HOST: tcp://socket:2375
      CADDY_DOCKER_CADDYFILE_PATH: /Caddyfile_2
    deploy:
      placement:
        constraints:
          - "node.role == worker"
      labels:
        caddy.email: ${CADDY_EMAIL:=null@swarm.yachts}
        caddy.log: default
        caddy.log.output: stdout
        caddy.log.format: console
        caddy.storage: mongodb
        caddy.storage.uri: mongodb://mongodb.host:27017
        caddy.storage.database: caddy
        caddy.storage.collection: certificates
        caddy.storage.timeout: 10s
        caddy.order: "cache before rewrite"
        caddy.cache.allowed_http_verbs: "GET HEAD"

  whoami:
    image: traefik/whoami
    networks:
      - www
    deploy:
      labels:
        caddy: $CADDY_INGRESS_DOMAIN
        caddy.reverse_proxy: "http://whoami:80"

configs:
  Caddyfile_2:
    external: true
secrets:
  caddy_gandi_pat:
    external: true

networks:
  mongodb:
    external: true
  www:
    name: www
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"
    ipam:
      driver: default
      config:
        - subnet: "10.255.0.0/16"
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
EOL
```

## Basic Authentication
Basic access authentication can be enabled for a site, configured by labels. Caddy uses `bcrypt` encryption, optionally encoded with `base64`. Encoding with `base64` is highly recommended; otherwise, the user will have to modify the output of the `caddy hash-password`. Authentication hashes can safely be stored in service labels.

To generate a basic auntentication string:
```bash
MY_BASIC_AUTH=$(caddy hash-password | base64 -w 0)
```

To apply that basic authentication requirement to a web service (using an example user `admin`):
```yaml
# ...
  whoami:
    image: traefik/whoami
    networks:
      - www
    deploy:
      labels:
        caddy: $CADDY_INGRESS_DOMAIN
        caddy.reverse_proxy: "http://whoami:80"
        caddy.basicauth.admin: $MY_BASIC_AUTH
# ...
```
