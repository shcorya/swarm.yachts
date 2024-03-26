# Appendix

## JuiceFS

## Opening Services Externally
It may be useful to open Docker Swarm services to other applications running outside the swarm. This can be accomplished by using signed wildcard certificates, and keeping those certificates synchronized across each swarm node.

### Wildcard Domains
Each node will need access to a signed, wildcard certificate for services opened externally. This can be accomplished by using Certbot in conjunction with a service that will keep the certificate available and up-to-date on each node.

### Setting CNAME Records
A CNAME record will need to be set for the service which is to be opened externally. For example, if one wants to make the GLAuth stack available outside of the swarm, a CNAME record will need to be set. For simplicity, it is advisable to create a CNAME pointing, for example, `ldap.example.com` to the nodes `swarm.example.com`. This preserves DNS-level redundancy with only a single new record set for the new GLAuth service.

### Compose
```yaml
version: "3.8"

services:
  sync:
    image: coryaent/favre
    hostname: "{{.Service.Name}}.{{.Task.Slot}}.{{.Task.ID}}"
    secrets:
      - favre_key
    environment:
      CSYNC2_KEY_FILE: /run/secrets/favre_key
      CSYNC2_INCLUDE: /sync
      FAVRE_TASKS_ENDPOINT: "tasks.{{.Service.Name}}."
    networks:
      - internal
    volumes:
      - state:/var/lib/csync2/
      - wildcardcerts:/sync/
    deploy:
      mode: global
      endpoint_mode: dnsrr

secrets:
  favre_key:
    external: true

networks:
  internal:
    attachable: false
    driver: overlay
    driver_opts:
      encrypted: "true"

volumes:
  state:
    driver: local
  wildcardcerts:
    driver: local
    name: wildcardcerts
```

## Additional Compose Files

https://github.com/ethibox/awesome-stacks/tree/master/stacks

https://github.com/YouMightNotNeedKubernetes
