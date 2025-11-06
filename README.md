<p align="center">
  <img src="docs/attachments/takopi.svg" alt="Takoping Logo" width="200" />
</p>

# Takoping

> AI-assisted developer onboarding that explains unfamiliar repositories through interactive diagrams, guided tours, and agentic exploration.

## Table of Contents
- [Takoping](#takoping)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
  - [The Problem](#the-problem)
  - [Core Capabilities](#core-capabilities)
  - [Architecture at a Glance](#architecture-at-a-glance)
  - [AWS \& NVIDIA Stack](#aws--nvidia-stack)
  - [Documentation Map](#documentation-map)
  - [Getting Started](#getting-started)
  - [Deployment Workflow](#deployment-workflow)
    - [1. Provision EKS \& Deploy NIM](#1-provision-eks--deploy-nim)
    - [2. Build \& Push Application Images](#2-build--push-application-images)
    - [3. Deploy the Application Stack](#3-deploy-the-application-stack)

## Overview

Takoping shortens the time it takes engineers to understand a new codebase. Drawing from the requirements in `docs/PRD.md`, the application combines an infinite-canvas repository visualizer, contextual code exploration, and an autonomous tutor agent powered by NVIDIA NIM services. The project is built for the **Agentic AI Unleashed: AWS & NVIDIA Hackathon** and satisfies the event requirements outlined in `docs/hackathon-description.md` by deploying both a llama-3 1-nemotron-nano-8B-v1 reasoning service and at least one Retrieval Embedding NIM on AWS infrastructure.

## The Problem

New developers lose 2–3 days manually exploring unfamiliar repositories. Teams face undocumented architectural patterns, knowledge-transfer bottlenecks, and inconsistent onboarding that leads to pattern drift and slower progress on a project.

Takoping turns those pain points into an interactive explained experience, giving every newcomer the same guided understanding of the codebase from day one.

## Core Capabilities

- **Interactive Repository Visualizer:** Infinite canvas with zoom/pan, layered overlays, and irregularity detection for monorepo vs. microservice patterns (`docs/PRD.md`).
- **Contextual Code Viewer:** Linked file previews, syntax highlighting, and click-through navigation aligned with the visual map.
- **Intelligent Chat Interface:** Agent answers questions, expands relevant sections of the diagram, and can generate new explanatory views on demand.
- **Smart Documentation Generation:** Auto-builds “common tasks,” naming conventions, and architecture write-ups by analyzing source patterns.
- **Tutor/Guide Agent:** Creates guided tours such as “How do I add an API endpoint?” and replays them for onboarding consistency.
- **Architectural Pattern Detection:** Flags pattern violations, surfaces dependencies, and recommends refactors.

## Architecture at a Glance

The current production deployment (documented in `docs/deployment-architecture.md`) runs entirely on Amazon EKS using two GPU-backed nodes to stay within hackathon limits:

```
EKS Cluster (2x g6e.xlarge)
├── Node 1 (role=llm)
│   └── LLM NIM (LoadBalancer)
└── Node 2 (role=app)
    ├── Bun Server
    ├── PostgreSQL
    ├── ChromaDB
    └── Nginx Vite Frontend (LoadBalancer)

External: NVIDIA Integrate API for embeddings
```

Key decisions are explained in the architecture document, including cost profiles (~$280/week during the hackathon) and rejected alternatives that violated the two-EC2-instance constraint.

## AWS & NVIDIA Stack

- **Primary LLM:** NVIDIA NIM `llama-3 1-nemotron-nano-8B-v1` deployed as an inference microservice on EKS.
- **Embeddings:** Retrieval Embedding NIM (hosted in the same cluster) or NVIDIA’s public Integrate API, depending on workload.
- **Server Runtime:** Bun-based backend exposing agent tools and WebSocket streaming.
- **Database Layer:** PostgreSQL for relational metadata plus ChromaDB for vector search (see `docs/PRD.md` §8.2).
- **Client:** Vite + TypeScript + React Flow + Shadcn UI for the infinite canvas experience.

## Documentation Map

All deployment and product docs live under `docs/`:

- `docs/eks-setup-guide.md` – Provisioning the EKS cluster, labeling nodes, and deploying the NIM services.
- `docs/eks-full-deployment-guide.md` – Building container images, configuring secrets, and rolling out the full application stack.
- `docs/eks-redeployment-guide.md` – Cleaning up and redeploying after cluster resets.
- `docs/deployment-architecture.md` – Rationale, topology, and cost breakdowns.
- `docs/PRD.md` – Product requirements, personas, feature priorities, and metrics.
- `docs/hackathon-description.md` – Hackathon rules, judging criteria, and submission expectations.

## Getting Started

1. **Review the architecture:** Read `docs/deployment-architecture.md` to understand the two-node EKS design and service boundaries.
2. **Confirm prerequisites:** Install AWS CLI, `eksctl`, `kubectl`, Docker, and ensure you have NVIDIA NGC credentials as listed in `docs/eks-setup-guide.md` (Step 0).
3. **Decide your environment:** Local development uses Bun + Vite against Ollama or NIM endpoints (`docs/PRD.md` §5.3). Production deployments target the AWS/EKS stack below.

## Deployment Workflow

### 1. Provision EKS & Deploy NIM

Follow Sections 1–5 of `docs/eks-setup-guide.md` to create the `g6e.xlarge` cluster, install the NVIDIA GPU operator, and expose the llama-3 NIM through a LoadBalancer. Label nodes for dedicated workloads:

```bash
kubectl label nodes <LLM_NODE> role=llm --overwrite
kubectl label nodes <APP_NODE> role=app --overwrite
```

### 2. Build & Push Application Images

Use the helper script from `docs/eks-full-deployment-guide.md` to build for `linux/amd64` and push to Amazon ECR:

```bash
AWS_REGION=us-east-1 API_BASE="" infrastructure/k8s/build_push.sh
```

### 3. Deploy the Application Stack

Apply Kubernetes manifests (namespace, secrets, PostgreSQL, ChromaDB, server, web) as described in `docs/eks-full-deployment-guide.md` Steps 6–9. Secrets must include NIM endpoints and the NVIDIA Integrate API key for embeddings fallbacks.
