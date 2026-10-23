#!/bin/bash
# First-boot setup for the DeliveryLens EC2 server (Amazon Linux 2023).
set -euxo pipefail
dnf update -y
dnf install -y docker jq
systemctl enable --now docker
usermod -aG docker ec2-user
mkdir -p /usr/local/lib/docker/cli-plugins
curl -fsSL "https://github.com/docker/compose/releases/download/v2.29.7/docker-compose-linux-x86_64" \
  -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
