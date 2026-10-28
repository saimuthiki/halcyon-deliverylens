#!/usr/bin/env bash
# RDS PostgreSQL (private, encrypted) + the app secret in Secrets Manager.
source "$(dirname "$0")/_common.sh"
DB_SG=$(cat "$STATE/db_sg")
if ! aws rds describe-db-instances --db-instance-identifier "$DB_ID" >/dev/null 2>&1; then
  PASS=$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)
  echo "$PASS" > "$STATE/db_pass"; chmod 600 "$STATE/db_pass"
  log "Creating RDS $DB_ID ($RDS_INSTANCE_CLASS) - takes ~10 minutes"
  aws rds create-db-instance --db-instance-identifier "$DB_ID" --engine postgres \
    --db-instance-class "$RDS_INSTANCE_CLASS" --allocated-storage "$RDS_STORAGE_GB" --storage-type gp3 \
    --master-username deliverylens --master-user-password "$PASS" --db-name deliverylens \
    --vpc-security-group-ids "$DB_SG" --no-publicly-accessible --storage-encrypted \
    --backup-retention-period 1 --no-multi-az --tags Key=project,Value="$PROJECT" >/dev/null
fi
aws rds wait db-instance-available --db-instance-identifier "$DB_ID"
HOST=$(aws rds describe-db-instances --db-instance-identifier "$DB_ID" --query 'DBInstances[0].Endpoint.Address' --output text)
PASS=$(cat "$STATE/db_pass")
DEMO_PASS=$(openssl rand -base64 18 | tr -dc 'A-Za-z0-9' | head -c 16)
SECRET=$(cat <<JSON
{"DATABASE_URL":"postgresql+psycopg://deliverylens:${PASS}@${HOST}:5432/deliverylens",
 "LLM_PROVIDER":"bedrock","AWS_REGION":"${AWS_REGION}",
 "BEDROCK_MODEL_FAST":"${BEDROCK_MODEL_FAST}","BEDROCK_MODEL_SMART":"${BEDROCK_MODEL_SMART}",
 "CORS_ORIGINS":"${AMPLIFY_ORIGIN}","S3_BUCKET":"${BUCKET}","DEMO_PASSWORD":"${DEMO_PASS}",
 "PUBLIC_SITE_URL":"${AMPLIFY_ORIGIN}","WEEKLY_BRIEF_TOPIC_ARN":"$(cat "$STATE/brief_topic_arn" 2>/dev/null || true)"}
JSON
)
# Secret values go through owner-only temp files (never a command-line argument), removed on any exit.
umask 077
NEW="$STATE/secret.new.tmp"; OUT="$STATE/secret.tmp"
trap 'rm -f "$NEW" "$OUT"' EXIT
printf '%s' "$SECRET" > "$NEW"
if aws secretsmanager describe-secret --secret-id "$SECRET_NAME" >/dev/null 2>&1; then
  # Merge, never replace: keep every field already in the secret (SMTP_*, email settings, keys other scripts added),
  # and never blank an existing value with an empty one (e.g. no brief_topic_arn state file on this machine).
  PY=$(command -v python3 || command -v python) || { log "python3 is needed to merge the secret"; exit 1; }
  aws secretsmanager get-secret-value --secret-id "$SECRET_NAME" --query SecretString --output text \
    | "$PY" -c 'import json,sys; old=json.load(sys.stdin); new=json.load(open(sys.argv[1])); old.update({k: v for k, v in new.items() if v != ""}); print(json.dumps(old))' "$NEW" > "$OUT"
  aws secretsmanager put-secret-value --secret-id "$SECRET_NAME" --secret-string "file://$(awspath "$OUT")" >/dev/null
else
  aws secretsmanager create-secret --name "$SECRET_NAME" --secret-string "file://$(awspath "$NEW")" >/dev/null
fi
log "RDS endpoint $HOST; secret $SECRET_NAME updated (demo password stored there)"
