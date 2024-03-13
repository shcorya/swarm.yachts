# OpenLDAP
## Setup
```bash
export OPENLDAP_LABEL="com.example.ldap"
```

Select which nodes will run Bedrock.
```bash
export OPENLDAP_NODES=(worker-01 worker-02 worker-03)
```

Apply the label to the selected nodes.
```bash
#!/bin/bash
for i in "${!OPENLDAP_NODES[@]}"
do
  docker node update --label-add $OPENLDAP_LABEL=true ${OPENLDAP_NODES[i]}
done
```

Compile the newly labeled nodes to a list of peers.
```bash
#!/bin/bash
LDAP_REPLICATION_HOSTS=""
OPENLDAP_NODE_IDS=($(docker node ls -q --filter node.label=$OPENLDAP_LABEL=true | tr '\n' ' '))
for i in "${!OPENLDAP_NODE_IDS[@]}"
do
  LDAP_REPLICATION_HOSTS="$LDAP_REPLICATION_HOSTS${BEDROCK_NODE_IDS[i]} "
done
export LDAP_REPLICATION_HOSTS
```
## Compose
```bash
cat << EOL | docker stack deploy -c - ldap
services:

  directory:
    hostname: {{.Node.ID}}.ldap.host
    image: tiredofit/openldap:2.6
    volumes:
      - backup:/data/backup
      - data:/var/lib/openldap
      - configuration:/etc/openldap
    secrets:
      - ldap_admin_pass
      - ldap_config_pass
      - ldap_worker_pass
    environment:
      ADMIN_PASS_FILE: /run/secrets/ldap_admin_pass
      CONFIG_PASS_FILE: /run/secrets/ldap_config_pass
      ENABLE_READONLY_USER: TRUE
      READONLY_USER_USER: worker
      READONLY_USER_PASS_FILE: /run/secrets/ldap_worker_pass
      TIMEZONE: $LDAP_TIMEZONE
      ORGANIZATION: $LDAP_ORGANIZATION
      DOMAIN: $LDAP_DOMAIN
      SLAPD_HOSTS: ldap:///
      LOG_LEVEL: 256
      DEBUG_MODE: FALSE
      ENABLE_TLS: FALSE
      ENABLE_REPLICATION: TRUE
      REPLICATION_HOSTS: $LDAP_REPLICATION_HOSTS
      BACKUP_INTERVAL: 1440
      BACKUP_RETENTION: 43200
      CONTAINER_ENABLE_MONITORING: FALSE
    networks:
      internal:
        aliases:
          - ldap.host

  mk-socket-dir:
    image: alpine
    command: mkdir -p /run/openldap
    volumes:
      - /run:/run
    deploy:
      mode: global-job

  socket-in:
    image: alpine/socat
    command: "-dd TCP-L:389,fork,bind=localhost UNIX:/run/openldap/openldap.sock"
    volumes:
      - /run/openldap:/run/openldap
    networks:
      - public
    deploy:
      mode: global

  socket-out:
    image: alpine/socat
    command: "-dd UNIX-L:/run/openldap/openldap.sock,fork TCP:ldap.host:389"
    volumes:
      - /run/openldap:/run/openldap
    networks:
      - internal
    deploy:
      mode: global

networks:
  internal
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

secrets:
  ldap_admin_pass:
    external: true
  ldap_config_pass:
    external: true
  ldap_worker_pass:
    external: true

volumes:
  backup:
    driver: local
  data:
    driver: local
  configuration:
    driver: local
EOL
```
