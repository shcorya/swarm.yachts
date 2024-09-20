*This stack depends on MariaDB.*

# GLAuth
[GLAuth](https://glauth.github.io/) is a go-lang implementation of the LDAP server protocol that can be configured to utilize a variety of backend storage, including S3 or a SQL database. MySQL/MariaDB, PostgreSQL, and SQLite are supported. A config file can also be used as a backend, which could be deployed as a swarm config. This example stack deployment will use PostgreSQL.

## Setup
First, create the docker config template, which can be used with either MariaDB or PostgreSQL. By using a config template, one can set GLAuth configuration options with environmental variables passed to the swarm service.

### Swarm Config
```bash
cat << EOL | docker config create --template-driver golang glauth_conf -
syslog = false

[ldap]
  enabled = true
  listen = "0.0.0.0:389"

[ldaps]
  enabled = true
  listen = "0.0.0.0:636"
  cert = "{{ env "GLAUTH_CERT_FILE" }}"
  key = "{{ env "GLAUTH_KEY_FILE" }}"

[backend]
  datastore = "plugin"
  plugin = "{{ env "GLAUTH_BACKEND_PLUGIN" }}"
  pluginhandler = "{{ env "GLAUTH_BACKEND_HANDLER" }}"
  database = "{{ secret "glauth_backend_db" }}"

[api]
  enabled = false
EOL
```

### MariaDB Database
Create a new database and user on the MariaDB cluster. This can be done with phpMyAdmin.

### Web Interface
https://github.com/wheelybird/ldap-user-manager

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
    secrets:
      - glauth_backend_db
    volumes:
      - certs:/etc/letsencrypt
    ports:
      - "636:636"
    environment:
      GLAUTH_CERT_FILE: /etc/letsencrypt/live/corya.enterprises/cert.pem
      GLAUTH_KEY_FILE: /etc/letsencrypt/live/corya.enterprises/privkey.pem
      GLAUTH_BACKEND_PLUGIN: mysql.so
      GLAUTH_BACKEND_HANDLER: NewMySQLHandler
    networks:
      - internal
      - mysql
    deploy:
      replicas: 2

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

secrets:
  glauth_backend_db:
    external: true

configs:
  glauth_conf:
    external: true

volumes:
  certs:
    external: true
EOL
```
