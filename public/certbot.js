"use strict";

let proceed, credentials, apiResponse, apiResponseData, initNode, psk, schedule;

if (!process.env.DOCKER_ENDPOINT) {
  console.error("Environment variable DOCKER_ENDPOINT must be set.");
  process.exit(1);
}

// check and marshall docker endpoint
const validDockerEndpoint = URL.canParse(process.env.DOCKER_ENDPOINT);
console.debug(validDockerEndpoint);
if (!validDockerEndpoint) {
  console.error(`DOCKER_ENDPOINT is not valid. Only HTTP is supported e.g. http://localhost:2375`);
  process.exit(1);
}

const provider = prompt(`Enter your DNS provider (desec, directadmin, hetzner, powerdns, or powerdns-admin):`);

switch (provider) {

  case "desec":
    const desecToken = prompt("Enter your deSEC token:");
    credentials =
      `dns_desec_token = ${desecToken}`;
    break;

  case "directadmin":
    const directAdminUrl = prompt("Enter your DirectAdmin URL:");
    const directAdminUsername = prompt("Enter your DirectAdmin username:");
    const directAdminPassword = prompt("Enter your DirectAdmin password:");
    credentials = 
      `dns_directadmin_url = ${directAdminUrl}` + '\n' +
      `dns_directadmin_username = ${directAdminUsername}` + '\n' +
      `dns_directadmin_password = ${directAdminPassword}`; 
    break;

  case "hetzner":
    const hetzerApiToken = prompt("Enter your Hetzner API token:");
    credentials = 
      `dns_hetzner_api_token = ${hetzerApiToken}`;
    break;

  case "powerdns":
    const powerdnsAdminUrl = prompt("Enter your PowerDNS URL:");
    const powerdnsApiKey = prompt("Enter your PowerDNS API key:");
    credentials =
      `dns_powerdns_api_url = ${powerdnsAdminUrl}` + '\n' +
      `dns_powerdns_api_key = ${powerdnsApiKey}`;
    break;

  case "powerdns-admin":
    const pdnsAdminUrl = prompt("Enter your PowerDNS-Admin URL:");
    const pdnsAdminKey = prompt("Enter your PowerDNS-Admin API key");
    credentials =
      `dns_powerdns_admin_api_url = ${pdnsAdminUrl}` + '\n' +
      `dns_powerdns_admin_api_key = ${pdnsAdminKey}`;
    break;

    default:
      console.error(`Provider "${provider}" is not supported.`); 
      proceed = confirm("Do you want to continue?");
      if (!proceed) process.exit(1);

}

const domains = prompt("Enter a comma-seperated array of domains to certify (wildcards are allowed): ");
if (!domains) {
  console.error("A list of domains must be provided.");
  process.exit(1);
}

const email = prompt("Enter your email address (optional):");

schedule = prompt("Enter a cron renewal time including seconds (one will be automatically generated if left blank): ");
if (!schedule){
  // generate a random, daily cron time
  schedule = `${Math.floor(Math.random() * 60)} ${Math.floor(Math.random() * 60)} ${Math.floor(Math.random() * 24)} * * *`
}

// get a psk
psk = prompt("Enter a random, 32-character string for the snchronization process pre-shared key \
  (one will be randomly generated in not entered here): ");
if (!psk) {
  // generate a random string 
  const length = 32;
  psk = Math.random().toString(36).substring(2, length + 2);
}
console.log("Creating secret pre-shared key in the swarm ...");
apiResponse = await fetch(process.env.DOCKER_ENDPOINT.replace(/\/+$/, "") + '/secrets/create', {
  method: "POST",
  body: JSON.stringify({
    Name: "certbot_favre_psk",
    Data: btoa(psk)
  }),
});
apiResponseData = await apiResponse.json();
if (apiResponse.status === 200) {
  console.log(apiResponseData.Id);
} else {
  console.error(apiResponseData.message);
  process.exit(1);
}

// certbot.ini => docker config
console.log(`Creating config certbot_ini ...`);
// configuration in base64
const ini_template = `
email = {{ env "CERTBOT_EMAIL" }}
authenticator = dns-{{ env "CERTBOT_DNS_PROVIDER" }}
dns-{{ env "CERTBOT_DNS_PROVIDER" }}-credentials = {{ env "CERTBOT_CREDENTIAL_FILE" }}
{{ env "CERTBOT_DOMAINS" }}
`;
apiResponse = await fetch(process.env.DOCKER_ENDPOINT.replace(/\/+$/, "") + '/configs/create', {
  method: "POST",
  body: JSON.stringify({
    Name: `certbot_ini`,
    Data: btoa(ini_template),
    Templating: {
      Name: 'golang'
    }
  }),
});

apiResponseData = await apiResponse.json();
if (apiResponse.status === 200) {
  console.log(apiResponseData.Id);
} else {
  console.error(apiResponseData.message);
  process.exit(1);
}

// credentials => docker secret
console.log(`Creating secret certbot_${provider}_credentials ...`);
apiResponse = await fetch(process.env.DOCKER_ENDPOINT.replace(/\/+$/, "") + '/secrets/create', {
  method: "POST",
  body: JSON.stringify({
    Name: `certbot_${provider}_credentials`,
    Data: btoa(credentials)
  }),
});
apiResponseData = await apiResponse.json();
if (apiResponse.status === 200) {
  console.log(apiResponseData.Id);
} else {
  console.error(apiResponseData.message);
  process.exit(1);
}

// find the first online worker, because the init job likes to run more than once
console.log('Finding an online worker node ...');
let url = new URL(process.env.DOCKER_ENDPOINT.replace(/\/+$/, "") + '/nodes');
url.searchParams.append('filters', JSON.stringify( { role: ['worker'] } ));
apiResponse = await fetch(url);
apiResponseData = await apiResponse.json();
if (apiResponse.status === 200) {
  // find init node
  initNode = apiResponseData.find(node => {
    let isActive = node.Spec.Availability === "active";
    let isReady = node.Status.State === "ready";
    return isActive && isReady;
  });
} else {
  console.error(apiResponseData.message);
  process.exit(1);
}
if (!initNode) {
  console.error("Could not find a worker node that is both active and ready.")
  process.exit(1);
}
console.log(initNode.ID);

const chmodScript = `
#!/bin/sh
set -e
chmod 0755 /etc/letsencrypt/live
chmod -R 0755 /etc/letsencrypt/live
chmod 0755 /etc/letsencrypt/archive
chmod -R 0755 /etc/letsencrypt/archive
`;

const mustacheTemplate = `
nossl * *;

group swarm {

    {{#hosts}}
    host {{.}};
    {{/hosts}}

    key {{key}};

    {{#includes}}
    include {{.}};
    {{/includes}}

    {{#excludes}}
    exclude {{.}};
    {{/excludes}}

    action
    {
        exec "/usr/local/bin/certbot_fix_permissions.sh";
        do-local;
    }

    {{#auto}}auto {{.}};{{/auto}}

    {{#backupDirectory}}backup-directory {{.}};{{/backupDirectory}}
    {{#backupGenerations}}backup-generations {{.}};{{/backupGenerations}}
}
`;

const composeFile = `
x-certbot-common: &certbot-common
  image: corya.io/enterprises/cypert:master
  configs:                                           
    - source: certbot_ini
      target: /etc/letsencrypt/cli.ini     
      mode: 0400
    - source: certbot_fix_permissions                                                                                                                                                                                    
      target: /etc/letsencrypt/renewal-hooks/deploy/certbot_fix_permissions.sh                                                                                                                                                                
      mode: 0555
  secrets:                                    
    - source: certbot_credentials_${provider}
      mode: 0400                            
  volumes:                                            
    - certs:/etc/letsencrypt/
                                                           
x-common-env: &common-env
  ${email ? `CERTBOT_EMAIL: ${email}` : ''}
  CERTBOT_DNS_PROVIDER: ${provider}
  CERTBOT_CREDENTIAL_FILE: /run/secrets/certbot_credentials_${provider}

services:                                                                                                                                                                                                                   22:35:00 [41/1858]
  init:     
    <<: *certbot-common            
    command: certonly --agree-tos -n
    environment:
      <<: *common-env
      CERTBOT_DOMAINS: "domains = ${domains}"
    deploy:     
      mode: replicated-job
      placement:                 
        constraints:
          - "node.id == ${initNode.ID}"
                                                        
  renew:          
    <<: *certbot-common     
    command: renew --agree-tos -n
    environment:     
      <<: *common-env
    deploy:
      labels:
        - "swarm.cronjob.enable=true"
        - "swarm.cronjob.schedule=${schedule}
        - "swarm.cronjob.skip-running=false"
      restart_policy:
        condition: none
      placement:
        constraints:
          - "node.role == worker"
                                                           
  sync:         
    image: coryaent/favre:main
    hostname: '{{.Task.ID}}'
    secrets:         
      - certbot_favre_psk
    environment:                 
      DEBUG: "1"
      CSYNC2_PSK_FILE: /run/secrets/certbot_favre_psk
      CSYNC2_INCLUDE: /sync
      CSYNC2_EXCLUDE_0: /sync/.certbot.lock
      CSYNC2_EXCLUDE_1: /sync/renewal-hooks
      CSYNC2_EXCLUDE_2: /sync/cli.ini
      CSYNC2_TEMPLATE_FILE: /Mustache_certbot
      FAVRE_POLL_INTERVAL: 1800000 # 30 minutes
      FAVRE_REMOVE_TIMEOUT: 90000 # 90 seconds
      FAVRE_SYNC_TIMEOUT: 300000 # 5 minutes
      FAVRE_DEBOUNCE_DELAY: 5000 # 5 seconds
      FAVRE_TASKS_ENDPOINT: "tasks.{{.Service.Name}}."
    networks:
      - sync
    configs:
      - source: Mustache_certbot
        target: /Mustache_certbot
      - source: certbot_fix_permissions
        target: /usr/local/bin/certbot_fix_permissions.sh
        mode: 0555
    volumes:
      - sync_state:/var/lib/csync2/
      - certs:/sync/
    deploy:
      mode: global
      endpoint_mode: dnsrr
      placement:
        constraints:
          - "node.role == worker"

configs:
  certbot_ini:
    external: true
  certbot_fix_permissions:
    external: true
  Mustache_certbot:
    external: true

secrets:
  certbot_credentials_${provider}:
    external: true
  certbot_favre_psk:
    external: true

networks:
  sync:
    attachable: false
    driver: overlay
    driver_opts:
      com.docker.network.driver.mtu: "1200"
    ipam:
      driver: default
      config:
        - subnet: "10.255.2.0/23"

volumes:
  sync_state:
    driver: local
  certs:
    driver: local
    name: certs
`;