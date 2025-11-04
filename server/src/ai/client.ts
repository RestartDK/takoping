import { streamText, type ModelMessage } from "ai";
import { createOllama } from "ai-sdk-ollama";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "../env";

export async function streamResponse(
	messages: ModelMessage[],
	system?: string
) {
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

	if (!env.NIM_API_KEY || !env.NIM_BASE_URL || !env.NIM_MODEL) {
		throw new Error(
			"NIM_API_KEY, NIM_BASE_URL and NIM_MODEL are required for nim provider"
		);
	}

	const nim = createOpenAICompatible({
		name: "nim",
		baseURL: env.NIM_BASE_URL,
		headers: {
			Authorization: `Bearer ${env.NIM_API_KEY}`,
		},
	});
	return streamText({ model: nim(env.NIM_MODEL), messages, system });
}
