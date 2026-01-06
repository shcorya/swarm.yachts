#!/bin/bash

# read variables
export CERTBOT_PLUGIN_TYPE CERTBOT_DNS_PROVIDER CERTBOT_TLD CERTBOT_EMAIL
read -p "Plugin type (eff or community): " CERTBOT_PLUGIN_TYPE
read -p "DNS provider (google, directadmin, desec, etc.): " CERTBOT_DNS_PROVIDER
read -p "Top-level domain: " CERTBOT_TLD
read -p "Email address: " CERTBOT_EMAIL

run () {
# validate variables
if [ -z $CERTBOT_DNS_PROVIDER ]; then echo "CERTBOT_DNS_PROVIDER must be set" && return; fi
if [[ "$CERTBOT_PLUGIN_TYPE" != "eff" && "$CERTBOT_PLUGIN_TYPE" != "community" ]]; then echo "Invalid CERTBOT_PLUGIN_TYPE" && return; fi
if { [ -z $CERTBOT_TLD ] || [[ $CERTBOT_TLD == *"example.com" ]] }; then echo "CERTBOT_TLD must be set" && return; fi

# create eff config
if [[ "$CERTBOT_PLUGIN_TYPE" == "eff" ]]; then
cat << EOL | docker config create --template-driver golang certbot_eff_ini -
email = {{ env "CERTBOT_EMAIL" }}
dns-{{ env "CERTBOT_DNS_PROVIDER" }}-credentials = {{ env "CERTBOT_CREDENTIAL_FILE" }}
{{ env "CERTBOT_DOMAINS" }}
EOL
fi

# create community config
if [[ "$CERTBOT_PLUGIN_TYPE" == "community" ]]; then
cat << EOL | docker config create --template-driver golang certbot_community_ini -
email = {{ env "CERTBOT_EMAIL" }}
authenticator = dns-{{ env "CERTBOT_DNS_PROVIDER" }}
dns-{{ env "CERTBOT_DNS_PROVIDER" }}-credentials = {{ env "CERTBOT_CREDENTIAL_FILE" }}
{{ env "CERTBOT_DOMAINS" }}
EOL
fi

# create secret
tr -dc A-Za-z0-9 </dev/urandom | head -c 32 | docker secret create certbot_favre_psk -

# compose file
cat << EOL | docker stack deploy -c - certbot --detach=true
version: '3.8'

x-certbot-common: &certbot-common
  image: coryaent/cypert
  configs:
    - source: certbot_${CERTBOT_PLUGIN_TYPE}_ini
      target: /etc/letsencrypt/cli.ini
  secrets:
    - certbot_credential_$CERTBOT_DNS_PROVIDER
  volumes:
    - certs:/etc/letsencrypt/

x-common-env: &common-env
  CERTBOT_EMAIL: ${CERTBOT_EMAIL:=username@example.com}
  CERTBOT_DNS_PROVIDER: $CERTBOT_DNS_PROVIER
  CERTBOT_CREDENTIAL_FILE: /run/secrets/certbot_credential_$CERTBOT_DNS_PROVIDER

services:
  init:
    <<: *certbot-common
    command: certonly --agree-tos -n
    environment:
      <<: *common-env
      CERTBOT_DOMAINS: "domains = *.$CERTBOT_TLD"
    deploy:
      mode: replicated-job
      replicas: 1
      restart_policy:
        condition: on-failure
      placement:
        constraints:
          - "node.role == worker"

  renew:
    <<: *certbot-common
    command: renew --agree-tos -n
    environment:
      <<: *common-env
    deploy:
      labels:
        - "swarm.cronjob.enable=true"
        - "swarm.cronjob.schedule=43 36 20 * * *" # 08:36:43 PM
        - "swarm.cronjob.skip-running=false"
      restart_policy:
        condition: none

  sync:
    image: coryaent/favre:main
    hostname: "{{.Service.Name}}.{{.Task.Slot}}.{{.Task.ID}}"
    secrets:
      - certbot_favre_psk
    environment:
      CSYNC2_PSK_FILE: /run/secrets/certbot_favre_psk
      CSYNC2_INCLUDE: /sync
      FAVRE_TASKS_ENDPOINT: "tasks.{{.Service.Name}}."
    networks:
      - sync
    volumes:
      - sync_state:/var/lib/csync2/
      - certs:/sync/
    deploy:
      mode: global
      endpoint_mode: dnsrr

configs:
  certbot_${CERTBOT_PLUGIN_TYPE}_ini:
    external: true

secrets:
  certbot_credential_$CERTBOT_DNS_PROVIDER:
    external: true
  certbot_favre_psk:
    external: true

networks:
  sync:
    attachable: false
    driver: overlay
    driver_opts:
      encrypted: "true"
    ipam:
      driver: default
      config:
        - subnet: "10.250.0.0/16"

volumes:
  sync_state:
    driver: local
  certs:
    driver: local
    name: certs
EOL
}
run