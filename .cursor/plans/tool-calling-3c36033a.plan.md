<!-- 3c36033a-b0fa-4265-874c-6cbb345a1e1d c0a344c6-b611-4386-aec2-bdebf4312a61 -->
# Tool Calling Architecture for Diagram Generation

## Overview

Implement an AI agent using Vercel AI SDK's `Agent` class that can automatically generate, update, and query **file tree diagrams** based on natural language user requests. The agent will use structured tools to interact with the existing diagram generation system.

**Current Scope**: File structure visualization only (hierarchical file/folder trees)

**Future Enhancement**: Dependency graphs and data flow diagrams (to be added after initial implementation)

## Architecture Approach

Use Vercel AI SDK's `Experimental_Agent` class which handles:

- **Loop management**: Automatically manages multi-step tool calling
- **Context management**: Maintains conversation history and tool results
- **Stopping conditions**: Determines when the task is complete

Reference: https://ai-sdk.dev/docs/agents/overview#agents

This is simpler than manually managing tool calls with `streamText` and reduces boilerplate.

## Tool Definitions (File Tree Focus)

### Tool 1: `createDiagram`

**Purpose**: Generate a new file tree diagram/visualization of the codebase with customizable filters and layout options.

**Scope**: File structure visualization only (hierarchical file/folder trees based on paths from PostgreSQL `file_tree_nodes` table).

**When Triggered** (User Intent Examples):

- "Create a diagram of the TypeScript files"
- "Show me a visualization of the src folder"
- "Generate a diagram showing only Python files"
- "Visualize the backend architecture" (shows file structure)
- "Make a diagram of the API folder"
- "Show me the file structure excluding test files"

**Parameters**:

```typescript
{
  owner: string,              // Repository owner
  repo: string,               // Repository name
  name: string,               // Diagram title (e.g., "TypeScript Source Files")
  description?: string,       // Human-readable description
  filters?: {
    pathPatterns?: string[],  // e.g., ["src/**", "lib/**"]
    excludePaths?: string[],  // e.g., ["**/*.test.ts", "node_modules/**"]
    languages?: string[],     // e.g., ["typescript", "python"]
    maxDepth?: number,        // Maximum tree depth (default: 7)
  },
  layoutType?: "hierarchical" | "treemap"  // Currently only hierarchical is implemented
}
```

**Returns**:

```typescript
{
  diagramId: string,
  name: string,
  nodes: ReactFlowNode[],    // Array of diagram nodes
  edges: ReactFlowEdge[],    // Array of parent-child connections
  stats: {
    nodeCount: number,
    fileCount: number,
    directoryCount: number,
    totalSize: number
  },
  action: {
    type: "CREATE_DIAGRAM_TAB",
    diagramId: string,
    name: string
  }
}
```

**Implementation**:

1. Calls `getFileTreeForReactFlow(ownerRepo, { maxDepth })` to get all nodes
2. Applies client-side filters (pathPatterns, excludePaths, languages)
3. Filters edges to only include connections between remaining nodes
4. Saves preset using `saveDiagramPreset()` for persistence
5. Returns nodes, edges, and action instruction

---

### Tool 2: `queryFileTree`

**Purpose**: Answer questions about the repository structure, statistics, and file organization without generating a full diagram.

**When Triggered** (User Intent Examples):

- "How many TypeScript files are in the src folder?"
- "What's the total size of the backend directory?"
- "List all Python files in the project"
- "What languages are used in this repository?"
- "How deep is the file tree?"
- "Which folder has the most files?"

**Parameters**:

```typescript
{
  owner: string,
  repo: string,
  query: string,              // Natural language query
  filters?: {
    pathPatterns?: string[],
    languages?: string[],
    maxDepth?: number
  }
}
```

**Returns**:

```typescript
{
  summary: {
    totalFiles: number,
    totalDirectories: number,
    languages: Record<string, number>,  // e.g., { "typescript": 45, "python": 12 }
    totalSize: number,
    maxDepth: number,
    largestFolder?: string
  },
  matchingNodes?: Array<{
    path: string,
    type: "file" | "directory",
    size: number,
    language?: string
  }>,
  answer: string              // Natural language answer to the query
}
```

**Implementation**:

1. Queries PostgreSQL `file_tree_nodes` table with SQL filters
2. Aggregates statistics (COUNT, SUM, GROUP BY)
3. Formats results as natural language answer
4. Returns structured data + answer text

---

### Tool 3: `updateDiagramFilters`

**Purpose**: Modify an existing diagram's filters without regenerating from scratch.

**When Triggered** (User Intent Examples):

- "Hide the test files from this diagram"
- "Show only files larger than 1KB"
- "Remove the node_modules folder"
- "Increase the depth to level 10"
- "Filter to show only JavaScript files"
- "Exclude all configuration files"

**Parameters**:

```typescript
{
  diagramId: string,          // ID of the diagram to update
  filters: {
    pathPatterns?: string[],
    excludePaths?: string[],
    languages?: string[],
    maxDepth?: number
  },
  additive?: boolean          // If true, adds to existing filters; if false, replaces them
}
```

**Returns**:

```typescript
{
  diagramId: string,
  nodes: ReactFlowNode[],
  edges: ReactFlowEdge[],
  appliedFilters: object,
  stats: {
    nodeCount: number,
    fileCount: number
  },
  action: {
    type: "UPDATE_DIAGRAM",
    diagramId: string
  }
}
```

**Implementation**:

1. Retrieves existing diagram preset from database
2. Merges or replaces filters based on `additive` parameter
3. Regenerates nodes/edges with new filters
4. Updates preset in database
5. Returns updated diagram data

---

## Auto-Save UX Flow (Context-Aware)

**Persistence Strategy**: All diagrams are immediately saved as presets when created. Filter updates auto-save instantly.

**How Context-Awareness Works:**

1. Client tracks which diagram tab is currently active/visible
2. Client sends `activeDiagramId` (or `null`) with each chat request
3. When user says "hide test files", agent calls `updateDiagramFilters` with the active diagram ID
4. Tool updates the preset in database and returns new nodes/edges
5. Client receives update and re-renders the diagram
6. **No save button needed** - changes are immediately persisted

**Message Format from Client:**

```typescript
{
  messages: [...],
  owner: "facebook",
  repo: "react",
  activeDiagramId: "preset-123" // or null if no diagram is active
}
```

**Agent Logic:**

- If user requests diagram update and `activeDiagramId` is present, use it
- If user says "create diagram", always create new (ignore activeDiagramId)
- If user asks question, use `queryFileTree` (doesn't need diagram ID)

---

## User Intent Flow Examples

### Flow 1: Simple Diagram Creation

```
User: "Create a diagram of the TypeScript files"

Agent Process:
1. Recognizes diagram creation intent
2. Calls createDiagram tool with:
   - owner: "facebook"
   - repo: "react"
   - filters.languages: ["typescript"]
   - name: "TypeScript Files"
   - maxDepth: 7 (default)
3. Tool executes, returns nodes/edges
4. Agent responds: "I've created a diagram showing all TypeScript files 
   in the repository. It includes 47 files across 8 directories."
5. Client receives CREATE_DIAGRAM_TAB action and renders new tab
```

### Flow 2: Filtered Diagram with Exclusions

```
User: "Show me the src folder but exclude test files"

Agent Process:
1. Recognizes diagram creation with filters
2. Calls createDiagram tool with:
   - filters.pathPatterns: ["src/**"]
   - filters.excludePaths: ["**/*.test.ts", "**/*.spec.ts"]
   - name: "Source Files (No Tests)"
3. Tool returns filtered nodes
4. Agent responds with stats and creates diagram tab
```

### Flow 3: Information Query (No Diagram)

```
User: "How many Python files are in the backend?"

Agent Process:
1. Recognizes structural question (not diagram request)
2. Calls queryFileTree tool with:
   - query: "How many Python files are in the backend?"
   - filters.pathPatterns: ["backend/**"]
   - filters.languages: ["python"]
3. Tool returns: { summary: { totalFiles: 23 }, answer: "..." }
4. Agent responds: "There are 23 Python files in the backend directory, 
   totaling approximately 45KB."
5. No diagram created
```

### Flow 4: Multi-Step Interaction

```
User: "Create a diagram of the API folder"
Agent: [Creates diagram with createDiagram]
Agent: "I've created a diagram of the API folder with 34 files."

User: "Now remove any TypeScript definition files"
Agent: [Calls updateDiagramFilters with excludePaths: ["**/*.d.ts"]]
Agent: "I've updated the diagram to exclude definition files. 
       Now showing 28 files."
```

### Flow 5: Exploratory Question Then Visualization

```
User: "What's the largest folder in the project?"
Agent: [Calls queryFileTree]
Agent: "The src folder is the largest with 156 files (2.3MB)."

User: "Show me that folder as a diagram"
Agent: [Calls createDiagram with filters.pathPatterns: ["src/**"]]
Agent: "I've created a diagram of the src folder."
```

---

## Implementation Steps

### 1. Create Tool Definitions (`server/src/ai/tools/index.ts`)

Define all three tools using Vercel AI SDK's `tool()` function with Zod schemas:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export const createDiagramTool = tool({
  description: 'Generate a new file tree diagram/visualization of the codebase...',
  parameters: z.object({
    owner: z.string().describe("Repository owner"),
    repo: z.string().describe("Repository name"),
    name: z.string().describe("Diagram title"),
    description: z.string().optional(),
    filters: z.object({
      pathPatterns: z.array(z.string()).optional(),
      excludePaths: z.array(z.string()).optional(),
      languages: z.array(z.string()).optional(),
      maxDepth: z.number().optional()
    }).optional(),
    layoutType: z.enum(["hierarchical", "treemap"]).optional()
  }),
  execute: async (params) => {
    const { createDiagram } = await import('./createDiagram');
    return await createDiagram(params);
  }
});

// Similar for queryFileTreeTool and updateDiagramFiltersTool
```

### 2. Implement Tool Execution Functions

Create separate files for each tool's logic:

- `server/src/ai/tools/createDiagram.ts` - Diagram generation logic
- `server/src/ai/tools/queryFileTree.ts` - File tree query logic  
- `server/src/ai/tools/updateDiagramFilters.ts` - Diagram update logic

Each calls existing database functions (`getFileTreeForReactFlow`, `saveDiagramPreset`, etc.)

### 3. Create Agent (`server/src/ai/agent.ts`)

Implement the Agent class with all tools:

```typescript
import { Experimental_Agent as Agent, stepCountIs } from 'ai';
import { createOllama } from "ai-sdk-ollama";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "../env";
import { createDiagramTool, queryFileTreeTool, updateDiagramFiltersTool } from './tools';

export function createDiagramAgent() {
  // Get model (same logic as client.ts)
  let modelString;
  if (env.AI_PROVIDER === "ollama") {
    if (!env.OLLAMA_REASONING_MODEL)
      throw new Error("OLLAMA_REASONING_MODEL is required");
    modelString = `ollama/${env.OLLAMA_REASONING_MODEL}`;
  } else {
    if (!env.NIM_MODEL)
      throw new Error("NIM_MODEL is required");
    modelString = `openai-compatible/${env.NIM_MODEL}`;
  }

  return new Agent({
    model: modelString,
    tools: {
      createDiagram: createDiagramTool,
      queryFileTree: queryFileTreeTool,
      updateDiagramFilters: updateDiagramFiltersTool,
    },
    stopWhen: stepCountIs(10), // Prevent infinite loops
  });
}
```

### 4. Update Chat Route (`server/src/routes/chat.ts`)

Replace `streamResponse` with agent execution. Keep RAG retrieval for context:

```typescript
// After RAG retrieval and context building...
import { createDiagramAgent } from '../ai/agent';

const agent = createDiagramAgent();

const result = await agent.generate({
  prompt: messagesWithContext,
  system: systemPrompt,
});

// Return result with tool calls
return new Response(JSON.stringify({
  answer: result.text,
  steps: result.steps,
  toolCalls: result.toolCalls,
}), {
  headers: { 'content-type': 'application/json' }
});
```

### 5. Update System Prompt (`server/src/ai/prompt.ts`)

Add tool usage instructions:

```typescript
export function buildPrompt(context: string): string {
  return `You are a helpful coding assistant specialized in codebase exploration.

AVAILABLE TOOLS:
- createDiagram: Generate new file tree diagram visualizations. Use when users ask to:
  * "create/make/generate a diagram"
  * "show/visualize the [folder/files]"  
  * "display the structure of"
  
- queryFileTree: Answer questions about repository structure. Use when users ask:
  * "how many files"
  * "what's the size of"
  * "list files in"
  * "which folder has"
  
- updateDiagramFilters: Modify existing diagrams. Use when users ask to:
  * "hide/remove/exclude [files]"
  * "show only [type]"
  * "filter by [criteria]"

When creating diagrams:
1. Choose meaningful names and descriptions
2. Use appropriate filters (languages, paths, depth)
3. Default maxDepth to 7 for readability
4. Explain what the diagram shows

CODEBASE CONTEXT:
${context}`;
}
```

### 6. Client-Side Integration (`client/src/hooks/useChat.ts`)

Handle tool results and trigger diagram creation:

```typescript
// Parse response and handle tool calls
const handleResponse = (data: any) => {
  if (data.toolCalls) {
    for (const toolCall of data.toolCalls) {
      if (toolCall.result?.action?.type === 'CREATE_DIAGRAM_TAB') {
        // Trigger diagram tab creation
        onDiagramCreated({
          id: toolCall.result.diagramId,
          name: toolCall.result.name,
          nodes: toolCall.result.nodes,
          edges: toolCall.result.edges,
        });
      }
      if (toolCall.result?.action?.type === 'UPDATE_DIAGRAM') {
        // Update existing diagram
        onDiagramUpdated(
          toolCall.result.diagramId,
          toolCall.result.nodes,
          toolCall.result.edges
        );
      }
    }
  }
};
```

---

## Files to Create

**New Files**:

- `server/src/ai/tools/index.ts` - Tool definitions with Zod schemas
- `server/src/ai/tools/createDiagram.ts` - Diagram generation logic
- `server/src/ai/tools/queryFileTree.ts` - File tree query logic
- `server/src/ai/tools/updateDiagramFilters.ts` - Diagram update logic

**Modified Files**:

- `server/src/ai/agent.ts` - Implement Agent class with tools (currently empty stub)
- `server/src/routes/chat.ts` - Use agent instead of streamResponse
- `server/src/ai/prompt.ts` - Add tool usage instructions
- `client/src/hooks/useChat.ts` - Handle tool results from agent

---

## Future Enhancements (Post-Implementation)

After this initial implementation is complete and working, add to `.todo`:

**Complex Diagram Types** (Future iteration):

- Implement dependency graph diagrams showing import/export relationships between files
- Implement data flow diagrams showing how data moves between functions/components
- Requires: AST parsing during ingestion, dependency edge storage, function call analysis

---

## Key Benefits

1. **Automatic Intent Recognition**: Agent decides when to use tools based on user query
2. **Multi-Step Reasoning**: Agent can call multiple tools in sequence
3. **Reduced Boilerplate**: Agent class manages loops and context automatically  
4. **Better UX**: Diagrams created automatically without manual commands
5. **Extensible**: Easy to add more tools later

---

## Example Capabilities

After implementation, users can:

- "Create a diagram of all Python files in the src folder"
- "Show me the backend but exclude migrations"
- "How many TypeScript files are there?" (without creating diagram)
- "Make a diagram, then hide all test files"
- "Visualize the client folder with max depth of 5"