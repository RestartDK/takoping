# server

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.3.1. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

## RAG Env

Create a `.env` with:

```
AI_PROVIDER=ollama

# Ollama
OLLAMA_BASE_URL=http://lan-tower:11434
OLLAMA_MODEL=llama3.1:8b-instruct-q4_K_M

# NVIDIA NIM (OpenAI-compatible)
NIM_OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1
NIM_OPENAI_API_KEY=YOUR_KEY
NIM_MODEL=meta/llama-3.1-8b-instruct

# Retrieval
RETRIEVE_TOP_K=4
MAX_TOKENS=512
```

Health: `GET /health`

### Chat API

`POST /api/chat/query`

Body:

```
{ "query": "How do we scan the repo?" }
```

Response:

```
{
  "answer": "...",
  "sources": [
    {"id":"...","metadata":{ },"text":"...","distance":0.12}
  ]
}
```

Notes:
- Retrieval uses collection-side embedding function via `queryTexts`, per Chroma docs: https://docs.trychroma.com/docs/embeddings/embedding-functions
- Generation via Vercel AI SDK with provider switch: Ollama or NIM (OpenAI-compatible).
