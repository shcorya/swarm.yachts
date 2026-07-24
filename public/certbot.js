import { Socket } from "jsr:@typescriptplayground/socket";
import { prompt, promptSecret } from "jsr:@deno-cli-tools/prompts";
import { userInfo } from "node:os";

let dockSock = new Socket('/var/run/docker.sock');

let credentials, process, status;

const provider = await prompt("Enter your DNS provider (desec, directadmin, hetzner, powerdns, or powerdns-admin): ");
// get credentials based on provider
switch (provider) {

  case "desec":
    const desecToken = await promptSecret("Enter your deSEC token: ");
    credentials =
      `dns_desec_token = ${desecToken}`;
    break;

  case "directadmin":
    const directAdminUrl = await prompt("Enter your DirectAdmin URL: ");
    const directAdminUsername = await prompt("Enter your DirectAdmin username: ");
    const directAdminPassword = await promptSecret("Enter your DirectAdmin password: ");
    credentials =
      `dns_directadmin_url = ${directAdminUrl}` + '\n' +
      `dns_directadmin_username = ${directAdminUsername}` + '\n' +
      `dns_directadmin_password = ${directAdminPassword}`;
    break;

  case "hetzner":
    const hetzerApiToken = await promptSecret("Enter your Hetzner API token: ");
    credentials =
      `dns_hetzner_api_token = ${hetzerApiToken}`;
    break;

  case "powerdns":
    const powerdnsAdminUrl = await prompt("Enter your PowerDNS URL: ");
    const powerdnsApiKey = await promptSecret("Enter your PowerDNS API key: ");
    credentials =
      `dns_powerdns_api_url = ${powerdnsAdminUrl}` + '\n' +
      `dns_powerdns_api_key = ${powerdnsApiKey}`;
    break;

  case "powerdns-admin":
    const pdnsAdminUrl = await prompt("Enter your PowerDNS-Admin URL: ");
    const pdnsAdminKey = await promptSecret("Enter your PowerDNS-Admin API key: ");
    credentials =
      `dns_powerdns_admin_api_url = ${pdnsAdminUrl}` + '\n' +
      `dns_powerdns_admin_api_key = ${pdnsAdminKey}`;
    break;

    default:
      console.error(`Provider "${provider}" is not supported.`);
      Deno.exit(1);

}

// Create a config
await createSwarmObject('config', `certbot_credentials_${provider}`, credentials);

// get the list of domains
const domains = await prompt("Enter a space-seperated array of domains to certify (wildcards are allowed): ");
if (!domains) {
  console.error("One or more domains must be provided.");
  Deno.exit(1);
}

// get the optional email address
const email = prompt("Enter your email address (optional): ");

// get the cron schedule
const schedule = await prompt("Enter a cron renewal time including seconds (one will be automatically generated if left blank): ") ||
  `${Math.floor(Math.random() * 60)} ${Math.floor(Math.random() * 60)} ${Math.floor(Math.random() * 24)} * * *`;

// generate a secret for favre sync
const FAVRE_PSK_LENGTH = 32;
const psk = Math.random().toString(36).substring(2, FAVRE_PSK_LENGTH + 2);
await createSwarmObject('secret', 'certbot_favre_psk', psk);

// create the ini config
// create config for certbot.ini
const certbot_ini_template = `
email = {{ env "CERTBOT_EMAIL" }}
authenticator = dns-{{ env "CERTBOT_DNS_PROVIDER" }}
dns-{{ env "CERTBOT_DNS_PROVIDER" }}-credentials = {{ env "CERTBOT_CREDENTIAL_FILE" }}
`;
await createSwarmObject('config', 'certbot_ini', certbot_ini_template, 'golang');

const chmodScript = `
#!/bin/sh
set -e
chmod 0755 /etc/letsencrypt/live
chmod -R 0755 /etc/letsencrypt/live
chmod 0755 /etc/letsencrypt/archive
chmod -R 0755 /etc/letsencrypt/archive
`;
await createSwarmObject('config', `certbot_fix_permissions`, chmodScript);

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
await createSwarmObject('config', `Mustache_certbot`, mustacheTemplate);

// get the initialization node because the init likes to run more than once if it's not explicitly specified
const response = await dockSock.request('/nodes', {
  method: "GET",
  headers: {
    "Content-Type": "application/json"
  }
});
const nodes = await response.json();
// just get the first worker that is active and ready
const initNode = nodes.filter(node => 
  node.Spec?.Role === 'worker' &&
  node.Spec?.Availability === 'active' &&
  node.Status?.State === 'ready'
)[0];
// bail if there's no eligile workers
if (!initNode) {
  console.error("no active, ready worker nodes found in the swarm");
  Deno.exit(1);
}

const composeFileTemplate = `
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
  CERTBOT_EMAIL: ${email ? email : 'null@swarm.invalid'}
  CERTBOT_DNS_PROVIDER: ${provider}
  CERTBOT_CREDENTIAL_FILE: /run/secrets/certbot_credentials_${provider}

services:                                                                                                                                                                                                                   22:35:00 [41/1858]
  init_${provider}:
    <<: *certbot-common
    command: certonly --agree-tos -n ${domains.split(' ').map(domain => `-d ${domain}`).toString().replaceAll(',', ' ')}
    environment:
      <<: *common-env
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

// run git-sync
const gitSyncCheck = new Deno.Command("git-sync", {
  args: ["-n", "-s", "check"],
  stdin: "piped",
  cwd: `${userInfo().homedir}/stacks`
});

process = gitSyncCheck.spawn();

// Await the status promise to get the status object
status = await process.status;

// bail if we can't git-sync
if (status.code) process.exit(status.code);

// write the file to the stacks folder
await Deno.writeTextFile(`${userInfo().homedir}/stacks/certbot.yml`, composeFileTemplate);

const gitSyncExec = new Deno.Command("git-sync", {
  args: ["-n", "-s"],
  stdin: "piped",
  cwd: `${userInfo().homedir}/stacks`
});

process = gitSyncExec.spawn();

// dirty exit
status = await process.status;
if (status.code) process.exit(status.code);

// ================================================================================
// convenience function
async function createSwarmObject(type, name, data, templateDriver) {
  // Validate object type
  if (type !== 'secret' && type !== 'config') {
    console.error(`Invalid type "${type}". Must be either "secret" or "config".`);
    Deno.exit(1);
  }

  // Docker API endpoints: /secrets/create vs /configs/create
  const endpoint = `/${type}s/create`;

  const payload = {
    "Name": name,
    "Data": btoa(data)
  };

  // Templating is supported on both Swarm configs and secrets
  if (templateDriver) {
    payload["Templating"] = {
      "Name": templateDriver
    };
  }

  const response = await dockSock.request(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const result = await response.json();

  if (response.status === 201) {
    console.log(result.ID);
    return result.ID;
  } else if (response.status === 409) {
    console.log(`${type} ${name} already exists`);
    if (!confirm('proceed anyway?')) Deno.exit(0);
  } else {
    console.error(result.message);
    Deno.exit(1);
  }
}