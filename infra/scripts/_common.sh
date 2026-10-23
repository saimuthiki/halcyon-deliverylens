#!/usr/bin/env bash
# Shared helpers for the infra scripts. Each script is safe to run more than once.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA="$(cd "$HERE/.." && pwd)"
[[ -f "$INFRA/config.env" ]] || { echo "Missing infra/config.env (copy config.env.example and fill it)"; exit 1; }
# shellcheck disable=SC1091
source "$INFRA/config.env"
if grep -q '<[A-Z_]*>' <(grep -v '^#' "$INFRA/config.env" | sed 's/#.*//'); then
  echo "infra/config.env still has <PLACEHOLDERS>:"; grep -n '<[A-Z_]*>' "$INFRA/config.env" | grep -v '^\s*[0-9]*:#'; exit 1
fi
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"
BUCKET="${PROJECT}-data-${AWS_ACCOUNT_ID}"
ECR_REPO="${PROJECT}-api"
SECRET_NAME="${PROJECT}/app"
DB_ID="${PROJECT}-db"
EC2_ROLE="${PROJECT}-ec2-role"
DEPLOY_ROLE="${PROJECT}-github-deploy"
SG_API="${PROJECT}-api-sg"
SG_DB="${PROJECT}-db-sg"
STATE="$INFRA/.state"; mkdir -p "$STATE"
log() { printf '\033[1;36m[%s]\033[0m %s\n' "$(basename "$0")" "$*"; }
default_vpc() { [[ -n "${VPC_ID:-}" ]] && echo "$VPC_ID" || aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query 'Vpcs[0].VpcId' --output text; }
