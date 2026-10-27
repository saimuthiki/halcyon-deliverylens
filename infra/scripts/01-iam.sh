#!/usr/bin/env bash
# IAM: (1) a role for the EC2 server, (2) a GitHub OIDC role that may push images to ECR, deploy the API via SSM and deploy the website to Amplify.
source "$(dirname "$0")/_common.sh"
render() { sed -e "s/__REGION__/$AWS_REGION/g" -e "s/__ACCOUNT__/$AWS_ACCOUNT_ID/g" -e "s/__BUCKET__/$BUCKET/g" \
               -e "s#__SECRET__#$SECRET_NAME#g" -e "s/__ECR_REPO__/$ECR_REPO/g" -e "s/__PROJECT__/$PROJECT/g" \
               -e "s#__GITHUB_REPO__#$GITHUB_REPO#g" -e "s#__GITHUB_REPO_IDS__#$GITHUB_REPO_IDS#g" "$INFRA/policies/$1"; }

if ! aws iam get-role --role-name "$EC2_ROLE" >/dev/null 2>&1; then
  log "Creating $EC2_ROLE"
  aws iam create-role --role-name "$EC2_ROLE" --assume-role-policy-document "$(render ec2-trust.json)" >/dev/null
fi
aws iam put-role-policy --role-name "$EC2_ROLE" --policy-name "${PROJECT}-app" --policy-document "$(render ec2-app-policy.json)"
# Systems Manager lets the GitHub deploy run commands on the server without SSH.
aws iam attach-role-policy --role-name "$EC2_ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam get-instance-profile --instance-profile-name "$EC2_ROLE" >/dev/null 2>&1 || {
  aws iam create-instance-profile --instance-profile-name "$EC2_ROLE" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$EC2_ROLE" --role-name "$EC2_ROLE"; }
log "EC2 role ready: $EC2_ROLE"

OIDC="token.actions.githubusercontent.com"
if ! aws iam list-open-id-connect-providers --query 'OpenIDConnectProviderList[].Arn' --output text | grep -q "$OIDC"; then
  log "Creating GitHub OIDC provider"
  aws iam create-open-id-connect-provider --url "https://$OIDC" --client-id-list sts.amazonaws.com \
    --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1 >/dev/null
fi
if ! aws iam get-role --role-name "$DEPLOY_ROLE" >/dev/null 2>&1; then
  log "Creating $DEPLOY_ROLE"
  aws iam create-role --role-name "$DEPLOY_ROLE" --assume-role-policy-document "$(render github-trust.json)" >/dev/null
fi
# Re-apply the trust policy every run, so an existing role picks up changes to github-trust.json.
aws iam update-assume-role-policy --role-name "$DEPLOY_ROLE" --policy-document "$(render github-trust.json)"
aws iam put-role-policy --role-name "$DEPLOY_ROLE" --policy-name "${PROJECT}-deploy" --policy-document "$(render github-deploy-policy.json)"
log "GitHub deploy role: arn:aws:iam::$AWS_ACCOUNT_ID:role/$DEPLOY_ROLE  (set as GitHub secret AWS_DEPLOY_ROLE_ARN)"
