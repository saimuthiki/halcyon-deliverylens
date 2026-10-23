#!/usr/bin/env bash
# Run first on Monday: who am I, which region, is Claude enabled in Bedrock?
source "$(dirname "$0")/_common.sh"
log "Identity:"; aws sts get-caller-identity
log "Region: $AWS_REGION"
log "Anthropic models visible in Bedrock:"
aws bedrock list-foundation-models --by-provider anthropic \
  --query 'modelSummaries[].{id:modelId,name:modelName}' --output table || log "Cannot list Bedrock models (permission?)"
log "Inference profiles (use these IDs if on-demand model IDs are not allowed):"
aws bedrock list-inference-profiles --query 'inferenceProfileSummaries[?contains(inferenceProfileId, `anthropic`)].inferenceProfileId' --output table || true
log "Quick permission probes (each should print OK):"
for probe in "s3 ls" "ecr describe-repositories --max-items 1" "rds describe-db-instances --max-items 1" \
             "ec2 describe-vpcs --max-items 1" "secretsmanager list-secrets --max-items 1" \
             "iam list-roles --max-items 1" "logs describe-log-groups --limit 1" "amplify list-apps --max-results 1"; do
  # shellcheck disable=SC2086
  if aws $probe >/dev/null 2>&1; then echo "  OK   aws $probe"; else echo "  FAIL aws $probe  -> ask in the infra group"; fi
done
