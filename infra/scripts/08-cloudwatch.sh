#!/usr/bin/env bash
# CloudWatch: log retention, an error metric, alarms (emailed via SNS) and a small dashboard.
source "$(dirname "$0")/_common.sh"
INSTANCE=$(cat "$STATE/instance_id")
TOPIC=$(aws sns create-topic --name "$PROJECT-alarms" --tags Key=project,Value="$PROJECT" --query TopicArn --output text)
SUBSCRIBED=$(aws sns list-subscriptions-by-topic --topic-arn "$TOPIC" --query 'Subscriptions[].Endpoint' --output text)
for e in ${ALERT_EMAILS//,/ }; do  # each address gets a "Confirm subscription" email from AWS
  grep -qw "$e" <<<"$SUBSCRIBED" || aws sns subscribe --topic-arn "$TOPIC" --protocol email --notification-endpoint "$e" >/dev/null
done
NOTIFY=(--alarm-actions "$TOPIC" --ok-actions "$TOPIC")
for g in "/$PROJECT/api" "/$PROJECT/caddy"; do
  aws logs create-log-group --log-group-name "$g" 2>/dev/null || true
  aws logs put-retention-policy --log-group-name "$g" --retention-in-days 14
done
aws logs put-metric-filter --log-group-name "/$PROJECT/api" --filter-name api-errors \
  --filter-pattern '?ERROR ?Traceback ?" 500 "' \
  --metric-transformations metricName=ApiErrors,metricNamespace=DeliveryLens,metricValue=1,defaultValue=0
aws cloudwatch put-metric-alarm --alarm-name "$PROJECT-api-errors" --namespace DeliveryLens --metric-name ApiErrors \
  --statistic Sum --period 300 --evaluation-periods 1 --threshold 5 --comparison-operator GreaterThanOrEqualToThreshold \
  --treat-missing-data notBreaching "${NOTIFY[@]}"
aws cloudwatch put-metric-alarm --alarm-name "$PROJECT-ec2-status" --namespace AWS/EC2 --metric-name StatusCheckFailed \
  --dimensions Name=InstanceId,Value="$INSTANCE" --statistic Maximum --period 60 --evaluation-periods 2 --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold "${NOTIFY[@]}"
aws cloudwatch put-metric-alarm --alarm-name "$PROJECT-ec2-cpu" --namespace AWS/EC2 --metric-name CPUUtilization \
  --dimensions Name=InstanceId,Value="$INSTANCE" --statistic Average --period 300 --evaluation-periods 2 --threshold 80 \
  --comparison-operator GreaterThanThreshold "${NOTIFY[@]}"
sed -e "s/__REGION__/$AWS_REGION/g" -e "s/__INSTANCE__/$INSTANCE/g" -e "s/__DB__/$DB_ID/g" -e "s/__PROJECT__/$PROJECT/g" \
  "$INFRA/cloudwatch-dashboard.json" > "$STATE/dashboard.json"
aws cloudwatch put-dashboard --dashboard-name "$PROJECT" --dashboard-body "file://$(awspath "$STATE/dashboard.json")" >/dev/null
log "Dashboard: https://$AWS_REGION.console.aws.amazon.com/cloudwatch/home?region=$AWS_REGION#dashboards:name=$PROJECT"
