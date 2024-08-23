# cAdvisor

## Reverse Proxy
This stack will use a different reverse proxy from the Caddy stack. Each node will run its own proxy on the `host` network, allowing each server to be accessed without going through the swarm routing mesh. The generic nginx template can be used to listen on an arbitrary port, and Certbot can be used to fetched signed certificates for each node.

Create the reverse proxy config template.
```bash
cat << EOL | docker config create --template-driver golang nginx_proxy_template -
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
## Compose
```bash
cat << EOL | docker stack deploy -c - cadvisor
version: '3.8'
services:
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.47.2
    command: >
      --storage_duration=5m0s
      --logtostderr
      --stderrthreshold=INFO
      --allow_dynamic_housekeeping=true
      --listen_ip="127.0.0.1"
      --port=57832
      --http_auth_file="/run/secrets/cadvisor_auth_file"
      --http_auth_realm="Corya Enterprises, LLC"
      --storage_driver="redis
      --storage_driver_host="localhost:24967"
    secrets:
      - cadvisor_auth_file
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:rw
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
    networks:
      - public
    deploy:
      mode: global

  storage:
    image: redis
    command: >
      redis-server
      --bind 127.0.0.1
      --port 24967
    networks:
      - public
    volumes:
      - data:/data
    deploy:
      mode: global

  ui-proxy:
    image: nginx
    networks:
      - public
    environment:
      LISTEN_PORT: 8080
      SSL_CERT_PATH: /run/secrets/default_ssl_cert
      SSL_KEY_PATH: /run/secrets/default_ssl_key
      TARGET: "http://127.0.0.1:57832"
    configs:
      - source: nginx_proxy_template
        target: /etc/nginx/nginx.conf
    secrets:
      - default_ssl_cert
      - default_ssl_key
    deploy:
      mode: global

configs:
  nginx_proxy_template:
    external: true

networks:
  public:
    external: true
    name: host

volumes:
  data
    driver: local
EOL
```
