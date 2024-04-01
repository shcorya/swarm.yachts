*This stack depends on Caddy.*

# Garage
[Garage](https://garagehq.deuxfleurs.fr/) is a distributed object storage program that implements the Amazon S3 protocol. Garage uses conflict-free replicated data types coupled with a quorum system to provide consistency and high availability.

This stack will utilize both types of Garage nodes, gateways and storage. While this may complicate the setup, it will significantly improve network performance.

## Provisioning Storage Nodes
The basic nodes detailed in the [Getting Started](/getting-started/#basic-node-provisioning) section will likely not be adequate for data storage; therefore, additional nodes should be provisioned. One choice for affordable storage nodes is Contabo. A basic [storage VPS](https://contabo.com/en/storage-vps/) from Contabo costs $5.50 per month for 800 GB of SSD storage. Storage nodes are available in different locations which can be used for a multi-region deployment. Consider naming these storage nodes `storage-01`, `storage-02`, and `storage-03`.

Rounding the Contabo price to $6.50 per server, three storage servers will cost about $20 per month. Using the total cost of the RackNerd servers suggested in the [Basic Node Provisioning](/getting-started/#basic-node-provisioning) section plus these storage servers brings the total cost of the Docker Swarm to around $30 per month.

The storage nodes should be setup as Swarm Worker nodes.

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
The configuration in this guide will run a Garage gateway node on each swarm ingress node and a Garage store on each of the storage nodes.

### Environment
Ensure that the [ingress label](/stacks/caddy/#environment-setup) is set for each ingress node (the nodes that run [Caddy](/stacks/caddy/)). The same label should be used for Garage as the Caddy ingress nodes. That is, the Garage gateway nodes should already be labeled.
```bash
export GARAGE_INGRESS_LABEL="yachts.swarm.ingress"
```

Define a label that will apply to the storage nodes. Note that this label will be set to `storage`, not `true`.
```bash
export GARAGE_STORAGE_LABEL="yachts.swarm.garage"
```

Define a `bash` array containing the storage nodes, for example `storage-01 storage-02 storage-03`.
```bash
read -a GARAGE_STORAGE_NODES -p "Garage storage nodes (space-seperated): "
```

Apply the storage label to the selected nodes.
```bash
#!/bin/bash
for i in "${!GARAGE_STORAGE_NODES[@]}"
do
  docker node update --label-add $GARAGE_STORAGE_LABEL=storage ${GARAGE_STORAGE_NODES[i]}
done
```

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

[admin]
api_bind_addr = "0.0.0.0:3903"
EOL
```

## Secrets
Three secrets are required to secure Garage. One is for RPC, another for metrics, and another for administration. The RPC secret should be 64 characters (32 hex encoded bytes) long, and the other secrets should be 44 characters long.

The RPC secret will be needed to configure the nodes, it needs to be retained outside of the swarm.
```bash
openssl rand -hex 32
```

```bash
openssl rand -base64 32 | docker secret create garage_metrics_token -
```

```bash
openssl rand -base64 32 | docker secret create garage_admin_token -
```

## Compose
```bash
cat << EOL | docker stack deploy -c - garage
version: '3.8'

x-garage-image: &garage-image
  image: dxflrs/garage:v0.9.1

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

x-local-socket: &local-socket
  image: alpine/socat
  volumes:
    - /run/garage:/run/garage
  networks:
    - public
  deploy:
    mode: global
    placement:
      constraints:
        - "node.labels.$GARAGE_INGRESS_LABEL == true"

services:
  mk-socket-dir:
    image: alpine
    command: mkdir -p /run/garage
    volumes:
      - /run:/run
    deploy:
      mode: global-job


  storage:
    <<: *garage-image
    <<: *shared-configs
    <<: *shared-secrets
    hostname: "{{.Node.Hostname}}.garage.host"
    networks:
      - internal
    environment:
      <<: *shared-env
      GARAGE_RPC_PUBLIC_ADDRESS: "{{.Node.Hostname}}.storage.garage.host"
      GARAGE_S3_BIND_ADDR: 0.0.0.0:3900
      GARAGE_WEB_BIND_ADDR: 0.0.0.0:3902
    volumes:
      - data:/var/lib/garage/data
      - metadata:/var/lib/garage/meta
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.$GARAGE_STORAGE_LABEL == storage"

  s3-localhost:
    <<: *local-socket
    command: "-dd TCP-L:3900,fork,bind=localhost UNIX:/run/garage/s3.sock"

  web-localhost:
    <<: *local-socket
    command: "-dd TCP-L:3902,fork,bind=localhost UNIX:/run/garage/web.sock"

  gateway:
    <<: *garage-image
    <<: *shared-configs
    <<: *shared-secrets
    hostname: "{{.Node.Hostname}}.garage.host"
    networks:
      - internal
    environment:
      <<: *shared-env
      GARAGE_RPC_PUBLIC_ADDRESS: "{{.Node.Hostname}}.gateway.garage.host"
      GARAGE_S3_BIND_ADDR: /run/garage/s3.sock
      GARAGE_WEB_BIND_ADDR: /run/garage/web.sock
    volumes:
      - /run/garage:/run/garage
      - data:/var/lib/garage/data
      - metadata:/var/lib/garage/meta
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.$GARAGE_INGRESS_LABEL == true"
      labels:
        # node.docker.host is defined in the caddy stack
        caddy_0: "s3.corya.enterprises, *.s3.corya.enterprises"
        caddy_0.reverse_proxy: "http://node.docker.host:3900"
        caddy_1: "*.web.corya.enterprises"
        caddy_1.reverse_proxy: "http://node.docker.host:3902"
        caddy_1.cache.ttl: 120s # default value

configs:
  garage_tmpl:
    external: true

networks:
  internal:
    attachable: false
    driver: overlay
    driver_opts:
      encrypted: "true"
  public:
    external: true
    name: host

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

## After Deployment
Garage requires multiple manual steps be taken in order to initialize the deployed stack. First, each node needs to be connected with the other nodes. Then, each node needs to be assigned a zone and storage capacity.

### Connecting Nodes
Upon start, each node will have generated a unique ID. SSH into one of the hosts running either a gateway or storage node, for example `worker-01` or `storage-01`. Run `docker ps | grep garage` to get the list of Garage containers running on the host. Output should resemble the following.
```
CONTAINER ID   IMAGE                  COMMAND                  CREATED          STATUS          PORTS     NAMES
sa2Uugha4Ook   dxflrs/garage:v0.9.1   "/garage server"         20 minutes ago   Up 20 minutes             garage_gateway.ih1diSuv6iyio0Nuujae4OeGe.ulaengeiseeZ4phihiew9reey
```

Execute this command to get the Garage node ID, replacing the container ID with the container ID from the `docker ps` command output.
```bash
docker exec -it sa2Uugha4Ook /garage node id
```

Output will include the Garage node ID, for example:
```
febe21a53ae87d29820a761922df5cf0ee67a18d3765ba2758a63fe0d007f55f@worker-01.gateway.garage.host:3901
```

SSH into each additional host running a Garage node, and connect each one to the Garage cluster. If one Swarm node is running both a Garage gateway and Garage storage node, be sure to add both to the Garage cluster.

More details about node connections can be found in the [official documentation](https://garagehq.deuxfleurs.fr/documentation/cookbook/real-world/#connecting-nodes-together).

### Cluster Layout


After the Garage stack has been deployed, it is necessary to [create a cluster layout](https://garagehq.deuxfleurs.fr/documentation/cookbook/real-world/#creating-a-cluster-layout).
