*This stack depends on cron.*

# Certbot
[Certbot](https://certbot.eff.org/) is a program that handles the creation and renewal of Let's Encrypt certificates. Using this stack does not require any open ports; it relies on `DNS-01` challenges. Using the `DNS-01` ACME challenge has some advantages. One is that there is no need to open ports on any hosts. Another is that wildcard certificates can be obtained. These advantages will greatly ease the creation of secure swarm services.

## Custom Images
The [cypert](https://corya.io/enterprises/cypert) image includes all the [Electronic Frontier Foundation DNS plugins](https://eff-certbot.readthedocs.io/en/stable/using.html#dns-plugins) plus [DirectAdmin](https://github.com/cybercinch/certbot-dns-directadmin) and [deSEC](https://pypi.org/project/certbot-dns-desec/). deSEC as a free and open-source DNS provider which can be used regardless of domain registrar. DirectAdmin DNS can be used for existing domains with shared hosting or email set up. Depending on the your DNS provider(s), it may be necessary to install one or more other plugins. The below Dockerfile demonstrates the installation of the Gandi LiveDNS plugin. Additional plugins may be found on [GitHub](https://github.com/search?q=certbot%20plugin&type=repositories).

```Dockerfile
FROM python:alpine

RUN pip install certbot certbot-plugin-gandi

ENTRYPOINT ["certbot"]

CMD ["--help"]
```

## Configs and Secrets
The EFF plugins and the community plugins require slightly different configurations. The Swarm configs will thus be slightly different for both types of plugin. Configs may be need to be adapted further for yet more plugins. The credential secrets will differ slightly from provider to provider in order to authenticate with each provider's API.

### Secrets
In order to make the certificates available on each node without unnecessary renewals, a service for syncing the certificates will be utilized. The service requires a pre-shared key, which should be defined as a docker secret. Use this command to generate a sync key:

It is beyond the scope of this guide to detail the various methods of generating API credentials for each DNS provider. Please see the documentation for each of the plugins and DNS providers to generate an appropriate credential secret. Create a secret with a name such as `certbot_credential_desec`.

## Deployment
This stack deployment script will work for any of the EFF plugins, deSEC or DirectAdmin; it will need to be modified for other DNS providers. It fetches a wildcard certificate for the top-level domain e.g. `*.example.com`.

```bash
curl -sL https://swarm.yachts/certbot.sh -o /tmp/certbot.sh &&\
chmod +x /tmp/certbot.sh &&\
/tmp/certbot.sh &&\
rm /tmp/certbot.sh
```
