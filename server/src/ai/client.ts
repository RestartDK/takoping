import { streamText, type CoreMessage } from "ai";
import { createOllama } from "ai-sdk-ollama";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "../env";

export async function streamResponse(messages: CoreMessage[], system?: string) {
	if (env.AI_PROVIDER === "ollama") {
		const ollama = createOllama({ baseURL: env.OLLAMA_BASE_URL });
		if (!env.OLLAMA_REASONING_MODEL)
			throw new Error("OLLAMA_REASONING_MODEL is required for ollama provider");
		return streamText({
			model: ollama(env.OLLAMA_REASONING_MODEL),
			messages,
			system,
		});
	}

	if (!env.NIM_OPENAI_API_KEY || !env.NIM_OPENAI_BASE_URL || !env.NIM_MODEL) {
		throw new Error(
			"NIM_OPENAI_API_KEY, NIM_OPENAI_BASE_URL and NIM_MODEL are required for nim provider"
		);
	}

	const nim = createOpenAICompatible({
		name: "nim",
		apiKey: env.NIM_OPENAI_API_KEY,
		baseURL: env.NIM_OPENAI_BASE_URL,
	});
	return streamText({ model: nim(env.NIM_MODEL), messages, system });
}
