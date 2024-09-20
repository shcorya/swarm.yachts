*This stack depends on Caddy.*

# OpenSearch (ELK Stack)
The ELK stack consists of Elasticsearch, Kibana, and Logstash. Due to licensing reasons, these pieces of software were forked. The fork of Elasticsearch is called "OpenSearch," and the fork of Kibana is called "OpenSearch Dashboards."

## Security
OpenSearch contains a security plugin that is required in order to restrict which users will be able to login. For OpenSearch Dashboards, the security plugin allows administrators to create and manager other users. The security plugin requires the use of SSL certificates.

### Environment

Enter environment variables that will be used to create a certificate authority and signed certificates.

For country, use a [two letter code](https://www.digicert.com/kb/ssl-certificate-country-codes.htm).
```bash
export COUNTRY="US"
```
```bash
export STATE="Indiana"
```
```bash
export LOCALITY="Indianapolis"
```
Omitting spaces and non-alphanumeric characters from the organization name and organizational unit is advisable.
```bash
export ORGANIZATION="Swarm"
```
```bash
export ORGANIZATIONAL_UNIT="Yachts"
```
Set the common name to your fully-qualified domain name.
```bash
export COMMON_NAME="swarm.yachts"
```

### Certificates and Keys
Create a security key for your root certificate.
```bash
openssl genrsa 2048 > ca-key.pem
```

Create a root certificate that will be used to sign our client certificates.
```bash
openssl req -new -x509 -nodes -days 36500 \
    -key ca-key.pem \
    -out ca-cert.pem \
    -subj "/C=$COUNTRY/ST=$STATE/L=$LOCALITY/O=$ORGANIZATION/OU=$ORGANIZATIONAL_UNIT/CN=$COMMON_NAME"
```

Generate a certificate signing request and key that will be used for inter-node communication.
```bash
openssl req -newkey rsa:2048 -nodes -days 36500 \
    -keyout node-key.pem \
    -out node-req.pem -subj "/C=$COUNTRY/ST=$STATE/L=$LOCALITY/O=$ORGANIZATION/OU=$ORGANIZATIONAL_UNIT/CN=opensearch.host" \
    -reqexts SAN -config <(cat /etc/ssl/openssl.cnf <(printf "[SAN]\nsubjectAltName=RID:1.2.3.4.5.5,DNS:*.opensearch.host"))
```
Sign the node certificate with the root key.
```bash
openssl x509 -req -days 36500 -set_serial 01 \
   -in node-req.pem \
   -out node-cert.pem \
   -CA ca-cert.pem \
   -CAkey ca-key.pem -copy_extensions=copyall
```

Create another certificate signing request and key that will be used for admin access. This certificate will be used for accessing OpenSearch from OpenSearch Dashboards.
```bash
openssl req -newkey rsa:2048 -nodes -days 36500 \
    -keyout admin-key.pem \
    -out admin-req.pem -subj "/C=$COUNTRY/ST=$STATE/L=$LOCALITY/O=$ORGANIZATION/OU=$ORGANIZATIONAL_UNIT/CN=$COMMON_NAME" \
    -reqexts SAN -config <(cat /etc/ssl/openssl.cnf <(printf "[SAN]\nsubjectAltName=RID:1.2.3.4.5.5,DNS:*.$COMMON_NAME"))
```
Sign the admin certificate.
```bash
openssl x509 -req -days 36500 -set_serial 01 \
   -in admin-req.pem \
   -out admin-cert.pem \
   -CA ca-cert.pem \
   -CAkey ca-key.pem
```

Create a signing request for the logstash certificate.
```bash
openssl req -newkey rsa:2048 -nodes -days 36500 \
    -keyout logstash-key.pem \
    -out logstash-req.pem -subj "/C=$COUNTRY/ST=$STATE/L=$LOCALITY/O=$ORGANIZATION/OU=$ORGANIZATIONAL_UNIT/CN=logstash.host" \
    -reqexts SAN -config <(cat /etc/ssl/openssl.cnf <(printf "[SAN]\nsubjectAltName=RID:1.2.3.4.5.5,DNS:*.logstash.host"))
```
Sign the logstash certificate.
```bash
openssl x509 -req -days 36500 -set_serial 01 \
   -in logstash-req.pem \
   -out logstash-cert.pem \
   -CA ca-cert.pem \
   -CAkey ca-key.pem
```

Create a swarm secret for each of the certificates and keys.
```bash
docker secret create ca_key ./ca-key.pem &&\
docker secret create ca_cert ./ca-cert.pem &&\
docker secret create opensearch_admin_key ./admin-key.pem &&\
docker secret create opensearch_admin_cert ./admin-cert.pem &&\
docker secret create opensearch_node_key ./node-key.pem &&\
docker secret create opensearch_node_cert ./node-cert.pem &&\
docker secret create logstash_key ./logstash-key.pem &&\
docker secret create logstash_cert ./logstash-cert.pem
```

## Swarm Nodes
We must select which nodes will run our OpenSearch processes, and we must change some configuration on the corresponding swarm nodes.

### Environment
Create label.
```bash
export OPENSEARCH_LABEL="yachts.swarm.opensearch"
```

Read nodes.
```bash
read -a OPENSEARCH_NODES -p "Enter the OpenSearch node array (space-seperated): "
```

Apply label.
```bash
#!/bin/bash
for i in "${!OPENSEARCH_NODES[@]}"
do
  docker node update --label-add $OPENSEARCH_LABEL=true ${OPENSEARCH_NODES[i]}
done
```


### Host System Configuration

For each OpenSearch node, it is [important](https://opensearch.org/docs/latest/install-and-configure/install-opensearch/index/#important-settings) to set `vm.max_map_count` to at least `262144`.

This can be done by editing the `/etc/sysctl.conf` file.

Add the following line to `/etc/sysctl.conf`.

```
vm.max_map_count=262144
```


## Configuration
Two swarm configs are necessary to operate and secure our OpenSearch cluster.

### Passwords
We will need to configure both docker secrets and hashes from two passwords.


Define an administrator password, and retain it (ideally, in a password manager.) This will be used to access Dashboards.
```bash
export OPENSEARCH_INITIAL_ADMIN_PASSWORD=$(pwgen 24 1) && echo $OPENSEARCH_INITIAL_ADMIN_PASSWORD
```

Define another password that will be used by Logstash to access the OpenSearch backend.
```bash
export OPENSEARCH_LOGSTASH_PASSWORD=$(pwgen 24 1)
```

Create swarm secrets for each of these passwords.
```bash
printf $OPENSEARCH_INITIAL_ADMIN_PASSWORD | docker secret create opensearch_admin_pw - &&\
printf $OPENSEARCH_LOGSTASH_PASSWORD | docker secret create opensearch_logstash_pw -
```

### Internal Users
Use the following command to create a swarm config that will be mounted at `/usr/share/opensearch/config/opensearch-security/internal_users.yml` within the OpenSearch containers.
```bash
cat << EOL | docker config create opensearch_users -
_meta:
  type: "internalusers"
  config_version: 2
admin:
  hash: "$(caddy hash-password --plaintext $OPENSEARCH_INITIAL_ADMIN_PASSWORD)"
  reserved: true
  backend_roles:
  - "admin"
  description: "Default admin user"
logstash:
  hash: "$(caddy hash-password --plaintext $OPENSEARCH_LOGSTASH_PASSWORD)"
  reserved: false
  backend_roles:
  - "admin"
  - "logstash"
  description: "Logstash user"
EOL
```

### General Configuration

Optionally, name the OpenSearch cluster.
```bash
export OPENSEARCH_CLUSTER_NAME="Swarm"
```

Set a variable that will be the web address of your dashboards.
```bash
export DASHBOARDS_DOMAIN="dashboards.swarm.yachts"
```


We will use the following configuration file to enable the OpenSearch security plugin.
```bash
cat << EOL | docker config create opensearch_node -
plugins.security.ssl.transport.pemcert_filepath: node-cert.pem
plugins.security.ssl.transport.pemkey_filepath: node-key.pem
plugins.security.ssl.transport.pemtrustedcas_filepath: root-ca.pem
plugins.security.ssl.transport.enforce_hostname_verification: false
plugins.security.ssl.http.enabled: true
plugins.security.ssl.http.pemcert_filepath: node-cert.pem
plugins.security.ssl.http.pemkey_filepath: node-key.pem
plugins.security.ssl.http.pemtrustedcas_filepath: root-ca.pem
plugins.security.allow_unsafe_democertificates: false
plugins.security.allow_default_init_securityindex: false
plugins.security.authcz.admin_dn: ['CN=$COMMON_NAME,OU=$ORGANIZATIONAL_UNIT,O=$ORGANIZATION,L=$LOCALITY,ST=$STATE,C=$COUNTRY']
plugins.security.nodes_dn: ['CN=*.opensearch.host,OU=$ORGANIZATIONAL_UNIT,O=$ORGANIZATION,L=$LOCALITY,ST=$STATE,C=$COUNTRY']
plugins.security.audit.type: internal_opensearch
plugins.security.enable_snapshot_restore_privilege: true
plugins.security.check_snapshot_restore_write_privileges: true
plugins.security.restapi.roles_enabled: [all_access, security_rest_api_access]
plugins.security.system_indices.enabled: true
plugins.security.system_indices.indices: [.plugins-ml-agent, .plugins-ml-config, .plugins-ml-connector,
  .plugins-ml-controller, .plugins-ml-model-group, .plugins-ml-model, .plugins-ml-task,
  .plugins-ml-conversation-meta, .plugins-ml-conversation-interactions, .plugins-ml-memory-meta,
  .plugins-ml-memory-message, .plugins-ml-stop-words, .opendistro-alerting-config,
  .opendistro-alerting-alert*, .opendistro-anomaly-results*, .opendistro-anomaly-detector*,
  .opendistro-anomaly-checkpoints, .opendistro-anomaly-detection-state, .opendistro-reports-*,
  .opensearch-notifications-*, .opensearch-notebooks, .opensearch-observability, .ql-datasources,
  .opendistro-asynchronous-search-response*, .replication-metadata-store, .opensearch-knn-models,
  .geospatial-ip2geo-data*, .plugins-flow-framework-config, .plugins-flow-framework-templates,
  .plugins-flow-framework-state]
node.max_local_storage_nodes: 3
EOL
```

## Dashboards
Define a name for the Dashboards server. This is used for display purposes.
```bash
exports DASHBOARDS_NAME="Swarm.Yachts"
```

Create a config for the Dashboards server.
```bash
cat << EOL | docker config create --template-driver golang opensearch_dashboards -
# Specifies the address to which the OpenSearch Dashboards server will bind. IP addresses and host names are both valid values.
# The default is 'localhost', which usually means remote machines will not be able to connect.
# To allow connections from remote users, set this parameter to a non-loopback address.
server.host: "0.0.0.0"


# The OpenSearch Dashboards server's name.  This is used for display purposes.
server.name: "$DASHBOARDS_NAME"

# The URLs of the OpenSearch instances to use for all your queries.
opensearch.hosts: ["https://opensearch.host:9200"]

# If your OpenSearch is protected with basic authentication, these settings provide
# the username and password that the OpenSearch Dashboards server uses to perform maintenance on the OpenSearch Dashboards
# index at startup. Your OpenSearch Dashboards users still need to authenticate with OpenSearch, which
# is proxied through the OpenSearch Dashboards server.
opensearch.username: "admin"
opensearch.password: "{{ secret "opensearch_admin_pw" }}"

# Enables SSL and paths to the PEM-format SSL certificate and SSL key files, respectively.
# These settings enable SSL for outgoing requests from the OpenSearch Dashboards server to the browser.
#server.ssl.enabled: false
#server.ssl.certificate: /path/to/your/server.crt
#server.ssl.key: /path/to/your/server.key

# Optional settings that provide the paths to the PEM-format SSL certificate and key files.
# These files are used to verify the identity of OpenSearch Dashboards to OpenSearch and are required when
# xpack.security.http.ssl.client_authentication in OpenSearch is set to required.
opensearch.ssl.certificate: /run/secrets/opensearch_admin_cert
opensearch.ssl.key: /run/secrets/opensearch_admin_key

# Optional setting that enables you to specify a path to the PEM file for the certificate
# authority for your OpenSearch instance.
opensearch.ssl.certificateAuthorities: [ "/run/secrets/ca_cert" ]

# To disregard the validity of SSL certificates, change this setting's value to 'none'.
opensearch.ssl.verificationMode: none

# Time in milliseconds to wait for OpenSearch to respond to pings. Defaults to the value of
# the opensearch.requestTimeout setting.
opensearch.pingTimeout: 5000

# Time in milliseconds to wait for responses from the back end or OpenSearch. This value
# must be a positive integer.
#opensearch.requestTimeout: 30000

# Enables you to specify a file where OpenSearch Dashboards stores log output.
logging.dest: stdout

# opensearchDashboards.branding:
#   logo:
#     defaultUrl: ""
#     darkModeUrl: ""
#   mark:
#     defaultUrl: ""
#     darkModeUrl: ""
#   loadingLogo:
#     defaultUrl: ""
#     darkModeUrl: ""
#   faviconUrl: ""
#   applicationTitle: ""
#   useExpandedHeader: false

# Optional setting that enables you to specify a path to PEM files for the certificate
# authority for your connected datasources.
data_source.ssl.certificateAuthorities: [ "/run/secrets/ca_cert" ]

# To disregard the validity of SSL certificates for connected data sources, change this setting's value to 'none'.
# Possible values include full, certificate and none
data_source.ssl.verificationMode: none

# Set the value of this setting to false to hide the help menu link to the OpenSearch Dashboards user survey
opensearchDashboards.survey.url: "false"

# These settings are adopted from the demo
opensearchDashboards.dashboardAdmin.groups: ["admin"]
opensearchDashboards.dashboardAdmin.users: ["admin"]
opensearch.requestHeadersWhitelist: [authorization, securitytenant]
opensearch_security.multitenancy.enabled: true
opensearch_security.multitenancy.tenants.preferred: [Private, Global]
opensearch_security.readonly_mode.roles: [kibana_read_only]
EOL
```

## Compose

```bash
cat << EOL | docker stack deploy -c - opensearch --detach=true
version: '3.8'
services:
  securityadmin:
    image: opensearchproject/opensearch:2.16.0
    entrypoint: bash
    networks:
      - default
    secrets:
      - ca_cert
      - opensearch_admin_cert
      - opensearch_admin_key
    configs:
      - source: opensearch_users
        target: /usr/share/opensearch/config/opensearch-security/internal_users.yml
    command: >
      /usr/share/opensearch/plugins/opensearch-security/tools/securityadmin.sh
      -icl
      -nhnv
      -cd /usr/share/opensearch/config/opensearch-security/
      -hostname opensearch.host
      -cacert /run/secrets/ca_cert
      -cert /run/secrets/opensearch_admin_cert
      -key /run/secrets/opensearch_admin_key
    deploy:
      mode: replicated-job

  node:
    image: opensearchproject/opensearch:2.16.0
    hostname: "{{.Node.ID}}.opensearch.host"
    configs:
      - source: opensearch_node
        target: /usr/share/opensearch/config/opensearch.yml
    secrets:
      - opensearch_admin_pw
      - source: opensearch_node_cert
        target: /usr/share/opensearch/config/node-cert.pem
      - source: opensearch_node_key
        target: /usr/share/opensearch/config/node-key.pem
      - source: ca_cert
        target: /usr/share/opensearch/config/root-ca.pem
    environment:
      - "OPENSEARCH_JAVA_OPTS=-Xms512m -Xmx512m"
      - node.name={{.Node.Hostname}}
      - cluster.name=${OPENSEARCH_CLUSTER_NAME:=Swarm}
      - network.bind_host=0.0.0.0
      - network.publish_host={{.Node.ID}}.opensearch.host
      - discovery.seed_hosts=$(docker node ls -q --filter node.label=$OPENSEARCH_LABEL=true | tr '\n' ' ' | sed -e "s/ /.opensearch.host /g" | awk '{$1=$1};1' | tr ' ' ',')
      - cluster.initial_cluster_manager_nodes=$OPENSEARCH_NODES
      - bootstrap.memory_lock=true
    ulimits:
      memlock:
        soft: -1
        hard: -1
      nofile:
        soft: 65536
        hard: 65536
    volumes:
      - data:/usr/share/opensearch/data
    networks:
      default:
        aliases:
          - opensearch.host
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.$OPENSEARCH_LABEL == true"

  dashboards:
    image: opensearchproject/opensearch-dashboards:2.16.0
    hostname: $DASHBOARDS_DOMAIN
    secrets:
      - opensearch_admin_pw
      - ca_cert
      - opensearch_admin_cert
      - opensearch_admin_key
    configs:
      - source: opensearch_dashboards
        target: /usr/share/opensearch-dashboards/config/opensearch_dashboards.yml
    networks:
      - default
      - www
    deploy:
      replicas: 1
      placement:
        constraints:
          - "node.role == worker"
      labels:
        caddy: $DASHBOARDS_DOMAIN
        caddy.reverse_proxy: http://dashboards:5601

secrets:
  opensearch_admin_pw:
    external: true
  ca_cert:
    external: true
  opensearch_node_cert:
    external: true
  opensearch_node_key:
    external: true
  opensearch_admin_cert:
    external: true
  opensearch_admin_key:
    external: true

configs:
  opensearch_dashboards:
    external: true
  opensearch_users:
    external: true
  opensearch_node:
    external: true

volumes:
  data:
    driver: local

networks:
  default:
    name: opensearch
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "false"
    ipam:
      driver: default
      config:
        - subnet: "10.249.0.0/16"
  www:
    external: true
EOL
```
