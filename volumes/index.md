---
prev:
  text: 'Stacks'
  link: '/stacks/'
---

# Docker Volumes
Docker supports multiple storage drivers via [plugins](https://docs.docker.com/engine/extend/plugins_volume/). The default driver is `local`, which (naturally) stores files on a single node. This can present problems with high-availability setups, because the data will only be stored on a single node. If the node where the container is running goes down, the data will no longer be available.

Two open-source plugins that utilize S3 as a data store are rclone and JuiceFS. JuiceFS has the advantage of being faster, and rclone has the advantage of not needing a database.

## rclone
[Rclone](https://rclone.org/) is a file manager for cloud storage. It works with [a variety](https://rclone.org/#providers) of cloud storage providers, including S3. Rclone also supports a docker plugin that can be used within a Swarm.

### Setup
1. Install `fuse` on each machine in the Swarm cluster
2. Create two directories required by the rclone plugin, `/var/lib/docker-plugins/rclone/config` and `/var/lib/docker-plugins/rclone/cache`, on each machine
3. Install the rcone plugin by running `docker plugin install rclone/docker-volume-rclone:amd64 args="-v" --alias rclone --grant-all-permissions` on each machine
4. Create a garage bucket

### Configuration
```
[garage]
type = s3
provider = Other
env_auth = false
access_key_id = <access key>
secret_access_key = <secret key>
region = <region>
endpoint = <endpoint>
force_path_style = true
acl = private
bucket_acl = private
```

## JuiceFS
```bash
docker plugin install juicedata/juicefs --alias juicefs --grant-all-permissions
```
