<!-- 47a88f2b-49e1-49a9-8ce7-35561b90efd4 c443ebcf-5a6e-457d-9453-ba31adb67861 -->
# Tool Calling Architecture for Diagram Generation

## Overview

Implement a tool-calling system using Vercel AI SDK that allows the agent to generate new diagrams, navigate the canvas, and provide guided tours. The agent will use structured tools returning React Flow-compatible data and explicit action instructions.

## Core Components

### 1. Agent Implementation (`server/src/ai/agent.ts`)

- Use Vercel AI SDK's `generateObject` or `streamText` with tool definitions
- Integrate with existing `generateResponse` pattern from `client.ts`
- Support both streaming and structured responses
- Include context about current repository state and available diagrams

### 2. Tool Definitions

#### Tool: `createDiagram`

**Purpose:** Generate a new diagram/tab with filtered or transformed repository data

**Parameters:**

- `owner`: string (required)
- `repo`: string (required)
- `name`: string (required) - Diagram name/title
- `description`: string (optional) - Human-readable description
- `type`: "file_tree" | "data_flow" | "architecture_slice" | "dependency_graph" | "custom"
- `filters`: object (optional)
  - `pathPatterns`: string[] - Include paths matching patterns
  - `excludePaths`: string[] - Exclude paths
  - `languages`: string[] - Filter by programming languages
  - `minDepth`: number - Minimum tree depth
  - `maxDepth`: number - Maximum tree depth
- `weighting`: "size" | "file_count" | "recent_changes" | "custom" (optional)
- `layoutType`: "treemap" | "hierarchical" | "force_directed" (optional)

**Returns:**

- `diagramId`: string - Unique identifier
- `nodes`: React Flow nodes array
- `edges`: React Flow edges array (if applicable)
- `actions`: Array of navigation instructions

**Implementation:**

- Call existing `getFileTreeForReactFlow` with computed filters
- For custom types (data_flow, architecture_slice), use AI to analyze code relationships
- Save preset using `saveDiagramPreset` for persistence
- Query ChromaDB for semantic understanding when needed

#### Tool: `searchCodebase`

**Purpose:** Semantic search through codebase (leverages existing retriever)

**Parameters:**

- `query`: string (required)
- `topK`: number (optional, defaults to env.RETRIEVE_TOP_K)
- `filters`: object (optional)
  - `paths`: string[] - Limit search to specific paths
  - `languages`: string[] - Filter by languages
  - `repo`: string - Repository identifier

**Returns:**

- `results`: Array of search results with metadata
- `referencedNodes`: string[] - Node IDs referenced in results
- `suggestedActions`: Array of navigation actions

**Implementation:**

- Reuse existing `searchByText` from `retriever.ts`
- Format results with file paths and line ranges
- Generate node IDs compatible with React Flow

#### Tool: `navigateCanvas`

**Purpose:** Navigate and manipulate the current canvas view

**Parameters:**

- `actions`: Array of navigation commands
  - `focusNode`: { nodeId: string }
  - `expandPath`: { path: string }
  - `highlightNodes`: { nodeIds: string[], color?: string }
  - `zoomTo`: { nodeIds: string[] }
  - `panTo`: { x: number, y: number }

**Returns:**

- `executedActions`: Array confirming executed actions
- `currentView`: Object describing current canvas state

**Implementation:**

- Return instructions for client to execute
- Validate node IDs exist in current diagram

#### Tool: `openFileRange`

**Purpose:** Open specific file ranges in code viewer

**Parameters:**

- `path`: string (required)
- `startLine`: number (required)
- `endLine`: number (optional)
- `repo`: string (optional, defaults to current)
- `highlight`: boolean (optional) - Whether to highlight in visualizer

**Returns:**

- `fileContent`: string (optional, if client needs it)
- `nodeId`: string - Corresponding node ID if applicable
- `navigationAction`: Action to execute

**Implementation:**

- Return file path and line range
- Optionally fetch file content if client requires it
- Link to visualizer node if it exists

#### Tool: `queryFileTree`

**Purpose:** Query file tree structure with specific criteria

**Parameters:**

- `owner`: string (required)
- `repo`: string (required)
- `query`: string (required) - Natural language or pattern query
- `filters`: object (optional) - Same as createDiagram filters

**Returns:**

- `nodes`: Array of matching file tree nodes
- `summary`: Object with counts and statistics
- `suggestedDiagram`: boolean - Whether to suggest creating a diagram

**Implementation:**

- Use PostgreSQL queries from `queries.ts`
- Support pattern matching and semantic filtering
- Return structured node data

### 3. Enhanced Chat Route (`server/src/routes/chat.ts`)

- Migrate from simple `generateText` to `streamText` or `generateObject` with tools
- Include tool execution in response
- Return structured response format:
  ```typescript
  {
    answer: string,
    tools: Array<{
      tool: string,
      result: any,
      actions: Array<NavigationAction>
    }>,
    referencedNodes: string[],
    suggestedActions: Array<NavigationAction>
  }
  ```


### 4. Tool Result Format

All tools return data compatible with:

- React Flow nodes/edges format
- Client-side action system
- Persistent diagram presets

## Implementation Steps

1. **Define Tool Schemas** (`server/src/ai/tools.ts`)

   - Create Zod schemas for each tool's parameters
   - Define tool functions with proper types
   - Export tool definitions for Vercel AI SDK

2. **Implement Agent** (`server/src/ai/agent.ts`)

   - Use `generateObject` or `streamText` from Vercel AI SDK
   - Include tool definitions
   - Handle tool execution and response formatting
   - Integrate with existing RAG pipeline

3. **Update Chat Route** (`server/src/routes/chat.ts`)

   - Replace `generateResponse` with agent invocation
   - Handle tool execution results
   - Format response for client consumption

4. **Create Tool Implementations** (`server/src/ai/tools/`)

   - `createDiagram.ts` - Diagram generation logic
   - `searchCodebase.ts` - Semantic search wrapper
   - `navigateCanvas.ts` - Canvas navigation logic
   - `openFileRange.ts` - File viewer integration
   - `queryFileTree.ts` - Tree query logic

5. **Client-Side Integration** (Future - not in this plan)

   - Handle tool responses in client
   - Create new diagram tabs
   - Execute navigation actions
   - Update code viewer

## Files to Create/Modify

**Create:**

- `server/src/ai/tools.ts` - Tool definitions and schemas
- `server/src/ai/tools/createDiagram.ts` - Diagram generation
- `server/src/ai/tools/searchCodebase.ts` - Search wrapper
- `server/src/ai/tools/navigateCanvas.ts` - Navigation logic
- `server/src/ai/tools/openFileRange.ts` - File opening
- `server/src/ai/tools/queryFileTree.ts` - Tree queries

**Modify:**

- `server/src/ai/agent.ts` - Implement agent with tool calling
- `server/src/ai/client.ts` - Add tool support to generate functions
- `server/src/routes/chat.ts` - Integrate agent with tool calling
- `server/src/ai/prompt.ts` - Update system prompt to include tool usage

## Key Design Decisions

1. **Tool Execution Model:** Synchronous - tools execute during agent invocation, results included in response
2. **Response Format:** Structured JSON with both text answer and tool results
3. **Diagram Persistence:** New diagrams automatically saved as presets
4. **Client Contract:** Server returns explicit action instructions, client interprets and executes
5. **AI Integration:** Agent decides when to use tools based on user query context