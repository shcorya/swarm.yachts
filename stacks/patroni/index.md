*This stack depends on Caddy and etcd.*

# Patroni

[Patroni](https://patroni.readthedocs.io/en/latest/index.html) is a template for installing PostgreSQL databases in a high-availability situation. It uses a data store, such as etcd or Consul, to track the state of a Patroni cluster.

Being a highly configurable system, Patroni and its related services require a comprably high amount of configuration. Many of these options can (and should) be stored as swarm configs. Some configuration values will also be set by environmental variables.

The setup detailed below configures one synchronous and one asyncronous replica. If one of the syncronous replicas goes offline, the asyncronous replica takes over as the syncronous replica. This setup creates a balance between strong consistency and availability.

## Services
Successful deployment of Patroni depends on sereval services. In general, the database stores data on the designated nodes, the proxy and socat route queries, and pgAdmin provides a convienint, visual means of administering roles and databases.

### Database
The storage of data is handled by a wrapper around PostgreSQL. This service communicates with etcd to determine which node is the master, and HAproxy queries the status of the running tasks of this service to properly route queries.

### HAproxy
Routing is handled by HAproxy. In the configuration below, this service listens on both an internal overlay network and a UNIX socket. A global job is deployed to create the directory within `/run` through which the Swarm node will communicate with HAproxy.

### socat
Local between the node and the proxy via TCP is handled by socat. Because of this, the database can be accessed as though it were local on each Swarm node.

### pgAdmin
pgAdmin is a robust and featureful interface for the administration of PostgreSQL databases. It can store its own configuration in its own PostgreSQL database. This database will be created automatically upon the successful deployment of a Patroni cluster.

## Setup
To start the deployment of a Patroni cluster, it is prudent to label the swarm nodes which will be used to store the data of the database. For example, add the label `yachts.swarm.patroni=true` to each node that will store the Patroni database.

## Secrets
Secrets which need to be set include:

- `postgres_admin_password`
- `patroni_replication_password`
- `patroni_superuser_password`
- `pgadmin_default_password`
- `pgadmin_configdb_password`

Upon starting the Patroni cluster, a user `admin` will be craeted for purposes of creating other roles and databases. It is recommended to use this `admin` account when configuring pgAdmin. Logging in to the database as the superuser or replication user is *not* recommended.

See [Secrets](/stacks/#secrets) for a method to securely create secrets from the command line.

## Configs
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
Creating the config for HAProxy can be done with some manual steps.

#### Manual
First, list the nodes labeled as Patroni database hosts.
```bash
docker node ls --filter node.label=${PATRONI_LABEL:?}=true
```

Output should resemble the following.
```
ID                            HOSTNAME    STATUS    AVAILABILITY   MANAGER STATUS   ENGINE VERSION
saeSh9chue6aoqu1ahv3Mah1t     worker-01   Ready     Active                          25.0.3
Zoowou7een6aey9eici6Vaiz9     worker-02   Ready     Active                          25.0.3
aocaingaish5eepoh4aeTh9eo     worker-03   Ready     Active                          25.0.3
```

The compose file sets the hostname for the database based on the node ID. Both the ID and the hostname should be set in the HAproxy config. At the bottom, there are several lines starting with `server`. These are the hosts to which the proxy may direct incomming queries, depending on the status of the servers. Substitute the sample values below with the output of the above command.

#### Automatic
Alternatively, HAProxy can be created automatically, so long as the environmental variable `PATRONI_LABEL` is set.

```bash
cat << EOL
global
$(printf "\tmaxconn 384")

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
$(printf "\tbind /run/patroni/proxy.sock")
$(printf "\tbind *:5432")
$(printf "\toption httpchk")
$(printf "\thttp-check expect status 200")
$(printf "\tdefault-server inter 2500ms fall 4 rise 2 on-marked-down shutdown-sessions")
$(docker node ls --filter node.label=$PATRONI_LABEL=true --format "\tserver {{.Hostname}} {{.ID}}.patroni.host:15432 maxconn 128 check port 8008")
EOL
```

### pgAdmin
To initialize the pgAdmin configuration store within the PostgreSQL database, the following script is run after database initialization. As this service will only be accessible behind the Caddy reverse proxy, the security of the password is less important than this stack's secrets.

Create the config, an executable script in this case, which will initialize the pgAdmin database upon the bootstrapping of the Patroni cluster.
```bash
cat << EOL | docker config create --template-driver golang init_pgadmin_db -
#!/bin/bash
psql -d "\$1" -c "CREATE USER pgadmin WITH PASSWORD '{{ secret "pgadmin_configdb_password" }}';"
psql -d "\$1" -c "CREATE DATABASE pgadmin OWNER pgadmin;"
EOL
```

Create a pgAdmin system configuration file to set the configuration storage database.
```bash
cat << EOL | docker config create --template-driver golang pgadmin_system.py
CONFIG_DATABASE_URI = 'postgresql://pgadmin:{{ secret "pgadmin_configdb_password" }}@patroni.host:5432/pgadmin?sslmode=disable'
EOL
```

## Compose
```bash
cat << EOL | docker stack deploy -c - patroni
version: '3.8'
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
      PATRONI_SCOPE: enterprises
      PATRONI_ETCD3_HOST: etcd:2379
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.enterprises.corya.patroni == true"
      resources:
        reservations:
          cpus: '2'
          memory: 2G

  mk-socket-dir:
    image: alpine
    command: mkdir -p /run/patroni
    volumes:
      - /run:/run
    deploy:
      mode: global-job

  localhost-tcp:
    image: alpine/socat
    command: "-dd TCP-L:5432,fork,bind=localhost UNIX:/run/patroni/proxy.sock"
    volumes:
      - /run/patroni:/run/patroni
    networks:
      - public
    deploy:
      mode: global
      resources:
        limits:
          memory: 32M

  proxy:
    image: haproxy
    hostname: patroni.host
    user: root
    configs:
    - source: patroni_haproxy_conf
      target: /usr/local/etc/haproxy/haproxy.cfg
    networks:
      - postgres
      - www
    volumes:
      - /run/patroni:/run/patroni
    deploy:
      labels:
        caddy: status.patroni.corya.enterprises
        caddy.reverse_proxy: http://patroni.host:7000
        caddy.basicauth.admin: JDJhJDE0JHZlYUFnci56NzV4ZDZDcmdjSXZMeU9scmVNVndmRTdkVWFiWjVoQkFPbUJ5WlZsL2lIL1BpCg==
      mode: global
      placement:
        constraints:
          - "node.role == worker"
      restart_policy:
        delay: 0s

  pgadmin:
    image: dpage/pgadmin4
    environment:
      PGADMIN_DEFAULT_EMAIL: stephen@corya.co
      PGADMIN_DEFAULT_PASSWORD_FILE: /run/secrets/pgadmin_default_password_2
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
        caddy: pgadmin.patroni.corya.enterprises
        caddy.reverse_proxy: http://pgadmin:80
      placement:
        constraints:
          - "node.role == worker"

configs:
  patroni_conf:
    external: true
  patroni_haproxy_conf:
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
