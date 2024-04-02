*The web interface for this stack, phpMyAdmin, depends on Caddy.*

# MariaDB
[MariaDB](https://mariadb.org/) is a fork of MySQL created by the one of the original founders of MySQL after MySQL was acquired by Oracle Corporation. MariaDB intends to maintain compatability with MySQL, so MySQL clients and other software designed for MySQL connections should be able to connect without modification.

## Replication Modes
MariaDB supports multiple replication modes, each having advantages and disadvantages. Different modes generally sacrafice speed for consistency and vice versa. MariaDB nodes are defined as "masters" or "slaves", although this verbiage is being phased out in favor of "primary" and "replica", respctively.

### Asynchronous Replication
Asnchronous replication does not require replicas to confirm SQL transactions before the query result is sent to the client. This improves performance as only a single server needs to communicate with the client at a time, but provides no guarantee of consistency among the various nodes. Within the context of MariaDB, this mode is also called [Standard Replication](https://mariadb.com/kb/en/replication-overview/#standard-replication).

### Semisynchronous Replication
Semisynchronous replication is effectively the same replication mode deployed on the [Patroni](/stacks/patroni). The master server only waits for one replica to acknowledge a write before returning the result to the client.

### Synchronous Replication
Synchronous replication for MariaDB is achieved by using [Galera Cluster](https://galeracluster.com/library/documentation/overview.html#:~:text=This%20approach%20is%20also%20called,thus%20asynchronously%20on%20each%20node.&text=Galera%20Cluster%20provides%20a%20significant,availability%20for%20the%20MySQL%20system.). Within a Galera Cluster, nodes communicate and coordinate using the raft protocol (the same protocol used by etcd and RedisRaft.) Each node is aware of which node is the primary, and all reads and writes happen on the primary node. This mode provides the strongest consistency guarantee.

## Setup
This tutorial will utilize synchronous replication via Galera Cluster. A slight [modification](https://github.com/coryaent/mantle?tab=readme-ov-file#the-modification) has been made to the [official MariaDB image](https://hub.docker.com/_/mariadb) to automate the bootstrapping process.

### Configs
Create the template which will configure Galera on each host.
```bash
cat << EOL | docker config create --template-driver golang galera_tmpl -
[mysqld]
binlog_format=ROW
default-storage-engine=innodb
innodb_autoinc_lock_mode=2
bind-address=0.0.0.0

# Galera Provider Configuration
wsrep_on=ON
wsrep_provider=/usr/lib/galera/libgalera_smm.so

# Galera Cluster Configuration
wsrep_cluster_name="{{ env "GALERA_CLUSTER_NAME" }}"
wsrep_cluster_address="{{ env "GALERA_CLUSTER_ADDRESS" }}"

# Galera Synchronization Configuration
wsrep_sst_method=rsync

# Galera Node Configuration
wsrep_node_address="{{ env "GALERA_NODE_ADDRESS" }}"
wsrep_node_name="{{ env "GALERA_NODE_NAME" }}"
EOL
```

Create a config for the SQL commands that will create the phpMyAdmin tables.
```bash
curl -s https://raw.githubusercontent.com/phpmyadmin/phpmyadmin/master/resources/sql/create_tables.sql | docker config create pma_create_tables.sql -
```

### Environment
Define the label to apply to the Galera nodes.
```bash
export GALERA_LABEL="yachts.swarm.galera"
```

Select which nodes will run MariaDB, for example `worker-01 worker-02 worker-03`.
```bash
read -a GALERA_NODES -p "Enter the array of Galera nodes (space-seperated): "
```

Apply the label to the selected nodes.
```bash
#!/bin/bash
for i in "${!GALERA_NODES[@]}"
do
  docker node update --label-add $GALERA_LABEL=true ${GALERA_NODES[i]}
done
```

Compile the list of peers to be passed to the galera nodes, and define the primary (bootstrapping) node.
```bash
#!/bin/bash
GALERA_NODE_IDS=($(docker node ls -q --filter node.label=$GALERA_LABEL=true | tr '\n' ' '))
GALERA_PEER_LIST=""
for i in "${!GALERA_NODE_IDS[@]}"
do
  if [[ $i == 0 ]]
  then
    GALERA_PRIMARY_HOST="${GALERA_NODE_IDS[i]}.galera.host"
    GALERA_PEER_LIST="$GALERA_PRIMARY_HOST"
  else
    GALERA_PEER_LIST="$GALERA_PEER_LIST,${GALERA_NODE_IDS[i]}.galera.host"
  fi
done
export GALERA_PRIMARY_HOST
export GALERA_PEER_LIST
```

Set the domain to use for phpMyAdmin.
```bash
export PHPMYADMIN_DOMAIN=mysql.example.com
```

### Root Password
Create a [secret](/stacks/#secrets) containing the root password of the MariaDB database. Create another secret for the `pma` user.

### Basic Authentication
It is imperative that one sets an authentication requirement for phpMyAdmin.
```bash
PMA_BASIC_AUTH_PW=$(caddy hash-password | base64 -w 0)
```
In the compose file below, the username will be set to `admin` by default. This can be changed by setting the environment variable `PMA_BASIC_AUTH_USER`.

## Compose
```bash
#!/bin/bash
run () {
if { [ -z $PHPMYADMIN_DOMAIN ] || [[ $PHPMYADMIN_DOMAIN == *"example.com" ]] }; then echo "PHPMYADMIN_DOMAIN must be set" && return; fi
if [ -z $PMA_BASIC_AUTH_PW ]; then echo "PMA_BASIC_AUTH_PW must be set" && return; fi
cat << EOL | docker stack deploy -c - galera --detach=false
version: '3.8'

services:
  node:
    image: coryaent/mantle
    hostname: "{{.Node.ID}}.galera.host"
    environment:
      GALERA_NODE_ADDRESS: "{{.Node.ID}}.galera.host"
      GALERA_NODE_NAME: "{{.Node.Hostname}}_{{.Node.ID}}"
      GALERA_CLUSTER_NAME: Swarm.Yachts
      GALERA_PRIMARY_HOST: $GALERA_PRIMARY_HOST
      GALERA_CLUSTER_ADDRESS: "gcomm://$GALERA_PEER_LIST"
      MARIADB_ROOT_PASSWORD_FILE: /run/secrets/galera_root_pw
      MARIADB_DATABASE: phpmyadmin
      MARIADB_USER: pma
      MARIADB_PASSWORD_FILE: /run/secrets/phpmyadmin_db_pw
    configs:
      - source: galera_tmpl
        target: /etc/mysql/conf.d/galera.cnf
      - source: pma_create_tables.sql
        target: /docker-entrypoint-initdb.d/create_tables.sql
    secrets:
      - galera_root_pw
      - phpmyadmin_db_pw
    networks:
      mysql:
        aliases:
          - mysql.host
          - galera.host
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.$GALERA_LABEL == true"

  phpmyadmin:
    image: phpmyadmin
    secrets:
      - galera_root_pw
      - phpmyadmin_db_pw
      - phpmyadmin_pw
    environment:
      PMA_HOST: mysql.host
      PMA_PORT: 3306
      PMA_USER: root
      PMA_PASSWORD_FILE: /run/secrets/galera_root_pw
      PMA_CONTROLHOST: mysql.host
      PMA_CONTROLPORT: 3306
      PMA_PMADB: phpmyadmin
      PMA_CONTROLUSER: pma
      PMA_CONTROLPASS_FILE: /run/secrets/phpmyadmin_db_pw
    networks:
      - www
      - mysql
    deploy:
      labels:
        caddy: $PHPMYADMIN_DOMAIN
        caddy.reverse_proxy: http://phpmyadmin:80
        caddy.basicauth.${PMA_BASIC_AUTH_USER:=admin}: $PMA_BASIC_AUTH_PW
      placement:
        constraints:
          - "node.role == worker"

configs:
  galera_tmpl:
    external: true

secrets:
  galera_root_pw:
    external: true
  phpmyadmin_db_pw:
    external: true
  phpmyadmin_pw:
    external: true

networks:
  mysql:
    name: mysql
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"
    ipam:
      driver: default
      config:
        - subnet: "10.251.0.0/16"
  www:
    external: true
EOL
}
run
```

