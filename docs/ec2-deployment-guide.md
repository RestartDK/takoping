# Step-by-Step EC2 Deployment Guide

This guide walks you through creating an EC2 instance and deploying your application using Docker Compose.

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] **AWS Account** with permissions to:
  - Launch EC2 instances
  - Create security groups
  - Create key pairs
- [ ] **EKS Cluster with NIM** already deployed (follow `eks-setup-guide.md`)
- [ ] **NIM LoadBalancer DNS** from EKS deployment
  - LLM: `a10062a9c72244fe39b116c6b0b85a4f-1963612092.us-east-1.elb.amazonaws.com`
  - Embeddings (if deployed): `a307068d8f5ce4956a0ec1bf4d5397e0-82370778.us-east-1.elb.amazonaws.com`
- [ ] **SSH Key Pair** (or create one during EC2 setup)
- [ ] **Git Repository** URL (to clone your code)

---

## Step 1: Create EC2 Key Pair (if you don't have one)

### Option A: Via AWS Console

1. Go to **EC2 Console** → **Key Pairs** (left sidebar)
2. Click **"Create key pair"**
3. Configure:
   - **Name**: `takoping-ec2-key` (or your preferred name)
   - **Key pair type**: `RSA`
   - **Private key file format**: `.pem` (for Linux/Mac) or `.ppk` (for Windows PuTTY)
4. Click **"Create key pair"**
5. **Save the downloaded file** - you'll need it to SSH into the instance

### Option B: Via AWS CLI

```bash
aws ec2 create-key-pair \
  --key-name takoping-ec2-key \
  --query 'KeyMaterial' \
  --output text > ~/.ssh/takoping-ec2-key.pem

chmod 400 ~/.ssh/takoping-ec2-key.pem
```

---

## Step 2: Create Security Group

### Via AWS Console

1. Go to **EC2 Console** → **Security Groups** (left sidebar)
2. Click **"Create security group"**
3. Configure:
   - **Name**: `takoping-app-sg`
   - **Description**: `Security group for Takoping application`
   - **VPC**: Select your default VPC (or the VPC where your EKS cluster is)
4. **Inbound Rules** - Add these rules:
   - **HTTP (Port 80)**: 
     - Type: `HTTP`
     - Source: `0.0.0.0/0` (or your IP for more security)
     - Description: `Allow HTTP access from internet`
   - **SSH (Port 22)**:
     - Type: `SSH`
     - Source: `My IP` (or your specific IP)
     - Description: `Allow SSH from my IP`
5. **Outbound Rules**: 
   - Default (allow all) is fine - needed to reach NIM LoadBalancer
6. Click **"Create security group"**
7. **Note the Security Group ID** (e.g., `sg-xxxxxxxxxxxxx`)

### Via AWS CLI

```bash
# Get your IP
MY_IP=$(curl -s https://checkip.amazonaws.com)

# Create security group
SG_ID=$(aws ec2 create-security-group \
  --group-name takoping-app-sg \
  --description "Security group for Takoping application" \
  --query 'GroupId' \
  --output text)

# Add HTTP rule
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0

# Add SSH rule (from your IP)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_ID \
  --protocol tcp \
  --port 22 \
  --cidr $MY_IP/32

echo "Security Group ID: $SG_ID"
```

---

## Step 3: Launch EC2 Instance

### Via AWS Console

1. Go to **EC2 Console** → **Instances** → **Launch instances**

2. **Name and tags**:
   - Name: `takoping-app-server`

3. **Application and OS Images**:
   - **Amazon Machine Image (AMI)**: `Amazon Linux 2023 AMI` (recommended)
     - Or `Ubuntu Server 22.04 LTS` if you prefer Ubuntu

4. **Instance type**:
   - Select `t3.medium` (2 vCPU, 4 GB RAM) - recommended for hackathon
   - Or `t3.large` (2 vCPU, 8 GB RAM) - if you need more memory
   - **Cost**: ~$0.0416/hour (t3.medium) or ~$0.0832/hour (t3.large)

5. **Key pair (login)**:
   - Select the key pair you created in Step 1
   - **Important**: Download the key if you haven't already!

6. **Network settings**:
   - **VPC**: Select the same VPC as your EKS cluster (or default VPC)
   - **Subnet**: Any public subnet
   - **Auto-assign Public IP**: `Enable`
   - **Security groups**: Select `takoping-app-sg` (created in Step 2)

7. **Configure storage**:
   - **Size**: `30 GiB` (enough for databases and Docker images)
   - **Volume type**: `gp3` (default)
   - **Delete on termination**: Leave unchecked if you want to keep data

8. **Advanced details** (optional):
   - You can add user data scripts here if needed

9. Click **"Launch instance"**

10. Click **"View all instances"** and wait for instance to be **"Running"**

11. **Note the Public IPv4 address** (e.g., `54.123.45.67`)

### Via AWS CLI

```bash
# Get the latest Amazon Linux 2023 AMI ID
AMI_ID=$(aws ec2 describe-images \
  --owners amazon \
  --filters "Name=name,Values=al2023-ami-2023*" \
            "Name=architecture,Values=x86_64" \
            "Name=state,Values=available" \
  --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' \
  --output text \
  --region us-east-1)

# Launch instance (replace SG_ID with your security group ID)
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id $AMI_ID \
  --instance-type t3.medium \
  --key-name takoping-ec2-key \
  --security-group-ids $SG_ID \
  --associate-public-ip-address \
  --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":30,"VolumeType":"gp3"}}]' \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=takoping-app-server}]' \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "Instance ID: $INSTANCE_ID"

# Wait for instance to be running
aws ec2 wait instance-running --instance-ids $INSTANCE_ID

# Get public IP
PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids $INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)

echo "Public IP: $PUBLIC_IP"
```

---

## Step 4: SSH into EC2 Instance

### On Linux/Mac

```bash
# Replace with your key path and public IP
ssh -i ~/.ssh/takoping-ec2-key.pem ec2-user@<YOUR-EC2-PUBLIC-IP>

# If you get permission denied error:
chmod 400 ~/.ssh/takoping-ec2-key.pem
ssh -i ~/.ssh/takoping-ec2-key.pem ec2-user@<YOUR-EC2-PUBLIC-IP>
```

### On Windows (using PowerShell or WSL)

```powershell
# In PowerShell or WSL
ssh -i C:\path\to\takoping-ec2-key.pem ec2-user@<YOUR-EC2-PUBLIC-IP>
```

Or use **PuTTY** (if you downloaded `.ppk` key):
1. Open PuTTY
2. Host: `ec2-user@<YOUR-EC2-PUBLIC-IP>`
3. Connection → SSH → Auth → Credentials → Browse and select your `.ppk` file
4. Open

---

## Step 5: Install Dependencies on EC2

Once you're SSH'd into the instance, run these commands:

### For Amazon Linux 2023

```bash
# Update system
sudo yum update -y

# Install Docker
sudo yum install docker -y

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Add ec2-user to docker group (so you can run docker without sudo)
sudo usermod -aG docker ec2-user

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Git
sudo yum install git -y

# Verify installations
docker --version
docker-compose --version
git --version

# Log out and back in for docker group to take effect
exit
# Then SSH back in: ssh -i ~/.ssh/takoping-ec2-key.pem ec2-user@<YOUR-EC2-PUBLIC-IP>
```

### For Ubuntu 22.04

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
sudo apt install docker.io -y

# Start Docker service
sudo systemctl start docker
sudo systemctl enable docker

# Add ubuntu user to docker group
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Git
sudo apt install git -y

# Verify installations
docker --version
docker-compose --version
git --version

# Log out and back in
exit
# Then SSH back in: ssh -i ~/.ssh/takoping-ec2-key.pem ubuntu@<YOUR-EC2-PUBLIC-IP>
```

---

## Step 6: Clone Your Repository

```bash
# Clone your repository
git clone <YOUR-REPO-URL>
cd aws-nvidia-hackathon

# Or if you need to authenticate:
# git clone https://github.com/yourusername/aws-nvidia-hackathon.git
```

---

## Step 7: Configure Environment Variables

### Create Production Environment File

```bash
# Get your EC2 public IP (if you need it for client config)
export EC2_PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)
echo "EC2 Public IP: $EC2_PUBLIC_IP"

# Create server/.env file
cat > server/.env <<EOF
# AI Provider
AI_PROVIDER=nim

# NVIDIA NIM LLM (from your EKS LoadBalancer)
NIM_BASE_URL=http://a10062a9c72244fe39b116c6b0b85a4f-1963612092.us-east-1.elb.amazonaws.com:8000/v1
NIM_API_KEY=dummy-required
NIM_MODEL=nvidia/llama-3.1-nemotron-nano-8b-v1

# NVIDIA NIM Embeddings (if you deployed embeddings)
NIM_EMBED_BASE_URL=http://a307068d8f5ce4956a0ec1bf4d5397e0-82370778.us-east-1.elb.amazonaws.com:8000/v1
NIM_EMBED_API_KEY=dummy-required
NIM_EMBED_MODEL=nvidia/llama-3.2-nv-embedqa-1b-v2

# Retrieval
RETRIEVE_TOP_K=10
MAX_TOKENS=512

# Databases (docker-compose internal networking)
DATABASE_URL=postgres://takoping:takoping@postgres:5432/takoping
CHROMA_URL=http://chroma:8000

# GitHub (optional - add your token if needed)
# GITHUB_TOKEN=your_github_token_here

# Server
PORT=3000
EOF

# Verify the file was created
cat server/.env
```

**Important**: Update the NIM LoadBalancer URLs with your actual values from EKS!

---

## Step 8: Update Docker Compose Configuration

### Update Client Build Args

Edit `docker-compose.yml` to set the client API base URL:

```bash
# Set your EC2 public IP or domain
export EC2_PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

# Update docker-compose.yml (replace the VITE_API_BASE value)
# You can use sed or edit manually
sed -i "s|VITE_API_BASE: http://localhost|VITE_API_BASE: http://$EC2_PUBLIC_IP|g" docker-compose.yml

# Or manually edit docker-compose.yml and set:
# VITE_API_BASE: http://<YOUR-EC2-PUBLIC-IP>
```

### Verify docker-compose.yml

Make sure your `docker-compose.yml` includes restart policies:

```yaml
services:
  postgres:
    restart: unless-stopped
  chroma:
    restart: unless-stopped
  server:
    restart: unless-stopped
  nginx:
    restart: unless-stopped
```

---

## Step 9: Deploy Application

```bash
# Make sure you're in the project directory
cd ~/aws-nvidia-hackathon

# Build and start all services
docker-compose up -d --build

# Watch the logs
docker-compose logs -f

# Or check specific service logs
docker-compose logs server
docker-compose logs postgres
docker-compose logs chroma
```

**First build will take 5-10 minutes** as it downloads Docker images and builds your application.

---

## Step 10: Verify Deployment

### Check All Containers Are Running

```bash
docker-compose ps
```

You should see all services with `Up` status:
- `postgres` - Up
- `chroma` - Up  
- `server` - Up
- `client-build` - Exited (it's a one-time build job)
- `nginx` - Up

### Test Server Health

```bash
# Test from inside EC2
curl http://localhost/api/health

# Or test the server directly
curl http://localhost:3000/api/health
```

### Test NIM Connectivity

```bash
# Test if server can reach NIM LoadBalancer
docker-compose exec server curl http://a10062a9c72244fe39b116c6b0b85a4f-1963612092.us-east-1.elb.amazonaws.com:8000/v1/models

# Should return JSON with model information
```

### Test from Your Browser

Open your browser and go to:
```
http://<YOUR-EC2-PUBLIC-IP>
```

You should see your application!

---

## Step 11: Troubleshooting

### Containers Not Starting

```bash
# Check logs for errors
docker-compose logs

# Check specific service
docker-compose logs server

# Restart a service
docker-compose restart server

# Rebuild and restart
docker-compose up -d --build
```

### Server Can't Reach NIM

```bash
# Test from server container
docker-compose exec server curl -v http://a10062a9c72244fe39b116c6b0b85a4f-1963612092.us-east-1.elb.amazonaws.com:8000/v1/models

# Check security group allows outbound traffic
# Check if NIM pods are running in EKS
```

### Database Connection Issues

```bash
# Check postgres logs
docker-compose logs postgres

# Check if postgres is running
docker-compose exec postgres psql -U takoping -d takoping -c "SELECT 1;"
```

### Port Already in Use

```bash
# Check what's using port 80
sudo netstat -tulpn | grep :80

# Or check port 3000
sudo netstat -tulpn | grep :3000
```

### View All Container Logs

```bash
# Follow all logs
docker-compose logs -f

# Last 100 lines of all logs
docker-compose logs --tail=100
```

---

## Step 12: Update Application (Redeployment)

When you make changes to your code:

```bash
# SSH into EC2
ssh -i ~/.ssh/takoping-ec2-key.pem ec2-user@<YOUR-EC2-PUBLIC-IP>

# Navigate to project
cd ~/aws-nvidia-hackathon

# Pull latest changes
git pull

# Rebuild and restart
docker-compose up -d --build

# Check logs
docker-compose logs -f
```

---

## Step 13: Set Up Domain (Optional)

If you want to use a custom domain:

1. **Get a domain** (Route 53, Namecheap, etc.)
2. **Create an A record** pointing to your EC2 public IP
3. **Update nginx.conf** to handle the domain
4. **Update client build args** with the domain URL
5. **Set up SSL/TLS** (use Let's Encrypt with certbot)

---

## Cost Monitoring

### Daily Costs

- **EC2 t3.medium**: ~$1/day
- **EBS Storage (30GB)**: ~$0.003/day
- **Data Transfer**: Variable

### Monthly Estimate (24/7)

- **EC2**: ~$30/month
- **EBS**: ~$0.10/month
- **Total EC2**: ~$30/month

**Plus EKS costs** (from eks-setup-guide.md):
- EKS GPU node: ~$550/month
- EKS Control Plane: ~$73/month
- LoadBalancer: ~$18/month

**Total**: ~$671/month (or ~$158/week for hackathon)

---

## Cleanup (When Done)

To avoid charges when you're done:

```bash
# Stop all containers
docker-compose down

# Or stop and remove volumes (⚠️ deletes data)
docker-compose down -v
```

Then terminate the EC2 instance:

### Via AWS Console
1. Go to EC2 → Instances
2. Select your instance
3. Instance state → Terminate instance
4. Confirm

### Via AWS CLI

```bash
aws ec2 terminate-instances --instance-ids <INSTANCE_ID>
```

**Note**: Don't forget to also delete your EKS cluster when done!

---

## Quick Reference Commands

```bash
# SSH into EC2
ssh -i ~/.ssh/takoping-ec2-key.pem ec2-user@<EC2-IP>

# Check services
docker-compose ps

# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Rebuild and restart
docker-compose up -d --build

# Stop services
docker-compose stop

# Start services
docker-compose start

# Get EC2 public IP
curl http://169.254.169.254/latest/meta-data/public-ipv4
```

---

## Next Steps

1. ✅ EC2 instance created and configured
2. ✅ Application deployed
3. ✅ Test end-to-end functionality
4. ✅ Monitor logs for any issues
5. ✅ Set up monitoring/alerting (optional)
6. ✅ Configure backup strategy (optional)

---

## Support

If you encounter issues:
- Check container logs: `docker-compose logs`
- Verify NIM pods are running in EKS
- Check security group rules
- Verify environment variables are correct
- Test connectivity from EC2 to NIM LoadBalancer

