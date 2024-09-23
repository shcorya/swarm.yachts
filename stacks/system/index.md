*This stack depends on cron.*

# System

This stack includes three components: a means to automatically prune the host node at a regular interval, a listener to automatically update select services, and a global job to create a directory within the `/opt` folder on the host.

## Automatic Pruning and Updates
Pruning is important so that outdated versions of docker images do not persist on a host indefinitely. These images can quickly consume a host's storage resources. In some circumstances, it is prudent to keep a service automatically up-to-date with the `:latest` docker image. This behaviour can be controlled with deployment labels in a manner similar to `cron` jobs.

## Using UNIX Sockets

Some stacks depend on UNIX sockets, and these sockets need to run within persistent directories. Using `/run` as the directory for UNIX sockets requires that any service that needs to use one of these sockets have access to every socket within the `/run` directory. Global jobs can be used to create subdirectories, for example `/run/garage`, but due to the way that global jobs are implemented, this directory will not persist. Once a job has run on a host, it is considered done, and the job will not run again even if the host reboots. The directory `/opt/swarm/sockets` is a suitable persistent directory for UNIX sockets, and is used throughout this guide.

## Compose
```bash
cat << EOL | docker stack deploy -c - system
version: "3.2"

services:
  prune:
    image: docker
    command: ["docker", "system", "prune", "-f"]
    volumes:
      - "/var/run/docker.sock:/var/run/docker.sock"
    deploy:
      mode: global
      labels:
        - "swarm.cronjob.enable=true"
        - "swarm.cronjob.schedule=0 0 0 * * *"
        - "swarm.cronjob.skip-running=false"
      restart_policy:
        condition: none

  updates:
    image: ixdotai/cioban
    volumes:
      - '/var/run/docker.sock:/var/run/docker.sock'
    deploy:
      placement:
        constraints:
          - node.role == manager

  mk-socket-dir:
    image: alpine
    command: mkdir -p /opt/swarm/sockets/
    volumes:
      - /opt:/opt
    deploy:
      mode: global-job
EOL
```
