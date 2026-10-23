#!/usr/bin/env bash
# S3: private, encrypted bucket for the dataset, uploaded emails, reports and evidence.
source "$(dirname "$0")/_common.sh"
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  log "Creating s3://$BUCKET"
  if [[ "$AWS_REGION" == "us-east-1" ]]; then aws s3api create-bucket --bucket "$BUCKET" >/dev/null
  else aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration LocationConstraint="$AWS_REGION" >/dev/null; fi
fi
aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket "$BUCKET" --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-bucket-versioning --bucket "$BUCKET" --versioning-configuration Status=Enabled
log "Uploading the dataset to s3://$BUCKET/raw/"
aws s3 sync "$INFRA/../data/halcyon-dataset" "s3://$BUCKET/raw/halcyon-dataset/" --only-show-errors
log "Done"
