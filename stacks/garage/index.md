# Garage

## Configuration
Run this script to create the config template `garage_tmpl`:
```bash
cat << EOL | docker config create --template-driver golang garage_tmpl -
replication_mode = "3"

metadata_dir = "/var/lib/garage/meta"
data_dir = "/var/lib/garage/data"
metadata_fsync = true
data_fsync = false

db_engine = "lmdb"
lmdb_map_size = "1T"

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

## Compose
```yaml
version: '3.8'

x-garage-image: &garage-image
  image: dxflrs/garage:v0.9.1

x-shared-confgs: &shared-configs
  configs:
    - source: garage_tmpl
      target: /etc/garage.toml

x-shared-secrets: &shared-secrets
  secrets:
    - garage_rpc_secret
    - garage_metrics_token
    - garage_admin_token

x-shared-env: &shared-env
  GARAGE_RPC_PUBLIC_ADDRESS: "{{.Node.Hostname}}.garage.host"
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
        - "node.labels.enterprises.corya.garage == gateway"

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
      GARAGE_S3_BIND_ADDR: 0.0.0.0:3900
      GARAGE_WEB_BIND_ADDR: 0.0.0.0:3902
    volumes:
      - data:/var/lib/garage/data
      - metadata: /var/lib/garage/meta
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.enterprises.corya.garage == storage"

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
    environment:
      <<: *shared-env
      GARAGE_S3_BIND_ADDR: /run/garage/s3.sock
      GARAGE_WEB_BIND_ADDR: /run/garage/web.sock
    volumes:
      - /run/garage:/run/garage
      - data:/var/lib/garage/data
      - metadata: /var/lib/garage/meta
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.enterprises.corya.garage == gateway"
      labels:
        # node.docker.host is defined in the caddy stack
        caddy_0: "s3.corya.enterprises, *.s3.corya.enterprises"
        caddy_0.reverse_proxy: "http://node.docker.host:3900"
        caddy_1: "*.web.corya.enterprises"
        caddy_1.reverse_proxy: "http://node.docker.host:3902"
        caddy_1.cache.ttl: 120s # default value

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
```

