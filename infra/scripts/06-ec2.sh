#!/usr/bin/env bash
# EC2: one Amazon Linux 2023 server running Docker (Caddy + API), with an Elastic IP.
source "$(dirname "$0")/_common.sh"
API_SG=$(cat "$STATE/api_sg")
aws ec2 describe-key-pairs --key-names "$KEY_PAIR_NAME" >/dev/null 2>&1 || {
  log "Creating key pair $KEY_PAIR_NAME -> infra/.state/$KEY_PAIR_NAME.pem"
  aws ec2 create-key-pair --key-name "$KEY_PAIR_NAME" --query KeyMaterial --output text > "$STATE/$KEY_PAIR_NAME.pem"
  chmod 600 "$STATE/$KEY_PAIR_NAME.pem"; }
EXISTING=$(aws ec2 describe-instances --filters Name=tag:Name,Values="$PROJECT-api" Name=instance-state-name,Values=pending,running,stopped \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)
if [[ "$EXISTING" == "None" ]]; then
  AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64 --query Parameter.Value --output text 2>/dev/null \
        || aws ec2 describe-images --owners amazon --filters 'Name=name,Values=al2023-ami-2023*-x86_64' --query 'sort_by(Images,&CreationDate)[-1].ImageId' --output text)
  log "Launching $EC2_INSTANCE_TYPE from $AMI"
  EXISTING=$(aws ec2 run-instances --image-id "$AMI" --instance-type "$EC2_INSTANCE_TYPE" --key-name "$KEY_PAIR_NAME" \
    --security-group-ids "$API_SG" --iam-instance-profile Name="$EC2_ROLE" \
    --metadata-options HttpTokens=required,HttpEndpoint=enabled \
    --block-device-mappings 'DeviceName=/dev/xvda,Ebs={VolumeSize=30,VolumeType=gp3,Encrypted=true}' \
    --user-data "file://$INFRA/ec2-user-data.sh" \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$PROJECT-api},{Key=project,Value=$PROJECT}]" \
    --query 'Instances[0].InstanceId' --output text)
fi
aws ec2 wait instance-running --instance-ids "$EXISTING"
EIP=$(aws ec2 describe-addresses --filters Name=tag:project,Values="$PROJECT" --query 'Addresses[0].PublicIp' --output text)
if [[ "$EIP" == "None" ]]; then
  ALLOC=$(aws ec2 allocate-address --domain vpc --tag-specifications "ResourceType=elastic-ip,Tags=[{Key=project,Value=$PROJECT}]" --query AllocationId --output text)
  aws ec2 associate-address --instance-id "$EXISTING" --allocation-id "$ALLOC" >/dev/null
  EIP=$(aws ec2 describe-addresses --allocation-ids "$ALLOC" --query 'Addresses[0].PublicIp' --output text)
fi
echo "$EXISTING" > "$STATE/instance_id"; echo "$EIP" > "$STATE/eip"
log "Instance $EXISTING at $EIP. API URL will be: https://${EIP//./-}.sslip.io  (set as VITE_API_URL in Amplify)"
