## Configuration
```bash
cat << EOL | docker config create m3dbnode -
# Include this field if you want to enable an embedded M3Coordinator instance.
coordinator:
  # Address for M3Coordinator to listen for traffic.
  listenAddress: 0.0.0.0:7201

db:
  # Minimum log level which will be emitted.
  logging:
    level: info

  # Address to listen on for local thrift/tchannel APIs.
  listenAddress: 0.0.0.0:9000
  # Address to listen on for cluster thrift/tchannel APIs.
  clusterListenAddress: 0.0.0.0:9001
  # Address to listen on for local json/http APIs (used for debugging primarily).
  httpNodeListenAddress: 0.0.0.0:9002
  # Address to listen on for cluster json/http APIs (used for debugging primarily).
  httpClusterListenAddress: 0.0.0.0:9003
  # Address to listen on for debug APIs (pprof, etc).
  debugListenAddress: 0.0.0.0:9004

  # Configuration for resolving the instances host ID.
  hostID:
    # Resolver used to match the host ID, valid options: [hostname, config, environment, file]
    resolver: environment
    # If using "environment" resolver, is the environment variable specified host ID
    envVarName: M3DB_HOST_ID

  client:
    # Consistency level for writes.
    writeConsistencyLevel: majority
    # Consistency level for reads.
    readConsistencyLevel: unstrict_majority
    # Timeout for writes.
    writeTimeout: 10s
    # Timeout for reads.
    fetchTimeout: 15s
    # Timeout for establishing a connection to the cluster.
    connectTimeout: 20s
    # Configuration for retrying writes.
    writeRetry:
        initialBackoff: 500ms
        backoffFactor: 3
        maxRetries: 2
        jitter: true
    # Configuration for retrying reads.
    fetchRetry:
        initialBackoff: 500ms
        backoffFactor: 2
        maxRetries: 3
        jitter: true
    # Number of times we background health check for a node can fail before
    # considering the node unhealthy.
    backgroundHealthCheckFailLimit: 4
    backgroundHealthCheckFailThrottleFactor: 0.5

  # Sets GOGC value.
  gcPercentage: 100

  # Whether new series should be created asynchronously (recommended value
  # of true for high throughput.)
  writeNewSeriesAsync: true
  writeNewSeriesBackoffDuration: 2ms

  bootstrap:
    commitlog:
      # Whether tail end of corrupted commit logs cause an error on bootstrap.
      returnUnfulfilledForCorruptCommitLogFiles: false

  cache:
    # Caching policy for database blocks.
    series:
      policy: lru

  commitlog:
    # Maximum number of bytes that will be buffered before flushing the commitlog.
    flushMaxBytes: 524288
    # Maximum amount of time data can remain buffered before flushing the commitlog.
    flushEvery: 1s
    # Configuration for the commitlog queue. High throughput setups may require higher
    # values. Higher values will use more memory.
    queue:
      calculationType: fixed
      size: 2097152

  filesystem:
    # Directory to store M3DB data in.
    filePathPrefix: /var/lib/m3db
    # Various fixed-sized buffers used for M3DB I/O.
    writeBufferSize: 65536
    dataReadBufferSize: 65536
    infoReadBufferSize: 128
    seekReadBufferSize: 4096
    # Maximum Mib/s that can be written to disk by background operations like flushing
    # and snapshotting to prevent them from interfering with the commitlog. Increasing
    # this value can make node adds significantly faster if the underlying disk can
    # support the throughput.
    throughputLimitMbps: 1000.0
    throughputCheckEvery: 128


  # etcd configuration.
  discovery:
    config:
      service:
        # KV environment, zone, and service from which to write/read KV data (placement
        # and configuration). Leave these as the default values unless you know what
        # you're doing.
        env: user_defined
        zone: global
        service: m3db
        # Directory to store cached etcd data in.
        cacheDir: /var/lib/m3kv
        # Configuration to identify the etcd hosts this node should connect to.
        etcdClusters:
          - zone: global
            endpoints:
              - etcd:2379
EOL
```

## Compose
```bash
cat << EOL | docker stack deploy -c - m3db --detach=true
version: "3.9"
services:
  node:
    image: coryaent/m3dbnode
    command: -f /m3dbnode
    hostname: "{{.Node.ID}}.m3db.internal"
    environment:
      M3DB_HOST_ID: "{{.Node.Hostname}}_{{.Node.ID}}"
    configs:
      - m3dbnode
    volumes:
      - data:/var/lib/m3db
      - cache:/var/lib/m3kv
    networks:
      etcd:
      m3db:
        aliases:
          - m3db.internal
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.enterprises.corya.m3db == node"
  
  influx:
    image: coryaent/flacco
    hostname: "influx.{{.Node.Hostname}}.{{.Node.ID}}.m3db.internal"
    environment:
      FLACCO_M3DB_TARGET: "http://{{.Node.ID}}.m3db.internal:7201"
      FLACCO_LISTEN_PORT: 8086
      FLACCO_LISTEN_ADDRESS: 0.0.0.0
    networks:
      m3db:
        aliases:
          - influx.m3db.internal
    deploy:
      mode: global
      placement:
        constraints:
          - "node.labels.enterprises.corya.m3db == node"
          
configs:
  m3dbnode:
    external: true

volumes:
  data:
    driver: local
  cache:
    driver: local

networks:
  etcd:
    external: true
  m3db:
    name: m3db
    attachable: true
    driver: overlay
    driver_opts:
      encrypted: "true"
    ipam:
      driver: default
      config:
        - subnet: "10.240.0.0/16"
EOL
```

## Initialization

```bash
#!/bin/bash
M3DB_LABEL=enterprises.corya.m3db
M3DB_NODES=($(docker node ls -q --filter node.label=$M3DB_LABEL=node | tr '\n' ' '))
docker run -it --rm --network m3db alpine/curl -s -X POST http://m3db.internal:7201/api/v1/database/create -d $(docker node inspect ${M3DB_NODES[@]} | \
jq -rc '{type: "cluster",
  namespaceName: "default",
  retentionTime: "360h",
  numShards: "64",
  replicationFactor: "3",
  hosts: [.[] | 
    {zone: "global",
    weight: 100,
    port: 9000,
    address: (.ID + ".m3db.internal"), 
    id: (.Description.Hostname + "_" + .ID), 
    isolationGroup: .Spec.Labels."enterprises.corya.m3db.group"}]}')
```

```bash
docker run -it --rm --network m3db alpine/curl -s http://m3db.internal:7201/api/v1/services/m3db/placement
```

```bash
docker run -it --rm --network m3db alpine/curl -s -X POST http://m3db.internal:7201/api/v1/services/m3db/namespace/ready -d '{
  "name": "default"
}' | jq .
```

## Usage
This is useless without a proxy that will rewrite the paths.
