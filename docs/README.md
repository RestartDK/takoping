# Deployment Documentation

This directory contains comprehensive documentation for deploying the application on AWS.

## Documentation Overview

### Getting Started

1. **`eks-setup-guide.md`** - Start here
   - Initial EKS cluster setup
   - Deploy NVIDIA NIM LLM service
   - Create LoadBalancers for NIM
   - **Time**: ~30-40 minutes

2. **`eks-full-deployment-guide.md`** - Complete deployment
   - Deploy application stack (server, postgres, chroma, web)
   - Configure public embeddings API
   - Build and push Docker images to ECR
   - Node labeling and workload separation
   - **Time**: ~20-30 minutes (after EKS setup)

### Architecture & Strategy

- **`deployment-architecture.md`** - Architecture decisions
  - Current implementation (2-node EKS)
  - Why this approach
  - Cost estimates
  - Alternative approaches (not used due to constraints)

- **`PRD.md`** - Product requirements
  - Feature specifications
  - Technical requirements

### Deployment Guides

- **`eks-setup-guide.md`** - EKS cluster and NIM setup
- **`eks-full-deployment-guide.md`** - Complete application deployment
- **`eks-redeployment-guide.md`** - Redeploying after cleanup
- **`ec2-deployment-guide.md`** - Alternative EC2 deployment (not used)

### Hackathon Context

- **`hackathon-description.md`** - Hackathon requirements and constraints

---

## Quick Start

### For Complete Deployment

```bash
# 1. Set up EKS and NIM (~30-40 min)
# Follow: eks-setup-guide.md

# 2. Deploy application stack (~20-30 min)
# Follow: eks-full-deployment-guide.md
```

### Deployment Architecture

```
EKS Cluster (2 GPU nodes)
├── Node 1 (role=llm)
│   └── LLM NIM (LoadBalancer)
└── Node 2 (role=app)
    ├── Bun Server
    ├── PostgreSQL
    ├── ChromaDB
    └── Nginx Frontend (LoadBalancer)
```

**External:**
- Public Embeddings API (NVIDIA)

---

## Documentation Index

| Document | Purpose | When to Use |
|----------|---------|-------------|
| `eks-setup-guide.md` | Initial EKS + NIM setup | First time setup |
| `eks-full-deployment-guide.md` | Complete app deployment | After NIM is deployed |
| `eks-redeployment-guide.md` | Cleanup and redeploy | After cluster cleanup |
| `deployment-architecture.md` | Architecture decisions | Understanding design |
| `ec2-deployment-guide.md` | Alternative EC2 approach | If you had separate EC2 capacity |
| `PRD.md` | Product requirements | Understanding features |

---

## Common Tasks

### Check Deployment Status

```bash
# Check NIM
kubectl -n nim get pods,svc

# Check application
kubectl -n app get pods,svc

# Get LoadBalancer URLs
kubectl -n nim get svc nim-public -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
kubectl -n app get svc web -o jsonpath='{.status.loadBalancer.ingress[0].hostname}'
```

### Update Application After Code Changes

```bash
# Build and push new images
AWS_REGION=us-east-1 API_BASE="" infrastructure/k8s/build_push.sh

# Restart deployments
kubectl -n app rollout restart deploy/server deploy/web
kubectl -n app rollout status deploy/server deploy/web
```

### View Logs

```bash
# Server logs
kubectl -n app logs deploy/server -f

# Web logs
kubectl -n app logs deploy/web -f

# NIM logs
kubectl -n nim logs my-nim-nim-llm-0 -f
```

---

## Troubleshooting

See `eks-full-deployment-guide.md` Step 9 for comprehensive troubleshooting, including:

- Pods stuck in Pending
- Postgres initialization errors
- Server can't connect to NIM
- ChromaDB embedding errors
- Client requests going to localhost

---

## Cost Estimates

**Monthly (24/7):**
- EKS GPU nodes (2x g6e.xlarge): ~$1,100
- EKS Control Plane: ~$73
- LoadBalancers (2): ~$36
- EBS Storage: ~$2
- **Total: ~$1,211/month**

**For Hackathon (1 week):**
- ~$280/week

---

## Next Steps

1. ✅ Read `deployment-architecture.md` to understand the design
2. ✅ Follow `eks-setup-guide.md` to set up EKS and NIM
3. ✅ Follow `eks-full-deployment-guide.md` to deploy application
4. ✅ Test end-to-end functionality
5. ✅ Monitor logs and troubleshoot as needed

---

## Support

For issues or questions:
1. Check the troubleshooting section in `eks-full-deployment-guide.md`
2. Review logs using commands above
3. Verify all prerequisites are met
4. Check that nodes are correctly labeled

