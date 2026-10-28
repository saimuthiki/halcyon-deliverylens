#!/usr/bin/env bash
# Deploy or update the API on EC2: copy compose files, pull the image from ECR, (re)start, load data once.
# Usage: infra/scripts/07-deploy.sh [image_tag]   (default: latest)
source "$(dirname "$0")/_common.sh"
TAG="${1:-latest}"  # LOCAL_IMAGE=1 skips the ECR pull (first deploy, image built on the server)
EIP=$(cat "$STATE/eip"); KEY="$STATE/$KEY_PAIR_NAME.pem"
HOSTNAME_TLS="${EIP//./-}.sslip.io"
IMAGE="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO:$TAG"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "ec2-user@$EIP")
scp -i "$KEY" -o StrictHostKeyChecking=accept-new "$INFRA/docker-compose.prod.yml" "$INFRA/Caddyfile" "ec2-user@$EIP:/home/ec2-user/"
"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
cd /home/ec2-user
# SMTP_* stay out of app.env: the API reads them itself from the secret (APP_SECRET_ID, boto3, instance role).
trap 'rm -f /home/ec2-user/app.env.tmp' EXIT
(umask 077
 aws secretsmanager get-secret-value --region $AWS_REGION --secret-id $SECRET_NAME --query SecretString --output text \
   | jq -r 'to_entries[] | select(.key | startswith("SMTP_") | not) | "\(.key)=\(.value)"' > app.env.tmp
 printf 'APP_SECRET_ID=%s\nAPP_SECRET_ACCOUNT=%s\n' "$SECRET_NAME" "$AWS_ACCOUNT_ID" >> app.env.tmp)
mv app.env.tmp app.env && chmod 600 app.env
cat > .env <<ENV
IMAGE=$IMAGE
API_HOSTNAME=$HOSTNAME_TLS
AWS_REGION=$AWS_REGION
SECRET_NAME=$SECRET_NAME
PROJECT=$PROJECT
ENV
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com
if [ "${LOCAL_IMAGE:-0}" = "1" ]; then echo "Using the image built on this server"; else docker compose -f docker-compose.prod.yml pull; fi
docker compose -f docker-compose.prod.yml up -d
sleep 5
docker compose -f docker-compose.prod.yml exec -T api python -m app.loader --if-empty
REMOTE
log "Health check:"; curl -fsS "https://$HOSTNAME_TLS/api/health" && echo
