*This stack depends on Caddy.*

# Garage
[Garage](https://garagehq.deuxfleurs.fr/) is a distributed object storage program that implements the Amazon S3 protocol. Garage uses conflict-free replicated data types coupled with a quorum system to provide consistency and high availability.

This stack will utilize both types of Garage nodes, gateways and storage. While this may complicate the setup, it will significantly improve network performance.

A [consul](https://hub.docker.com/_/consul) service will be deployed as part of this stack. This allows the garage nodes to exchange gossip messages and assists with automatic privisioning. Opening a user interface to consul through the web allows the user to visualize which nodes are able to reach one another. For the sake of system security, it is advisable to add [basic authentication](https://swarm.yacts/stacks/caddy/#basic-authentication) to this service.

## Provisioning Storage Nodes
The basic nodes detailed in the [Getting Started](/getting-started/#basic-node-provisioning) section will likely not be adequate for data storage; therefore, additional nodes should be provisioned. In the same manner as the Getting Started section, the storage nodes should be provisioned as workers.

Nodes with large storage devices can be obtained from providers including [Alwyzon](https://www.alwyzon.com/en), [Crunchbits](https://crunchbits.com/) and [ServaRICA](https://servarica.com/).

After deployment, `docker node ls` should output something similar to the following.
```
ID                            HOSTNAME      STATUS    AVAILABILITY   MANAGER STATUS   ENGINE VERSION
aZohnao5Eem2vafaeTh1ohgh5 *   manager-01    Ready     Active         Leader           25.0.3
dovei3zou4eiJai6fu3uraefo     manager-02    Ready     Active         Reachable        25.0.3
ouChaGh1phe1ahmail2ieT6ei     manager-03    Ready     Active         Reachable        25.0.3
saeSh9chue6aoqu1ahv3Mah1t     worker-01     Ready     Active                          25.0.3
Zoowou7een6aey9eici6Vaiz9     worker-02     Ready     Active                          25.0.3
aocaingaish5eepoh4aeTh9eo     worker-03     Ready     Active                          25.0.3
Vom7EiRi2Eoz1iem2AhghaeCe     storage-01    Ready     Active                          25.0.3
zeCho8aequei8ahTaitai2Yai     storage-02    Ready     Active                          25.0.3
phaema7tahjeibi5OhKo2aif2     storage-03    Ready     Active                          25.0.3
```

## Setup
The configuration in this guide will run a Garage gateway node on each basic worker node and a Garage store on each of the storage nodes. A custom container called [Gordon](https://github.com/coryaent/gordon) will be used to assist in the creation of our Garage cluster.

### Node Labels
Garage requires the use of zones and capacity to define its nodes. Optional tags can also be applied. We will apply these to our cluster nodes, and these labels will be read by the initialization job and applied to the garage cluster.

#### Zone
Garage requires the definition of a zone for each node. Define a swarm node label key that will be read by the garage initialization service.
```bash
exports GARAGE_ZONE_LABEL="yacts.swarm.garage.zone"
```
Add an appropriate zone label to each node that will be part of your garage cluster. For example, if you have a node in Indianapolis, you might set its label as `yaghts.swarm.garage.zone=us-ind`. This needs to be done for each node.

To configure a gateway node, set its capacity to `null`.

#### Capacity
In addition to a zone, garage requires each node to have a capacity. Define another swarm node label key.
```bash
exports GARAGE_CAPACITY_LABEL="yachts.swarm.garage.capacity"
```

The capacity is measured in bytes, so if you have a server where you want to store 100 GB, add a labal to your swarm node such as `yachts.swarm.garage.capacity=100000000000`.

#### Capacity
Optionally, each garage node can have one or more tags assigned. Like with zone and capacity, define a swarm node label that will be read into the garage layout.
```bash
exports GARAGE_TAGS_LABEL="yachts.swarm.garage.tags"
```
This will be read as a comma-seperated array. If you want to add the tags `ssd` and `raid-10` to a node, add a swarm label `yachts.swarm.garage.tags=ssd,raid-10`.

## Configuration
Run this script to create the config template `garage_tmpl`.
```bash
cat << EOL | docker config create --template-driver golang garage_tmpl -
replication_mode = "3"

metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
metadata_fsync = true
data_fsync = false

db_engine = "sqlite"

block_size = 1048576
compression_level = 1

rpc_bind_addr = "0.0.0.0:3901"
rpc_public_addr = "{{ env "GARAGE_RPC_PUBLIC_ADDRESS" }}:3901"

[s3_api]
api_bind_addr = "{{ env "GARAGE_S3_BIND_ADDR" }}"
s3_region = "global"
root_domain = ".s3.corya.enterprises"

[s3_web]
bind_addr = "{{ env "GARAGE_WEB_BIND_ADDR" }}"
root_domain = ".web.corya.enterprises"
index = "index.html"

[admin]
api_bind_addr = "0.0.0.0:3903"

[consul_discovery]
api = "catalog"
consul_http_addr = "http://discovery:8500"
service_name = "garage"
EOL
```

## Secrets
Three secrets are required to secure Garage. One is for RPC, another for metrics, and another for administration. The administration token will be needed to create new buckets; it needs to be retained outside of the swarm. Recomendation: use a password manager.

```bash
openssl rand -hex 32 | docker secret create garage_rpc_secret -
```

```bash
openssl rand -base64 32 | docker secret create garage_metrics_token -
```

```bash
openssl rand -base64 32 | tee /dev/stderr | docker secret create garage_admin_token - > /dev/null
```

## Compose
```bash
cat << EOL | docker stack deploy -c - garage
version: '3.8'

x-garage-image: &garage-image
  image: dxflrs/garage:v1.0.0

x-shared-confgs: &shared-configs
  configs:
    - source: garage_tmpl
      target: /etc/garage.toml

x-shared-secrets: &shared-secrets
  secrets:
    - source: garage_rpc_secret
      mode: 0600
    - source: garage_metrics_token
      mode: 0600
    - source: garage_admin_token
      mode: 0600

x-shared-env: &shared-env
  GARAGE_RPC_SECRET_FILE: /run/secrets/garage_rpc_secret
  GARAGE_METRICS_TOKEN_FILE: /run/secrets/garage_metrics_token
  GARAGE_ADMIN_TOKEN_FILE: /run/secrets/garage_admin_token
  GARAGE_RPC_PUBLIC_ADDRESS: "{{.Node.Hostname}}.corya.enterprises"

x-rpc-port: &rpc-port
  ports:
    - published: 3901
      target: 3901
      mode: host

services:
  discovery:
    image: consul:1.15
    environment:
      CONSUL_BIND_INTERFACE: eth0
    networks:
      internal:
      www:
        aliases:
          - garage.discovery.host
    deploy:
      labels:
        caddy: garage.corya.enterprises
        caddy.reverse_proxy: garage.discovery.host:8500
        caddy.basicauth.admin: JDJhJDE0JGNiZFpXSEJTbTEueWZSaUJYbThHb3ViWVcwb0o1emVJNVZvWGk5VjYwREwuLmVmWUo0djZXCg==
      placement:
        constraints:
          - "node.role == worker"

  init:
    image: coryaent/gordon:master
    command: --init
    environment:
      GORDON_EXPECTED_NODE_COUNT: 7
      GORDON_ADMIN_ENDPOINT: garage.host:3903
      GORDON_ADMIN_TOKEN_FILE: /run/secrets/garage_admin_token
      GORDON_CAPACITY_LABEL: enterprises.corya.garage.capacity
      GORDON_ZONE_LABEL: enterprises.corya.garage.zone
      GORDON_TAGS_LABEL: enterprises.corya.garage.tags
    secrets:
      - garage_admin_token
    networks:
      - internal
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    secrets:
      - source: garage_admin_token
        mode: 0600
    deploy:
      mode: replicated-job
      replicas: 1
      restart_policy:
        condition: on-failure

  storage:
    <<: *garage-image
    <<: *shared-configs
    <<: *shared-secrets
    <<: *rpc-port
    hostname: "{{.Node.ID}}"
    networks:
      internal:
        aliases:
          - garage.host
    environment:
      <<: *shared-env
      GARAGE_S3_BIND_ADDR: "0.0.0.0:3900"
      GARAGE_WEB_BIND_ADDR: "0.0.0.0:3902"
    volumes:
      - data:/var/lib/garage/data
      - metadata:/var/lib/garage/meta
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.enterprises.corya.garage == storage"

  gateway:
    <<: *garage-image
    <<: *shared-configs
    <<: *shared-secrets
    <<: *rpc-port
    hostname: "{{.Node.ID}}"
    networks:
      internal:
        aliases:
          - garage.host
    environment:
      <<: *shared-env
      GARAGE_S3_BIND_ADDR: /opt/swarm/sockets/s3.sock
      GARAGE_WEB_BIND_ADDR: /opt/swarm/sockets/web.sock
    volumes:
      - /opt/swarm/sockets/:/opt/swarm/sockets/
      - data:/var/lib/garage/data
      - metadata:/var/lib/garage/meta
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.enterprises.corya.ingress == true"
      labels:
        caddy_0: "s3.corya.enterprises, *.s3.corya.enterprises"
        caddy_0.reverse_proxy: "unix//opt/swarm/sockets/s3.sock"
        caddy_1: "*.web.corya.enterprises"
        caddy_1.reverse_proxy: "unix//opt/swarm/sockets/web.sock"
        caddy_1.cache.ttl: 120s # default value

configs:
  garage_tmpl:
    external: true

networks:
  internal:
    name: garage
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"
  public:
    external: true
    name: host
  www:
    external: true

volumes:
  data:
    driver: local
  metadata:
    driver: local

secrets:
  garage_rpc_secret:
    external: true
  garage_metrics_token:
    external: true
  garage_admin_token:
    external: true
EOL
```
## Creating Buckets
```bash
docker run -it --rm --network garage -e GORDON_NEW_BUCKET_NAME=default -e GORDON_ADMIN_TOKEN=$GARAGE_ADMIN_TOKEN -e GORDON_ADMIN_ENDPOINT=garage.host:3903 coryaent/gordon --create-bucket
```
