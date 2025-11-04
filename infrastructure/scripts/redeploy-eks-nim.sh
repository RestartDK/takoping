#!/bin/bash
# EKS NIM Redeployment Script
# Automates most of the EKS cluster and NIM deployment steps

set -e  # Exit on error

# Configuration
export CLUSTER_NAME=${CLUSTER_NAME:-nim-eks-workshop}
export CLUSTER_NODE_TYPE=${CLUSTER_NODE_TYPE:-g6e.xlarge}
export NODE_COUNT=${NODE_COUNT:-1}
export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-us-east-1}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for required tools
command -v eksctl >/dev/null 2>&1 || { echo -e "${RED}Error: eksctl is required but not installed.${NC}" >&2; exit 1; }
command -v kubectl >/dev/null 2>&1 || { echo -e "${RED}Error: kubectl is required but not installed.${NC}" >&2; exit 1; }
command -v helm >/dev/null 2>&1 || { echo -e "${RED}Error: helm is required but not installed.${NC}" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo -e "${YELLOW}Warning: jq not found, some status checks may not work${NC}" >&2; }

# Check for NVIDIA API key
if [ -z "$NGC_CLI_API_KEY" ]; then
    echo -e "${RED}Error: NGC_CLI_API_KEY not set${NC}"
    echo "Please set it with: export NGC_CLI_API_KEY=<your-key>"
    exit 1
fi

echo -e "${GREEN}🚀 Starting EKS NIM Redeployment...${NC}"
echo "Cluster: $CLUSTER_NAME"
echo "Region: $AWS_DEFAULT_REGION"
echo "Node Type: $CLUSTER_NODE_TYPE"
echo "Node Count: $NODE_COUNT"
echo ""

# Get script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."  # Go to infrastructure directory

# Step 1: Create cluster
echo -e "${YELLOW}📦 Creating EKS cluster (this takes 10-15 minutes)...${NC}"
eksctl create cluster \
  --name=$CLUSTER_NAME \
  --node-type=$CLUSTER_NODE_TYPE \
  --nodes=$NODE_COUNT \
  --region=$AWS_DEFAULT_REGION

echo -e "${GREEN}✅ Cluster created!${NC}"
echo ""

# Step 2: Setup storage
echo -e "${YELLOW}💾 Setting up storage...${NC}"
eksctl utils associate-iam-oidc-provider \
  --cluster $CLUSTER_NAME \
  --region $AWS_DEFAULT_REGION \
  --approve

eksctl create iamserviceaccount \
  --name ebs-csi-controller-sa \
  --namespace kube-system \
  --cluster $CLUSTER_NAME \
  --region $AWS_DEFAULT_REGION \
  --role-name AmazonEKS_EBS_CSI_DriverRole \
  --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy \
  --approve

eksctl create addon \
  --name "aws-ebs-csi-driver" \
  --cluster $CLUSTER_NAME \
  --region $AWS_DEFAULT_REGION \
  --service-account-role-arn arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/AmazonEKS_EBS_CSI_DriverRole \
  --force

echo -e "${YELLOW}⏳ Waiting for EBS CSI driver to be ACTIVE...${NC}"
if command -v jq &> /dev/null; then
  while true; do
    STATUS=$(eksctl get addon \
      --name "aws-ebs-csi-driver" \
      --region $AWS_DEFAULT_REGION \
      --cluster $CLUSTER_NAME \
      -o json 2>/dev/null | jq -r '.[0].Status // "CREATING"')
    if [ "$STATUS" = "ACTIVE" ]; then
      echo -e "${GREEN}✅ EBS CSI driver is ACTIVE${NC}"
      break
    fi
    echo "   Status: $STATUS (waiting...)"
    sleep 10
  done
else
  echo "   Waiting 30 seconds for addon to initialize..."
  sleep 30
  echo -e "${GREEN}✅ EBS CSI driver addon installed${NC}"
fi

# Create storage class
if [ ! -f storage.yaml ]; then
  cat <<EOF > storage.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ebs-sc
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
EOF
fi
kubectl create -f storage.yaml || echo "Storage class already exists"

echo -e "${GREEN}✅ Storage setup complete!${NC}"
echo ""

# Step 3: Setup NVIDIA access
echo -e "${YELLOW}🔑 Setting up NVIDIA API access...${NC}"
kubectl create namespace nim 2>/dev/null || echo "Namespace 'nim' already exists"

# Step 4: Download Helm chart
echo -e "${YELLOW}📥 Downloading Helm chart...${NC}"
if [ ! -f nim-llm-1.7.0.tgz ]; then
  helm fetch https://helm.ngc.nvidia.com/nim/charts/nim-llm-1.7.0.tgz \
    --username='$oauthtoken' \
    --password=$NGC_CLI_API_KEY
else
  echo "   Helm chart already exists, skipping download"
fi

# Step 5: Create secrets
echo -e "${YELLOW}🔐 Creating secrets...${NC}"
kubectl create secret docker-registry registry-secret \
  --docker-server=nvcr.io \
  --docker-username='$oauthtoken' \
  --docker-password=$NGC_CLI_API_KEY \
  -n nim \
  --dry-run=client -o yaml | kubectl apply -f -

kubectl create secret generic ngc-api \
  --from-literal=NGC_API_KEY=$NGC_CLI_API_KEY \
  -n nim \
  --dry-run=client -o yaml | kubectl apply -f -

echo -e "${GREEN}✅ Secrets created!${NC}"
echo ""

# Step 6: Create config files (if they don't exist)
if [ ! -f nim_custom_value.yaml ]; then
  echo -e "${YELLOW}📝 Creating nim_custom_value.yaml...${NC}"
  cat <<EOF > nim_custom_value.yaml
image:
  repository: "nvcr.io/nim/nvidia/llama-3.1-nemotron-nano-8b-v1"
  tag: latest
model:
  ngcAPISecret: ngc-api
persistence:
  enabled: true
  storageClass: "ebs-sc"
  accessMode: ReadWriteOnce
  stsPersistentVolumeClaimRetentionPolicy:
    whenDeleted: Retain
    whenScaled: Retain
imagePullSecrets:
  - name: registry-secret
EOF
fi

# Step 7: Deploy LLM
echo -e "${YELLOW}🚀 Deploying NIM LLM...${NC}"
helm install my-nim nim-llm-1.7.0.tgz \
  -f nim_custom_value.yaml \
  --namespace nim \
  2>/dev/null || helm upgrade my-nim nim-llm-1.7.0.tgz \
  -f nim_custom_value.yaml \
  --namespace nim

# Step 8: Create LoadBalancer
echo -e "${YELLOW}🌐 Creating LoadBalancer for LLM...${NC}"
cat <<EOF > nim_public.yaml
apiVersion: v1
kind: Service
metadata:
  name: nim-public
  namespace: nim
spec:
  selector:
    app.kubernetes.io/name: nim-llm
    app.kubernetes.io/instance: my-nim
  ports:
    - name: http
      port: 8000
      targetPort: 8000
      protocol: TCP
  type: LoadBalancer
EOF
kubectl apply -f nim_public.yaml

echo ""
echo -e "${GREEN}✅ Deployment started!${NC}"
echo ""
echo -e "${YELLOW}⏳ Next steps:${NC}"
echo "1. Wait for pods to be ready: ${GREEN}kubectl get pods -n nim -w${NC}"
echo "2. Wait for LoadBalancer (1-2 minutes), then get DNS:"
echo "   ${GREEN}kubectl get svc nim-public -n nim${NC}"
echo "3. Update your server .env with the new LoadBalancer DNS"
echo ""
echo -e "${YELLOW}📊 Monitor deployment:${NC}"
echo "   ${GREEN}kubectl get pods -n nim -w${NC}"
echo ""
echo -e "${YELLOW}🧪 Test once ready:${NC}"
echo "   ${GREEN}export NIM_ENDPOINT=\$(kubectl get svc nim-public -n nim -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')${NC}"
echo "   ${GREEN}curl http://\$NIM_ENDPOINT:8000/v1/models${NC}"
echo ""

