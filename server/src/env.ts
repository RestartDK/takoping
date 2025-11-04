import { z } from "zod";

const EnvSchema = z.object({
	// Server
	PORT: z.coerce.number().int().positive().default(3000),

	AI_PROVIDER: z.enum(["ollama", "nim"]).default("ollama"),

	// Database
	DATABASE_URL: z.string().optional(),
	CHROMA_URL: z.string().optional(),

	// Ollama
	OLLAMA_BASE_URL: z.url().optional(),
	OLLAMA_REASONING_MODEL: z.string().optional(),
	OLLAMA_EMBEDDINGS_MODEL: z.string().optional(),

	// NVIDIA NIM (OpenAI-compatible)
	NIM_BASE_URL: z.url().optional(),
	NIM_API_KEY: z.string().optional(),
	NIM_MODEL: z.string().optional(),
	NIM_EMBED_BASE_URL: z.url().optional(),
	NIM_EMBED_API_KEY: z.string().optional(),
	NIM_EMBED_MODEL: z.string().optional(),

	// Retrieval
	CHROMA_COLLECTION: z.string().default("docs"),
	RETRIEVE_TOP_K: z.coerce.number().int().positive().default(4),
	MAX_TOKENS: z.coerce.number().int().positive().default(512),

	// GitHub
	GITHUB_TOKEN: z.string().optional(),
});

const parsed = EnvSchema.safeParse(Bun.env);

if (!parsed.success) {
	console.error("Invalid environment variables:", z.treeifyError(parsed.error));
	throw new Error("Invalid environment variables");
}

export const env = parsed.data;
