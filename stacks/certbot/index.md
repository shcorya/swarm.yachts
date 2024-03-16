*This stack depends on cron.*

# Certbot
Certbot is a program that handles the creation and renewal of Let's Encrypt certificates. Using this stack does not require any open ports.

## Creating a Custom Image
This guide is written for Gandi DNS. Depending on the user's DNS provider, it may be necessary to install a different plugin. Several [DNS plugins](https://eff-certbot.readthedocs.io/en/stable/using.html#dns-plugins) are included with Certbot, and it is possible to install others. The below Dockerfile demonstrates the installation of plugins for [Gandi](https://github.com/obynio/certbot-plugin-gandi) and [cPanel](https://github.com/badjware/certbot-dns-cpanel). Additional plugins may be found on GitHub.

```Dockerfile
FROM python:3.9

RUN pip install certbot certbot-plugin-gandi certbot-dns-cpanel

ENTRYPOINT ["certbot"]

CMD ["--help"]
```

## Configs
Two similar configuration files are required to initialize and renew certificates. These configurations are similar, with the exception of the `domains` parameter. Running the `renew` command renews all certificates installed by Certbot on each machine.

```bash
cat << EOL | docker config create --template-driver golang certbot_init_ini -
email = {{ env "CERTBOT_EMAIL" }}
agree-tos = {{ env "CERTBOT_AGREE_TOS" }}
authenticator = {{ env "CERTBOT_AUTHENTICATOR" }}
dns-gandi-credentials = {{ env "CERTBOT_GANDI_CREDENTIALS_FILE" }}
domains = {{ env "CERTBOT_DOMAINS" }}
EOL
```
---
```bash
cat << EOL | docker config create --template-driver golang certbot_renew_ini -
email = {{ env "CERTBOT_EMAIL" }}
agree-tos = {{ env "CERTBOT_AGREE_TOS" }}
authenticator = {{ env "CERTBOT_AUTHENTICATOR" }}
dns-gandi-credentials = {{ env "CERTBOT_GANDI_CREDENTIALS_FILE" }}
EOL
```

## Compose
```yaml
version: '3.8'

x-certbot-common: &certbot-common
  image: coryaent/cypert:master
  secrets:
    - gandi_certbot_ini
  volumes:
    - certificates:/etc/letsencrypt/
  environment:
    CERTBOT_EMAIL: username@example.com
    CERTBOT_AUTHENTICATOR: dns-gandi
    CERTBOT_GANDI_CREDENTIALS_FILE: /run/secrets/gandi_certbot_ini
    CERTBOT_DOMAINS: "{{.Node.Hostname}}.example.com"

services:
  initialize:
    <<: *certbot-common
    command: certonly --agree-tos -n
    configs:
      - source: certbot_init_ini
        target: /etc/letsencrypt/cli.ini
    deploy:
      mode: global-job

  renew:
    <<: *certbot-common
    command: renew --agree-tos -n
    configs:
      - source: certbot_renew_ini
        target: /etc/letsencrypt/cli.ini
    deploy:
      mode: global
      labels:
        - "swarm.cronjob.enable=true"
        - "swarm.cronjob.schedule=43 36 20 * * *" # 08:36:43 PM
        - "swarm.cronjob.skip-running=false"
      restart_policy:
        condition: none

configs:
  certbot_init_ini:
    external: true
  certbot_renew_ini:
    external: true

secrets:
  gandi_certbot_ini:
    external: true

volumes:
  certificates:
    driver: local
    name: certificates

```
