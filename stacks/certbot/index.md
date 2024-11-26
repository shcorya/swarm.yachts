*This stack depends on cron.*

# Certbot
[Certbot](https://certbot.eff.org/) is a program that handles the creation and renewal of Let's Encrypt certificates. Using this stack does not require any open ports; it relies on `DNS-01` challenges. Using the `DNS-01` ACME challenge has some advantages. One is that there is no need to open ports on any hosts. Another is that wildcard certificates can be obtained. These advantages will greatly ease the creation of secure swarm services.

## Custom Images
The [coryaent/cypert](https://hub.docker.com/r/coryaent/cypert) image includes all the [Electronic Frontier Foundation DNS plugins](https://eff-certbot.readthedocs.io/en/stable/using.html#dns-plugins) plus [Gandi LiveDNS](https://github.com/obynio/certbot-plugin-gandi), [cPanel](https://github.com/badjware/certbot-dns-cpanel), [DirectAdmin](https://github.com/cybercinch/certbot-dns-directadmin), and [deSEC](https://pypi.org/project/certbot-dns-desec/). Depending on the your DNS provider(s), it may be necessary to install one or more other plugins. The below Dockerfile demonstrates the installation of the aforementioned Gandi plugin. Additional plugins may be found on [GitHub](https://github.com/search?q=certbot%20plugin&type=repositories).

```Dockerfile
FROM python:alpine

RUN pip install certbot certbot-plugin-gandi

ENTRYPOINT ["certbot"]

CMD ["--help"]
```

deSEC as a free and open-source DNS provider which can be used regardless of domain registrar. cPanel or DirectAdmin DNS can be used for existing domains with shared hosting or email set up.

## Configs and Secrets
The EFF plugins and the community plugins require slightly different configurations. The Swarm configs will thus be slightly different for both types of plugin. Configs may be need to be adapted further for yet more plugins. The credential secrets will differ slightly from provider to provider in order to authenticate with each provider's API.

### EFF Plugin Config
One base config template can be adapted for each of the EFF plugins. Create such a config template template with this command.
```bash
cat << EOL | docker config create --template-driver golang certbot_eff_ini -
email = {{ env "CERTBOT_EMAIL" }}
dns-{{ env "CERTBOT_DNS_PROVIDER" }}-credentials = {{ env "CERTBOT_CREDENTIAL_FILE" }}
{{ env "CERTBOT_DOMAINS" }}
EOL
```

### Gandi LiveDNS, DirectAdmin, and deSEC Config
Use this command to create a config template for the Gandi, deSEC or DirectAdmin plugins.
```bash
cat << EOL | docker config create --template-driver golang certbot_community_ini -
email = {{ env "CERTBOT_EMAIL" }}
authenticator = dns-{{ env "CERTBOT_DNS_PROVIDER" }}
dns-{{ env "CERTBOT_DNS_PROVIDER" }}-credentials = {{ env "CERTBOT_CREDENTIAL_FILE" }}
{{ env "CERTBOT_DOMAINS" }}
EOL
```

### cPanel Config
To use cPanel DNS, create a config template with this command.
```bash
cat << EOL | docker config create --template-driver golang certbot_cpanel_ini
email = {{ env "CERTBOT_EMAIL" }}
authenticator = certbot-dns-{{ env "CERTBOT_DNS_PROVIDER" }}:{{ env "CERTBOT_DNS_PROVIDER" }}
certbot-dns-{{ env "CERTBOT_DNS_PROVIDER" }}:{{ env "CERTBOT_DNS_PROVIDER" }}-credentials = {{ env "CERTBOT_CREDENTIAL_FILE" }}
{{ env "CERTBOT_DOMAINS" }}
EOL
```

### Secrets
In order to make the certificates available on each node without unnecessary renewals, a service for syncing the certificates will be utilized. The service requires a pre-shared key, which should be defined as a docker secret. Use this command to generate a sync key:
```bash
pwgen 32 1 | docker secret create favre_key -
```

It is beyond the scope of this guide to detail the various methods of generating API credentials for each DNS provider. Please see the documentation for each of the plugins and DNS providers to generate an appropriate credential secret. Create a secret with a name such as `certbot_credential_gandi`.

## Environment Setup
Set the `CERTBOT_DNS_PROVIDER` to one of `eff` (for official plugins), `community` (for Gandi LiveDNS or DirectAdmin), or `cpanel`.
```bash
export CERTBOT_DNS_PROVIER=provider
```

Additionally set your top-level domain.
```bash
export CERTBOT_TLD=example.com
```

It is advisable to set an email address to be warned of upcoming certificate expiration. Certbot, under normal operating circumstances, will renew your certificates before the warning is sent. More information on expiration emails is available [here](https://letsencrypt.org/docs/expiration-emails/).
```bash
export CERTBOT_EMAIL=username@example.com
```

## Compose
This stack deployment script will work for any of the EFF plugins, Gandi LiveDNS, deSEC, DirectAdmin, or cPanel. It will need to be modified for other DNS providers.
```bash
#!/bin/bash
run () {
if [ -z $CERTBOT_DNS_PROVIDER ]; then echo "CERTBOT_PROVIDER must be set" && return; fi
if { [[ $CERTBOT_DNS_PROVIDER != "eff" ]] || \
     [[ $CERTBOT_DNS_PROVIDER != "community" ]] || \
     [[ $CERTBOT_DNS_PROVIDER != "cpanel" ]] }; then echo "Invalid CERTBOT_PROVIDER" && return; fi
if { [ -z $CERTBOT_TLD ] || [[ $CERTBOT_TLD == *"example.com" ]] }; then echo "CERTBOT_TLD must be set" && return; fi
cat << EOL | docker stack deploy -c - certebot --detach=true
version: '3.8'

x-certbot-common: &certbot-common
  image: coryaent/cypert
  configs:
    - source: certbot_${CERTBOT_DNS_PROVIDER}_ini
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
    image: coryaent/favre
    hostname: "{{.Service.Name}}.{{.Task.Slot}}.{{.Task.ID}}"
    secrets:
      - favre_key
    environment:
      CSYNC2_KEY_FILE: /run/secrets/favre_key
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
  certbot_${CERTBOT_DNS_PROVIDER}_ini:
    external: true
  favre_key:
    external: true

secrets:
  certbot_credential_$CERTBOT_DNS_PROVIDER:
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
```
