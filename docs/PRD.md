# Takoping - Product Requirements Document

## 1. Executive Summary

**Product Name:** Takoping  
**Vision:** Accelerate developer onboarding by providing AI-powered repository visualization and analysis  
**Target Users:** Software engineers joining new projects, team leads onboarding developers, code reviewers  

## 2. Problem Statement

### Current Pain Points

- **Context Switching Overhead**: Developers spend 2-3 days understanding repository structure when joining new projects
- **Hidden Patterns**: Subtle architectural patterns and conventions are not immediately visible
- **Knowledge Transfer Bottleneck**: Senior developers spend significant time explaining codebase organization
- **Inconsistent Onboarding**: Each developer discovers patterns differently, leading to inconsistent understanding

### Impact

- **Time to Productivity**: 40% longer onboarding time for complex repositories
- **Code Quality**: New developers may introduce anti-patterns due to lack of context
- **Team Velocity**: Reduced team velocity during onboarding periods

## 3. Solution Overview

Takoping is an AI-powered developer onboarding platform that provides intelligent repository visualization and analysis tools that will accelerate developer onboarding and reduce context-switching time for developers that struggle to quickly understand complex codebase structures and architectural patterns when joining new projects.

## 4. Core Features

### 4.1 Interactive Repository Visualizer

**Priority:** P0 (Must Have)

- **Main Canvas**: Interactive infinite canvas showing repository structure
- **Visual Nodes**: Color-coded sections for different architectural components
- **Interactive Layers**: Toggle-able layers for different types of information
- **Zoom & Pan**: Navigate large repositories efficiently

### 4.2 Contextual Code Viewer

**Priority:** P0 (Must Have)

- **Side-by-side Integration**: Code viewer alongside visualizer
- **Highlighted Sections**: Code sections that correspond to visualizer nodes
- **Click-through Navigation**: Navigate from visualizer to actual code
- **Syntax Highlighting**: Language-specific code formatting

### 4.3 Intelligent Chat Interface

**Priority:** P0 (Must Have)

- **Contextual Responses**: Answers that reference specific visualizer sections
- **Visual Answers**: Given answers will show visually the relevant nodes to it
- **Progressive Disclosure**: Start simple, drill down as needed
- **“Take me there”**: The agent can navigate the canvas, open file ranges, and, when helpful, automatically create a new diagram/tab that better explains the concept (e.g., data flow for a feature or architecture slice), then focus the view there

### 4.4 Smart Documentation Generation

**Priority:** P0 (Must Have)

- **Tech stack**: Tech used, libraries used
- **Auto-generated Guides**: Based on actual code patterns
- **"Common tasks"**: With real examples from the codebase
- **Development Standards**: Extracted from code patterns

### 4.5 Contextual Tooltips & Overlays

**Priority:** P1 (Should Have)

- All of these features you right click and see it on the small menu
- **Explain**: "This service handles authentication, uses JWT tokens...", then have option to add to chat
- **Click Details**: "This follows the Repository pattern, here's how to use it..."
- **Dependency Mapping**: "This depends on these services, here's the data flow..."

### 4.6 Architectural Pattern Detection

**Priority:** P1 (Should Have)

- **Pattern Recognition**: MVC, microservices, clean architecture detection
- **Anti-pattern Alerts**: Identify potential issues and violations
- **Consistency Checks**: Ensure patterns are followed consistently
- **Refactoring Suggestions**: Recommend improvements based on patterns

### 4.7 Tutor/Guide Agent

**Priority:** P0 (Must Have)

- **Guided Tours**: Converts questions like “How do I add an API endpoint?” into step-by-step tours that animate the canvas and open the right code spans
- **Auto-Diagramming**: Determines when a new diagram/tab is needed to explain an answer (e.g., feature data flow, module lifecycle, cross-service interaction), generates it, names it, and persists it for reuse
- **Agentic Navigation**: Executes UI actions (focus/expand nodes, highlight dependencies/flows, open file ranges) as part of the explanation
- **Replay & Share**: Tours can be replayed, edited, and shared with teammates

## 5. Technical Requirements

### 5.1 AI/ML Components

- **Primary LLM:** llama-3 1-nemotron-nano-8B-v1 (NVIDIA NIM)
- **Embedding Model:** Retrieval Embedding NIM
- **Deployment:** Amazon EKS or SageMaker AI endpoint
- **Pattern Recognition:** Custom models for architectural pattern detection
- **Client SDK:** Vercel AI SDK for agent tool-use and provider routing (supports local Ollama and custom NIM endpoints)

### 5.2 Integration Requirements

- **GitHub API Integration:** Full repository access
- **Real-time Updates:** Webhook integration for live updates
- **Authentication:** GitHub OAuth integration
- **Rate Limiting:** Respect GitHub API limits

### 5.3 Environments & Configuration

- **Local Development (Default):**
  - Vector DB: Chromadb running locally (Docker or native) with seed/test collections
  - LLM: Ollama on developer LAN tower for fast iteration; model selection via env (e.g., `OLLAMA_MODEL=llama3:8b`)
  - Backend: Bun server with hot reload; `.env` controls local services
  - Switching: Single env toggle (`AI_PROVIDER=ollama|nim`, `CHROMA_URL`, `LLM_BASE_URL`) to swap between local and AWS
- **AWS (Staging/Prod):**
  - Vector DB: Chromadb on EC2 with EBS-backed storage (or managed alternative later)
  - LLMs: NVIDIA NIM endpoints on SageMaker (primary LLM + embeddings NIM)
  - Networking: VPC + Security Groups; HTTPS termination via ALB or CloudFront
  - Secrets: AWS Secrets Manager for API keys and model endpoints

### 5.4 Deployment Plan (High Level)

- **Manual First:**
  - Provision EC2 for Bun backend and Chromadb; deploy NIM endpoints on SageMaker
  - Configure DNS/SSL; wire env variables to point frontend/backend to AWS services
- **Infrastructure as Code (Follow-up):**
  - Terraform modules for VPC, EC2, Security Groups, IAM roles/policies, SageMaker endpoints, and DNS records
  - Outputs expose service URLs; variables mirror local `.env` for easy switching

## 6. User Stories

### 6.1 Primary User Stories

1. **As a new developer**, I want to see a visual overview of the repository structure so I can understand the codebase organization quickly
2. **As a new developer**, I want to ask "How do I add a new user feature?" and get a step-by-step guide with real code examples
3. **As a new developer**, I want to click on a service in the visualizer and see its code, dependencies, and how it's used
4. **As a new developer**, I want to understand the development workflow - how to test, deploy, and contribute code
5. **As a new developer**, I want to see how similar features were implemented so I can follow the same patterns
6. **As a new developer**, when I ask a question, the agent can create a new diagram/tab that illustrates the answer (e.g., data flow or architecture slice) and navigate me through it

### 6.2 Secondary User Stories

1. **As a new developer**, I want to take a guided tour of "How to add a new API endpoint" with real examples
2. **As a new developer**, I want to hover over components to see what they do and how they're connected
3. **As a team lead**, I want to generate onboarding documentation automatically from repository analysis
4. **As a code reviewer**, I want to identify architectural violations before they become problems
5. **As a developer**, I want to compare architectural patterns across different repositories

## 7. Success Metrics

### 7.1 Primary Metrics

- **Onboarding Time Reduction:** 50% reduction in time to understand repository structure
- **Developer Satisfaction:** 4.5+ rating on onboarding experience
- **Pattern Recognition Accuracy:** 90%+ accuracy in architectural pattern detection
- **Query Success Rate:** 95%+ successful resolution of developer questions

### 7.2 Secondary Metrics

- **Usage Frequency:** Daily active usage by 80% of new team members
- **Feature Adoption:** 70%+ usage of conversational interface
- **Time to First Contribution:** 30% reduction in time to first meaningful code contribution

## 8. Technical Architecture

### 8.1 Frontend

- **Framework:** Vite with TypeScript
- **Canvas Engine:** React flow
- **State Management:** Jotai
- **UI Components:** Shadcn
- **Layout:** Two-panel layout (Visualizer, Code Viewer/Chat)
- **Interactive Elements:** tooltips, name of repo on top left, zoom in and out button in bottom left

### 8.2 Backend

- **Bun backend:** Bun server (EC2)
- **Database:** Chromadb as vector db (ec2 instance)
- **AI model:** NVIDIA NIM microservice llama-3 1-nemotron-nano-8B-v1 large language reasoning mode as an endpoint (sagemaker)
- **Embeddings model:** Retrieval embedding NIM as an endpoint (sagemaker)
- **AI client SDK:** Vercel AI SDK for model/agent interactions (providers: Ollama local, custom NIM endpoint)
- **Real-time Updates:** WebSocket connections for live updates using Bun's native WebSocket API

### 8.3 AI/ML Pipeline

- **Repository Analysis:** Batch processing for initial analysis
- **Real-time Processing:** Stream processing for updates
- **Embedding Storage:** Vector database for semantic search
- **Code Generation:** AI-powered example generation
- **Workflow Analysis:** Understanding development patterns

### 8.4 Interactive Features

- **Tour Creation:** Automated guided tour generation driven by the Tutor/Guide agent
- **Contextual Help:** Real-time assistance based on code context with visual grounding
- **Pattern Recognition:** Identifying and explaining code patterns
- **Agent-Decided Diagrams:** The agent decides when to generate a new diagram/tab to better convey an explanation and links the answer to that view

### 8.5 Diagram Generation and Level-of-Detail (LoD)

- **Inspiration:** Based on the tree-walking approach of GitHub’s repo-visualizer (file system → folder/file tree → diagram), but rendered as an interactive canvas rather than a static SVG, with zoom-aware detail.
- **Input Acquisition:**
  - Local checkout or GitHub API tree listing to build a directory tree; respects ignore rules (e.g., `.gitignore`, default excludes like `node_modules`, build artifacts).
  - Configurable `root_path`, `excluded_paths`, and `excluded_globs` to scope the visualization.
- **Tree Construction:**
  - Build a hierarchical model: Repository → Directories → Subdirectories/Files.
  - Compute per-node metrics (e.g., cumulative size, file count, recent change count) for layout weighting and overlays.
- **Layout:**
  - Use a squarified treemap per directory level to allocate screen area proportionally (e.g., by cumulative size or file count).
  - Each directory is a container; children are packed within its bounds; edges are not drawn—spatial containment communicates hierarchy.
- **Rendering Pipeline:**
  - Map nodes to React Flow (or custom canvas) rectangles with labels, badges, and optional color-coding by type/extension.
  - Virtualize rendering (only draw items in viewport) and memoize layout for snappy pan/zoom.
- **Zoom-Based Level-of-Detail:**
  - Define a per-depth minimum pixel area threshold (e.g., `minArea[depth]`) and/or minimum visible side length.
  - A folder must exceed its threshold to reveal its subfolders/files; otherwise it renders as a filled block with an aggregate label (e.g., “src (112 files)”).
  - On zoom-in, progressively reveal child nodes with smooth transitions; on zoom-out, aggregate back into the parent to reduce clutter.
  - When aggregated, show summary tooltips (file types distribution, recent changes) and allow “focus/expand” on click.
- **Interaction & Agent Actions:**
  - Pan/zoom, hover tooltips, right-click context menu; agent can programmatically `focusNode`, `expandPath`, or `openFileRange`.
  - Agent may re-weight layout temporarily (e.g., emphasize files relevant to the current explanation) and create new diagram tabs with filtered/alternate weightings.
- **Incremental Updates:**
  - On webhook/refresh, rebuild changed subtrees and reuse cached layouts for unaffected branches.
  - Persist diagram presets (weighting choice, filters, color rules) per repo.
- **Performance Considerations:**
  - Cap node count per view via LoD thresholds, virtualize DOM, and debounce zoom events.
  - Precompute metrics and chunk large trees; lazy-load deep branches when first revealed.

## Cool ideas and could be implemented in the future

- Switch branch -> Can allow the user to switch the current branch
- Detect problems and open up issues / prs for it
- Open in cursor -> generate the code you want clearly illustrated to the developer then allow the developer to apply it in cursor

## 9. Design

![UI Wireframe](ui.png)

---

## Questions about design

- Should there only be one diagram with the only the files or show multiple for the user?
- I could either have presets, or allow ai to help make your own
- For example, have by default the repository structure one, then you can ask ai to make a new one based on a specific arhitecture (like show me how the data flow works for this feature in the app) then make a new tab / diagram of that one
- The agent can generate additional diagrams/tabs on-demand to best explain a concept, besides the default repository structure view
