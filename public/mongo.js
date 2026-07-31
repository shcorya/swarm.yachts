import { Socket } from "jsr:@typescriptplayground/socket";

// variables for fetch methods and continuation
let response, result, proceed;

// initialize docker socket
const dockSock = new Socket('/var/run/docker.sock');

// prompt for TLD (used for certbot for mongo express)
const tld = prompt("Enter your swarm's TLD (e.g. \"swarm.yachts\"): ").replaceAll('\"', '').replaceAll('\'', '');
if (!tld) {
    console.error("Top-level domain is required.");
    Deno.exit(1);
}

// get the list of hostnames of nodes to label, cleaning up quotes and splitting into an array
const labelUs = prompt("Enter a space-seperated array of node hostnames that will hold data: ")
.replaceAll('\"', '')
.replaceAll('\'', '')
.split(' ');
// some sanity checking
if (labelUs.length !== 3 || labelUs.length !== 5 || labelUs.length !== 7) {
    console.error("It is highly recommended to use 3, 5 or 7 nodes for high availability.");
    proceed = confirm("Do you wish to continue with", labelUs.length, "nodes?")
    if (!proceed) {
        Deno.exit(0);
    }
}

// prompt for label that will be used to identify nodes with local volumes (has default value "yachts.swarm.mongo=db")
const label =  prompt("Enter mongo label key and value (defaults to \"yachts.swarm.mongo=db\"): ") || "yachts.swarm.mongo=db";
const [labelKey, labelValue] = label.replaceAll('\"', '').replaceAll('\'', '').split('=');

// get list of all nodes
response = await dockSock.request('/nodes', {
    method: "GET",
    headers: {
        "Content-Type": "application/json"
    }
});
result = await response.json(); // all nodes

// apply labels to nodes
for (let host of labelUs) {
    const updateMe = result.find(node => node.Description.Hostname === host);
    const update = {
        Labels: {
            ...updateMe.Spec.Labels,
            labelKey: labelValue
        }
    }
    response = await dockSock.request(`/nodes/${updateMe.ID}/update?version=${updateMe.Version.Index}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(update)
    });
    if (response.status !== 200) {
        console.error(await response.json().message);
        Deno.exit(response.status);
    }
}

// get list of all nodes (again)
response = await dockSock.request('/nodes', {
    method: "GET",
    headers: {
        "Content-Type": "application/json"
    }
});
result = await response.json(); // nodes, labeled this time
// filter results client-side because it's easier
const labeledNodes = nodes.filter(node => node.Spec.Labels[labelKey] === labelValue);

const initScript = `
#!/bin/bash
mongosh mongodb://${nodes[0].ID}.mongodb.internal:27017 \
"rs.initiate(
  { _id: \"swarm\", version: 1, members:
    [
${labeledNodes
.map((node, index) => `      { _id: ${index}, host: \\"${node.ID}.mongodb.internal:27017\\" }`)
.join(',\n')}
    ]
  }
)"
`;

const composeTemplate = `
services:
  init:
    image: mongo:8.3.4
    networks:
      - mongodb
    entrypoint: bash
    configs:
      - source: mongo_init
        mode: 0555
    command: /mongo_init
    deploy:
      mode: replicated-job

  db:
    image: mongo:8.3.4
    hostname: "{{.Node.ID}}.mongodb.internal"
    command: >
      --nounixsocket
      --bind_ip_all
      --replSet swarm
    networks:
      mongodb:
        aliases:
          - mongodb.internal
    volumes:
      - data:/data/db
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.${labelKey} == ${labelValue}"

  express:
    image: mongo-express
    hostname: mongo.${tld}
    networks:
      - mongodb
    ports:
      - "8081:8081"
    secrets:
      - mongo_express_pw
    volumes:
      - certs:/mnt/certs/
    environment:
      ME_CONFIG_MONGODB_URL: mongodb://mongodb.internal:27017
      ME_CONFIG_BASICAUTH_USERNAME: mongo
      ME_CONFIG_BASICAUTH_PASSWORD_FILE: /run/secrets/mongo_express_pw
      ME_CONFIG_SITE_SSL_ENABLED: "true"
      ME_CONFIG_SITE_SSL_CRT_PATH: /mnt/certs/live/${tld}/cert.pem
      ME_CONFIG_SITE_SSL_KEY_PATH: /mnt/certs/live/${tld}/privkey.pem
    deploy:
      placement:
        constraints:
          - node.role == worker

  proxy:                                                                                                                                                                                                                                      
    image: haproxy:3.4.1                                                                                                                                                                                                                      
    hostname: proxy.mongodb.internal                                                                                                                                                                                                          
    user: root                                                                                                                                                                                                                                
    ports:                                                                                                                                                                                                                                    
      - published: 7000                                                                                                                                                                                                                       
        target: 7000                                                                                                                                                                                                                          
        mode: host                                                                                                                                                                                                                            
    configs:                                                                                                                                                                                                                                  
    - source: hamongo_cfg                                                                                                                                                                                                                     
      target: /usr/local/etc/haproxy/haproxy.cfg                                                                                                                                                                                              
    networks:                                                                                                                                                                                                                                 
      - mongodb                                                                                                                                                                                                                               
    volumes:                                                                                                                                                                                                                                  
      - runvol:/run/mongo
    environment:
      HAPROXY_CERT_FILE: /run/secrets/haproxy_ssl
    deploy:
      mode: global
      placement:
        constraints:
          - "node.role == worker"
      restart_policy:
        delay: 0s
    secrets:
      - mongo_status_pw
      - haproxy_ssl

  gateway:
    image: alpine/socat:1.8.0.3
    command: "-d TCP-L:27017,fork,bind=host.docker.internal UNIX:/run/mongo/haproxy.sock"
    networks:
      - public
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - runvol:/run/mongo
    deploy:
      mode: global
      placement:
        constraints:
          - "node.role == worker"

networks:
  mongodb:
    name: mongodb
    attachable: true
    driver: overlay
    driver_opts:
      com.docker.network.driver.mtu: "1200"
    ipam:
      driver: default
      config:
        - subnet: "10.255.4.0/23"

configs:
  mongo_init:
    external: true

secrets:
  mongo_express_pw:
    external: true

volumes:
  data:
    driver: local
  certs:
    external: true

`;