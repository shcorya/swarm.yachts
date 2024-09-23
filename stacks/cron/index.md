# Cron
It is possible to run scheduled jobs within Docker Swarm thanks to [swarm-cronjob](https://crazymax.dev/swarm-cronjob/). The swarm-cronjob project can be [supported via GitHub sponsors](https://github.com/sponsors/crazy-max).

[Cioban](https://gitlab.com/ix.ai/cioban) allows for automatic updating of Swarm services. It can be configured with a similar cron syntax.

## Timezone
Optionally set the timezone that will be used for task scheduling.
```bash
export SWARM_TIMEZONE="America/Indiana/Indianapolis"
```

## Compose
```bash
cat << EOL | docker stack deploy -c - cron --detach=true
version: "3.2"

services:
  socket:
    image: alpine/socat
    command: "-dd TCP-L:2375,fork UNIX:/var/run/docker.sock"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    networks:
      - internal
    deploy:
      mode: global
      placement:
        constraints:
          - "node.role == manager"

  scheduler:
    image: crazymax/swarm-cronjob
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
    environment:
      - "TZ=${SWARM_TIMEZONE:=America/Indiana/Indianapolis}"
      - "LOG_LEVEL=info"
      - "LOG_JSON=false"
      - "DOCKER_HOST=tcp://socket:2375"
    networks:
      - internal
    deploy:
      placement:
        constraints:
          - node.role == worker

networks:
  internal:
    attachable: false
    driver: overlay
    driver_opts:
      encrypted: "true"
EOL
```
