# Step-by-Step EKS Setup Guide for NVIDIA NIM

This guide walks you through setting up an Amazon EKS cluster and deploying NVIDIA NIM microservices.

## Prerequisites Checklist

Before starting, ensure you have:

- [ ] **AWS Account** with permissions to:
  - Create EKS clusters
  - Launch EC2 instances (GPU instances: g6e.xlarge or larger)
  - Create IAM roles and policies
  - Access AWS Service Quotas
- [ ] **Service Quota**: Request quota increase for GPU instances if needed
  - Go to AWS Console → Service Quotas → EC2 → "Running On-Demand G and VT instances"
  - Request at least 4 vCPUs (minimum for g6e.xlarge)
- [ ] **NVIDIA API Key**: Get from [NVIDIA Build](https://build.nvidia.com/settings/api-keys)
- [ ] **AWS Cloud Shell** open (or local machine with AWS CLI configured)

---

## Step 1: Open AWS Cloud Shell

1. Log into AWS Console
2. Click the Cloud Shell icon (top right) or search "Cloud Shell"
3. Wait for the terminal to initialize

---

## Step 2: Install Required Tools

Cloud Shell comes with `kubectl` and `aws-cli`, but you need `eksctl` and `helm`:

### Install eksctl

```bash
# For Linux/Cloud Shell
curl --silent --location "https://github.com/weaveworks/eksctl/releases/latest/download/eksctl_Linux_amd64.tar.gz" | tar xz -C /tmp
sudo mv /tmp/eksctl /usr/local/bin
eksctl version
```

### Install Helm

```bash
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
helm version
```

---

## Step 3: Set Environment Variables

Set these variables for your cluster configuration:

```bash
export CLUSTER_NAME=nim-eks-workshop
export CLUSTER_NODE_TYPE=g6e.xlarge
export NODE_COUNT=1
export AWS_DEFAULT_REGION=us-east-1  # Change to your preferred region
```

**What this does:**
- `CLUSTER_NAME`: Name for your EKS cluster
- `CLUSTER_NODE_TYPE`: GPU instance type (g6e.xlarge has 1 GPU, 4 vCPUs)
- `NODE_COUNT`: Number of nodes in your cluster
- `AWS_DEFAULT_REGION`: AWS region (make sure GPU instances are available)

---

## Step 4: Create the EKS Cluster

This step takes **10-15 minutes**. The cluster includes:
- EKS control plane
- Kubernetes nodes (EC2 instances with GPUs)
- Networking configuration

```bash
eksctl create cluster \
  --name=$CLUSTER_NAME \
  --node-type=$CLUSTER_NODE_TYPE \
  --nodes=$NODE_COUNT \
  --region=$AWS_DEFAULT_REGION
```

**What to expect:**
- You'll see progress messages
- CloudFormation stacks will be created (visible in AWS Console)
- Final message: "✓ EKS cluster "nim-eks-workshop" in "us-east-1" region is ready"

**Troubleshooting:**
- If you get a quota error, request quota increase in Service Quotas
- If it fails, check CloudFormation console for error details

---

## Step 5: Verify Cluster Creation

Check that your nodes are running:

```bash
kubectl get nodes -o wide
```

**Expected output:**
```
NAME                                          STATUS   ROLES    AGE   VERSION   INTERNAL-IP      EXTERNAL-IP
ip-xxx-xxx-xxx-xxx.us-east-1.compute.internal   Ready    <none>   5m    v1.xx     x.x.x.x         x.x.x.x
```

The node should show `STATUS=Ready`. If it shows `NotReady`, wait a few more minutes.

---

## Step 6: Configure Storage (EBS CSI Driver)

NIM needs persistent storage to download and cache models. We'll set up EBS (Elastic Block Store) storage.

### 6.1: Enable OIDC for the cluster

This allows Kubernetes to assume IAM roles:

```bash
eksctl utils associate-iam-oidc-provider \
  --cluster $CLUSTER_NAME \
  --region $AWS_DEFAULT_REGION \
  --approve
```

### 6.2: Create IAM Service Account for EBS CSI Driver

```bash
eksctl create iamserviceaccount \
  --name ebs-csi-controller-sa \
  --namespace kube-system \
  --cluster $CLUSTER_NAME \
  --region $AWS_DEFAULT_REGION \
  --role-name AmazonEKS_EBS_CSI_DriverRole \
  --attach-policy-arn arn:aws:iam::aws:policy/service-role/AmazonEBSCSIDriverPolicy \
  --approve
```

**What this does:** Creates an IAM role that allows Kubernetes to create/manage EBS volumes.

### 6.3: Install EBS CSI Driver Add-on

```bash
eksctl create addon \
  --name "aws-ebs-csi-driver" \
  --cluster $CLUSTER_NAME \
  --region $AWS_DEFAULT_REGION \
  --service-account-role-arn arn:aws:iam::$(aws sts get-caller-identity --query Account --output text):role/AmazonEKS_EBS_CSI_DriverRole \
  --force
```

### 6.4: Verify Add-on Status

Wait until status is `ACTIVE` (may take 1-2 minutes):

```bash
eksctl get addon \
  --name "aws-ebs-csi-driver" \
  --region $AWS_DEFAULT_REGION \
  --cluster $CLUSTER_NAME
```

Keep checking until you see:
```
STATUS: ACTIVE
```

### 6.5: Create Storage Class

Create a Kubernetes StorageClass that uses EBS:

```bash
cat <<EOF > storage.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: ebs-sc
provisioner: ebs.csi.aws.com
volumeBindingMode: WaitForFirstConsumer
EOF

kubectl create -f storage.yaml
```

**What this does:** Defines how Kubernetes should provision EBS volumes. `WaitForFirstConsumer` means volumes are created when a pod actually needs them (better for cost).

Verify it was created:
```bash
kubectl get storageclass
```

---

## Step 7: Configure NVIDIA API Access

### 7.1: Set Your NVIDIA API Key

```bash
export NGC_CLI_API_KEY=<YOUR_NVIDIA_API_KEY>
```

**⚠️ Important:** Replace `<YOUR_NVIDIA_API_KEY>` with your actual key from [NVIDIA Build](https://build.nvidia.com/settings/api-keys). Remove the `<` and `>` brackets.

**Security Note:** This key is stored in your shell session. Don't share your terminal output.

### 7.2: Create Kubernetes Namespace

Namespaces organize resources. We'll put all NIM resources in a `nim` namespace:

```bash
kubectl create namespace nim
```

---

## Step 8: Download NIM Helm Chart

Helm charts are Kubernetes application packages. Download the official NIM chart:

```bash
helm fetch https://helm.ngc.nvidia.com/nim/charts/nim-llm-1.7.0.tgz \
  --username='$oauthtoken' \
  --password=$NGC_CLI_API_KEY
```

**What this does:** Downloads the Helm chart to your current directory as `nim-llm-1.7.0.tgz`.

Verify it downloaded:
```bash
ls -lh nim-llm-1.7.0.tgz
```

---

## Step 9: Create Kubernetes Secrets

NIM needs credentials to pull images from NVIDIA's registry and download models.

### 9.1: Docker Registry Secret (for pulling images)

```bash
kubectl create secret docker-registry registry-secret \
  --docker-server=nvcr.io \
  --docker-username='$oauthtoken' \
  --docker-password=$NGC_CLI_API_KEY \
  -n nim
```

### 9.2: NGC API Secret (for downloading models)

```bash
kubectl create secret generic ngc-api \
  --from-literal=NGC_API_KEY=$NGC_CLI_API_KEY \
  -n nim
```

Verify secrets were created:
```bash
kubectl get secrets -n nim
```

You should see both `registry-secret` and `ngc-api`.

---

## Step 10: Create NIM Configuration File

Create a Helm values file that configures your NIM deployment:

```bash
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
```

**What this configures:**
- **image**: Which NIM container to use (llama-3.1-nemotron-nano-8b-v1)
- **model.ngcAPISecret**: Uses the secret we created to download the model
- **persistence**: Enables persistent storage so models are cached
- **storageClass**: Uses the EBS storage class we created
- **imagePullSecrets**: Uses the registry secret to pull the container image

---

## Step 11: Deploy NIM to EKS

Deploy using Helm:

```bash
helm install my-nim nim-llm-1.7.0.tgz \
  -f nim_custom_value.yaml \
  --namespace nim
```

**What this does:** Installs the NIM microservice into your cluster.

---

## Step 12: Monitor Deployment

The first time, NIM needs to download the model (several GB). This can take **10-20 minutes**.

Watch the pod status:

```bash
kubectl get pods -n nim -w
```

**What to watch for:**
1. Initially: `STATUS=ContainerCreating` or `Pending`
2. Then: `STATUS=Running` but `READY=0/1` (downloading model)
3. Finally: `STATUS=Running` and `READY=1/1` (ready!)

Press `Ctrl+C` to stop watching once it's ready.

**Check pod logs if stuck:**
```bash
kubectl logs -n nim <pod-name> -f
```

Replace `<pod-name>` with the actual pod name from `kubectl get pods -n nim`.

---

## Step 13: Verify NIM is Running

Once the pod is `READY=1/1`, verify the service:

```bash
kubectl get svc -n nim
```

You should see:
```
NAME                 TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
my-nim-nim-llm       ClusterIP   10.xxx.xxx.xxx  <none>        8000/TCP   Xm
my-nim-nim-llm-sts   ClusterIP   None            <none>        8000/TCP   Xm
```

---

## Step 14: Expose NIM Publicly (Optional)

By default, NIM is only accessible within the cluster. To access it from your server, expose it via a LoadBalancer.

### 14.1: Get Service Labels

```bash
kubectl get svc my-nim-nim-llm -n nim -o yaml | grep "app.kubernetes.io"
```

Note the values for `app.kubernetes.io/name` and `app.kubernetes.io/instance`.

### 14.2: Create LoadBalancer Service

```bash
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
```

### 14.3: Get Public Endpoint

Wait 1-2 minutes for the LoadBalancer to provision, then:

```bash
kubectl get svc nim-public -n nim
```

Wait until `EXTERNAL-IP` shows an address (not `<pending>`). It will look like:
```
xxxxx-xxxxx.us-east-1.elb.amazonaws.com
```

**Save this URL!** You'll need it for your server configuration.

---

## Step 15: Test the NIM Endpoint

### 15.1: Test Basic Connection

```bash
# Replace with your actual LoadBalancer DNS
export NIM_ENDPOINT="http://xxxxx-xxxxx.us-east-1.elb.amazonaws.com:8000"

curl $NIM_ENDPOINT/v1/models
```

**Expected response:** JSON with model information including `nvidia/llama-3.1-nemotron-nano-8b-v1`

### 15.2: Test Chat Completion

```bash
curl -X POST $NIM_ENDPOINT/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/llama-3.1-nemotron-nano-8b-v1",
    "messages": [
      {"role": "user", "content": "Say hi from Vancouver!"}
    ]
  }'
```

**Expected response:** JSON with a chat completion response.

---

## Step 16: Configure Your Server

Update your server's `.env` file to use the EKS-deployed NIM:

```bash
# In your server directory
AI_PROVIDER=nim
NIM_OPENAI_BASE_URL=http://xxxxx-xxxxx.us-east-1.elb.amazonaws.com:8000/v1
NIM_OPENAI_API_KEY=dummy-required  # NIM doesn't require real auth, but SDK expects this
NIM_MODEL=nvidia/llama-3.1-nemotron-nano-8b-v1
```

**Important:** Replace `xxxxx-xxxxx.us-east-1.elb.amazonaws.com` with your actual LoadBalancer DNS from Step 14.3.

---

## Step 17: Deploy Embedding Model (Optional)

If you need embeddings for RAG (Retrieval Augmented Generation), you can deploy a second NIM instance specifically for embeddings. This will run on the same node as your LLM.

### 17.1: Create Embeddings Configuration File

```bash
cat <<EOF > nim_embeddings_value.yaml
image:
  repository: "nvcr.io/nim/nvidia/llama-3.2-nv-embedqa-1b-v2"
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
```

**What this configures:**
- **image**: Embedding model container (`llama-3.2-nv-embedqa-1b-v2`)
- **model.ngcAPISecret**: Uses the same secret to download the model
- **persistence**: Enables persistent storage for model caching
- **storageClass**: Uses the EBS storage class we created earlier

### 17.2: Deploy Embeddings Service

```bash
helm install my-nim-embeddings nim-llm-1.7.0.tgz \
  -f nim_embeddings_value.yaml \
  --namespace nim
```

**What this does:** Installs the embeddings NIM microservice as a separate deployment in your cluster.

### 17.3: Monitor Embeddings Deployment

Watch the pod status (model download may take 5-10 minutes):

```bash
kubectl get pods -n nim -w
```

You should see a new pod: `my-nim-embeddings-xxx`. Wait until it shows `READY=1/1`.

**Check pod logs if needed:**
```bash
kubectl logs -n nim <embeddings-pod-name> -f
```

### 17.4: Verify Embeddings Service

```bash
kubectl get svc -n nim
```

You should see:
```
NAME                         TYPE        CLUSTER-IP      EXTERNAL-IP   PORT(S)    AGE
my-nim-nim-llm               ClusterIP   10.xxx.xxx.xxx  <none>        8000/TCP   Xm
my-nim-nim-llm-sts           ClusterIP   None            <none>        8000/TCP   Xm
my-nim-embeddings-nim-llm    ClusterIP   10.xxx.xxx.xxx  <none>        8000/TCP   Xm
my-nim-embeddings-nim-llm-sts ClusterIP   None            <none>        8000/TCP   Xm
```

### 17.5: Expose Embeddings via LoadBalancer

Get the service labels for the embeddings service:

```bash
kubectl get svc my-nim-embeddings-nim-llm -n nim -o yaml | grep "app.kubernetes.io"
```

Note the values for `app.kubernetes.io/name` and `app.kubernetes.io/instance`.

Create the LoadBalancer service:

```bash
cat <<EOF > nim_embeddings_public.yaml
apiVersion: v1
kind: Service
metadata:
  name: nim-embeddings-public
  namespace: nim
spec:
  selector:
    app.kubernetes.io/name: nim-llm
    app.kubernetes.io/instance: my-nim-embeddings
  ports:
    - name: http
      port: 8000
      targetPort: 8000
      protocol: TCP
  type: LoadBalancer
EOF

kubectl apply -f nim_embeddings_public.yaml
```

### 17.6: Get Embeddings LoadBalancer DNS

Wait 1-2 minutes for the LoadBalancer to provision, then:

```bash
kubectl get svc nim-embeddings-public -n nim
```

Wait until `EXTERNAL-IP` shows an address (not `<pending>`). It will look like:
```
xxxxx-xxxxx.us-east-1.elb.amazonaws.com
```

**Save this URL!** You'll need it for your server configuration.

### 17.7: Test Embeddings Endpoint

Test the embeddings endpoint:

```bash
# Replace with your actual LoadBalancer DNS
export NIM_EMBED_ENDPOINT="http://xxxxx-xxxxx.us-east-1.elb.amazonaws.com:8000"

# Test models endpoint
curl $NIM_EMBED_ENDPOINT/v1/models
```

**Expected response:** JSON with model information including the embedding model.

Test embeddings generation:

```bash
curl -X POST $NIM_EMBED_ENDPOINT/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nvidia/llama-3.2-nv-embedqa-1b-v2",
    "input": ["This is a test sentence for embeddings"]
  }'
```

**Expected response:** JSON with embedding vectors (array of numbers).

### 17.8: Update Server Configuration

Update your server's `.env` file to include embeddings configuration:

```bash
# In your server directory
AI_PROVIDER=nim

# LLM Configuration (for chat/completions)
NIM_OPENAI_BASE_URL=http://<llm-loadbalancer-dns>:8000/v1
NIM_OPENAI_API_KEY=dummy-required
NIM_MODEL=nvidia/llama-3.1-nemotron-nano-8b-v1

# Embeddings Configuration (for RAG vector search)
NIM_EMBED_BASE_URL=http://<embeddings-loadbalancer-dns>:8000/v1
NIM_EMBED_MODEL=nvidia/llama-3.2-nv-embedqa-1b-v2
```

**Important:** 
- Replace `<llm-loadbalancer-dns>` with your LLM LoadBalancer DNS from Step 14.3
- Replace `<embeddings-loadbalancer-dns>` with your embeddings LoadBalancer DNS from Step 17.6

**Note:** Your server code may need to be updated to use `NIM_EMBED_BASE_URL` separately from `NIM_OPENAI_BASE_URL` for embeddings. Check `server/src/vector/nim-embedding.ts` and `server/src/env.ts` to ensure they support separate endpoints.

---

## Troubleshooting

### Cluster won't create
- Check Service Quotas for GPU instances
- Verify you have permissions to create EKS clusters
- Check CloudFormation console for error details

### Pod stuck in ContainerCreating
- Check pod logs: `kubectl logs -n nim <pod-name>`
- Check pod events: `kubectl describe pod -n nim <pod-name>`
- Verify EBS CSI driver is ACTIVE

### Model download taking forever
- This is normal on first deployment (several GB)
- Check pod logs to see download progress
- Verify NGC_API_KEY is correct in secrets

### Can't connect to LoadBalancer
- Wait 2-3 minutes for LoadBalancer to provision
- Check security groups allow traffic on port 8000
- Verify pod is READY: `kubectl get pods -n nim`

### Connection refused errors
- Verify the LoadBalancer DNS is correct
- Check pod is running: `kubectl get pods -n nim`
- Check service endpoints: `kubectl get endpoints -n nim`

---

## Cleanup (When Done)

To avoid charges, delete the cluster when you're done:

```bash
eksctl delete cluster \
  --name=$CLUSTER_NAME \
  --region=$AWS_DEFAULT_REGION \
  --disable-nodegroup-eviction \
  --wait
```

This takes 5-10 minutes and deletes all resources (cluster, nodes, LoadBalancers, etc.).

---

## Next Steps

1. ✅ Configure your server to use the NIM LLM endpoint (Step 16)
2. ✅ Test the chat API with your server
3. ✅ Deploy embedding model if needed (Step 17)
4. ✅ Update server code to support separate embeddings endpoint (if needed)
5. ✅ Set up monitoring/alerting (optional)
6. ✅ Consider setting up HTTPS/TLS for production

---

## Cost Estimates

- **g6e.xlarge**: ~$0.75/hour (varies by region)
- **EKS Control Plane**: ~$0.10/hour
- **EBS Storage**: ~$0.10/GB/month
- **LoadBalancer**: ~$0.025/hour + data transfer

**Total for 24/7 operation**: ~$600-700/month (single node)

**Recommendation**: Delete the cluster when not in use to save costs.

