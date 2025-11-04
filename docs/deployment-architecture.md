# Deployment Architecture Recommendation

## Recommended: Hybrid Approach (EKS + EC2)

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  EKS Cluster (GPU Nodes - g6e.xlarge)                  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  NVIDIA NIM Services:                           │  │
│  │  • llama-3.1-nemotron-nano-8b-v1 (LLM)         │  │
│  │  • nv-embedqa-e5 (Embeddings) [optional]        │  │
│  │  Exposed via LoadBalancer                       │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                        ↓ HTTP API calls
┌─────────────────────────────────────────────────────────┐
│  EC2 Instance (t3.medium or t3.large)                   │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Application Services (Docker Compose):         │  │
│  │  • Bun Server (Port 3000)                      │  │
│  │  • PostgreSQL (Port 5432)                        │  │
│  │  • ChromaDB (Port 8000)                        │  │
│  │  • Nginx (Port 80) - serves frontend + proxy   │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Why This Approach?

1. **Cost Effective**: GPU nodes ($0.75/hr) only for models, regular EC2 ($0.05/hr) for app
2. **Simple**: All app services in one place, easy to manage
3. **Flexible**: Can scale each independently
4. **Familiar**: Docker Compose pattern you already have

### Setup Steps

#### 1. Deploy NIM on EKS (Already covered)
- Follow `eks-setup-guide.md`
- Get LoadBalancer DNS for NIM endpoint

#### 2. Launch EC2 Instance

```bash
# Instance specs
Type: t3.medium or t3.large (2-4 vCPU, 4-8 GB RAM)
OS: Amazon Linux 2023 or Ubuntu 22.04
Storage: 20-30 GB EBS (for databases)
Security Group: 
  - Allow HTTP (80) from internet
  - Allow SSH (22) from your IP
  - Allow outbound (for calling NIM)
```

#### 3. Install Dependencies on EC2

```bash
# Install Docker & Docker Compose
sudo yum update -y
sudo yum install docker -y
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Git
sudo yum install git -y
```

#### 4. Deploy Application

```bash
# Clone your repo
git clone <your-repo-url>
cd aws-nvidia-hackathon

# Create production .env file
cat > server/.env <<EOF
AI_PROVIDER=nim
NIM_OPENAI_BASE_URL=http://<your-nim-loadbalancer-dns>:8000/v1
NIM_OPENAI_API_KEY=dummy-required
NIM_MODEL=nvidia/llama-3.1-nemotron-nano-8b-v1
NIM_EMBED_MODEL=NV-Embed-QA

DATABASE_URL=postgres://takoping:takoping@postgres:5432/takoping
CHROMA_URL=http://chroma:8000

PORT=3000
EOF

# Update nginx.conf for production (if needed)
# Update client Dockerfile args for production API URL

# Start services
docker-compose up -d
```

#### 5. Configure Networking

Your EC2 instance needs to reach the NIM LoadBalancer:
- Both should be in same VPC (or use VPC peering)
- Or use public LoadBalancer (already configured)

### Cost Estimate

**Monthly (24/7):**
- EKS GPU node: ~$550
- EKS Control Plane: ~$73
- EC2 t3.medium: ~$30
- EBS Storage (20GB): ~$2
- LoadBalancer: ~$18
- **Total: ~$673/month**

**For Hackathon (1 week):**
- ~$158/week

---

## Alternative: Everything on EKS

If you want to learn Kubernetes or need production-grade setup:

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│  EKS Cluster                                            │
│  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │  GPU Node Group  │  │  CPU Node Group           │  │
│  │  (g6e.xlarge)    │  │  (t3.medium)              │  │
│  │                  │  │                           │  │
│  │  • NIM LLM       │  │  • Bun Server             │  │
│  │  • NIM Embed     │  │  • PostgreSQL             │  │
│  │                  │  │  • ChromaDB              │  │
│  │                  │  │  • Nginx (Frontend)      │  │
│  └──────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Setup Complexity

You'd need to:
1. Create separate node groups (GPU vs CPU)
2. Create Kubernetes manifests for each service
3. Set up persistent volumes for databases
4. Configure service discovery
5. Set up ingress/load balancers

### Pros
- ✅ Unified orchestration
- ✅ Better scaling
- ✅ Production-ready
- ✅ Good learning experience

### Cons
- ❌ More complex setup
- ❌ Higher operational overhead
- ❌ Still need to pay for GPU nodes even if app is idle
- ❌ Steeper learning curve

---

## Recommendation for Hackathon

**Start with Hybrid (EKS + EC2):**
- Faster to deploy
- Lower cost
- Easier to debug
- Focus on building features, not infrastructure

**Consider Full EKS if:**
- You want to learn Kubernetes deeply
- You need auto-scaling
- You're building for production
- You have time to invest in K8s setup

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


