# Cron
It is possible to run scheduled jobs within Docker Swarm thanks to [swarm-cronjob](https://crazymax.dev/swarm-cronjob/). Like the Caddy reverse-proxy, swarm-cronjob is can be configured with service labels. The swarm-cronjob project can be [supported via GitHub sponsors](https://github.com/sponsors/crazy-max).

## Compose
```bash
cat << EOL | docker stack deploy -c - cron
version: "3.2"

services:
  scheduler:
    image: crazymax/swarm-cronjob
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
    environment:
      - "TZ=America/Indiana/Indianapolis"
      - "LOG_LEVEL=info"
      - "LOG_JSON=false"
    deploy:
      placement:
        constraints:
          - node.role == manager
EOL
```
