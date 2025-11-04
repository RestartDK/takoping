# Complete EKS Deployment Guide

This guide covers deploying your entire application stack on EKS with 2 GPU nodes, using the LLM NIM on one node and your application on the other.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  EKS Cluster (2 GPU Nodes - g6e.xlarge)               │
│  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │  Node 1 (role=llm)   │  │  Node 2 (role=app)   │  │
│  │                      │  │                      │  │
│  │  • LLM NIM          │  │  • Bun Server        │  │
│  │    (LoadBalancer)   │  │  • PostgreSQL        │  │
│  │                      │  │  • ChromaDB          │  │
│  │                      │  │  • Nginx (Frontend)  │  │
│  │                      │  │                      │  │
│  └──────────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                        ↓ HTTP API calls
            Public Embeddings API (NVIDIA)
```

### Key Decisions

- **2 GPU nodes**: Both nodes are g6e.xlarge (1 GPU each)
- **LLM on Node 1**: Dedicated GPU node for LLM NIM
- **App on Node 2**: All application services on second GPU node
- **Public Embeddings**: Use NVIDIA's public embeddings API (no GPU needed)

---

## Prerequisites

- [ ] EKS cluster with 2 GPU nodes (follow `eks-setup-guide.md` Steps 1-14)
- [ ] LLM NIM deployed and accessible via LoadBalancer
- [ ] NVIDIA API key for public embeddings: [Get from NVIDIA Build](https://build.nvidia.com/settings/api-keys)
- [ ] `kubectl` configured to access your cluster
- [ ] AWS CLI configured with ECR permissions
- [ ] Docker installed locally (for building images)

---

## Step 1: Verify EKS Cluster Setup

### Check Cluster Status

```bash
kubectl cluster-info
kubectl get nodes -o wide
```

You should see 2 nodes, both `g6e.xlarge` instances.

### Verify LLM NIM is Running

```bash
kubectl -n nim get pods
kubectl -n nim get svc nim-public
```

Note the LoadBalancer DNS for LLM NIM (you'll need it later).

### Verify Storage Class

```bash
kubectl get storageclass ebs-sc
```

If it doesn't exist, follow Step 6 in `eks-setup-guide.md` to create it.

---

## Step 2: Label Nodes for Workload Separation

Label your nodes to control where pods are scheduled:

```bash
# Find which node has LLM NIM
kubectl -n nim get pod -o wide my-nim-nim-llm-0

# Label the LLM node (replace with actual node name)
kubectl label nodes <LLM_NODE_NAME> role=llm --overwrite

# Label the app node (the other node)
kubectl label nodes <APP_NODE_NAME> role=app --overwrite

# Verify labels
kubectl get nodes --show-labels
```

**Example:**
```bash
kubectl label nodes ip-192-168-43-227.ec2.internal role=llm --overwrite
kubectl label nodes ip-192-168-9-42.ec2.internal role=app --overwrite
```

---

## Step 3: Scale Down Embeddings NIM (If Deployed)

If you previously deployed embeddings NIM, scale it down to free the node:

```bash
kubectl -n nim scale sts my-nim-embeddings-nim-llm --replicas=0
```

---

## Step 4: Build and Push Docker Images to ECR

### Set Up ECR Repositories

```bash
AWS_REGION=us-east-1
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

# Create ECR repositories
aws ecr create-repository --repository-name takoping-server --region $AWS_REGION || true
aws ecr create-repository --repository-name takoping-client --region $AWS_REGION || true

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR
```

### Build and Push Images

```bash
# Build and push server image
docker build --platform linux/amd64 -t takoping-server:latest -f server/Dockerfile server
docker tag takoping-server:latest $ECR/takoping-server:latest
docker push $ECR/takoping-server:latest

# Build and push client image (with relative API base)
docker build --platform linux/amd64 -t takoping-client:latest -f Dockerfile.client .
docker tag takoping-client:latest $ECR/takoping-client:latest
docker push $ECR/takoping-client:latest

echo "Images pushed to: $ECR"
```

**Note**: The client image uses `nginx.k8s.conf` which proxies `/api/*` to the server service, so no API base URL is needed in the build.

---

## Step 5: Update Kubernetes Manifests with ECR URLs

Replace `REPLACE_ECR` in your manifests with your actual ECR URL:

```bash
ECR="$ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
sed -i '' "s|REPLACE_ECR|$ECR|g" infrastructure/k8s/app/server.yaml
sed -i '' "s|REPLACE_ECR|$ECR|g" infrastructure/k8s/app/web.yaml
```

Or manually edit:
- `infrastructure/k8s/app/server.yaml`: Replace `REPLACE_ECR` with your ECR URL
- `infrastructure/k8s/app/web.yaml`: Replace `REPLACE_ECR` with your ECR URL

---

## Step 6: Create Application Namespace and Secrets

### Create Namespace

```bash
kubectl apply -f infrastructure/k8s/app/namespace.yaml
```

### Create Server Environment Secret

```bash
# Get LLM LoadBalancer DNS
LLM_LB=$(kubectl -n nim get svc nim-public -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# Set your NVIDIA API key for public embeddings
NVIDIA_API_KEY="nvapi-<your-api-key>"

# Create secret
kubectl -n app create secret generic server-env \
  --from-literal=AI_PROVIDER=nim \
  --from-literal=NIM_BASE_URL="http://$LLM_LB:8000/v1" \
  --from-literal=NIM_API_KEY=dummy-required \
  --from-literal=NIM_MODEL=nvidia/llama-3.1-nemotron-nano-8b-v1 \
  --from-literal=NIM_EMBED_BASE_URL="https://integrate.api.nvidia.com/v1" \
  --from-literal=NIM_EMBED_API_KEY="$NVIDIA_API_KEY" \
  --from-literal=NIM_EMBED_MODEL=nvidia/llama-3.2-nv-embedqa-1b-v2 \
  --from-literal=RETRIEVE_TOP_K=10 \
  --from-literal=MAX_TOKENS=512 \
  --from-literal=PORT=3000
```

**Important**: Replace `nvapi-<your-api-key>` with your actual NVIDIA API key from [NVIDIA Build](https://build.nvidia.com/settings/api-keys).

---

## Step 7: Deploy Application Stack

### Deploy Services in Order

```bash
# 1. Deploy PostgreSQL (StatefulSet with persistent storage)
kubectl apply -f infrastructure/k8s/app/postgres.yaml

# 2. Deploy ChromaDB (Deployment with persistent storage)
kubectl apply -f infrastructure/k8s/app/chroma.yaml

# 3. Deploy Server (Deployment)
kubectl apply -f infrastructure/k8s/app/server.yaml

# 4. Deploy Web Frontend (Deployment with LoadBalancer)
kubectl apply -f infrastructure/k8s/app/web.yaml
```

### Verify Deployment

```bash
# Check all pods are running
kubectl -n app get pods -o wide

# Check services
kubectl -n app get svc

# Get web LoadBalancer URL
kubectl -n app get svc web -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
echo
```

**Expected output:**
```
NAME                      READY   STATUS    RESTARTS   AGE
chroma-xxx                1/1     Running   0          Xm
postgres-0                1/1     Running   0          Xm
server-xxx                 1/1     Running   0          Xm
web-xxx                    1/1     Running   0          Xm
```

All pods should be on the node with `role=app` label.

---

## Step 8: Verify Application is Working

### Check Server Logs

```bash
kubectl -n app logs deploy/server -f
```

You should see:
- "PostgreSQL schema initialized"
- "Server running on port 3000"
- No errors about invalid environment variables

### Test API Endpoints

```bash
WEB_LB=$(kubectl -n app get svc web -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')

# Test frontend
curl -I http://$WEB_LB/

# Test API health
curl http://$WEB_LB/api/health
```

### Test NIM Connectivity

```bash
# Test LLM NIM
kubectl -n app exec -it deploy/server -- sh -lc 'curl -s $NIM_BASE_URL/models | head -c 200'

# Test public embeddings API
kubectl -n app exec -it deploy/server -- sh -lc 'curl -s -X POST $NIM_EMBED_BASE_URL/embeddings -H "Content-Type: application/json" -H "Authorization: Bearer $NIM_EMBED_API_KEY" -d "{\"model\":\"$NIM_EMBED_MODEL\",\"input\":[\"test\"],\"input_type\":\"query\"}" | head -c 200'
```

### Access Your Application

Open your browser and go to:
```
http://<web-loadbalancer-dns>
```

---

## Step 9: Troubleshooting

### Pods Stuck in Pending

**Symptom**: Pods show `STATUS=Pending` with error "didn't match Pod's node affinity/selector"

**Solution**: Ensure nodes are labeled correctly:
```bash
kubectl get nodes --show-labels
kubectl label nodes <node-name> role=app --overwrite
kubectl -n app rollout restart deploy/server deploy/web deploy/chroma
```

### Postgres Fails to Start

**Symptom**: Postgres pod shows `CrashLoopBackOff` with error about "lost+found directory"

**Solution**: The manifest includes `PGDATA=/var/lib/postgresql/data/pgdata` to avoid this. If it still fails:
```bash
kubectl -n app delete pvc pgdata
kubectl -n app apply -f infrastructure/k8s/app/postgres.yaml
```

### Server Can't Connect to NIM

**Symptom**: Server logs show connection errors to NIM

**Solution**: 
1. Verify LLM NIM is running: `kubectl -n nim get pods`
2. Check LoadBalancer DNS: `kubectl -n nim get svc nim-public`
3. Update secret with correct URL:
```bash
LLM_LB=$(kubectl -n nim get svc nim-public -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
kubectl -n app patch secret server-env --type='json' -p="[{\"op\":\"replace\",\"path\":\"/data/NIM_BASE_URL\",\"value\":\"$(echo -n "http://$LLM_LB:8000/v1" | base64)\"}]"
kubectl -n app rollout restart deploy/server
```

### ChromaDB Embedding Errors

**Symptom**: Logs show "No embedding function configuration found"

**Solution**: This is expected - ChromaDB doesn't store embedding function config, but the server provides embeddings directly. Restart Chroma to clear any cached config:
```bash
kubectl -n app rollout restart deploy/chroma
```

### Client Requests Going to localhost

**Symptom**: Browser console shows requests to `http://localhost/api/...`

**Solution**: Rebuild client image without VITE_API_BASE:
```bash
AWS_REGION=us-east-1 API_BASE="" infrastructure/k8s/build_push.sh
kubectl -n app rollout restart deploy/web
```

### Multiple Pods of Same Service

**Symptom**: See duplicate pods (e.g., `server-abc` and `server-xyz`)

**Solution**: Old ReplicaSet pods. Delete the older ones:
```bash
kubectl -n app get rs
kubectl -n app delete pod <old-pod-name>
```

---

## Step 10: Update Application After Code Changes

When you make code changes:

```bash
# 1. Build and push new images
AWS_REGION=us-east-1 API_BASE="" infrastructure/k8s/build_push.sh

# 2. Restart deployments to pull new images
kubectl -n app rollout restart deploy/server deploy/web

# 3. Monitor rollout
kubectl -n app rollout status deploy/server
kubectl -n app rollout status deploy/web

# 4. Check logs
kubectl -n app logs deploy/server -f
```

---

## Step 11: Monitor Resource Usage

### Check Pod Resource Usage

```bash
kubectl top pods -n app
kubectl top pods -n nim
```

### Check Node Resource Usage

```bash
kubectl top nodes
```

### View All Pods Across Namespaces

```bash
kubectl get pods -A -o wide
```

---

## Step 12: Accessing Services

### Web Application

```bash
WEB_LB=$(kubectl -n app get svc web -o jsonpath='{.status.loadBalancer.ingress[0].hostname}')
echo "Open: http://$WEB_LB"
```

### Server API (Internal)

```bash
# Port-forward for local testing
kubectl -n app port-forward svc/server 3000:3000
# Then access: http://localhost:3000
```

### PostgreSQL (Internal)

```bash
# Port-forward for local access
kubectl -n app port-forward svc/postgres 5432:5432
# Then connect with: psql postgres://takoping:takoping@localhost:5432/takoping
```

### ChromaDB (Internal)

```bash
# Port-forward for local access
kubectl -n app port-forward svc/chroma 8000:8000
# Then access: http://localhost:8000
```

---

## Configuration Reference

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `AI_PROVIDER` | AI provider type | `nim` |
| `NIM_BASE_URL` | LLM NIM LoadBalancer URL | `http://<lb-dns>:8000/v1` |
| `NIM_API_KEY` | LLM API key (dummy for NIM) | `dummy-required` |
| `NIM_MODEL` | LLM model name | `nvidia/llama-3.1-nemotron-nano-8b-v1` |
| `NIM_EMBED_BASE_URL` | Public embeddings API | `https://integrate.api.nvidia.com/v1` |
| `NIM_EMBED_API_KEY` | NVIDIA API key | `nvapi-...` |
| `NIM_EMBED_MODEL` | Embeddings model | `nvidia/llama-3.2-nv-embedqa-1b-v2` |
| `DATABASE_URL` | PostgreSQL connection | `postgres://takoping:takoping@postgres.app.svc.cluster.local:5432/takoping` |
| `CHROMA_URL` | ChromaDB connection | `http://chroma.app.svc.cluster.local:8000` |
| `RETRIEVE_TOP_K` | RAG retrieval count | `10` |
| `MAX_TOKENS` | Max tokens per response | `512` |
| `PORT` | Server port | `3000` |

### Node Labels

- `role=llm`: Node for LLM NIM workloads
- `role=app`: Node for application workloads

### Storage Classes

- `ebs-sc`: EBS CSI driver storage class (for persistent volumes)

---

## Cleanup

To remove the application stack (but keep NIM):

```bash
# Delete application namespace (deletes all app resources)
kubectl delete namespace app
```

To remove everything including NIM:

```bash
# Delete NIM namespace
kubectl delete namespace nim

# Delete EKS cluster
eksctl delete cluster --name=<CLUSTER_NAME> --region=us-east-1
```

---

## Cost Estimate

**Monthly (24/7):**
- EKS GPU nodes (2x g6e.xlarge): ~$1,100
- EKS Control Plane: ~$73
- EBS Storage (20GB): ~$2
- LoadBalancers (2): ~$36
- **Total: ~$1,211/month**

**For Hackathon (1 week):**
- ~$280/week

---

## Quick Reference Commands

```bash
# Check status
kubectl -n app get pods -o wide
kubectl -n app get svc

# View logs
kubectl -n app logs deploy/server -f
kubectl -n app logs deploy/web -f

# Restart services
kubectl -n app rollout restart deploy/server deploy/web

# Get LoadBalancer URLs
kubectl -n app get svc web -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
kubectl -n nim get svc nim-public -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'

# Update secret
kubectl -n app delete secret server-env
# Then recreate with new values
```

---

## Next Steps

1. ✅ EKS cluster with 2 nodes
2. ✅ LLM NIM deployed
3. ✅ Application stack deployed
4. ✅ Public embeddings API configured
5. ✅ LoadBalancers created
6. ✅ Test end-to-end functionality
7. ✅ Monitor logs for issues
8. ✅ Set up monitoring/alerting (optional)

---

## Related Documentation

- `eks-setup-guide.md` - Initial EKS and NIM setup
- `eks-redeployment-guide.md` - Redeploying after cleanup
- `deployment-architecture.md` - Architecture decisions
- `PRD.md` - Product requirements

