*This stack depends on Caddy and etcd.*

# Patroni

[Patroni](https://patroni.readthedocs.io/en/latest/index.html) is a template for installing PostgreSQL databases in a high-availability situation. It uses a data store, such as etcd or Consul, to track the state of a Patroni cluster.

Being a highly configurable system, Patroni and its related services require a comprably high amount of configuration. Many of these options can (and should) be stored as swarm configs. Some configuration values will also be set by environmental variables.

The setup detailed below configures one synchronous and one asyncronous replica. If one of the syncronous replicas goes offline, the asyncronous replica takes over as the syncronous replica. This setup creates a balance between strong consistency and availability.

## Services
Successful deployment of Patroni depends on sereval services. In general, the database stores data on the designated nodes, the proxy and socat route queries, and pgAdmin provides a convienint, visual means of administering roles and databases. This stack creates a service running on each swarm node which allows accessing PostgreSQL through HAProxy on each local host.

### Database
The storage of data is handled by a wrapper around PostgreSQL. This service communicates with etcd to determine which node is the master, and HAproxy queries the status of the running tasks of this service to properly route queries.

### HAproxy
Routing is handled by HAproxy. In the configuration below, this service listens on both an internal overlay network and a UNIX socket. A global job was created in the System stack to create the directory `/opt/swarm/sockets` through which the Swarm node will communicate with HAproxy.

### socat
Local between the node and the proxy via TCP is handled by socat. Because of this, the database can be accessed as though it were local on each Swarm node.

### pgAdmin
pgAdmin is a robust and featureful interface for the administration of PostgreSQL databases. It can store its own configuration in its own PostgreSQL database. This database will be created automatically upon the successful deployment of a Patroni cluster.

## Setup
We will setup our Patroni cluster with [semisynchronous replication](/stacks/mariadb/#semisynchronous-replication).

### Environment
Define the label which will indicate which nodes store our persistent Patroni data.
```bash
export PATRONI_LABEL="yachts.swarm.patroni"
```

Select which nodes will run the databases.
```bash
read -a PATRONI_DB_NODES -p "Enter the array of Patroni database nodes (space-seperated): "
```

Apply the label to the database nodes.
```bash
#!/bin/bash
for i in "${!PATRONI_DB_NODES[@]}"
do
  docker node update --label-add $PATRONI_LABEL=storage ${PATRONI_DB_NODES[i]}
done
```

A password should be set to access the status page.
```bash
export PATRONI_STATUS_BASIC_AUTH=$(caddy hash-password | base64 -w 0)
```

Set the default email which will be used to login to pgAdmin.
```bash
export PGADMIN_DEFAULT_EMAIL="me@example.com"
```

Additionally, set the domain by which pgAdmin will be accessed.
```bash
export PGADMIN_ACCESS_DOMAIN="pgadmin.example.com"
```

Finally, set the domain for the status page:
```bash
export PATRONI_STATUS_DOMAIN="pgstatus.example.com"
```

### Secrets
Secrets which need to be set include:

- `postgres_admin_password`
- `patroni_replication_password`
- `patroni_superuser_password`
- `pgadmin_default_password`

Upon starting the Patroni cluster, a user `admin` will be created for purposes of creating other roles and databases. It is recommended to use this `admin` account when configuring pgAdmin. Logging in to the database as the superuser or replication user is *not* recommended.

Retention of the `pgadmin_default_password` and the `postgres_admin_password` is important. Again, these should be stored in a password manager. Run these commands to generate pseudorandom passwords, printed to the console.
```bash
pwgen 24 1 | tee /dev/stderr | docker secret create pgadmin_default_password - > /dev/null
```
```bash
pwgen 24 1 | tee /dev/stderr | docker secret create postgres_admin_password - > /dev/null
```

Retention of the `patroni_replication_password` and `patroni_superuser_password` passwords outside of little importance (again, it is not recommended to use these to log in to the database,) and they can set without storing them externally e.g. without the use of a password manager.
```bash
openssl rand -hex 32 | docker secret create patroni_replication_password -
```
```bash
openssl rand -hex 32 | docker secret create patroni_superuser_password -
```

## Configuration
The Patroni stack requires several configuration files. Templates will be utilized to reference secret values within configs.

### Dynamic Configuration Settings
The main configuration file is `patroni.yml`. This file contains the initial cluster configuration (also called the Distributed Communication Store,) for the purpose of bootstrapping (among other things.) Extensive documentation can be found [here](https://patroni.readthedocs.io/en/latest/dynamic_configuration.html).

Notice that there is a script option defined by `post_init`. This can be used to create a role and a database.

```bash
cat << EOL | docker config create --template-driver golang patroni_conf -
# patroni.yml
bootstrap:
  # Initial DCS config
  dcs:
    # Leader election settings
    ttl: 20                          # Time before failover (minimum allowed)
    loop_wait: 2                     # Time between voting?
    retry_timeout: 5                 # Time before retrying DCS / Postgres
    maximum_lag_on_failover: 1048576 # Maximum bytes a follower may lag to be able to participate in leader election (1 MB)
    # Replication settings
    synchronous_mode: true           # Turn on synchronous replication
    synchronous_mode_strict: true    # Reject writes when there is no synchronous replica
    synchronous_node_count: 1        # Synchronous commit to 1 other node, async to other
    # Postgres settings
    postgresql:
      parameters:
        max_connections: 256         # Max number of client connections
      # Recovery
      use_pg_rewind: true            # Catch up node automatically when am old master comes back online
      use_slots: true
      remove_data_directory_on_diverged_timelines: false
      remove_data_directory_on_rewind_failure: true

  initdb:
    - encoding: UTF8
    - data-checksums

  # Postgres inbound connection rules
  pg_hba:
    - host replication replicator 0.0.0.0/0 md5
    - host all all 0.0.0.0/0 md5

  users:
    admin:
      password: {{ secret "postgres_admin_password" }}
      options:
        - createrole
        - createdb

  post_init: /usr/local/bin/init-pgadmin-db.sh

postgresql:
  authentication:
    replication:
      username: replicator
      password: {{ secret "patroni_replication_password" }}
    superuser:
      username: postgres
      password: {{ secret "patroni_superuser_password" }}

tags:
  nofailover: false    # Node *can* participate in leader race if false (default)
  noloadbalance: false # (default)
  clonefrom: false     # (default)
  nosync: false        # The node *can* be selected as a synchronous replica if false
EOL
```

### HAproxy
The compose file sets the hostname for the database based on the node ID. Both the ID and the hostname should be set in the HAproxy config. At the bottom, there are several lines starting with `server`. These are the hosts to which the proxy may direct incomming queries, depending on the status of the servers.

The HAProxy config can be created programatically, so long as the environmental variable `PATRONI_LABEL` is set.
```bash
cat << EOL | docker config create patroni_proxy_conf -
global
$(printf "\tmaxconn 256")

defaults
$(printf "\tlog global")
$(printf "\tmode tcp")
$(printf "\tretries 2")
$(printf "\ttimeout client 30m")
$(printf "\ttimeout connect 4s")
$(printf "\ttimeout server 30m")
$(printf "\ttimeout check 5s")

listen stats
$(printf "\tmode http")
$(printf "\tbind *:7000")
$(printf "\tstats enable")
$(printf "\tstats uri /")

listen manning
$(printf "\tbind /opt/swarm/sockets/patroni.sock")
$(printf "\tbind *:5432")
$(printf "\toption httpchk")
$(printf "\thttp-check expect status 200")
$(printf "\tdefault-server inter 2500ms fall 4 rise 2 on-marked-down shutdown-sessions")
$(docker node ls --filter node.label=$PATRONI_LABEL=storage --format "\tserver {{.Hostname}} {{.ID}}.patroni.host:15432 maxconn 256 check port 8008")
EOL
```

### pgAdmin
To initialize the pgAdmin configuration store within the PostgreSQL database, the following script is run after database initialization. As this service will only be accessible behind the Caddy reverse proxy, the security of the password is less important than this stack's secrets.

Create the config, an executable script in this case, which will initialize the pgAdmin database upon the bootstrapping of the Patroni cluster.
```bash
cat << EOL | docker config create init_pgadmin_db -
#!/bin/bash
psql -d "\$1" -c "CREATE USER pgadmin WITH PASSWORD 'access';"
psql -d "\$1" -c "CREATE DATABASE pgadmin OWNER pgadmin;"
EOL
```

## Compose
```bash
cat << EOL | docker stack deploy -c - patroni --detach=true
version: '3.8'

x-socket: &socket
  volumes:
    - /opt/swarm/sockets:/opt/swarm/sockets
  networks:
    - public
  deploy:
    mode: global
    resources:
      limits:
        memory: 32M

services:
  database:
    image: coryaent/manning:master
    hostname: '{{.Node.ID}}.patroni.host'
    configs:
      - source: patroni_conf
        target: /etc/patroni.yml
      - source: init_pgadmin_db
        target: /usr/local/bin/init-pgadmin-db.sh
        mode: 0777
    secrets:
      - patroni_replication_password
      - patroni_superuser_password
      - postgres_admin_password
    volumes:
      - data:/patroni
    networks:
      - etcd
      - postgres
    environment:
      PATRONI_NAME: '{{.Node.Hostname}}_{{.Node.ID}}'
      PATRONI_NAMESPACE: /manning
      PATRONI_POSTGRESQL_CONNECT_ADDRESS: '{{.Node.ID}}.patroni.host:15432'
      PATRONI_RESTAPI_CONNECT_ADDRESS: '{{.Node.ID}}.patroni.host:15432'
      PATRONI_POSTGRESQL_LISTEN: 0.0.0.0:15432
      PATRONI_SCOPE: swarm
      PATRONI_ETCD3_HOST: etcd:2379
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.$PATRONI_LABEL == storage"

  gateway:
    image: alpine/socat
    extra_hosts:
      - "node.docker.host:host-gateway"
    command: "-dd TCP-L:5432,fork,bind=node.docker.host UNIX:/opt/swarm/sockets/patroni.sock"
    <<: *socket
  
  localhost
    image: alpine/socat
    command: "-dd TCP-L:5432,fork,bind=localhost UNIX:/opt/swarm/sockets/patroni.sock"
    <<: *socket

  proxy:
    image: haproxy
    hostname: patroni.host
    user: root
    configs:
    - source: patroni_proxy_conf
      target: /usr/local/etc/haproxy/haproxy.cfg
    networks:
      - postgres
      - www
    volumes:
      - /opt/swarm/sockets:/opt/swarm/sockets
    deploy:
      labels:
        caddy: $PATRONI_STATUS_DOMAIN
        caddy.reverse_proxy: http://patroni.host:7000
        caddy.basic_auth.admin: $PATRONI_STATUS_BASIC_AUTH
      mode: global
      placement:
        constraints:
          - "node.role == worker"

  pgadmin:
    image: dpage/pgadmin4
    environment:
      PGADMIN_DEFAULT_EMAIL: $PGADMIN_DEFAULT_EMAIL
      PGADMIN_DEFAULT_PASSWORD_FILE: /run/secrets/pgadmin_default_password
      PGADMIN_CONFIG_CONFIG_DATABASE_URI: "'postgresql://pgadmin:access@patroni.host:5432/pgadmin?sslmode=disable'"
      PGADMIN_LISTEN_ADDRESS: 0.0.0.0
      PGADMIN_CONFIG_PROXY_X_HOST_COUNT: 1
      PGADMIN_CONFIG_MAX_LOGIN_ATTEMPTS: 0
    secrets:
      - pgadmin_default_password
    networks:
      - www
      - postgres
    deploy:
      labels:
        caddy: $PGADMIN_ACCESS_DOMAIN
        caddy.reverse_proxy: http://pgadmin:80
      placement:
        constraints:
          - "node.role == worker"

configs:
  patroni_conf:
    external: true
  patroni_proxy_conf:
    external: true
  init_pgadmin_db:
    external: true

secrets:
  pgadmin_default_password:
    external: true
  patroni_replication_password:
    external: true
  patroni_superuser_password:
    external: true
  postgres_admin_password:
    external: true

volumes:
  data:
    driver: local

networks:
  etcd:
    external: true
  www:
    external: true
  postgres:
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"
    name: postgres
    ipam:
      driver: default
      config:
        - subnet: "10.253.0.0/16"
  public:
    external: true
    name: host
EOL
```
