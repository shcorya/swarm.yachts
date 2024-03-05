---
prev:
  text: 'Stacks Overview'
  link: '/stacks/'
---

# RedisRaft
Redis is an in-memory storage for various data types. It includes support for sets, lists, simple key-value pairs, and hash maps.

## Before Deployment
Before deploying RedisRaft, it is prudent to create a network for other services to attach to the Caddy reverse proxy. This will allow the deployment of the RedisRaft stack prior to deploying the reverse proxy stack.

Create the web overlay network:
```bash
docker network create --attachable --driver overlay --opt encrypted --subnet 10.255.0.0/16 www
```

## Compose
```yaml
version: "3.8"
# redis-cli RAFT.CLUSTER INIT
# redis-cli RAFT.CLUSTER JOIN redisraft-1:6379
services:
  server:
    image: redislabs/ng-redis-raft
    hostname: "{{.Node.ID}}.redisraft.host"
    networks:
      default:
        aliases:
          - redisraft
    command: >
      redis-server
      --loadmodule /redisraft.so
      --bind 0.0.0.0
      --raft.follower-proxy yes
    volumes:
      - data:/data
    deploy:
      mode: global
      placement:
        constraints:
          - node.labels.enterprises.corya.redisraft==true
      resources:
        reservations:
          cpus: '0.25'
          memory: 32M

  browser:
    image: erikdubbelboer/phpredisadmin
    environment:
      - REDIS_1_HOST=redisraft
      - REDIS_1_PORT=6379
    networks:
      default:
      www:
        aliases:
          - browser.redisraft.host
    deploy:
      replicas: 1
      placement:
        constraints:
          - "node.role==worker"
      labels:
        caddy: redisraft.corya.enterprises
        caddy.basicauth.admin: JDJhJDE0JGdpVGlYZ09INUJ1cERqVGdieS5PdGUyQ2VmZHhnT3lZbmYyQ3BIWDRaMng3eWxEbngwTG55Cg==
        caddy.reverse_proxy: http://browser.redisraft.host:80


networks:
  default:
    name: redisraft
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"
  www:
    external: true

volumes:
  data:
    driver: local
```

## Setup
Now that the stack is deployed
