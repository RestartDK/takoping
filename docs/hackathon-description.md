# Hackathon Overview

Welcome to the Agentic AI Unleashed: AWS & NVIDIA Hackathon

Build the next generation of intelligent, autonomous applications using NVIDIA NIM services and AWS cloud infrastructure. This hackathon challenges you to create innovative Agentic AI applications that demonstrate advanced AI capabilities, autonomous decision-making, and real-world problem-solving.

- **Event Dates:** October 13 - November 3, 2025
- **Submission Deadline:** November 3, 2025 at 23:59:59 UTC
- **Platform:** DevPost at <https://nvidia-aws.devpost.com/>

## About the Challenge

Are you ready to push the boundaries of AI? Build the next generation of intelligent, autonomous applications. This isn't just a hackathon—it's your chance to unleash the power of Agentic AI and show the world what's possible.

Your challenge is to create an Agentic Application—using the llama-3 1-nemotron-nano-8B-v1 large language reasoning mode, deployed as an NVIDIA NIM inference microservice, and at least one Retrieval Embedding NIM.

Your project will be deployed on the scalable infrastructure of either an Amazon Elastic Kubernetes Service (Amazon EKS) Cluster or an Amazon SageMaker AI endpoint. It's a full-stack AI project that will test your skills and leave you with a real-world application.

## Requirements

### What to Create

Build an Agentic Application that uses the llama-3 1-nemotron-nano-8B-v1 large language reasoning mode, deployed as an NVIDIA NIM inference microservice, and at least one Retrieval Embedding NIM, all deployed on either an Amazon EKS Cluster or an Amazon SageMaker AI endpoint.

### What to Submit

- Text description that explains the features and functionality of your project
- Demo video (should be under three minutes)
- URL to your code repository
- README file that contains deployment instructions

Please check the official Rules page for full details.

## Prizes and Recognition

- **Grand Prize: NVIDIA GPU - PNY RTX 6000 ADA**  
  Value: $6,900  
  Awarded to the top innovative agentic AI application demonstrating excellence across all judging criteria.

- **Second Place: MSI RTX 5090 32G**  
  Value: $2,500  
  Runner-up excellence in implementation and innovation.

- **Third Place: NVIDIA GeForce RTX 5080 Founders Edition**  
  Value: $1,250  
  Third place innovation award for outstanding technical achievement.

- **Special Award: Most Valuable Participant - MSI RTX 5090 32G**  
  Value: $2,500  
  Recognizing outstanding contribution and engagement throughout the hackathon.

## Judging Criteria

Your submission will be evaluated by expert judges across four key dimensions:

### Technological Implementation

Quality of code, architecture, and technical execution including:

- Effective use of NVIDIA NIM services
- Proper deployment on Amazon EKS or Amazon SageMaker
- Code quality and adherence to best practices
- Scalability and performance considerations
- Security implementations

### Design

User experience, interface design, and usability including:

- Intuitive user interface and interactions
- Clear information architecture
- Accessibility considerations
- Visual appeal and polish

### Potential Impact

Real-world applicability and value proposition including:

- Meaningful problem-solving approach
- Market potential and scalability
- Social or business impact
- Innovation in addressing real challenges

### Quality of Idea

Originality, creativity, and innovation including:

- Novel use of agentic AI concepts
- Creative problem-solving approaches
- Unique value proposition
- Advanced AI capabilities beyond basic chatbots

## Ready to Build?

This hackathon is your opportunity to push the boundaries of what's possible with agentic AI. Whether you're building customer service automation, research assistants, DevOps agents, content creation systems, or entirely new applications, the combination of NVIDIA NIM and AWS infrastructure provides the foundation for innovation.

Explore the documentation, review the architecture patterns, and let your creativity drive your solution. The next page will guide you through setting up your AWS environment and accessing NVIDIA NIM services.

Let's build the future of autonomous AI together!

# AWS Lab Environment

## Introduction

This lab environment has been custom-built for the NVIDIA AWS Agentic AI Hackathon. It provides dedicated AWS infrastructure to develop and deploy agentic AI applications using NVIDIA NIM services and AWS resources.

## Getting Started

- **Launching your lab session**
  1. Click "Start Lab" in the Vocareum interface to provision AWS account access.
  2. Wait for the status to show "Running/Ready" (typically ~30 seconds).
  3. Click "Open AWS Console" to access the AWS Management Console.

## Session Management

- **Active session duration**
  - Each lab session remains active for 8 hours from the time you start it.
  - A countdown timer in Vocareum shows your remaining time.

- **Extending your work time**
  - When a session expires, click "Start Lab" again to begin a new 8-hour session.
  - You can restart the lab as many times as needed during the hackathon.

- **Resource persistence**
  - When a session stops, active compute resources (EC2, SageMaker) are stopped, not terminated.
  - Your data, code, and configurations persist between sessions.
  - Resources resume their previous stopped state when you start a new session.

## Resource Constraints

- **Concurrent resource limits** (fair-use policy):
  - One active SageMaker instance OR one EKS cluster at any given time.
  - Plan your architecture accordingly to stay within these limits.

## Budget Awareness

- Each team has an allocated budget for AWS usage.
- Critical: Exhausting your budget terminates the account and cleans up all resources.
- Monitor spending via the "Cost and usage" section in Vocareum.
- Stop instances when not in use to optimize costs.

## Programmatic Access

- **AWS CLI and SDK access**
  1. In Vocareum, open the "Cloud access" section.
  2. Copy the displayed credentials (Access Key ID, Secret Access Key, Session Token).
  3. Configure them in your local shell:

```bash
export AWS_ACCESS_KEY_ID=<your-access-key>
export AWS_SECRET_ACCESS_KEY=<your-secret-key>
export AWS_SESSION_TOKEN=<your-session-token>
```

Note: Session credentials expire when your lab session ends. Retrieve fresh credentials after starting a new session.

- **EC2 SSH access** (pre-configured SSH keys available)
  1. In "Cloud access", download the SSH key: PPK (PuTTY on Windows) or PEM (OpenSSH on Linux/Mac).
  2. Set permissions on the key file:

```bash
chmod 400 <downloaded-key>.pem
```

  3. Connect to your EC2 instance:

```bash
ssh -i <downloaded-key>.pem ec2-user@<instance-public-ip>
```

## Best Practices

- Start sessions only when actively working to maximize 8-hour windows.
- Stop compute resources (SageMaker, EC2) when taking breaks.
- Monitor budget frequently to avoid unexpected termination.
- Regularly download important code and results as a backup.
- Test deployments early to validate against resource constraints.

## Support

If you encounter issues, see the Troubleshooting section in the hackathon docs or contact the support team via official channels.

# AWS Concurrency Limits & Resource Constraints

## Introduction

This AWS lab environment implements a controlled, cost-optimized infrastructure with certain concurrency management and resource constraints. The configuration provides access across compute, storage, analytics, machine learning, and serverless architectures.

## Compute Services

| Service | Parameter | Limit | Concurrency Check | Notes |
|---------|-----------|-------|-------------------|-------|
| EC2 | Concurrent instances | 2 | ✓ Enabled | Active fraud detection at 5 instances |
| CodeBuild | Concurrent builds | 2 | ✓ Enabled | Limited parallel build capacity |
| Lambda | Concurrent executions | 10 | ✓ Enabled | Throttles beyond 10 simultaneous invocations |

## Container Orchestration

| Service | Parameter | Limit | Concurrency Check | Notes |
|---------|-----------|-------|-------------------|-------|
| EKS | Max clusters | 1 | ✓ Enabled | Single Kubernetes cluster allowed |
| EKS | Max nodes | 2 | ✓ Enabled | Total worker nodes across cluster |

## Machine Learning Services

| Service | Parameter | Limit | Concurrency Check | Notes |
|---------|-----------|-------|-------------------|-------|
| SageMaker | Notebook instances | 1 | ✓ Enabled | Single development environment |
| SageMaker | App instances | 1 | ✓ Enabled | Studio apps or hosted applications |
| Bedrock | Input token limit | 10,000 | ✓ Enabled | Per-request foundation model input |
| Bedrock | Output token limit | 10,000 | ✓ Enabled | Per-request foundation model output |
| Bedrock | Image output limit | 0 | ✓ Enabled | Image generation disabled |
| Comprehend | Analysis job duration | 120 min | ✓ Enabled | Maximum runtime per NLP job |

## Data Analytics & ETL

| Service | Parameter | Limit | Concurrency Check | Notes |
|---------|-----------|-------|-------------------|-------|
| Glue | Max concurrent workers (Standard) | 1 | ✓ Enabled | DPU-based Spark workers |
| Glue | Max concurrent workers (G.1X) | 1 | ✓ Enabled | Memory-optimized workers |
| Glue | Max concurrent jobs | 1 | ✓ Enabled | Single ETL job at a time |

## Service Control Policy Constraints

### EC2 Instance Restrictions

- Allowed types: g6e.xlarge, g5.xlarge
- Tenancy: Default only (no dedicated hosts/instances)
- EBS volumes: Max 50GB, gp2 type only, zero provisioned IOPS

### SageMaker Restrictions

- Notebooks: ml.g5.xlarge, ml.g6e.xlarge for GPU workloads
- Training/Transform/Endpoints: ml.g5.xlarge, ml.g6e.xlarge for GPU workloads
- Hyperparameter tuning: Same instance restrictions apply

## Quick Reference Summary

| Category | Key Constraint | Impact |
|----------|----------------|--------|
| Compute | 2 EC2 instances, 10 Lambda executions | Small-scale distributed systems |
| ML Development | 1 SageMaker notebook, limited instance types | Individual development workflows |
| Data Processing | 1 concurrent Glue job, 1 worker | Sequential ETL pipelines |
| Containers | 1 EKS cluster, 2 nodes | Lightweight Kubernetes learning |
| Build Pipeline | 2 concurrent CodeBuild jobs | Limited CI/CD parallelism |
| GenAI | 10K Bedrock tokens (input/output) | Constrained LLM experimentation |
| Data Warehouse | 1-node Redshift cluster | Prototype analytics workloads |
| Storage | Unlimited S3, restricted EBS (50GB gp2) | Cloud-native data lake emphasis |

# Technical Resources

## Introduction

This page provides curated technical documentation, tutorials, sample code, and learning resources to accelerate your hackathon development.

## NVIDIA NIM Documentation

### Official NVIDIA NIM Resources

- NVIDIA NIM Platform: <https://build.nvidia.com/>
- Llama-3 1-nemotron-nano-8B-v1 Documentation: <https://build.nvidia.com/nvidia/llama-3-nemotron-nano-8b>
- NVIDIA Retrieval Embedding NIM: <https://build.nvidia.com/nvidia/embed-qa-4>
- NIM API Reference: <https://docs.nvidia.com/nim/>
- Model Cards and Performance Specs: Available on NVIDIA build platform

### Prompt Engineering for Agentic AI

- NVIDIA AI Playground: <https://build.nvidia.com/explore/>
- Prompt Engineering Guide: <https://www.promptingguide.ai/>
- LangChain Prompt Templates: <https://python.langchain.com/docs/modules/model_io/prompts/>
- Best Practices for Instruction Following: <https://platform.openai.com/docs/guides/prompt-engineering>

### Retrieval-Augmented Generation (RAG)

- NVIDIA RAG Best Practices: <https://developer.nvidia.com/blog/rag/>
- Building RAG Applications: <https://python.langchain.com/docs/use_cases/question_answering/>
- Vector Database Comparisons: <https://www.pinecone.io/learn/vector-database/>
- Embedding Model Selection Guide: <https://huggingface.co/blog/mteb>

## AWS Service Documentation

### Amazon EKS (Kubernetes Deployment)

- Amazon EKS User Guide: <https://docs.aws.amazon.com/eks/latest/userguide/>
- EKS Getting Started: <https://docs.aws.amazon.com/eks/latest/userguide/getting-started.html>
- EKS Best Practices Guide: <https://aws.github.io/aws-eks-best-practices/>
- Managing EKS Clusters with eksctl: <https://eksctl.io/>
- Kubernetes Documentation: <https://kubernetes.io/docs/home/>

### Amazon SageMaker (ML Deployment)

- SageMaker Developer Guide: <https://docs.aws.amazon.com/sagemaker/latest/dg/>
- SageMaker Inference Endpoints: <https://docs.aws.amazon.com/sagemaker/latest/dg/deploy-model.html>
- Real-time Inference Best Practices: <https://docs.aws.amazon.com/sagemaker/latest/dg/best-practices.html>
- SageMaker Python SDK: <https://sagemaker.readthedocs.io/>
- Custom Container Deployment: <https://docs.aws.amazon.com/sagemaker/latest/dg/your-algorithms.html>

### AWS Lambda (Serverless Functions)

- Lambda Developer Guide: <https://docs.aws.amazon.com/lambda/latest/dg/>
- Lambda Best Practices: <https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html>
- Lambda Container Images: <https://docs.aws.amazon.com/lambda/latest/dg/images-create.html>
- Lambda Layers: <https://docs.aws.amazon.com/lambda/latest/dg/configuration-layers.html>
- Boto3 (AWS SDK for Python): <https://boto3.amazonaws.com/v1/documentation/api/latest/index.html>

### Amazon API Gateway

- API Gateway Developer Guide: <https://docs.aws.amazon.com/apigateway/latest/developerguide/>
- REST API Design: <https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-rest-api.html>
- WebSocket APIs: <https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html>
- API Gateway Lambda Integration: <https://docs.aws.amazon.com/apigateway/latest/developerguide/getting-started-with-lambda-integration.html>

### Amazon DynamoDB

- DynamoDB Developer Guide: <https://docs.aws.amazon.com/dynamodb/latest/developerguide/>
- DynamoDB Best Practices: <https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html>
- DynamoDB Data Modeling: <https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/data-modeling.html>
- NoSQL Workbench for DynamoDB: <https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/workbench.html>

### Amazon S3 (Object Storage)

- S3 User Guide: <https://docs.aws.amazon.com/s3/latest/userguide/>
- S3 Security Best Practices: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html>
- S3 Cost Optimization: <https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-costs.html>
- Boto3 S3 Examples: <https://boto3.amazonaws.com/v1/documentation/api/latest/guide/s3-examples.html>

### AWS EventBridge (Event-Driven Architecture)

- EventBridge User Guide: <https://docs.aws.amazon.com/eventbridge/latest/userguide/>
- EventBridge Patterns: <https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-event-patterns.html>
- Event-Driven Architecture: <https://aws.amazon.com/event-driven-architecture/>
- EventBridge with Lambda: <https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-run-lambda-schedule.html>

### Amazon CloudWatch (Monitoring)

- CloudWatch User Guide: <https://docs.aws.amazon.com/cloudwatch/latest/monitoring/>
- CloudWatch Logs: <https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/>
- CloudWatch Metrics: <https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/working_with_metrics.html>
- CloudWatch Dashboards: <https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Dashboards.html>

### AWS IAM (Security and Access Control)

- IAM User Guide: <https://docs.aws.amazon.com/iam/latest/userguide/>
- IAM Best Practices: <https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html>
- IAM Policy Examples: <https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_examples.html>
- Least Privilege Permissions: <https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege>

## Sample Code Repositories

### NVIDIA NIM Integration Examples

- NVIDIA NIM Quickstart: <https://github.com/NVIDIA/nim-deploy>
- LangChain with NVIDIA NIM: <https://github.com/langchain-ai/langchain/tree/master/docs/docs/integrations/providers/nvidia>
- RAG Implementation Samples: <https://github.com/NVIDIA/GenerativeAIExamples>

### AWS Agentic AI Examples

- AWS Bedrock Agents: <https://github.com/aws-samples/amazon-bedrock-samples>
- LangChain AWS Integration: <https://github.com/langchain-ai/langchain-aws>
- Serverless AI Applications: <https://github.com/aws-samples/serverless-patterns>

### Infrastructure as Code Templates

- AWS CDK Examples: <https://github.com/aws-samples/aws-cdk-examples>
- Terraform AWS Modules: <https://github.com/terraform-aws-modules>
- CloudFormation Templates: <https://github.com/awslabs/aws-cloudformation-templates>

### Full-Stack AI Applications

- Streamlit AI Apps: <https://github.com/streamlit/streamlit>
- Gradio Interfaces: <https://github.com/gradio-app/gradio>
- FastAPI Backend Examples: <https://github.com/tiangolo/fastapi>

## Tutorial Videos and Guides

### NVIDIA NIM Tutorials

- NVIDIA NIM Overview and Setup (YouTube): Search for "NVIDIA NIM tutorial"
- Deploying NIM on Kubernetes: NVIDIA Developer Blog
- RAG with NVIDIA Embedding Models: NVIDIA AI Podcast

### AWS Learning Paths

- AWS Training and Certification: <https://aws.amazon.com/training/>
- AWS Skill Builder: <https://explore.skillbuilder.aws/>
- AWS Workshops: <https://workshops.aws/>
- AWS Well-Architected Labs: <https://wellarchitectedlabs.com/>

### Agentic AI Concepts

- Building Autonomous AI Agents: YouTube tutorials on LangChain agents
- ReAct Framework: <https://arxiv.org/abs/2210.03629>
- Tool-Using AI Systems: OpenAI Function Calling guides
- AI Agent Design Patterns: Multiple resources on Medium and dev.to

## Development Tools and Frameworks

### AI Development Frameworks

- LangChain: <https://www.langchain.com/>
- LlamaIndex: <https://www.llamaindex.ai/>
- Semantic Kernel: <https://learn.microsoft.com/en-us/semantic-kernel/>
- AutoGen: <https://microsoft.github.io/autogen/>

### Containerization and Deployment

- Docker Documentation: <https://docs.docker.com/>
- Docker Compose: <https://docs.docker.com/compose/>
- Kubernetes Tutorials: <https://kubernetes.io/docs/tutorials/>
- Helm Charts: <https://helm.sh/docs/>

### API Development

- FastAPI Documentation: <https://fastapi.tiangolo.com/>
- Flask Documentation: <https://flask.palletsprojects.com/>
- Node.js Express: <https://expressjs.com/>

### Testing and Quality Assurance

- pytest for Python: <https://docs.pytest.org/>
- Locust for Load Testing: <https://locust.io/>
- AWS X-Ray for Tracing: <https://docs.aws.amazon.com/xray/latest/devguide/>

## Community Resources and Forums

### NVIDIA Developer Forums

- NVIDIA Developer Forums: <https://forums.developer.nvidia.com/>
- NVIDIA AI Community: <https://www.nvidia.com/en-us/ai-data-science/community/>

### AWS Community

- AWS re:Post (Q&A): <https://repost.aws/>
- AWS Developer Forums: <https://forums.aws.amazon.com/>
- AWS Subreddit: <https://www.reddit.com/r/aws/>
- Stack Overflow AWS Tags: <https://stackoverflow.com/questions/tagged/amazon-web-services>

### AI/ML Communities

- Hugging Face Community: <https://huggingface.co/>
- Papers with Code: <https://paperswithcode.com/>
- AI Alignment Forum: <https://www.alignmentforum.org/>
- r/MachineLearning: <https://www.reddit.com/r/MachineLearning/>

### DevPost Hackathon Resources

- DevPost How-To Guides: <https://help.devpost.com/>
- Hackathon Tips: Check DevPost blog for submission best practices
- Past Winning Projects: Browse DevPost for inspiration

## Responsible AI Resources

### AWS Responsible AI

- AWS Responsible AI: <https://aws.amazon.com/machine-learning/responsible-ai/>
- AI Service Cards: <https://aws.amazon.com/machine-learning/responsible-machine-learning/ai-service-cards/>
- Fairness in ML: <https://docs.aws.amazon.com/sagemaker/latest/dg/clarify-fairness-and-explainability.html>

### NVIDIA AI Ethics

- NVIDIA AI Ethics: <https://www.nvidia.com/en-us/about-nvidia/ethics/>
- Responsible AI Toolkit: NVIDIA developer resources

### General AI Safety

- AI Ethics Guidelines: <https://ai-ethics.com/>
- Algorithmic Fairness: <https://fairmlbook.org/>
- AI Transparency: Partnership on AI resources

## Quick Reference Cheat Sheets

### AWS CLI Common Commands

```bash
aws sts get-caller-identity
aws s3 ls
aws lambda list-functions
aws eks list-clusters
aws sagemaker list-endpoints
aws cloudwatch get-metric-statistics
aws iam list-users
aws ec2 describe-instances
```

### kubectl Common Commands

```bash
kubectl get pods
kubectl get services
kubectl describe deployment
kubectl logs <pod-name>
kubectl exec -it <pod-name> -- /bin/bash
kubectl apply -f deployment.yaml
kubectl delete -f deployment.yaml
```

### Docker Common Commands

```bash
docker build -t myapp .
docker run -p 8080:8080 myapp
docker ps
docker logs <container-id>
docker exec -it <container-id> /bin/bash
docker images
docker rmi <image-id>
```

## Staying Updated

### Follow for Latest Updates

- NVIDIA Developer Blog: <https://developer.nvidia.com/blog/>
- AWS News Blog: <https://aws.amazon.com/blogs/aws/>
- AWS What's New: <https://aws.amazon.com/new/>
- DevPost Event Page: <https://nvidia-aws.devpost.com/>

### Newsletters and Podcasts

- NVIDIA AI Podcast
- AWS Podcast
- The TWIML AI Podcast
- Lex Fridman Podcast (AI topics)

## Getting Help

### During the Hackathon

- Check the DevPost discussion forum first
- Review AWS documentation thoroughly
- Search Stack Overflow and AWS re:Post
- Ask specific technical questions with error details
- Join office hours if available (check event schedule)

### Debugging Resources

- AWS CloudWatch Logs for error messages
- AWS X-Ray for distributed tracing
- kubectl logs for EKS deployments
- SageMaker CloudWatch logs for endpoint issues
- Browser developer tools for frontend issues

Remember: The best resource is hands-on experimentation. Don't just read documentation - try things, break things, and learn from the experience. That's what hackathons are all about!
