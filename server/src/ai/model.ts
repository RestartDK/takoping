import { env } from "../env";
import { createOllama } from "ai-sdk-ollama";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

/**
 * Initialize and return the appropriate AI model based on environment configuration.
 * Supports Ollama, OpenRouter, and NVIDIA NIM providers.
 * 
 * @returns A configured language model instance
 * @throws Error if required environment variables are missing for the selected provider
 */
function initializeModel(): LanguageModel {
	if (env.AI_PROVIDER === "ollama") {
		const ollama = createOllama({ baseURL: env.OLLAMA_BASE_URL });
		if (!env.OLLAMA_REASONING_MODEL) {
			throw new Error(
				"OLLAMA_REASONING_MODEL is required for ollama provider"
			);
		}
		return ollama(env.OLLAMA_REASONING_MODEL);
	} else if (env.AI_PROVIDER === "openrouter") {
		const openrouter = createOpenRouter({ apiKey: env.OPEN_ROUTER_KEY });
		if (!env.OPEN_ROUTER_MODEL) {
			throw new Error(
				"OPEN_ROUTER_MODEL is required for openrouter provider"
			);
		}
		return openrouter.chat(env.OPEN_ROUTER_MODEL);
	} else {
		if (!env.NIM_API_KEY || !env.NIM_BASE_URL || !env.NIM_MODEL) {
			throw new Error(
				"NIM_API_KEY, NIM_BASE_URL and NIM_MODEL are required for nim provider"
			);
		}
		const nim = createOpenAICompatible({
			name: "nim",
			apiKey: env.NIM_API_KEY,
			baseURL: env.NIM_BASE_URL,
		});
		return nim(env.NIM_MODEL);
	}
}

export const model = initializeModel();

