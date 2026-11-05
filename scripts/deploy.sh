#!/usr/bin/env bash
# Build the app image, push it to ECR, and restart the container on the EC2 instance.
# Run after `terraform apply` in infra/terraform. Needs docker, the AWS CLI and terraform.
#
#   scripts/deploy.sh
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
tf() { terraform -chdir="$root/infra/terraform" output -raw "$1"; }

region="$(tf region)"
app="$(tf app_name)"
repo="$(tf ecr_repository_url)"
instance="$(tf instance_id)"
url="$(tf url)"
sha="$(git -C "$root" rev-parse --short HEAD)"

echo "==> Building $repo:$sha"
# EC2 runs x86_64; --platform keeps the image right when building on an ARM Mac
docker build --platform linux/amd64 -t "$repo:$sha" -t "$repo:latest" "$root"

echo "==> Pushing to ECR"
aws ecr get-login-password --region "$region" | docker login --username AWS --password-stdin "${repo%%/*}"
docker push "$repo:$sha"
docker push "$repo:latest"

echo "==> Restarting the container on $instance"
cmd_id="$(aws ssm send-command \
  --region "$region" \
  --instance-ids "$instance" \
  --document-name AWS-RunShellScript \
  --comment "deploy $app $sha" \
  --parameters "commands=[\"systemctl restart $app.service\"]" \
  --query Command.CommandId --output text)"
aws ssm wait command-executed --region "$region" --command-id "$cmd_id" --instance-id "$instance"

echo "==> Deployed $sha to $url"
