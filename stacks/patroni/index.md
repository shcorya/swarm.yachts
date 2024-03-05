*This stack depends on Caddy and etcd.*

# Patroni

[Patroni](https://patroni.readthedocs.io/en/latest/index.html) is a "template" for installing PostgreSQL databases in a high-availability situation. It uses a data store, such as etcd or Consul, to track the state of a Patroni cluster.

## Setup

Being a highly configurable system, Patroni and its related services require a comprably high amount of configuration. Many of these options can (and should) be stored as Swarm configs. Some configuration values will also be set by environmental variables.

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

### pgAdmin

## Compose
