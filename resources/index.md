# Appendix

This guide would not be possible without [dockerswarm.rocks](https://dockerswarm.rocks). Although that guide has been deprecated, Docker Swarm lives on as a simpler alternative to Kubernetes.

[Funky Penguin's Geek Cookbook](https://geek-cookbook.funkypenguin.co.nz/) shows users how to set up a distributed system, similar to this site. It also covers Kubernetes. Unlike swarm.yachts, Funky Penguin's guide is not suitable for WAN networks.

## Hosting Static Sites
There are at least two ways to host static sites. One is using an S3 bucket from Garage, the other is creating a docker image that contains the site data. An advantage of using the docker image mothod is that a base domain can be used. For example, we can host `www.swarm.yachts` in S3, but we cannot host `swarm.yachts` using the same method.

### Using S3
Create a bucket for the site e.g. `yachts`.

Configure [AWS CLI](https://garagehq.deuxfleurs.fr/documentation/connect/cli/#aws-cli) and [Minio clint](https://garagehq.deuxfleurs.fr/documentation/connect/cli/#minio-client). The AWS CLI will be used to expose the bucket as a website, and the Minio client will be used to copy the data to the bucket.

Create a CNAME record pointing to the site, e.g. `yachts.web.swarm.yachts` pointing to `ingress.swarm.yachts`.

Create a configuration file `website.json`.
```json
{
    "IndexDocument": {
        "Suffix": "index.html"
    },
    "ErrorDocument": {
        "Key": "error.html"
    }
}
```

Use the AWS CLI to expose the bucket as a website using the `put-bucket-website` command. More details on this command can be found [here](https://docs.aws.amazon.com/cli/latest/reference/s3api/put-bucket-website.html).

```bash
aws s3api put-bucket-website --bucket yachts --website-configuration file://website.json
```

Copy the website using minio.

```bash
mcli mirror --overwrite ./ garage/yachts
```

### Using a Docker Image
This is the manner that is used to host this site. Using VitePress, we copy the site metadata to the image, install the necessary packages, and compile the image. Then, the compilation is copied to another image layer and an http server is installed and started.

```Dockerfile
FROM node:20-alpine AS compiler

# needed for compilation
RUN apk add git

WORKDIR /app

# copy metadata
COPY package.json ./

# install required packages
RUN npm install

# copy the remaining site data
COPY . .

# run the compiler
RUN npm run docs:build

# output image
FROM node:20-alpine

# copy the static, compiled site
COPY --from=compiler /app/.vitepress/dist ./

# install an http server
RUN npm i -g http-server

# run the server
ENTRYPOINT ["http-server"]
```

Notice that we added these lines to the Caddy stack.
```yaml
    extra_hosts:
      - "node.docker.host:host-gateway"
```

This can be used to access the docker network interface at `node.docker.host`.

We then deploy the image using the following compose file.
```yaml
version: '3.8'

services:
  http-server:
    image: coryaent/yachts
    command: -a node.docker.host -p 3000
    networks:
      - public
    extra_hosts:
      - "node.docker.host:host-gateway"
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.swarm.yachts.ingress == true"
      labels:
        caddy_0: swarm.yachts
        caddy_0.reverse_proxy: "http://node.docker.host:3000"
        caddy_1: www.swarm.yachts
        caddy_1.redir: "https://swarm.yachts{uri} permanent"
        ai.ix.auto-update: 'true'

networks:
  public:
    name: host
    external: true
```

Again, notice the `extra_hosts` added to the http service. By running the service on the host network and binding to the address `node.docker.host`, this container can only be accessed internally, yet it will run redundantly at each ingress or edge node.

## Additional Compose Files

https://github.com/ethibox/awesome-stacks/tree/master/stacks
