#!/usr/bin/env bash
# ECR: repository for the API image (scan on push).
source "$(dirname "$0")/_common.sh"
aws ecr describe-repositories --repository-names "$ECR_REPO" >/dev/null 2>&1 || {
  log "Creating ECR repo $ECR_REPO"
  aws ecr create-repository --repository-name "$ECR_REPO" --image-scanning-configuration scanOnPush=true \
    --encryption-configuration encryptionType=AES256 >/dev/null; }
aws ecr put-lifecycle-policy --repository-name "$ECR_REPO" --lifecycle-policy-text \
  '{"rules":[{"rulePriority":1,"description":"keep last 10","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":10},"action":{"type":"expire"}}]}' >/dev/null
log "Image URI: $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO"
