import { Experimental_Agent as Agent, stepCountIs, validateUIMessages, type UIMessage, tool } from "ai";
import { createOllama } from "ai-sdk-ollama";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { env } from "../env";
import { 
	createDiagramSchema, 
	queryFileTreeSchema, 
	updateDiagramFiltersSchema 
} from "./tools/schemas";
import { createDiagram } from "./tools/createDiagram";
import { queryFileTree } from "./tools/queryFileTree";
import { updateDiagramFilters } from "./tools/updateDiagramFilters";

export async function streamResponseWithTools(
	messages: UIMessage[], // UIMessages from client (after RAG context injection) - validateUIMessages will validate
	activeDiagramId: string,
	owner: string,
	repo: string,
	system?: string,
) {
	console.log("[agent] streamResponseWithTools called with:", { activeDiagramId, owner, repo });
	
	// Build enhanced system prompt with activeDiagramId
	const enhancedSystem = (system || "") + `\n\nIMPORTANT CONTEXT:
- Active diagram ID: ${activeDiagramId}
- Working repository: ${owner}/${repo}

When the user asks to update, modify, filter, hide, show, exclude, or change anything about "this diagram", "the current diagram", or "the diagram", you MUST use the updateDiagramFilters tool with diagramId: "${activeDiagramId}". 

Do NOT create a new diagram when the user wants to modify the existing one. Always use updateDiagramFilters with the active diagram ID.

Note: The repository context (owner/repo) is automatically provided to tools - you don't need to specify it.`;

	// Get model
	let model;
	if (env.AI_PROVIDER === "ollama") {
		const ollama = createOllama({ baseURL: env.OLLAMA_BASE_URL });
		if (!env.OLLAMA_REASONING_MODEL) {
			throw new Error("OLLAMA_REASONING_MODEL is required for ollama provider");
		}
		model = ollama(env.OLLAMA_REASONING_MODEL);
	} else {
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
		model = nim(env.NIM_MODEL);
	}

	// Create tools with bound context (owner/repo automatically injected)
	const createDiagramTool = tool({
		description: "Generate a new file tree diagram/visualization of the codebase with customizable filters. Use this when the user asks to create, generate, or show a diagram, visualization, or visual representation of the codebase structure. The repository context is automatically provided.",
		inputSchema: createDiagramSchema.omit({ owner: true, repo: true }), // Remove owner/repo from schema
		execute: async (params: any) => {
			// Inject owner/repo from closure
			return await createDiagram({ ...params, owner, repo });
		},
	});

	const queryFileTreeTool = tool({
		description: "Answer questions about the repository structure, statistics, and file organization without generating a full diagram. Use this when users ask about file counts, sizes, languages, or directory structure. The repository context is automatically provided.",
		inputSchema: queryFileTreeSchema.omit({ owner: true, repo: true }), // Remove owner/repo from schema
		execute: async (params: any) => {
			// Inject owner/repo from closure
			return await queryFileTree({ ...params, owner, repo });
		},
	});

	const updateDiagramFiltersTool = tool({
		description: "Modify an existing diagram's filters to hide, show, or filter files. Use this when users want to update the current diagram by hiding test files, excluding folders, filtering by language, or changing depth. IMPORTANT: When the system prompt indicates there is an active diagram ID, use that diagramId.",
		inputSchema: updateDiagramFiltersSchema,
		execute: async (params: any) => {
			return await updateDiagramFilters(params);
		},
	});

	// Create agent with system prompt and context-bound tools
	const agent = new Agent({
		model,
		system: enhancedSystem,
		tools: {
			createDiagram: createDiagramTool,
			queryFileTree: queryFileTreeTool,
			updateDiagramFilters: updateDiagramFiltersTool,
		},
		stopWhen: stepCountIs(10),
	});

	// Use agent.respond() for chat - streams tool calls properly
	// Validate messages to ensure they match the agent's expected format
	return agent.respond({
		messages: await validateUIMessages({ messages }),
	});
}
