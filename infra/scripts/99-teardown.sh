#!/usr/bin/env bash
# Delete everything after the hackathon (access is revoked anyway). Asks before acting.
source "$(dirname "$0")/_common.sh"
read -r -p "Type DELETE to remove all $PROJECT resources in $AWS_REGION: " ok; [[ "$ok" == "DELETE" ]] || exit 1
INSTANCE=$(cat "$STATE/instance_id" 2>/dev/null || true)
[[ -n "$INSTANCE" ]] && aws ec2 terminate-instances --instance-ids "$INSTANCE" >/dev/null && aws ec2 wait instance-terminated --instance-ids "$INSTANCE"
for a in $(aws ec2 describe-addresses --filters Name=tag:project,Values="$PROJECT" --query 'Addresses[].AllocationId' --output text); do aws ec2 release-address --allocation-id "$a"; done
aws rds delete-db-instance --db-instance-identifier "$DB_ID" --skip-final-snapshot >/dev/null 2>&1 && aws rds wait db-instance-deleted --db-instance-identifier "$DB_ID" || true
aws secretsmanager delete-secret --secret-id "$SECRET_NAME" --force-delete-without-recovery >/dev/null 2>&1 || true
aws ecr delete-repository --repository-name "$ECR_REPO" --force >/dev/null 2>&1 || true
aws s3 rb "s3://$BUCKET" --force >/dev/null 2>&1 || true
for sg in "$SG_DB" "$SG_API"; do id=$(aws ec2 describe-security-groups --filters Name=group-name,Values="$sg" --query 'SecurityGroups[0].GroupId' --output text); [[ "$id" != None ]] && aws ec2 delete-security-group --group-id "$id" || true; done
aws cloudwatch delete-dashboards --dashboard-names "$PROJECT" || true
aws cloudwatch delete-alarms --alarm-names "$PROJECT-api-errors" "$PROJECT-ec2-status" "$PROJECT-ec2-cpu" || true
TOPIC=$(aws sns list-topics --query "Topics[?ends_with(TopicArn, ':$PROJECT-alarms')].TopicArn" --output text); [[ -n "$TOPIC" ]] && aws sns delete-topic --topic-arn "$TOPIC" || true
aws amplify list-apps --query "apps[?name=='$PROJECT'].appId" --output text | xargs -r -n1 aws amplify delete-app --app-id >/dev/null || true
log "Done. IAM roles ($EC2_ROLE, $DEPLOY_ROLE) are left in place; delete them in the console if needed."
