---
prev:
  text: 'Getting Started'
  link: '/getting-started/'
---

# Docker Swarm Stacks

Docker stacks use configurations similar to Docker Compose. In fact, both share the same configuration file, called a compose file. Extensive documentation for compose files can be found at the official [compose file reference](https://docs.docker.com/compose/compose-file/compose-file-v3/).

While the specifications for the files for Docker Compose and Docker Stacks are basically the same, there are some key differences. Most of these differences are outlined in the compose file reference. More information about deploying stacks can be found on the [docker stack deploy](https://docs.docker.com/reference/cli/docker/stack/deploy/) command reference page.

It should be noted that stacks are simply collections of services. That is, each option which can be set for a standalone service can be set for a service which forms part of a stack. The [docker service create](https://docs.docker.com/reference/cli/docker/service/create/) reference describes a multitude of options available for stack/service creation.

Many of the stacks in this guide will be dependent on other stacks. This has been noted at the top of each stack's reference page.

## Labels
Both services and nodes can be assigned labels. This guide will utilize node labels in order to place services on appropriate nodes. Service labels can be leveraged to configure services such as the Caddy reverse proxy.

## Configs
Configs exist at the Swarm level, are stored in the raft log, and can be mounted into any service container. Templates can be used in config files, so secrets, environmental variables, Task ID's, and other golang templates can be referenced within a config.

## Secrets
Similar to configs, secrets exist at the Swarm level. Contrary to configs, secrets are encrypted at rest and stored within a container's filesystem with the use of a RAM disk.

A secret can be set with `bash` without printing it to the console:
```bash
read -s MY_SECRET && echo $MY_SECRET | docker secret create my_example_secret - && unset MY_SECRET
```

Note that `echo` will append a newline to the end of the newly created scret. To prevent this behaviour, replace `echo` with `printf`:
```bash
read -s MY_SECOND_SECRET && print $MY_SECOND_SECRET | docker secret create my_second_secret - && unset MY_SECOND_SECRET
```

## Networks

## Volumes
