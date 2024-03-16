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
