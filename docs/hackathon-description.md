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
