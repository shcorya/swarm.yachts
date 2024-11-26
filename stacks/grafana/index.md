## Compose
```yaml
version: '3'
services:
  dashboards:
    image: grafana/grafana-oss:11.3.0
    hostname: grafana.internal
    environment:
      GF_DEFAULT_INSTANCE_NAME: yachts
      GF_SECURITY_ADMIN_USER: swarm
      GF_INSTALL_PLUGINS: https://github.com/haohanyang/mongodb-datasource/releases/download/v0.1.1/haohanyang-mongodb-datasource-0.1.1.zip;haohanyang-mongodb-datasource,redis-datasource,yesoreyeram-infinity-datasource
    volumes:
      - storage:/var/lib/grafana
    deploy:
      labels:
        caddy: dashboards.swarm.yachts
        caddy.reverse_proxy: grafana.internal:3000

volumes:
  storage:
    driver: rclone
    driver_opts:
      remote: 'garage'
      allow_other: 'true'
      vfs_cache_mode: writes
      path: grafana
```
