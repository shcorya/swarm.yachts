# Appendix

This guide would not be possible without [dockerswarm.rocks](https://dockerswarm.rocks). Although that guide has been deprecated, Docker Swarm lives on as a simpler alternative to Kubernetes.

[Funky Penguin's Geek Cookbook](https://geek-cookbook.funkypenguin.co.nz/) shows users how to set up a distributed system, similar to this site. It also covers Kubernetes. Unlike swarm.yachts, Funky Penguin's guide is not suitable for WAN networks.

## Hosting Static Sites with Garage
Create a bucket for the site e.g. `yachts`.

Configure [AWS CLI](https://garagehq.deuxfleurs.fr/documentation/connect/cli/#aws-cli) and [Minio clint])(https://garagehq.deuxfleurs.fr/documentation/connect/cli/#minio-client). The AWS CLI will be used to expose the bucket as a website, and the Minio client will be used to copy the data to the bucket.

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
mcli mirror --overwrite ~/Desktop/sample/ garage/yachts
```

## Additional Compose Files

https://github.com/ethibox/awesome-stacks/tree/master/stacks
