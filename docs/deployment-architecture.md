# Deployment Architecture

## Current Implementation: Full EKS Deployment

This document describes the actual deployment architecture used for the hackathon.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  EKS Cluster (2 GPU Nodes - g6e.xlarge)                │
│  ┌──────────────────────┐  ┌──────────────────────┐  │
│  │  Node 1 (role=llm)   │  │  Node 2 (role=app)   │  │
│  │                      │  │                      │  │
│  │  • LLM NIM          │  │  • Bun Server        │  │
│  │    (LoadBalancer)   │  │  • PostgreSQL        │  │
│  │                      │  │  • ChromaDB          │  │
│  │                      │  │  • Nginx (Frontend) │  │
│  │                      │  │    (LoadBalancer)   │  │
│  └──────────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                        ↓ HTTP API calls
            Public Embeddings API (NVIDIA)
            https://integrate.api.nvidia.com/v1
```

### Why This Approach?

1. **Hackathon Constraints**: Max 2 EC2 instances (EKS nodes count as EC2)
2. **Unified Orchestration**: All services managed by Kubernetes
3. **Resource Efficiency**: GPU nodes used for both NIM and app (app doesn't need GPU)
4. **LoadBalancer Integration**: Native Kubernetes service discovery
5. **Public Embeddings**: Uses NVIDIA's public API (no GPU needed for embeddings)

### Setup Steps

#### 1. Deploy EKS Cluster with 2 Nodes
- Follow `eks-setup-guide.md` Steps 1-5
- Create cluster with 2 nodes (both g6e.xlarge)

#### 2. Deploy LLM NIM
- Follow `eks-setup-guide.md` Steps 6-14
- Deploy LLM NIM on one node
- Note the LoadBalancer DNS

#### 3. Label Nodes for Workload Separation
```bash
kubectl label nodes <LLM_NODE> role=llm --overwrite
kubectl label nodes <APP_NODE> role=app --overwrite
```

#### 4. Build and Push Docker Images
```bash
# Build for linux/amd64 and push to ECR
AWS_REGION=us-east-1 API_BASE="" infrastructure/k8s/build_push.sh
```

#### 5. Deploy Application Stack
```bash
# Create namespace and secrets
kubectl apply -f infrastructure/k8s/app/namespace.yaml
# Create server-env secret with NIM URLs and public embeddings API

# Deploy services
kubectl apply -f infrastructure/k8s/app/postgres.yaml
kubectl apply -f infrastructure/k8s/app/chroma.yaml
kubectl apply -f infrastructure/k8s/app/server.yaml
kubectl apply -f infrastructure/k8s/app/web.yaml
```

**See `eks-full-deployment-guide.md` for complete step-by-step instructions.**

### Cost Estimate

**Monthly (24/7):**
- EKS GPU nodes (2x g6e.xlarge): ~$1,100
- EKS Control Plane: ~$73
- EBS Storage (20GB): ~$2
- LoadBalancers (2): ~$36
- **Total: ~$1,211/month**

**For Hackathon (1 week):**
- ~$280/week

**Note**: This is higher than EC2 approach, but required due to hackathon constraints (max 2 EC2 instances).

---

## Alternative: EC2 Deployment (Not Used)

For hackathon constraints, we use the full EKS approach. If you had separate EC2 capacity, you could:

### EC2 + EKS Hybrid (Not Possible with Constraints)

- **EKS**: GPU nodes for NIM only
- **EC2**: CPU instance for application stack
- **Pros**: Lower cost (CPU instance cheaper than GPU node)
- **Cons**: Not possible with max 2 EC2 limit (both consumed by EKS nodes)

**See `ec2-deployment-guide.md` for EC2 deployment instructions** (if you had capacity).

---

## Quick Start Command Summary

```bash
# 1. EKS for NIM (from eks-setup-guide.md)
eksctl create cluster --name=nim-eks --node-type=g6e.xlarge --nodes=1
# ... follow guide ...

# 2. Launch EC2 instance
# Via Console or:
aws ec2 run-instances \
  --image-id ami-xxxxx \
  --instance-type t3.medium \
  --key-name your-key \
  --security-group-ids sg-xxxxx

# 3. SSH into EC2
ssh -i your-key.pem ec2-user@<ec2-ip>

# 4. Deploy app
git clone <repo>
cd aws-nvidia-hackathon
docker-compose up -d
```

---

## Next Steps

1. ✅ Set up EKS for NIM (follow eks-setup-guide.md)
2. ✅ Launch EC2 instance
3. ✅ Deploy docker-compose services
4. ✅ Configure networking between EC2 and EKS
5. ✅ Test end-to-end


