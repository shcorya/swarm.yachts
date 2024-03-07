*This stack depends on Caddy and etcd.*

# Patroni

[Patroni](https://patroni.readthedocs.io/en/latest/index.html) is a "template" for installing PostgreSQL databases in a high-availability situation. It uses a data store, such as etcd or Consul, to track the state of a Patroni cluster.

Being a highly configurable system, Patroni and its related services require a comprably high amount of configuration. Many of these options can (and should) be stored as swarm configs. Some configuration values will also be set by environmental variables.

## Setup
To start the deployment of a Patroni cluster, it is prudent to label the swarm nodes which will be used to store the data of the database. For example, add the label `com.example.patroni=true` to each node that will store the Patroni database.

### Configuration
The main configuration file is `patroni.yml`. This file contains the initial cluster configuration (also called the Distributed Communication Store,) for the purpose of bootstrapping (among other things.) Extensive documentation can be found [here](https://patroni.readthedocs.io/en/latest/dynamic_configuration.html).

Notice that there is a script option defined by `post_init`. This can be used to create a role and a database.
```yaml
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
```

### HAproxy
```
global
    maxconn 384

defaults
    log global
    mode tcp
    retries 2
    timeout client 30m
    timeout connect 4s
    timeout server 30m
    timeout check 5s

listen stats
    mode http
    bind *:7000
    stats enable
    stats uri /

listen manning
    bind /run/patroni/proxy.sock
    bind *:5432
    option httpchk
    http-check expect status 200
    default-server inter 2500ms fall 4 rise 2 on-marked-down shutdown-sessions
    server manager manager.patroni.host:15432 maxconn 128 check port 8008
    server worker-01 worker-01.patroni.host:15432 maxconn 128 check port 8008
    server worker-02 worker-02.patroni.host:15432 maxconn 128 check port 8008
```

### pgAdmin
To initialize the pgAdmin configuration store within the PostgreSQL database, the following script is run after database initialization.
```bash
#!/bin/bash
psql -d "$1" -c "CREATE USER pgadmin WITH PASSWORD 'access';"
psql -d "$1" -c "CREATE DATABASE pgadmin OWNER pgadmin;"
```

## Compose
```yaml
version: '3.8'

services:
  database:
    image: coryaent/manning:master
    hostname: '{{.Node.ID}}.patroni.host'
    configs:
      - source: patroni_conf
        target: /etc/patroni.yml
      - source: init_pgadmin_db_2
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
    command: mkdir /run/patroni
    volumes:
      - /run:/run
    deploy:
      mode: global-job

  localhost-ingress:
    image: alpine/socat
    command: "-dd TCP-L:5432,fork,bind=localhost UNIX:/run/patroni/proxy.sock"
    volumes:
      - /run/patroni:/run/patroni
    networks:
      - public
    deploy:
      mode: global
      placement:
        constraints:
          - "node.role == worker"

  haproxy:
    image: haproxy
    hostname: haproxy.patroni.host
    volumes:
      - /run/patroni:/run/patroni
    configs:
    - source: haproxy_conf
      target: /usr/local/etc/haproxy/haproxy.cfg
    networks:
      - postgres
      - www
    deploy:
      mode: global
      placement:
        constraints:
          - node.role == worker
      restart_policy:
        delay: 0s
      labels:
        caddy: status.patroni.corya.enterprises
        caddy.reverse_proxy: http://haproxy.patroni.host:7000
        caddy.basicauth.admin: JDJhJDE0JHZlYUFnci56NzV4ZDZDcmdjSXZMeU9scmVNVndmRTdkVWFiWjVoQkFPbUJ5WlZsL2lIL1BpCg==

configs:
  patroni_conf:
    external: true
  patroni_haproxy_conf:
    external: true
  init_pgadmin_db_2:
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
```
