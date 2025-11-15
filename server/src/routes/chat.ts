import { env } from "@/env";
import { z } from "zod";
import { searchByText, addText, type SearchFilters } from "@/ai/retriever";
import { getDocumentsCollection } from "@/vector/collections";
import {
	convertToModelMessages,
	type UIMessage,
	streamText,
	tool,
	stepCountIs,
	generateId,
} from "ai";
import { makeCreateDiagramTool, makeUpdateDiagramTool } from "@/ai/tools";
import { model } from "@/ai/model";

// Schema for UIMessage parts - supports all part types
// Using a flexible approach since UIMessagePart is a complex union type
const UIMessagePartSchema = z.union([
	// Text part
	z.object({
		type: z.literal("text"),
		text: z.string(),
		state: z.enum(["streaming", "done"]).optional(),
		providerMetadata: z.any().optional(),
	}),
	// Reasoning part
	z.object({
		type: z.literal("reasoning"),
		text: z.string(),
		state: z.enum(["streaming", "done"]).optional(),
		providerMetadata: z.any().optional(),
	}),
	// Tool part (flexible - can be tool-{name} or dynamic-tool)
	z
		.object({
			type: z
				.string()
				.refine((val) => val.startsWith("tool-") || val === "dynamic-tool", {
					message: "Tool type must start with 'tool-' or be 'dynamic-tool'",
				}),
			toolCallId: z.string().optional(),
			toolName: z.string().optional(),
			state: z
				.enum([
					"input-streaming",
					"input-available",
					"output-available",
					"output-error",
				])
				.optional(),
			input: z.any().optional(),
			output: z.any().optional(),
			errorText: z.string().optional(),
			providerExecuted: z.boolean().optional(),
			callProviderMetadata: z.any().optional(),
			preliminary: z.boolean().optional(),
			rawInput: z.any().optional(),
		})
		.loose(),
	// Source URL part
	z.object({
		type: z.literal("source-url"),
		sourceId: z.string(),
		url: z.string(),
		title: z.string().optional(),
		providerMetadata: z.any().optional(),
	}),
	// Source document part
	z.object({
		type: z.literal("source-document"),
		sourceId: z.string(),
		mediaType: z.string(),
		title: z.string(),
		filename: z.string().optional(),
		providerMetadata: z.any().optional(),
	}),
	// File part
	z.object({
		type: z.literal("file"),
		mediaType: z.string(),
		filename: z.string().optional(),
		url: z.string(),
		providerMetadata: z.any().optional(),
	}),
	// Data part (flexible - can be data-{name})
	z.object({
		type: z.string().refine((val) => val.startsWith("data-"), {
			message: "Data type must start with 'data-'",
		}),
		id: z.string().optional(),
		data: z.any(),
	}),
	// Step start part
	z.object({
		type: z.literal("step-start"),
	}),
	// Fallback for any other part types
	z
		.object({
			type: z.string(),
		})
		.loose(),
]);

// Schema for UIMessage
// Using z.any() for parts to avoid complex type matching issues
const UIMessageSchema = z.object({
	id: z.string(),
	role: z.enum(["system", "user", "assistant"]),
	metadata: z.any().optional(),
	parts: z.array(UIMessagePartSchema),
}) as z.ZodType<UIMessage>;

const MessagesSchema = z.object({
	messages: z.array(UIMessageSchema),
	owner: z.string().min(1, "owner is required"),
	repo: z.string().min(1, "repo is required"),
	activeDiagramId: z.string().min(1, "activeDiagramId is required"),
});

const AddSchema = z.object({
	text: z.string().min(1, "text is required"),
	source: z.string().optional(),
	idPrefix: z.string().optional(),
});

export const chatRoute = async (req: Request) => {
	if (req.method !== "POST")
		return new Response("Method Not Allowed", { status: 405 });
	const contentType = req.headers.get("content-type") || "";
	if (!contentType.includes("application/json")) {
		return new Response(
			JSON.stringify({ error: "Expected application/json" }),
			{
				status: 400,
				headers: { "content-type": "application/json" },
			}
		);
	}

	const parsed = MessagesSchema.safeParse(await req.json());
	if (!parsed.success) {
		return new Response(
			JSON.stringify({
				error: "Invalid payload",
				details: z.treeifyError(parsed.error),
			}),
			{ status: 400, headers: { "content-type": "application/json" } }
		);
	}

	const { messages, owner, repo, activeDiagramId } = parsed.data;

	try {
		// Create tools using factory functions with request variables
		const createDiagramTool = makeCreateDiagramTool(owner, repo);
		const updateDiagramTool = makeUpdateDiagramTool(activeDiagramId);

		// Create searchKnowledge tool with owner/repo context
		const searchKnowledgeTool = tool({
			description:
				"Search the codebase embeddings to find relevant code snippets and documentation. Use this to answer questions about the codebase.",
			inputSchema: z.object({
				query: z
					.string()
					.describe("The user's question to search for in the knowledge base"),
			}),
			execute: async ({ query }) => {
				const collection = await getDocumentsCollection();
				const filters: SearchFilters = {
					repo: `${owner}/${repo}`,
				};
				const results = await searchByText(
					query,
					collection,
					env.RETRIEVE_TOP_K,
					filters
				);
				return results.documents;
			},
		});

		// Create addKnowledge tool for persisting chat history
		const addKnowledgeTool = tool({
			description:
				"Store important conversation details in the persistent chat history so they can be recalled later.",
			inputSchema: z.object({
				resource: z
					.string()
					.describe("The content or information to remember in chat history"),
				title: z
					.string()
					.optional()
					.describe("Optional short title for the saved information"),
			}),
			execute: async ({ resource, title }) => {
				const collection = await getDocumentsCollection();
				const id = generateId();
				const idPrefix = `chat-${id.slice(0, 8)}`;
				const repoKey = `${owner}/${repo}`;

				const ids = await addText(collection, resource, {
					source: `chat-history:${repoKey}`,
					idPrefix,
					metadata: {
						repo: repoKey,
						section: "chat-history",
						title: title ?? `Resource ${id.slice(0, 8)}`,
					},
				});

				return {
					message: `Successfully added "${
						title || "Untitled"
					}" to chat history.`,
					idPrefix,
					storedIds: ids,
				};
			},
		});

		const result = streamText({
			model,
			messages: convertToModelMessages(messages),
			stopWhen: stepCountIs(10),
			system: `You are a helpful assistant. Check your knowledge base before answering any questions.
    Only respond to questions using information from tool calls.
    if no relevant information is found in the tool calls, respond, "Sorry, I don't know."`,
			tools: {
				createDiagram: createDiagramTool,
				updateDiagramFilters: updateDiagramTool,
				searchKnowledge: searchKnowledgeTool,
				addKnowledge: addKnowledgeTool,
			},
			// log out intermediate steps
			onStepFinish: ({ toolResults }) => {
				if (toolResults.length > 0) {
					console.log("Tool results:");
					console.dir(toolResults, { depth: null });
				}
			},
		});

		return result.toUIMessageStreamResponse();
	} catch (err) {
		return new Response(JSON.stringify({ error: "Internal Server Error" }), {
			status: 500,
			headers: { "content-type": "application/json" },
		});
	}
};

export const chatAddRoute = async (req: Request) => {
	if (req.method !== "POST")
		return new Response("Method Not Allowed", { status: 405 });
	const contentType = req.headers.get("content-type") || "";
	if (!contentType.includes("application/json")) {
		return new Response(
			JSON.stringify({ error: "Expected application/json" }),
			{
				status: 400,
				headers: { "content-type": "application/json" },
			}
		);
	}

	const parsed = AddSchema.safeParse(await req.json());
	if (!parsed.success) {
		return new Response(
			JSON.stringify({
				error: "Invalid payload",
				details: z.treeifyError(parsed.error),
			}),
			{ status: 400, headers: { "content-type": "application/json" } }
		);
	}

	const { text, source, idPrefix } = parsed.data;

	const collection = await getDocumentsCollection();
	const ids = await addText(collection, text, { source, idPrefix });
	return new Response(JSON.stringify({ ok: true, ids }), {
		headers: { "content-type": "application/json" },
	});
};
