import { OllamaEmbeddingFunction } from "@chroma-core/ollama";
import { ChromaClient } from "chromadb";
import { env } from "../env";
import { NIMEmbedding } from "./nim-embedding";

// Prefer CHROMA_URL via env (e.g., http://chroma:8000 in Docker),
// fallback to default localhost if not provided
export const chromaClient = new ChromaClient({
  path: env.CHROMA_URL ?? undefined,
});

export function getEmbedder() {
	if (env.AI_PROVIDER === "nim") {
		if (!env.NIM_EMBED_BASE_URL || !env.NIM_EMBED_API_KEY || !env.NIM_EMBED_MODEL) {
			throw new Error("NIM_EMBED_BASE_URL, NIM_EMBED_API_KEY, and NIM_EMBED_MODEL are required for NIM embeddings");
		}
		return new NIMEmbedding({
			apiKey: env.NIM_EMBED_API_KEY,
			baseURL: env.NIM_EMBED_BASE_URL,
			model: env.NIM_EMBED_MODEL,
		});
	}
	// default to Ollama
	if (!env.OLLAMA_BASE_URL || !env.OLLAMA_EMBEDDINGS_MODEL) {
		throw new Error("OLLAMA_BASE_URL and OLLAMA_EMBEDDINGS_MODEL are required for Ollama embeddings");
	}
	return new OllamaEmbeddingFunction({ url: env.OLLAMA_BASE_URL, model: env.OLLAMA_EMBEDDINGS_MODEL });
}

