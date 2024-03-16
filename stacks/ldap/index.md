*This stack depends on Patroni or MariaDB for high availability.*

# GLAuth
[GLAuth](https://glauth.github.io/) is a go-lang implementation of the LDAP server protocol that can be configured to utilize a variety of backend storage, including S3 or a SQL database. MySQL/MariaDB, PostgreSQL, and SQLite are supported. A config file can also be used as a backend, which could be deployed as a swarm config. This example stack deployment will use PostgreSQL.

## Configuration
First, create the docker config template, which can be used with either MariaDB or PostgreSQL. By using a config template, one can set GLAuth configuration options with environmental variables add to the swarm service.

### Swarm Config
```bash
cat << EOL | docker config create --template-driver golang glauth_conf -
[ldap]
  enabled = true
  listen = "0.0.0.0:389"
  tls = false

[ldaps]
  enabled = false

[backend]
  datastore = "plugin"
  plugin = "{{ env "GLAUTH_BACKEND_PLUGIN" }}"
  pluginhandler = "{{ env "GLAUTH_BACKEND_HANDLER" }}"
  database = "{{ env "GLAUTH_BACKEND_ENDPOINT" }}"

[api]
  enabled = true
  internals = true
  listen = "0.0.0.0:5555"
EOL
```

### PostgreSQL Database
Create a new database on the PostgreSQL instance. This can be done with pgAdmin or `psql`.

## Compose
```bash
cat << EOL | docker stack deploy -c - ldap
version: '3.8'

services:

  glauth:
    image: glauth/glauth-plugins
    hostname: ldap.host
    configs:
      - source: glauth_conf
        target: /app/config/config.cfg
    environment:
      GLAUTH_BACKEND_PLUGIN: postgres.so
      GLAUTH_BACKEND_HANDLER: NewPostgresHandler
      GLAUTH_BACKEND_ENDPOINT:
    networks:
      - internal
      - postgres
    deploy:
      replicas: 2
      labels:
        caddy: ldap.corya.enterprises
        caddy.reverse_proxy: http://ldap.host:5555

  mk-socket-dir:
    image: alpine
    command: mkdir -p /run/glauth
    volumes:
      - /run:/run
    deploy:
      mode: global-job

  socket-in:
    image: alpine/socat
    command: "-dd TCP-L:389,fork,bind=localhost UNIX:/run/glauth/glauth.sock"
    volumes:
      - /run/glauth:/run/glauth
    networks:
      - public
    deploy:
      mode: global

  socket-out:
    image: alpine/socat
    command: "-dd UNIX-L:/run/glauth/glauth.sock,fork TCP:ldap.host:389"
    volumes:
      - /run/glauth:/run/glauth
    networks:
      - internal
    deploy:
      mode: global

networks:
  internal:
    name: ldap
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"
    ipam:
      driver: default
      config:
        - subnet: "10.252.0.0/16"
  public:
    external: true
    name: host

configs:
  glauth_conf:
    external: true
EOL
```
