#!/usr/bin/env bash
# Weekly brief email: an SNS topic, its subscribers, the app settings, and a Monday timer on the server.
# SNS (not SES) because the company domain's DMARC policy rejects mail sent for it by other services.
# Each address in BRIEF_EMAILS (default: ALERT_EMAILS) gets a "Confirm subscription" email from AWS.
source "$(dirname "$0")/_common.sh"
TOPIC_NAME="$PROJECT-weekly-brief"
TOPIC=$(aws sns create-topic --name "$TOPIC_NAME" --tags Key=project,Value="$PROJECT" --query TopicArn --output text)
echo "$TOPIC" > "$STATE/brief_topic_arn"
SUBSCRIBED=$(aws sns list-subscriptions-by-topic --topic-arn "$TOPIC" --query 'Subscriptions[].Endpoint' --output text)
for e in $(echo "${BRIEF_EMAILS:-${ALERT_EMAILS:-}}" | tr ',' ' '); do
  grep -qw "$e" <<<"$SUBSCRIBED" || aws sns subscribe --topic-arn "$TOPIC" --protocol email --notification-endpoint "$e" >/dev/null
done
log "Topic $TOPIC_NAME ready"

# Add the two settings to the app secret without printing it.
aws secretsmanager get-secret-value --secret-id "$SECRET_NAME" --query SecretString --output text \
  | python -c 'import json,sys; d=json.load(sys.stdin); d.update(WEEKLY_BRIEF_TOPIC_ARN=sys.argv[1], PUBLIC_SITE_URL=sys.argv[2]); print(json.dumps(d))'       "$TOPIC" "$AMPLIFY_ORIGIN" \
  > "$STATE/secret.tmp"
aws secretsmanager put-secret-value --secret-id "$SECRET_NAME" --secret-string "file://$(awspath "$STATE/secret.tmp")" >/dev/null
rm -f "$STATE/secret.tmp"
log "Secret $SECRET_NAME updated"

# On the server (Systems Manager, no SSH): refresh app.env, restart the API, install the Monday timer.
INSTANCE=$(cat "$STATE/instance_id")
REMOTE=$(cat <<'SH'
set -euo pipefail
cd /home/ec2-user
set -a; . ./.env; set +a
aws secretsmanager get-secret-value --region "$AWS_REGION" --secret-id "$SECRET_NAME" --query SecretString --output text \
  | jq -r 'to_entries[] | "\(.key)=\(.value)"' > app.env
chmod 600 app.env && chown ec2-user app.env
sudo -u ec2-user docker compose -f docker-compose.prod.yml up -d api
cat > /etc/systemd/system/deliverylens-brief.service <<'UNIT'
[Unit]
Description=DeliveryLens weekly brief email
[Service]
Type=oneshot
User=ec2-user
WorkingDirectory=/home/ec2-user
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml exec -T api python -m app.agents.weekly_brief send
UNIT
cat > /etc/systemd/system/deliverylens-brief.timer <<'UNIT'
[Unit]
Description=Send the DeliveryLens weekly brief every Monday at 07:00 US Central
[Timer]
OnCalendar=Mon *-*-* 07:00:00 America/Chicago
Persistent=true
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now deliverylens-brief.timer
systemctl list-timers deliverylens-brief.timer --no-pager | head -3
SH
)
CMD=$(aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript --comment "weekly brief setup" \
  --parameters "$(python -c 'import json,sys; print(json.dumps({"commands": [sys.argv[1]]}))' "$REMOTE")" --query Command.CommandId --output text)
for _ in $(seq 1 30); do
  STATUS=$(aws ssm get-command-invocation --command-id "$CMD" --instance-id "$INSTANCE" --query Status --output text 2>/dev/null || echo Pending)
  [[ "$STATUS" == Success || "$STATUS" == Failed || "$STATUS" == TimedOut || "$STATUS" == Cancelled ]] && break
  sleep 5
done
aws ssm get-command-invocation --command-id "$CMD" --instance-id "$INSTANCE" --query '[StandardOutputContent,StandardErrorContent]' --output text | tail -6
[[ "$STATUS" == Success ]] || { log "Server setup ended with $STATUS"; exit 1; }
log "Weekly brief: every Monday 07:00 US Central to the confirmed subscribers of $TOPIC_NAME"
