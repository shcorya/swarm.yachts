---
next:
  text: 'Stacks'
  link: '/stacks/'
---

# Getting Started

Docker swarm is an orchestration tool for docker containers. It is backed by a system of managers and workers, where the managers determine the state of the swarm. The managers use the raft protocol to agree on the desired state of the containers. The desired states of the containers across both managers and workers is defined by services, in addition to collections of services called "stacks."

This guide assumes that the reader has basic knowledge of the command line, installing packages, and provisioning virtual private servers.

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

## Installation

```bash
curl -s https://get.docker.com | sh
```
