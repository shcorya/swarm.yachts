# Management
Letting services access the docker management socket is a convenient and versatile way to add functionality to stacks and services. Be careful; always check any code that has access to your management socket.

## Deployment
```sh
curl -sL https://swarm.yachts/mgmt.sh | sh
```