# lldap

## Configure
Set timezone.
```bash
export TIMEZONE="America/Indianapolis"
```

## Compose
```bash
cat << EOL | docker stack deploy -c - lldap
version: "3"

services:
  lldap:
    image: lldap/lldap:stable
    hostname: users.swarm.yachts
    ports:
      - "636:636"
    environment:
      - UID=150
      - GID=150
      - TZ=$TIMEZONE
      - LLDAP_JWT_SECRET=REPLACE_WITH_RANDOM
      - LLDAP_KEY_SEED=REPLACE_WITH_RANDOM
      - LLDAP_LDAP_BASE_DN=dc=example,dc=com
      - LLDAP_LDAPS_OPTIONS__PORT=636
      - LLDAP_HTTP_URL=https://users.swarm.yachts
      # If using LDAPS, set enabled true and configure cert and key path
      # - LLDAP_LDAPS_OPTIONS__ENABLED=true
      # - LLDAP_LDAPS_OPTIONS__CERT_FILE=/path/to/certfile.crt
      # - LLDAP_LDAPS_OPTIONS__KEY_FILE=/path/to/keyfile.key
      # You can also set a different database:
      # - LLDAP_DATABASE_URL=mysql://mysql-user:password@mysql-server/my-database
      # - LLDAP_DATABASE_URL=postgres://postgres-user:password@postgres-server/my-database
      # -
    deploy:
      mode: replicated
      replicas: 2
      labels:
        caddy: users.swarm.yachts
        caddy.reverse_proxy: http://users.swarm.yachts:17170
      placement:
        constraints:
          - "node.role == worker"

networks:
  www:
    external: true
  mysql:
    external: true

volumes:
  certs:
    external: true
EOL
```
