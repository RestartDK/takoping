import { OllamaEmbeddingFunction } from "@chroma-core/ollama";
import { ChromaClient } from "chromadb";
import { env } from "../env";
import { NIMEmbedding } from "./nim-embedding";

export const chromaClient = new ChromaClient();

export function getEmbedder() {
	if (env.AI_PROVIDER === "nim") {
		if (!env.NIM_OPENAI_BASE_URL || !env.NIM_OPENAI_API_KEY || !env.NIM_EMBED_MODEL) {
			throw new Error("NIM_OPENAI_BASE_URL, NIM_OPENAI_API_KEY, and NIM_EMBED_MODEL are required for NIM embeddings");
		}
		return new NIMEmbedding({
			apiKey: env.NIM_OPENAI_API_KEY,
			baseURL: env.NIM_OPENAI_BASE_URL,
			model: env.NIM_EMBED_MODEL,
		});
	}
	// default to Ollama
	if (!env.OLLAMA_BASE_URL || !env.OLLAMA_EMBEDDINGS_MODEL) {
		throw new Error("OLLAMA_BASE_URL and OLLAMA_EMBEDDINGS_MODEL are required for Ollama embeddings");
	}
	return new OllamaEmbeddingFunction({ url: env.OLLAMA_BASE_URL, model: env.OLLAMA_EMBEDDINGS_MODEL });
}