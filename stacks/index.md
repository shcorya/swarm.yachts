---
prev:
  text: 'Getting Started'
  link: '/getting-started/'
---

# Stacks

Docker stacks use configurations similar to Docker Compose. In fact, both share the same configuration file, called a compose file. Extensive documentation for compose files can be found at the official [compose file reference](https://docs.docker.com/compose/compose-file/compose-file-v3/).

While the specifications for the files for Docker Compose and Docker Stacks are basically the same, there are some key differences. Most of these differences are outlined in the compose file reference. More information about deploying stacks can be found on the [docker stack deploy](https://docs.docker.com/reference/cli/docker/stack/deploy/) command reference page.

It should be noted that stacks are simply collections of services. That is, each option which can be set for a standalone service can be set for a service which forms part of a stack. Services are comprised of tasks, each of which runs in a container. The [docker service create](https://docs.docker.com/reference/cli/docker/service/create/) reference describes a multitude of options available for stack/service creation.

Many of the stacks in this guide will be dependent on other stacks. This has been noted at the top of each stack's reference page.

## Labels
Both services and nodes can be assigned labels. This guide will utilize node labels in order to place services on appropriate nodes. Service labels can be leveraged to configure services such as the Caddy reverse proxy.

## Configs
Configs exist at the Swarm level, are stored in the raft log, and can be mounted into any service container. Templates can be used in config files, so secrets, environmental variables, Task ID's, and other golang templates can be referenced within a config.

## Secrets
Similar to configs, secrets exist at the Swarm level. Contrary to configs, secrets are encrypted at rest and stored within a container's filesystem with the use of a RAM disk.

The recommended way to store secrets (outside of the swarm) is with a password manager. [Bitwarden](https://bitwarden.com/) is one such program, and it is available at no cost. Accessing the value of secrets with docker is intentionally difficult. Storing secrets in a password manager allows for simple, secure access.

A secret can be set with `bash` without printing it to the console. Note that the secret's ID will be printed to the console upon successful creation.
```bash
read -s -p "Enter the new secret: " MY_SECRET && echo && \
printf $MY_SECRET | docker secret create my_example_secret - && \
unset MY_SECRET
```

In order to create a random secret, such as a secure password, the below command can be used. Note that this command will not print the newly created secret's ID to the console; the value printed to the console is your new, pseudorandom secret.
```bash
pwgen 24 1 | tee /dev/stderr | docker secret create my_example_secret - > /dev/null
```

## Networks
Docker supports six network types, called drivers. The network drivers most used in this guide are "host" and "overlay".

The host network is the networking stack on the swarm node. Attaching a container to the host network removes all isolation from the service's containers and the host node's network. The host network driver has the potential to open a wide variety of ports into the swarm, and should be used with caution.

Another commonly used network driver in the context of swarm mode is the overlay network driver. Overlay networks enable communication among a service's containers, and can also be used to open communication channels to other services. Overlay networks can easily be encrypted, which can ease the administrative burden of application encryption in many cases.

## Volumes
Volumes are the organizational unit of service's persistant data. The primary driver in this guide is the "local" driver. This driver creates a persistant store on the host responsible for running the container.

It should be noted that local volumes do not persist data if a service moves from one node to another. Docker containers are in many ways designed to be epheremal. This guide uses node labels to organize and constrain services in order to ensure that relevent data within volumes is accessible by the relevent service.
