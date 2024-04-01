*This stack depends on Patroni or MariaDB for high availability.*

# GLAuth
[GLAuth](https://glauth.github.io/) is a go-lang implementation of the LDAP server protocol that can be configured to utilize a variety of backend storage, including S3 or a SQL database. MySQL/MariaDB, PostgreSQL, and SQLite are supported. A config file can also be used as a backend, which could be deployed as a swarm config. This example stack deployment will use PostgreSQL.

## Setup
First, create the docker config template, which can be used with either MariaDB or PostgreSQL. By using a config template, one can set GLAuth configuration options with environmental variables passed to the swarm service.

### Swarm Configs
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

The php framework that phpLDAPadmin uses is called Laravel. By inspected the `Dockerfile`, we can see that the `.env.example` file from the [source repository](https://github.com/leenooks/phpLDAPadmin) is copied to `/var/www/html/.env` during the docker compilation.
```Dockerfile
FROM registry.dege.au/leenooks/php:8.1-fpm-ldap

COPY . /var/www/html/

RUN mkdir -p ${COMPOSER_HOME} && \
	([ -r auth.json ] && mv auth.json ${COMPOSER_HOME}) || true && \
	touch .composer.refresh && \
	mv .env.example .env && \
	FORCE_PERMS=1 NGINX_START=FALSE /sbin/init && \
	rm -rf ${COMPOSER_HOME}/* composer.lock
```

We need to overwrite the `.env` file at `/var/www/html/.env` with our custom file.
```bash
cat << EOL | docker config create --template-driver golang pla_dotenv
APP_NAME=Laravel
APP_ENV=production
APP_KEY=
APP_DEBUG=true
APP_URL=http://localhost

LOG_CHANNEL=stack

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=laravel
DB_USERNAME=root
DB_PASSWORD=

BROADCAST_DRIVER=log
CACHE_DRIVER=file
QUEUE_CONNECTION=sync
SESSION_DRIVER=file
SESSION_LIFETIME=120

REDIS_HOST=127.0.0.1
REDIS_PASSWORD=null
REDIS_PORT=6379

MAIL_DRIVER=smtp
MAIL_HOST=smtp.mailtrap.io
MAIL_PORT=2525
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_ENCRYPTION=null
MAIL_FROM_ADDRESS=null
MAIL_FROM_NAME="${APP_NAME}"

AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=

PUSHER_APP_ID=
PUSHER_APP_KEY=
PUSHER_APP_SECRET=
PUSHER_APP_CLUSTER=mt1

MIX_PUSHER_APP_KEY="${PUSHER_APP_KEY}"
MIX_PUSHER_APP_CLUSTER="${PUSHER_APP_CLUSTER}"

LDAP_HOST=
LDAP_BASE_DN=
LDAP_USERNAME=
LDAP_PASSWORD=
EOL
```

### MariaDB Database
Create a new database and user on the MariaDB cluster. This can be done with phpMyAdmin.

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
