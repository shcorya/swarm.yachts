---
next:
  text: 'Stacks'
  link: '/stacks/'
---

# Getting Started
Docker swarm is an orchestration tool for docker containers. It is backed by a system of managers and workers, where the managers determine the state of the swarm. The managers use the raft protocol to agree on the desired state of the containers. The desired states of the containers across both managers and workers is defined by services, in addition to collections of services called "stacks."

This guide assumes that the reader has basic knowledge of the command line, installing packages, and provisioning virtual private servers, and setting DNS records.

## Provisioning
At least six servers (three managers and three workers) are required to deploy docker swarm effectively. Root access on each of the servers is required. The servers will cost from $100 to $400 per year depending on which provider you choose. RackNerd is recommended. One can get started with six nodes hosted by RackNerd about $100, which will be charged on an annual basis.

Recommended minimum specifications for [manager nodes](https://my.racknerd.com/cart.php?a=confproduct&i=1):
- 1 vCPU
- 10 GB SSD storage
- 768 MB RAM

For [worker nodes](https://my.racknerd.com/cart.php?a=confproduct&i=2):
- 2 vCPU
- 25 GB SSD storage
- 2 GB RAM

As implied by the names, the worker nodes will do most of the computation. The managers orchestrate containers that run on the workers based on the state of the swarm.

Note: managers can also be workers, although this is not recommended for production deployments. Deploying more than a few stacks at a time could excessively tax a machine's resources. Overloading management nodes can result in degredation of the entire swarm.

Install Linux on each of the VPS's. This guide assumes Debian has been installed.

## Setting DNS records
Create a DNS A record for each of your new machines. Then, set another A record which is the same domain name pointing to the three worker nodes. For example, if your worker IP's are `1.2.3.4`, `3.4.5.6`, and `5.6.7.8`, create the following A records:
```
swarm.example.com. 300  IN      A       1.2.4.5
swarm.example.com. 300  IN      A       3.4.5.6
swarm.example.com. 300  IN      A       5.6.7.8
```

## Installation
Open a secure shell to each of your managers and workers and run (as root):
```bash
curl -s https://get.docker.com | sh
```


## Initialization
Then, on a manager node, run:
```bash
docker swarm init
```

The output will look like this:
```
Swarm initialized: current node (bvz81updecsj6wjz393c09vti) is now a manager.

To add a worker to this swarm, run the following command:

    docker swarm join --token SWMTKN-1-3pu6hszjas19xyp7ghgosyx9k8atbfcr8p2is99znpy26u2lkl-1awxwuwd3z9j1z3puu7rcgdbx 172.17.0.2:2377

To add a manager to this swarm, run 'docker swarm join-token manager' and follow the instructions.
```

Run the above, specified command on each worker.

Then run a similar command on one of the managers:
```bash
docker swarm join-token manager
```

The output will be similar. Run the `docker swarm join` command with the manager token on each of the other managers.

Running `docker node ls` on a manager node should show that all six nodes are now a part of the newly created swarm.

More information about [initializing a swarm](https://docs.docker.com/reference/cli/docker/swarm/init/) and [joining nodes](https://docs.docker.com/reference/cli/docker/swarm/join/) can be found in the official documentation.
