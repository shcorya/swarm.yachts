import { Socket } from "jsr:@typescriptplayground/socket";
import { promptSecret } from "jsr:@deno-cli-tools/prompts";

// variables for fetch methods and continuation
let response, result, proceed;

// initialize docker socket
const dockSock = new Socket('/var/run/docker.sock');

// prompt for TLD (used for certbot for mongo express)
let tld = prompt("Enter your swarm's TLD (e.g. \"swarm.yachts\"): ");
if (!tld) {
    console.error("Top-level domain is required.");
    Deno.exit(1);
} else {
    tld = tld.replaceAll('\"', '').replaceAll('\'', '');
}

// get the list of hostnames of nodes to label, cleaning up quotes and splitting into an array
let labelUs = prompt("Enter a space-seperated array of node hostnames that will hold data: ");
if (!labelUs) {
    console.error("An array of node hostnames is required.");
    Deno.exit(1);
} else {
    labelUs = labelUs.replaceAll('\"', '').replaceAll('\'', '').split(' ');
}
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

// get Mongo Express password
const expressUser = prompt("Enter a username for Mongo Express basic auth (defaults to \"mongo\"): ")
.replaceAll('\"', '').replaceAll('\'', '') || "mongo";
const expressPassword = await promptSecret("Enter a password for Mongo Express: ");
const expressPassword2 = await promptSecret("Re-enter password: ");
if (!expressPassword) {
    console.error("A Mongo Express password is required.");
    Deno.exit(4);
}
if (expressPassword !== expressPassword2) {
    console.error("Passwords do not match.");
    Deno.exit(3);
}
const expressSecretName = prompt("Enter a name for the Mongo Express password secret (defaults to \"mongo_express_pw\"):")
.replaceAll('\"', '').replaceAll('\'', '') || "mongo_express_pw";

// get status page secret
const statusUser = prompt("Enter a username for the HAProxy status page (defaults to \"mongo\"): ")
.replaceAll('\"', '').replaceAll('\'', '') || "mongo";
const statusPassword = await promptSecret("Enter a password for the HAProxy status page: ");
const statusPassword2 = await promptSecret("Re-enter password: ");
if (!statusPassword) {
    console.error("An HAProxy status page password is required.");
    Deno.exit(4);
}
if (statusPassword !== statusPassword2) {
    console.error("Passwords do not match.");
    Deno.exit(3);
}
const statusSecretName = prompt("Enter a name for the HAProxy status password secret (defaults to \"mongo_status_pw\"): ")
.replaceAll('\"', '').replaceAll('\'', '') || "mongo_status_pw";

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
            [labelKey]: labelValue
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

const haproxyTemplate = `
global
        hard-stop-after 30s
        log stdout format raw local0 err
                                                           
defaults            
        retries 4  
        option redispatch                              
        timeout client 30s
        timeout server 30s
        timeout connect 4s

frontend prometheus
        bind :8405
        mode http
        http-request use-service prometheus-exporter
        no log

listen stats
        mode http
        bind *:7000 ssl crt {{ env "HAPROXY_CERT_FILE" }}
        stats enable
        stats uri /
        stats auth ${statusUser}:{{ secret "${statusSecretName}" }}
        stats refresh 30s

frontend mongo_primary
        bind *:27017
        bind /run/mongo/haproxy.sock
        mode tcp
        default_backend mongo_stack

backend mongo_stack
        option tcp-check
        option log-health-checks
        tcp-check connect port 27017
        tcp-check send-binary 3a000000 # Message Length (58)
        tcp-check send-binary EEEEEEEE # Request ID (random value)
        tcp-check send-binary 00000000 # Response To (nothing)
        tcp-check send-binary d4070000 # OpCode (Query)
        tcp-check send-binary 00000000 # Query Flags
        tcp-check send-binary 61646d696e2e # fullCollectionName (admin.$cmd)
        tcp-check send-binary 24636d6400 # continued
        tcp-check send-binary 00000000 # NumToSkip
        tcp-check send-binary FFFFFFFF # NumToReturn
        # Start of Document
        tcp-check send-binary 13000000 # Document Length (19)
        tcp-check send-binary 10 # Type (Int32)
        tcp-check send-binary 69736d617374657200 # ismaster:
        tcp-check send-binary 01000000 # Value : 1
        tcp-check send-binary 00 # Term
        tcp-check expect binary 69736d61737465720001 #ismaster True
        default-server inter 3s fall 3 rise 2 on-marked-down shutdown-sessions
${labeledNodes.map(node => `        server ${node.Description.Hostname} ${node.ID}.mongodb.internal:27017 check inter 3s fall 3 rise 2`).join('\n')}
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
      - ${expressSecretName}
    volumes:
      - certs:/mnt/certs/
    environment:
      ME_CONFIG_MONGODB_URL: mongodb://mongodb.internal:27017
      ME_CONFIG_BASICAUTH_USERNAME: mongo
      ME_CONFIG_BASICAUTH_PASSWORD_FILE: /run/secrets/${expressSecretName}
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
  ${expressSecretName}:
    external: true
  ${statusSecretName}:
    external: true

volumes:
  data:
    driver: local
  certs:
    external: true
`;