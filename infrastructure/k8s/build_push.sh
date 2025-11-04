#!/usr/bin/env bash
set -euo pipefail

REGION=${AWS_REGION:-us-east-1}
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

echo "Logging into ECR..."
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR"

echo "Ensuring ECR repos exist..."
aws ecr describe-repositories --repository-names takoping-server >/dev/null 2>&1 || aws ecr create-repository --repository-name takoping-server --region "$REGION"
aws ecr describe-repositories --repository-names takoping-client >/dev/null 2>&1 || aws ecr create-repository --repository-name takoping-client --region "$REGION"

API_BASE=${API_BASE-}

echo "Building server image (linux/amd64)..."
docker build --platform linux/amd64 -t takoping-server:latest -f server/Dockerfile server
docker tag takoping-server:latest "$ECR/takoping-server:latest"
docker push "$ECR/takoping-server:latest"

if [ -n "${API_BASE}" ]; then
  echo "Building client image (linux/amd64) with VITE_API_BASE=$API_BASE ..."
  docker build --platform linux/amd64 -t takoping-client:latest -f Dockerfile.client --build-arg VITE_API_BASE="$API_BASE" .
else
  echo "Building client image (linux/amd64) with relative API base (no VITE_API_BASE) ..."
  docker build --platform linux/amd64 -t takoping-client:latest -f Dockerfile.client .
fi
docker tag takoping-client:latest "$ECR/takoping-client:latest"
docker push "$ECR/takoping-client:latest"

echo "Done. Update manifests with ECR: $ECR"


