import { Experimental_Agent as Agent, stepCountIs, validateUIMessages, type UIMessage, tool } from "ai";
import { createOllama } from "ai-sdk-ollama";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "../env";
import { 
	createDiagramSchema, 
	updateDiagramFiltersSchema 
} from "./tools/schemas";
import { createDiagram } from "./tools/createDiagram";
import { updateDiagramFilters } from "./tools/updateDiagramFilters";

export async function streamResponseWithTools(
	messages: UIMessage[], // UIMessages from client (after RAG context injection) - validateUIMessages will validate
	activeDiagramId: string,
	owner: string,
	repo: string,
	system?: string,
) {
	console.log("[agent] streamResponseWithTools called with:", { activeDiagramId, owner, repo });

	// Get model
	let model;
	if (env.AI_PROVIDER === "ollama") {
		const ollama = createOllama({ baseURL: env.OLLAMA_BASE_URL });
		if (!env.OLLAMA_REASONING_MODEL) {
			throw new Error("OLLAMA_REASONING_MODEL is required for ollama provider");
		}
		console.log("[agent] Provider: ollama", { baseURL: env.OLLAMA_BASE_URL, model: env.OLLAMA_REASONING_MODEL });
		model = ollama(env.OLLAMA_REASONING_MODEL);
	} else {
		if (!env.NIM_API_KEY || !env.NIM_BASE_URL || !env.NIM_MODEL) {
			throw new Error(
				"NIM_API_KEY, NIM_BASE_URL and NIM_MODEL are required for nim provider"
			);
		}
		console.log("[agent] Provider: nim", { baseURL: env.NIM_BASE_URL, model: env.NIM_MODEL });
		const nim = createOpenAICompatible({
			name: "nim",
			apiKey: env.NIM_API_KEY,
			baseURL: env.NIM_BASE_URL,
		});
		model = nim(env.NIM_MODEL);
	}

	// Define valid tool names for debugging
	const VALID_TOOLS = ["createDiagram", "updateDiagramFilters"];
	console.log("[agent] Registered tools:", VALID_TOOLS);

	// Create tools with bound context (owner/repo automatically injected)
	const createDiagramTool = tool({
		description: `Create a diagram visualization of the repository.

WHEN TO USE: User requests a diagram, visualization, chart, or graph.

HOW TO USE:
1. Look at file paths in the conversation context ([[SOURCE ... | path]] labels)
2. Extract directory patterns from those paths
3. Provide a descriptive name for the diagram
4. Call this tool with the extracted filters

Example: If you see "src/api/routes.ts" → use pathPatterns: ["src/api/**"]

If user wants "everything" or "full repo", omit filters.`,
		inputSchema: createDiagramSchema.omit({ owner: true, repo: true }),
		execute: async (params: any) => {
			console.log("[tool:createDiagram] Called with params:", JSON.stringify(params, null, 2));
			try {
				const result = await createDiagram({ ...params, owner, repo });
				console.log("[tool:createDiagram] Success - created diagram with", result.nodes.length, "nodes");
				return result;
			} catch (error) {
				console.error("[tool:createDiagram] Error:", error);
				throw error;
			}
		},
	});

	const updateDiagramFiltersTool = tool({
		description: "Update the current diagram. ONLY use when user explicitly asks to modify, filter, or update the existing diagram.",
		inputSchema: updateDiagramFiltersSchema,
		execute: async (params: any) => {
			console.log("[tool:updateDiagramFilters] Called with params:", JSON.stringify(params, null, 2));
			try {
				const result = await updateDiagramFilters(params);
				console.log("[tool:updateDiagramFilters] Success - updated diagram with", result.nodes.length, "nodes");
				return result;
			} catch (error) {
				console.error("[tool:updateDiagramFilters] Error:", error);
				throw error;
			}
		},
	});

	// Create agent with system prompt and context-bound tools
	const agent = new Agent({
		model,
		system: system || "",
		// TODO: Change this to auto once you have debugged tool calling flow with agent
		toolChoice: 'none',
		tools: {
			createDiagram: createDiagramTool,
			updateDiagramFilters: updateDiagramFiltersTool,
		},
		stopWhen: stepCountIs(10),
	});

	// Use agent.respond() for chat - streams tool calls properly
	// Validate messages to ensure they match the agent's expected format
	const agentStart = Date.now();
	console.log("[agent] Calling agent.respond()");
	const response = agent.respond({
		messages: await validateUIMessages({ messages }),
	});

	// Wrap the response to add debugging for tool-like JSON in text stream and stream timing
	const originalBody = response.body;
	if (originalBody) {
		let totalBytes = 0;
		let firstChunkAt: number | null = null;
		const { readable, writable } = new TransformStream({
			transform(chunk, controller) {
				try {
					const text = new TextDecoder().decode(chunk);
					if (firstChunkAt === null) {
						firstChunkAt = Date.now();
						console.log("[agent] First stream chunk after ms:", firstChunkAt - agentStart);
					}
					totalBytes += text.length;
					
					// Check if the text contains tool-call-like JSON
					const suspiciousPatterns = [
						/"name"\s*:\s*"(?!createDiagram|updateDiagramFilters)[^"]+"/,
						/"name"\s*:\s*"(getProjectInfo|queryFileTree)"/i,
						/"arguments"\s*:\s*\{/,
						/"parameters"\s*:\s*\{/
					];
					
					for (const pattern of suspiciousPatterns) {
						if (pattern.test(text)) {
							console.warn("⚠️ [agent] WARNING: Detected tool-like JSON in text stream!");
							console.warn("⚠️ [agent] This suggests the model is outputting JSON as text instead of using tools");
							console.warn("⚠️ [agent] Suspicious text:", text.substring(0, 200));
							break;
						}
					}
				} catch (e) {
					// Ignore decoding errors, just pass through
				}
				controller.enqueue(chunk);
			}
		});

		originalBody.pipeTo(writable).then(() => {
			const end = Date.now();
			console.log("[agent] Stream completed. DurationMs:", end - agentStart, "TotalBytes:", totalBytes);
		}).catch((e) => {
			console.error("[agent] Stream error:", e);
		});

		return new Response(readable, {
			headers: response.headers,
			status: response.status,
			statusText: response.statusText,
		});
	}

	return response;
}
