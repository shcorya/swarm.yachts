*This stack depends on cron.*

# System
This stack includes two components: an automatic image updater and an automatic system pruner. When an image is updated, its predecessor is kept on the host. This can result in high disk usage for large images or images that are updated frequently. The `docker system prune` command can be used to remove old images, and this stack runs it automatically. Note that volumes are not pruned with the `system prune` command.

## Deploy
```sh
curl -sL https://swarm.yachts/system.sh | sh
```
