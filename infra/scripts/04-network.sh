#!/usr/bin/env bash
# Security groups: API server (443/80 public, 22 from your IP only) and DB (5432 from the API server only).
source "$(dirname "$0")/_common.sh"
VPC=$(default_vpc); log "VPC $VPC"
sg_id() { aws ec2 describe-security-groups --filters Name=group-name,Values="$1" Name=vpc-id,Values="$VPC" --query 'SecurityGroups[0].GroupId' --output text; }
[[ "$(sg_id "$SG_API")" == "None" ]] && aws ec2 create-security-group --group-name "$SG_API" --description "DeliveryLens API" --vpc-id "$VPC" >/dev/null
[[ "$(sg_id "$SG_DB")" == "None" ]] && aws ec2 create-security-group --group-name "$SG_DB" --description "DeliveryLens DB" --vpc-id "$VPC" >/dev/null
API_SG=$(sg_id "$SG_API"); DB_SG=$(sg_id "$SG_DB")
allow() { aws ec2 authorize-security-group-ingress "$@" >/dev/null 2>&1 || true; }
allow --group-id "$API_SG" --protocol tcp --port 443 --cidr 0.0.0.0/0
allow --group-id "$API_SG" --protocol tcp --port 80 --cidr 0.0.0.0/0      # Caddy ACME challenge + redirect to HTTPS
allow --group-id "$API_SG" --protocol tcp --port 22 --cidr "$ALLOWED_SSH_CIDR"
allow --group-id "$DB_SG" --protocol tcp --port 5432 --source-group "$API_SG"
aws ec2 create-tags --resources "$API_SG" "$DB_SG" --tags Key=project,Value="$PROJECT"
echo "$API_SG" > "$STATE/api_sg"; echo "$DB_SG" > "$STATE/db_sg"
log "API SG $API_SG, DB SG $DB_SG  (set GitHub secret EC2_SG_ID=$API_SG)"
