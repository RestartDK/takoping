<!-- db32fe3f-8894-4f8a-a266-b05e2a14fb2e d103b400-3be1-4133-825d-bfb3eb94f25e -->
# GitHub API Ingestion, Chunking, and RAG Indexing Plan

## Scope

- Single repo at a time (owner/name via request). Works for any codebase (polyglot) using extension- and heuristic-based chunkers first; AST-based later.
- Output: Indexed chunks in `Chromadb` with rich metadata; query answers grounded with file/line citations and actionable node references.

## Backend Additions (Bun)

### 1) Endpoints

- POST `/api/github/ingest` — body: `{ owner, repo, branch?, rootPath?, excludeGlobs? }` → kicks off ingestion job; returns `jobId`.
- GET `/api/github/ingest/:jobId` — job status and counts (files scanned/skipped, chunks indexed).
- POST `/api/github/webhook` — optional GitHub webhook to trigger delta updates on push events.

### 2) GitHub API Access

- Use [Octokit.js](https://github.com/octokit/octokit.js) for all GitHub API interactions (official SDK with TypeScript support, error handling, and rate limit management):
  - `octokit.rest.git.getTree()` with `recursive: 1` to list all files in repo.
  - `octokit.rest.repos.getContent()` for file contents (Base64 decoded) or `octokit.rest.git.getBlob()` for blob data.
  - `octokit.rest.repos.compareCommits()` for delta updates (webhook-driven).
- Auth: Initialize Octokit with `auth: Bun.env.GITHUB_TOKEN` (personal access token or OAuth app token).
- Built-in features from Octokit:
  - Automatic rate limit handling and retries with exponential backoff.
  - Request/response hooks for logging and debugging.
  - Pagination helpers for large responses.
- Respect ignore rules:
  - Fetch `.gitignore` (and optionally `.gitattributes`) from repo using `octokit.rest.repos.getContent()`; merge with default excludes (`node_modules`, `dist`, binaries, images).
  - Support request `excludeGlobs` to customize.

### 3) File Filtering & Language Detection

- Skip binaries via extension and MIME sniff (no embedding for >2MB or non-text).
- Detect language by extension; map to chunker (ts/js, py, go, rs, java, md, txt, yaml, json, etc.).
- Store `language`, `path`, `repo`, `branch`, `commitSha`, `blobSha`, `size` in metadata.

### 4) Chunking Strategy (v1 heuristics)

- Universal constraints: target ~800-1200 chars, max ~2000, overlap ~100-150; keep line numbers.
- Markdown: split by headings (h1–h3), then paragraphs/lists; keep code blocks intact.
- Code (ts/js/py/go/java/rs/…):
  - Primary: regex/heuristic boundaries around functions/classes/modules; group small adjacent functions.
  - Fallback: semantic sentence/line windows (e.g., 30–80 lines) respecting braces/indent.
- Configurable chunkers per language; plug-in interface.

### 5) Stable IDs and Rich Metadata

- Chunk ID: `gh:{owner}/{repo}:{branch}:{path}#L{start}-{end}:{blobSha}` to stay stable per blob.
- Metadata:
  - `repo`, `branch`, `path`, `language`, `blobSha`, `commitSha`, `symbolName?`, `symbolKind?`, `startLine`, `endLine`, `size`, `ingestedAt`.
- Store display snippet and title (e.g., function signature or heading) for UI.

### 6) Embedding + Upsert

- Use current embeddings path (Ollama locally, NIM later). Batch add per file to `Chromadb` collection `documents` (or `env.CHROMA_COLLECTION`).
- Upsert rule: if `blobSha` unchanged, skip; else delete old chunks for `path` then insert new ones.
- Track per-file state in a small KV (e.g., `chroma` metadata entry or local `repo_state.sqlite` later) mapping `path→blobSha`.

### 7) Delta Updates

- On webhook (push): fetch changed files (added/modified/removed) from compare API, update only those paths.
- If no webhook: support `forceRescan: boolean` on ingest to fallback to full scan.

### 8) Query Flow Enhancements

- Extend `searchByText` to filter by `repo` and optionally `path` or `language`.
- Return sources with `path` and `start/end` for the frontend to open file ranges.
- Structured output: answer + `referencedNodes` mapping to `repo:path#Lx-Ly` and `suggestedActions` (`openFileRange`, `focusNode`).

### 9) Rate Limits and Robustness

- Parallelism caps (e.g., 4–8 concurrent blob fetches).
- Exponential backoff on 403 rate-limits; respect `X-RateLimit-Reset`.
- Size caps (skip >1MB text by default, configurable). Gzip responses.

## Minimal Data Structures (TS types)

- `IngestRequest`: `{ owner: string; repo: string; branch?: string; rootPath?: string; excludeGlobs?: string[] }`
- `IngestJob`: `{ id: string; status: 'queued'|'running'|'done'|'error'; counts: { files:number; skipped:number; chunks:number } }`
- `ChunkMetadata`: `{ repo, branch, path, language, blobSha, commitSha, startLine, endLine, symbolName?, symbolKind? }`

## File Touchpoints

- `backend/src/routes/github.ts` — new routes for ingest/status/webhook.
- `backend/src/github/client.ts` — GitHub REST client (auth, retries, ETags).
- `backend/src/github/ingest.ts` — tree walk, filtering, blob fetch, chunking, upsert.
- `backend/src/chunkers/*` — language-specific chunkers; `chunkers/index.ts` dispatcher.
- `backend/src/db/collections.ts` — add helpers for upsert-by-blobSha.
- `backend/src/ai/prompt.ts` — extend to include `path` and `Lx-Ly` in sources.
- `backend/index.ts` — wire new routes.

## Example Metadata Format (stored with each chunk)

```json
{
  "repo": "owner/repo",
  "branch": "main",
  "path": "src/utils/math.ts",
  "language": "typescript",
  "blobSha": "abc123",
  "commitSha": "def456",
  "startLine": 12,
  "endLine": 58,
  "symbolName": "calculateTotals",
  "symbolKind": "function"
}
```

## Test Plan

- Seed from a medium-sized TS repo (500–3k files). Verify:
  - Ingest completes under rate limits; index count ≈ expected.
  - Query returns correct file ranges and relevant chunks.
  - Delta update modifies only changed paths.

## Future Upgrades (post-MVP)

- AST-based chunkers via Tree-sitter per language.
- Graph overlays (imports/exports) for dependency mapping.
- Org-wide presets and multi-repo compare.

### To-dos

- [ ] Add /api/github/ingest, /ingest/:jobId, /webhook routes
- [ ] Implement GitHub REST client with auth, ETags, retries
- [ ] List repo tree recursively and apply ignore filters
- [ ] Fetch blobs with concurrency, skip binaries/large files
- [ ] Create chunker dispatcher by extension/language
- [ ] Implement Markdown heading/paragraph chunker
- [ ] Implement heuristic code chunker with line ranges
- [ ] Define stable chunk IDs and rich metadata
- [ ] Upsert chunks to Chromadb; skip unchanged blobSha
- [ ] Implement push webhook-based delta indexing
- [ ] Extend retrieval with repo/path/language filters
- [ ] Return referencedNodes and suggestedActions in answers