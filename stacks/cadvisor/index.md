*This stack depends on certbot.*

# cAdvisor
[cAdvisor](https://github.com/google/cadvisor) is a metrics collector for containers and the hosts that run them. It exposes a web UI as well as prometheus metrics.

## Reverse Proxy
This stack will use a different reverse proxy from the Caddy stack. Each node will run its own proxy in `host` mode, allowing each server to be accessed without going through the swarm routing mesh. The generic nginx template can be used to listen on an arbitrary port, and Certbot can be used to fetched signed, wildcard certificates for each node.

### Authentication
Use `htpasswd` to generate a docker secret containing the authorization credentials.
```bash
pwgen 24 1 | tee /dev/stderr | htpasswd -nbi cadvisor | docker secret create cadvisor_auth - > /dev/null
```
Take note of the password, which will be printed to the console. Use a password manager.

### Configuration
Create the reverse proxy config template.
```bash
cat << EOL | docker config create --template-driver golang nginx_auth_proxy_template -
error_log /dev/stdout info;

events  {}
http    {
        access_log /dev/stdout;
        server {
                # https://nginx.org/en/docs/http/configuring_https_servers.html
                listen {{ env "LISTEN_PORT" }} ssl;
                listen [::]:{{ env "LISTEN_PORT" }} ssl;

                # https://www.nginx.com/blog/using-free-ssltls-certificates-from-lets-encrypt-with-nginx/
                ssl_certificate {{ env "SSL_CERT_PATH" }};
                ssl_certificate_key {{ env "SSL_KEY_PATH" }};

                # https://davidwesterfield.net/2021/03/redirecting-http-requests-to-https-on-same-port-in-nginx/
                error_page 497 301 =307 https://\$host:\$server_port\$request_uri;

                location / {
                        # https://docs.nginx.com/nginx/admin-guide/security-controls/configuring-http-basic-authentication/
                        auth_basic {{ env "AUTH_BASIC_REALM" }};
                        auth_basic_user_file {{ env "AUTH_BASIC_USER_FILE" }};

                        # https://docs.nginx.com/nginx/admin-guide/web-server/reverse-proxy/
                        proxy_pass {{ env "TARGET" }};

                        # https://github.com/jwilder/dockerize/blob/master/examples/nginx/default.tmpl
                        # proxy_set_header Host \$host;
                        # proxy_set_header X-Real-IP \$remote_addr;
                        # proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;

                        # https://www.reddit.com/r/MysteriumNetwork/comments/15qflpo/access_myst_node_ui_through_nginx_reverse_proxy/
                        proxy_set_header X-Forwarded-Host \$http_host;
                        proxy_set_header X-Forwarded-For \$remote_addr;

                        # https://stackoverflow.com/questions/54825360/nginx-returns-partial-response
                        proxy_buffering off;
                        proxy_http_version 1.1;
                }
        }
}
EOL
```
## Environment Setup
Set an environment variable corresponding to your swarm domain which will be used to read the certificate location.
```bash
export SWARM_DOMAIN="swarm.yachts"
```

Optionally, define a realm for basic authentication.
```bash
export CADVISOR_REALM="Swarm"
```

## Compose
```bash
cat << EOL | docker stack deploy -c - cadvisor --detach=true
version: '3.8'
services:
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.47.2
    hostname: "{{.Node.Hostname}}_{{.Node.ID}}.cadvisor.host"
    networks:
      - internal
    command: >
      --logtostderr
      --docker_only
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /:/rootfs:ro
      - /var/run:/var/run
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    deploy:
      mode: global
      resources:
        limits:
          memory: 128M
        reservations:
          memory: 64M

  proxy:
    image: nginx
    networks:
      - internal
    ports:
      - target: 8080
        published: 8080
        mode: host
    environment:
      LISTEN_PORT: 8080
      SSL_CERT_PATH: /opt/certs/live/$SWARM_DOMAIN/fullchain.pem
      SSL_KEY_PATH: /opt/certs/live/$SWARM_DOMAIN/privkey.pem
      TARGET: "http://{{.Node.Hostname}}_{{.Node.ID}}.cadvisor.host:8080"
      AUTH_BASIC_REALM: ${CADVISOR_REALM:=Swarm}
      AUTH_BASIC_USER_FILE: /run/secrets/cadvisor_auth
    configs:
      - source: nginx_auth_proxy_template
        target: /etc/nginx/nginx.conf
    secrets:
      - cadvisor_auth
    volumes:
      - certs:/opt/certs/
    deploy:
      mode: global

configs:
  nginx_auth_proxy_template:
    external: true

secrets:
  cadvisor_auth:
    external: true

networks:
  internal:
    attachable: false
    driver: overlay
    driver_opts:
      encrypted: "true"
    ipam:
      driver: default
      config:
        - subnet: "10.245.0.0/16"

volumes:
  certs:
    external: true
EOL
```
