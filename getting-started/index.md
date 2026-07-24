---
next:
  text: 'Stacks'
  link: '/stacks/'
---

# Getting Started
Docker swarm is an orchestration tool for docker containers. It is backed by a system of managers and workers, where the managers determine the state of the swarm. The managers use the raft protocol to agree on the desired state of the containers. The desired states of the containers across both managers and workers is defined by services, in addition to collections of services called "stacks".

## About This Guide
One should take care to read the additional documentation [Stacks page](/stacks/). This guide assumes that the reader has basic knowledge of the command line, installing packages, provisioning virtual private servers, and setting DNS records.

The Compose files are entered as simple bash commands so that they may be easily copied into the terminal and executed, without needing to save any files. In order to modify these Compose files, copy only the `yaml` portion into a new file, and then run `docker stack deploy -c /path/to/my/compose.yml my-stack-name`.

It is hoped that this guide will serve as a sufficient introduction to Docker Swarm, as well as a complete tutorial for the implementation of a robust, fault-tolerant, distributed system. Vertically scaling each VPS or dedicated server should be straightforward.

## Basic Node Provisioning
***All managers must be in the same datacenter***. Workers can be geographically distributed.

At least six servers (three managers and three workers) are required to deploy docker swarm effectively. Root access on each of the servers is required. The servers will cost from $100 to $400 per year depending on which provider you choose. RackNerd is recommended. One can get started with six nodes about $100, which will be charged on an annual basis. Here is a [list](https://lowendbox.com/blog/2-usd-vps-cheap-vps-under-2-month/) of VPS offers for less than $25/year.

Having at least three managers is essential for high availability. From the [official docs](https://docs.docker.com/engine/swarm/admin_guide/#add-manager-nodes-for-fault-tolerance):
> You should maintain an odd number of managers in the swarm to support manager node failures. Having an odd number of managers ensures that during a network partition, there is a higher chance that the quorum remains available to process requests if the network is partitioned into two sets. Keeping the quorum is not guaranteed if you encounter more than two network partitions.

Recommended minimum specifications:
- 1 vCPU
- 1.5 GB RAM
- 20 GB disk space

As implied by the names, the worker nodes will do most of the computation. The managers orchestrate containers that run on the workers based on the state of the swarm. Managers can also be workers, although this is not recommended for production deployments. Deploying more than a few stacks at a time could excessively tax a machine's resources. Overloading management nodes can result in degredation of the entire swarm.

Install Linux on each of the VPS's. This guide assumes Debian or Ubuntu has been installed on each host, but other distributions should work just as well. Set the hostnames to something descriptive, for example `manager-1.example.com`, `worker-2.example.com`, etc. will work well for a simple setup for five or six nodes. With more nodes, it will help to add more details. For example, if using CloudServer as your hosting provider at their Buffalo location, consider setting the hostnames to `worker-cs-buf-1.example`. Many things will be easier if you pick a single TLD and include it in the servers' hostnames.

## Setting DNS Records
Create a DNS A record for each of your new machines. Then, set another A record which is the same domain name pointing to the three worker nodes. For example, if your manager IP are `1.2.3.4`, `2.3.4.5`, and `3.4.5.6`, create the following A records:
```
manager-1.example.com. 300  IN      A       1.2.3.4
manager-2.example.com  300  IN      A       2.3.4.5
manager-3.example.com  300  IN      A       3.4.5.6
worker-1.example.com.  300  IN      A       4.5.6.7
worker-2.example.com.  300  IN      A       5.6.7.8
worker-3.example.com   300  IN      A       6.7.8.9
```
More information about setting DNS records is available on the [Caddy Stack page](/stacks/caddy/#dns).

## Node Setup
One manager will sort of be a "general manager". On this node, create a username and add it to the groups `sudo` and `docker`. Also, install `pwgen`, `randmac`, `jq`, `git` and `parallel-ssh` from your distro's package registry.

### Install Deno
Running the scripts in this guide requires `deno`. to be installed. On your general manager, install `deno` globally:
```sh
curl -fsSL https://deno.land/install.sh | sudo DENO_INSTALL=/usr/local sh   
```

### n2n
Swarm networking can be finnicky when working with multiple different cloud providers; therefore, it is virtually required to install and setup [n2n](https://github.com/ntop/n2n). `n2n` will also be responsible for encrypting network configurations among the nodes.

Download `n2n` for your distribution from the GitHub [releases](https://github.com/ntop/n2n/releases) page. Version `3.0` or `3.1.1` will work. Then, setup supernodes *and* edges on each manager. If using multiple managers (highly recommended), each supernode should be federated with one another. Detailed [documentation](https://github.com/ntop/n2n/tree/dev/doc) of `n2n` is available on GitHub. The final configurations should resemble the following. `/etc/n2n/communities.list` should contain the community name. Use something random, generated with `pwgen`.

```
# /etc/n2n/supernode.conf
# listen on this fixed port (edges will need to point to this port)
-p=49173
# community list path
-c=/etc/n2n/communities.list
# IP address range (any single /23 subnet from the 192.168.0.0 – 192.168.255.255 range)
-a=192.168.2.0-192.168.2.0/23
# federation name (something random, needs to be the same on each supernode)
-F=aijei1huechieY1o
# other supernodes (managers) for federation
-l=2.3.4.5:52116
-l=3.4.5.6:53220
```

```
# managers' /etc/n2n/edge.conf (managers need a static IP assignment)
# intherface name
-d=n2n0
# community name (random, needs to exist in /etc/n2n/communities.list on the supernodes)
-c=Ohngai5oth2ooca1Aith
# pre-shared key (random, needs to be the same on each node)
-k=thahthee3nie3gieChah
# MAC address (uniqe per host, can be generated with `randmac -Uu`)
-m=4E:1F:62:61:4E:DB
# interface address
-a=192.168.2.1/23 (change this to another static address for the other managers e.g. 192.168.2.2/23 for manager-2)
# local udp port (anything will do, can be randomly generated with `shuf -i 49152-65535 -n 1`)
-p=49590
# supernode public IP list
-l=1.2.3.4:49173
-l=2.3.4.5:52105
-l=3.4.5.6:54220
# enable header encryption
-H
# MTU
-M=1290
```

```
# workers' /etc/n2n/edge.conf (randomly assigned VPN IP addresses)
# intherface name
-d=n2n0
# community name (needs to exist in /etc/n2n/communities.list)
-c=Ohngai5oth2ooca1Aith
# pre-shared key (needs to be the same on each node)
-k=thahthee3nie3gieChah
# MAC address (uniqe per host, can be generated with `randmac -Uu`)
-m=BA:0A:81:BD:FA:5C
# local udp port (anything will do, can be randomly generated with `shuf -i 49152-65535 -n 1`)
-p=49471
# supernode public IP list
-l=1.2.3.4:49173
-l=2.3.4.5:52105
-l=3.4.5.6:54220
# enable header encryption
-H
# MTU
-M=1290
```

### SSH
It will prove very convenient to be able to open a secure shell on any given node through the general manager. Here are the basic steps.

```bash
# generate a keypair for the root user (on the general manager)
sudo ssh-keygen
```

```bash
# install the key on ALL swarm nodes, managers and workers, including this one!
sudo ssh-copy-id manager-1.example.com
# sudo ssh-copy-id manager-2.example.com etc.
```

After the keys are installed on every node, this script can be run from the general manager to easily run a command on all the nodes in the swarm.
```bash
#!/bin/bash
docker node ls --format json | jq .Hostname | tr -d '"' > /tmp/hosts
parallel-ssh -h /tmp/hosts "$@"
rm /tmp/hosts
```

## Initialization
Open a secure shell on *each node* (workers as well as managers) and install `docker`.
```sh
curl -s https://get.docker.com | sudo sh
```

On the general manager, run:
```bash
docker swarm init --advertise-addr n2n0 --data-path-addr n2n0
```

The output will look like this:
```
Swarm initialized: current node (bvz81updecsj6wjz393c09vti) is now a manager.

To add a worker to this swarm, run the following command:

    docker swarm join --token SWMTKN-1-3pu6hszjas19xyp7ghgosyx9k8atbfcr8p2is99znpy26u2lkl-1awxwuwd3z9j1z3puu7rcgdbx 172.17.0.2:2377

To add a manager to this swarm, run `docker swarm join-token manager` and follow the instructions.
```

More information about [initializing a swarm](https://docs.docker.com/reference/cli/docker/swarm/init/) and [joining nodes](https://docs.docker.com/reference/cli/docker/swarm/join/) can be found in the official documentation.

## Listing Nodes
With three managers and three workers, running `docker node ls` should output something resembling the following.
```
ID                            HOSTNAME                STATUS    AVAILABILITY   MANAGER STATUS   ENGINE VERSION
aZohnao5Eem2vafaeTh1ohgh5 *   manager-1.example.com   Ready     Active         Leader           25.0.3
dovei3zou4eiJai6fu3uraefo     manager-2.example.com   Ready     Active         Reachable        25.0.3
ouChaGh1phe1ahmail2ieT6ei     manager-3.example.com   Ready     Active         Reachable        25.0.3
saeSh9chue6aoqu1ahv3Mah1t     worker-1.example.com    Ready     Active                          25.0.3
Zoowou7een6aey9eici6Vaiz9     worker-2.example.com    Ready     Active                          25.0.3
aocaingaish5eepoh4aeTh9eo     worker-3.example.com    Ready     Active                          25.0.3
```

## Version Control
This guide automatically generates `docker-compose.yml` stack files. This makes it easier to get up and running; however, it is prudent to keep the files saved to the disk. Even better, the stack files can be stored in a git repository and automatically updated should they be changed. This way, stack files can be recovered in the event of total failure of the general manager, and known working states can be restored.

### Installing Forgejo
Provision another server that will not be part of the swarm. A low end VPS with ~1 GB of RAM should suffice. Create an alias record:
```
git.example.com. 300  IN      A       7.8.9.10
```

Log into this server as `root`, and install Docker:
```sh
curl -s https://get.docker.com | sh
```

Create a directory for the `docker-compose.yml` file as well as data directories for the Forejo server and its proxy:
```sh
mkdir -p /opt/forgejo/caddy /opt/forgejo/forgejo && chown -R 150:150 /opt/forgejo/forgejo
```

Download the `docker-compose.yml` file:
```sh
wget -O /opt/forgejo/docker-compose.yml https://swarm.yachts/forgejo.yml
```

Modify the `docker-compose.yml` file, taking care to set `FORGEJO_DOMAIN` to the proper value for your domain (e.g. `git.example.com`):
```sh
FORGEJO_DOMAIN=git.example.com && sed -i "s/placeholder\.invalid/$FORGEJO_DOMAIN/g" /opt/forgejo/docker-compose.yml
```

Launch Forgejo and its reverse proxy:
```sh
cd /opt/forgejo && docker compose up -d
```

Point your web browser of choice to [git.example.com](https://git.example.com) and finish the initial setup with the web UI.

### Repository Setup

Login to the web UI with your newly created username and password, and create a new repository called `stacks`. This repository can be created with your user as its owner or with an organization as its owner. Take care to check the `Visibility` box and make the repository private. Also take note of the `Default Branch`; it is probably `main`. Check the `Initialize Repository` box. We want a README.md in the repository. Licenses and `.gitignore` files are not important here.

Return to the general manager, and login as your non-root user. Instruct git to save your Forgejo username and password to the disk:

```sh
git config --global credential.helper store
```

Also, set your name and email:

```sh
git config --global user.name "Your Name" && git config --global user.email "your.email@example.com"   
```

Clone your new git repository into a writeable directory such as `/home/$U$ER`. You will be prompted to enter your Forgejo username and password. You should now have a directory `/home/$USER/stacks`.

Create another repository with the same settings, with the exception of the name being `configs`. There is no need to re-run the `git config` commands again. Clone this repository into the same writeable directory, creating a directory `/home/$USER/configs`.

### Sync'ing with Git
Synchronization will be handled by [git-sync](https://github.com/simonthum/git-sync). Install the script:
```sh
sudo wget -P /usr/local/bin https://raw.githubusercontent.com/simonthum/git-sync/refs/heads/master/git-sync &&\
sudo chmod +x /usr/local/bin/git-sync
```

Create a simple stack in the new `stacks` repository and check to see that synchronization is working correctly:
```sh
WORKDIR=$(pwd) && cd /home/$USER/stacks && git-sync -n -s check && { cat << 'EOF' > ./test.yml
services:
  whoami:
    image: traefik/whoami
    ports:
      - "80:80"
EOF
} && git-sync -n -s && cd $WORKDIR
```

## Create a Network for Metrics
In order to facilitate monitoring of services later, create a `metrics` overlay network that will be used by Prometheus to scrape specified endpoints. Do this on the general manager.

```bash
docker network create --driver=overlay --attachable --subnet=10.254.0.0/16  metrics
```
