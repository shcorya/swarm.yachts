*This stack depends on MariaDB and Caddy.*

# LLDAP
[Light LDAP](https://github.com/lldap/lldap) is an authentication server that provides a simplified version of the LDAP protocol for user management.

## Configure
Set timezone.
```bash
export TIMEZONE="America/Indianapolis"
```

```bash
cat << EOL | docker config create lldap_conf -
## Default configuration for Docker.
## All the values can be overridden through environment variables, prefixed
## with "LLDAP_". For instance, "ldap_port" can be overridden with the
## "LLDAP_LDAP_PORT" variable.

## Tune the logging to be more verbose by setting this to be true.
## You can set it with the LLDAP_VERBOSE environment variable.
# verbose=false

## The host address that the LDAP server will be bound to.
## To enable IPv6 support, simply switch "ldap_host" to "::":
## To only allow connections from localhost (if you want to restrict to local self-hosted services),
## change it to "127.0.0.1" ("::1" in case of IPv6).
## If LLDAP server is running in docker, set it to "0.0.0.0" ("::" for IPv6) to allow connections
## originating from outside the container.
#ldap_host = "0.0.0.0"

## The port on which to have the LDAP server.
#ldap_port = 3890

## The host address that the HTTP server will be bound to.
## To enable IPv6 support, simply switch "http_host" to "::".
## To only allow connections from localhost (if you want to restrict to local self-hosted services),
## change it to "127.0.0.1" ("::1" in case of IPv6).
## If LLDAP server is running in docker, set it to "0.0.0.0" ("::" for IPv6) to allow connections
## originating from outside the container.
#http_host = "0.0.0.0"

## The port on which to have the HTTP server, for user login and
## administration.
#http_port = 17170

## The public URL of the server, for password reset links.
http_url = "http://localhost"

## Random secret for JWT signature.
## This secret should be random, and should be shared with application
## servers that need to consume the JWTs.
jwt_secret = "{{ secret "lldap_jwt" }}"

## Base DN for LDAP.
## This is usually your domain name, and is used as a
## namespace for your users. The choice is arbitrary, but will be needed
## to configure the LDAP integration with other services.
## The sample value is for "example.com", but you can extend it with as
## many "dc" as you want, and you don't actually need to own the domain
## name.
ldap_base_dn = "dc=example,dc=com"

## Admin username.
## For the LDAP interface, a value of "admin" here will create the LDAP
## user "cn=admin,ou=people,dc=example,dc=com" (with the base DN above).
## For the administration interface, this is the username.
ldap_user_dn = "admin"

## Admin email.
## Email for the admin account. It is only used when initially creating
## the admin user, and can safely be omitted.
ldap_user_email = "admin@example.com"

## Admin password.
## Password for the admin account, both for the LDAP bind and for the
## administration interface. It is only used when initially creating
## the admin user.
## It should be minimum 8 characters long.
ldap_user_pass = "REPLACE_WITH_PASSWORD"

## Database URL.
## This encodes the type of database (SQlite, MySQL, or PostgreSQL)
## , the path, the user, password, and sometimes the mode (when
## relevant).
database_url = "mysql://lldap:access@mysql.host/lldap"

## Private key file.
#key_file = "/data/private_key"

[smtp_options]
## Whether to enabled password reset via email, from LLDAP.
#enable_password_reset=true
## The SMTP server.
#server="smtp.gmail.com"
## The SMTP port.
#port=587
## How the connection is encrypted, either "NONE" (no encryption), "TLS" or "STARTTLS".
#smtp_encryption = "TLS"
## The SMTP user, usually your email address.
#user="sender@gmail.com"
## The SMTP password.
#password="password"
## The header field, optional: how the sender appears in the email. The first
## is a free-form name, followed by an email between <>.
#from="LLDAP Admin <sender@gmail.com>"
## Same for reply-to, optional.
#reply_to="Do not reply <noreply@localhost>"

[ldaps_options]
## Whether to enable LDAPS.
enabled=true
## Port on which to listen.
port=636
## Certificate file.
cert_file="/data/cert.pem"
key_file="/data/key.pem"
EOL
```

## Compose
```bash
cat << EOL | docker stack deploy -c - lldap
version: "3"

services:
  lldap:
    image: lldap/lldap:stable
    hostname: users.swarm.yachts
    volumes:
      - certs:/opt/certs
      - data:/data
    configs:
      - source: lldap_conf
        target: /data/lldap_config.toml
    networks:
      - www
      - mysql
    ports:
      - "636:636"
    environment:
      UID: 0
      GID: 0
      TZ: $TIMEZONE
      LLDAP_HTTP_URL: https://users.swarm.yachts
      LLDAP_LDAP_BASE_DN: dc=example,dc=com
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
  data:
    driver: local
EOL
```
