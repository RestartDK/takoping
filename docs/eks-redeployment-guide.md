# EKS Redeployment Guide

After cleaning up your cluster, here's what you need to know about redeploying.

**For complete deployment instructions, see `eks-full-deployment-guide.md`**

## What Gets Deleted vs. What Persists

### ❌ Deleted When You Clean Up:

- **EKS cluster** (control plane and nodes)
- **All Kubernetes resources** (pods, services, secrets, namespaces)
- **LoadBalancers** (you'll get new DNS names)
- **EBS volumes** (even with `Retain` policy, volumes are typically deleted when PVCs are deleted)
  - **Important**: Models will need to be re-downloaded (10-20 minutes)
- **IAM roles** created by eksctl (may persist, but cluster-specific ones are deleted)

### ✅ What Persists (If You Save It):

- **Configuration files** (yaml files) - if you saved them locally
- **Helm chart** (`nim-llm-1.7.0.tgz`) - if you saved it
- **NVIDIA API key** - you'll need to set it again
- **Environment variables** - if in a script or saved

### ⚠️ What Changes:

- **LoadBalancer DNS names** - will be different each time
- **Cluster IPs** - will be different
- **EBS volume IDs** - new volumes will be created

---

## Redeployment Difficulty: **Easy (with preparation)**

### Time to Redeploy:
- **First time setup**: ~30-40 minutes (cluster + model downloads)
- **Subsequent redeployments**: ~30-40 minutes (same steps, but you know what to do)

### What You Need to Do Again:
1. ✅ Create EKS cluster with 2 nodes (Steps 1-5 from `eks-setup-guide.md`)
2. ✅ Set up storage (Step 6 from `eks-setup-guide.md`)
3. ✅ Deploy LLM NIM (Steps 7-14 from `eks-setup-guide.md`)
4. ✅ Label nodes for workload separation (from `eks-full-deployment-guide.md`)
5. ✅ Build and push Docker images to ECR (from `eks-full-deployment-guide.md`)
6. ✅ Deploy application stack (from `eks-full-deployment-guide.md`)
7. ✅ Configure public embeddings API (from `eks-full-deployment-guide.md`)

**The good news**: All the configuration files are reusable! You just need to recreate the cluster and redeploy.

**Note**: For full application stack deployment, follow `eks-full-deployment-guide.md` after setting up NIM.

---

## Making Redeployment Easier

### Option 1: Save Your Configuration Files

Before cleanup, save these files:

```bash
# Create a backup directory
mkdir -p ~/eks-nim-backup
cd ~/eks-nim-backup

# Save all config files
cp nim_custom_value.yaml ~/eks-nim-backup/
cp nim_embeddings_value.yaml ~/eks-nim-backup/
cp storage.yaml ~/eks-nim-backup/
cp nim_public.yaml ~/eks-nim-backup/
cp nim_embeddings_public.yaml ~/eks-nim-backup/
cp nim-llm-1.7.0.tgz ~/eks-nim-backup/  # If you still have it

# Save environment variables
echo "export CLUSTER_NAME=$CLUSTER_NAME" > ~/eks-nim-backup/env.sh
echo "export CLUSTER_NODE_TYPE=$CLUSTER_NODE_TYPE" >> ~/eks-nim-backup/env.sh
echo "export NODE_COUNT=$NODE_COUNT" >> ~/eks-nim-backup/env.sh
echo "export AWS_DEFAULT_REGION=$AWS_DEFAULT_REGION" >> ~/eks-nim-backup/env.sh
# Note: DO NOT save NGC_CLI_API_KEY in a file - set it manually for security
```

### Option 2: Use a Deployment Script

See the deployment script below to automate most steps.

---

## Quick Redeployment Steps

### Prerequisites:
- Have your NVIDIA API key ready
- Saved configuration files (or use the ones from the guide)

### Steps:

1. **Set environment variables** (same as before):
```bash
export CLUSTER_NAME=nim-eks-workshop
export CLUSTER_NODE_TYPE=g6e.xlarge
export NODE_COUNT=1
export AWS_DEFAULT_REGION=us-east-1
export NGC_CLI_API_KEY=<your-key>
```

2. **Create cluster** (Steps 1-5 from guide):
```bash
eksctl create cluster \
  --name=$CLUSTER_NAME \
  --node-type=$CLUSTER_NODE_TYPE \
  --nodes=$NODE_COUNT \
  --region=$AWS_DEFAULT_REGION
```

3. **Set up storage** (Step 6):
```bash
eksctl utils associate-iam-oidc-provider --cluster $CLUSTER_NAME --region $AWS_DEFAULT_REGION --approve
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
kubectl create -f storage.yaml
```

4. **Configure and deploy** (Steps 7-14):
```bash
kubectl create namespace nim
helm fetch https://helm.ngc.nvidia.com/nim/charts/nim-llm-1.7.0.tgz \
  --username='$oauthtoken' \
  --password=$NGC_CLI_API_KEY
kubectl create secret docker-registry registry-secret \
  --docker-server=nvcr.io \
  --docker-username='$oauthtoken' \
  --docker-password=$NGC_CLI_API_KEY \
  -n nim
kubectl create secret generic ngc-api \
  --from-literal=NGC_API_KEY=$NGC_CLI_API_KEY \
  -n nim
helm install my-nim nim-llm-1.7.0.tgz -f nim_custom_value.yaml --namespace nim
kubectl apply -f nim_public.yaml
# Wait for LoadBalancer and get new DNS
```

5. **Deploy embeddings** (Step 17, if needed):
```bash
helm install my-nim-embeddings nim-llm-1.7.0.tgz \
  -f nim_embeddings_value.yaml \
  --namespace nim
kubectl apply -f nim_embeddings_public.yaml
# Wait for LoadBalancer and get new DNS
```

6. **Update server config** with new LoadBalancer DNS names

---

## Automated Deployment Script

Here's a script to automate most of the redeployment:

```bash
#!/bin/bash
# Save this as: redeploy-eks-nim.sh

set -e  # Exit on error

# Configuration
export CLUSTER_NAME=${CLUSTER_NAME:-nim-eks-workshop}
export CLUSTER_NODE_TYPE=${CLUSTER_NODE_TYPE:-g6e.xlarge}
export NODE_COUNT=${NODE_COUNT:-1}
export AWS_DEFAULT_REGION=${AWS_DEFAULT_REGION:-us-east-1}

# Check for NVIDIA API key
if [ -z "$NGC_CLI_API_KEY" ]; then
    echo "Error: NGC_CLI_API_KEY not set"
    echo "Please set it with: export NGC_CLI_API_KEY=<your-key>"
    exit 1
fi

echo "🚀 Starting EKS NIM Redeployment..."
echo "Cluster: $CLUSTER_NAME"
echo "Region: $AWS_DEFAULT_REGION"
echo ""

# Step 1: Create cluster
echo "📦 Creating EKS cluster (10-15 minutes)..."
eksctl create cluster \
  --name=$CLUSTER_NAME \
  --node-type=$CLUSTER_NODE_TYPE \
  --nodes=$NODE_COUNT \
  --region=$AWS_DEFAULT_REGION

# Step 2: Setup storage
echo "💾 Setting up storage..."
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

echo "⏳ Waiting for EBS CSI driver to be ACTIVE..."
while true; do
  STATUS=$(eksctl get addon \
    --name "aws-ebs-csi-driver" \
    --region $AWS_DEFAULT_REGION \
    --cluster $CLUSTER_NAME \
    -o json | jq -r '.[0].Status')
  if [ "$STATUS" = "ACTIVE" ]; then
    echo "✅ EBS CSI driver is ACTIVE"
    break
  fi
  echo "   Status: $STATUS (waiting...)"
  sleep 10
done

# Create storage class
cat <<EOF > storage.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ebs-sc
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
EOF
kubectl create -f storage.yaml

# Step 3: Setup NVIDIA access
echo "🔑 Setting up NVIDIA API access..."
kubectl create namespace nim || true

# Step 4: Download Helm chart
echo "📥 Downloading Helm chart..."
helm fetch https://helm.ngc.nvidia.com/nim/charts/nim-llm-1.7.0.tgz \
  --username='$oauthtoken' \
  --password=$NGC_CLI_API_KEY

# Step 5: Create secrets
echo "🔐 Creating secrets..."
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

# Step 6: Create config files (if they don't exist)
if [ ! -f nim_custom_value.yaml ]; then
  echo "📝 Creating nim_custom_value.yaml..."
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
echo "🚀 Deploying NIM LLM..."
helm install my-nim nim-llm-1.7.0.tgz \
  -f nim_custom_value.yaml \
  --namespace nim

# Step 8: Create LoadBalancer
echo "🌐 Creating LoadBalancer for LLM..."
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
echo "✅ Deployment started!"
echo ""
echo "⏳ Next steps:"
echo "1. Wait for pods to be ready: kubectl get pods -n nim -w"
echo "2. Get LoadBalancer DNS: kubectl get svc nim-public -n nim"
echo "3. Update your server .env with the new LoadBalancer DNS"
echo ""
echo "📊 Monitor deployment:"
echo "   kubectl get pods -n nim -w"
echo ""
```

**Usage:**
```bash
chmod +x redeploy-eks-nim.sh
export NGC_CLI_API_KEY=<your-key>
./redeploy-eks-nim.sh
```

---

## Tips for Faster Redeployment

1. **Save config files** - Keep all `.yaml` files in version control
2. **Use the script** - Automate repetitive steps
3. **Model downloads** - Can't skip this (10-20 min), but it's automated
4. **LoadBalancer DNS** - Will change, but you can script retrieving it:
   ```bash
   kubectl get svc nim-public -n nim -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
   ```

---

## Summary

**Redeployment is straightforward** because:
- ✅ All configuration files are reusable
- ✅ Steps are the same each time
- ✅ Can be scripted/automated
- ✅ Takes ~30-40 minutes (same as first time)

**Main considerations:**
- ⚠️ Models need to be re-downloaded (10-20 minutes)
- ⚠️ LoadBalancer DNS will be different (update server config)
- ⚠️ Need to set NVIDIA API key again

**Recommendation**: Save your config files and use a script to automate redeployment!

