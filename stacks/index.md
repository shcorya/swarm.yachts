---
prev:
  text: 'Getting Started'
  link: '/getting-started/'
---

# Docker Swarm Stacks

Docker stacks use configurations similar to Docker Compose. In fact, both share the same configuration file, called a compose file. The compose file reference can be found at the [compose file reference](https://docs.docker.com/compose/compose-file/compose-file-v3/).

While the specifications for the files for Docker Compose and Docker Stacks are basically the same, there are some key differences. Most of these differences are outlined in the compose file reference. More information about deploying stacks can be found on the [docker stack deploy](https://docs.docker.com/reference/cli/docker/stack/deploy/) command reference page.

It should be noted that stacks are simply collections of services. That is, each option which can be set for a standalone service can be set for a service which forms part of a stack. The [docker service create](https://docs.docker.com/reference/cli/docker/service/create/) reference describes a multitude of options available for stack/service creation.

Many of the stacks in this guide will be dependent on other stacks. This has been noted at the top of each stack's reference page.

## Labels
Both services and nodes can be assigned labels. This guide will utilize node labels in order to place services on appropriate VPS's.

## Configs

## Secrets

## Networks

## Volumes
