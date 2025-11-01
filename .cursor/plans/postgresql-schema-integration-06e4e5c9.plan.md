<!-- 06e4e5c9-2ab4-45a5-a8c3-a7e4cac05d46 b9e28c12-4e90-48b3-bf68-5084e6e3b304 -->
# Minimal Frontend Demo Plan

## Overview

Create a throwaway minimal UI to verify all backend integration points work correctly.

## Implementation

### 1. Update `frontend/src/App.tsx`

Replace with minimal demo that includes:

**Layout**

- Top: Repo input (`owner/repo`) + Load button
- Middle: React Flow canvas for tree visualization
- Bottom: Chat input + Send button + response display area

**Features to test**

- **Auto-ingestion**: On Load, fetch `/api/diagrams/tree?owner=X&repo=Y`
  - If 404: POST to `/api/github/ingest`, poll `/api/github/ingest/status/:jobId` until done, then retry tree fetch
  - Show ingestion progress (files/chunks)
- **Tree visualization**: Render React Flow nodes from backend
- **RAG chat**: POST to `/api/rag/query`, display answer (no streaming)
- **Diagram presets**: Button to save current view as preset (POST `/api/diagrams/preset`)

**State management**

```typescript
const [repoInput, setRepoInput] = useState("restartdk/leetcode-automation")
const [nodes, setNodes] = useState([])
const [edges, setEdges] = useState([])
const [chatInput, setChatInput] = useState("")
const [chatResponse, setChatResponse] = useState("")
const [status, setStatus] = useState("") // For showing ingestion/loading state
```

**Key functions**

- `loadRepo()`: Fetch tree, handle 404 with auto-ingest
- `pollIngestionStatus(jobId)`: Poll every 2s until done/error
- `sendChat()`: POST query, display response
- `savePreset()`: Save current tree as preset

### 2. Add CORS handling to backend

Update `backend/index.ts` to add CORS headers for local dev:

```typescript
fetch(req) {
  return new Response("Not Found", { 
    status: 404,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}
```

Add OPTIONS handler for preflight requests.

### 3. Test flow

1. Start backend: `bun run index.ts`
2. Start frontend: `npm run dev`
3. Load repo → triggers ingestion if needed
4. Verify tree renders
5. Send chat query → verify response
6. Save preset → verify API call succeeds

## Files to modify

- `frontend/src/App.tsx` (complete rewrite)
- `backend/index.ts` (add CORS)

## Success criteria

All backend endpoints working from browser:

- ✓ GET `/api/diagrams/tree`
- ✓ POST `/api/github/ingest` (auto-triggered)
- ✓ GET `/api/github/ingest/status/:jobId` (polling)
- ✓ POST `/api/rag/query`
- ✓ POST `/api/diagrams/preset`

### To-dos

- [ ] Create backend/src/db/postgres-schema.sql with all table definitions
- [ ] Create backend/src/db/postgres.ts with React Flow layout computation
- [ ] Add DATABASE_URL to backend/src/env.ts
- [ ] Update backend/src/github/ingest.ts to build tree and mark indexed files
- [ ] Create backend/src/routes/diagrams.ts with React Flow responses
- [ ] Update backend/index.ts to initialize schema and add routes
- [ ] Update docs/PRD.md with database architecture section
- [ ] Create backend/test-e2e-diagrams.sh for end-to-end testing