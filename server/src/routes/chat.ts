import { env } from "../env";
import { z } from "zod";
import { formatContexts, searchByText, addText } from "../ai/retriever";
import { buildPrompt } from "../ai/prompt";
import { streamResponse } from "../ai/client";
import { getDocumentsCollection } from "../vector/collections";
import { convertToModelMessages, type UIMessage } from "ai";

const MessagesSchema = z.object({
	messages: z.array(
		z.object({
			id: z.string().optional(),
			role: z.enum(["user", "assistant", "system"]),
			parts: z.array(
				z.object({
					type: z.string(),
					text: z.string().optional(),
				})
			),
		})
	),
});

const AddSchema = z.object({
	text: z.string().min(1, "text is required"),
	source: z.string().optional(),
	// optional: allow client to prepend an id prefix for easier tracing
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
		console.warn(
			"/api/chat/query validation failed",
			z.treeifyError(parsed.error)
		);
		return new Response(
			JSON.stringify({
				error: "Invalid payload",
				details: z.treeifyError(parsed.error),
			}),
			{ status: 400, headers: { "content-type": "application/json" } }
		);
	}

	const { messages } = parsed.data;
	console.log("/api/chat/query received", {
		messageCount: messages.length,
		topK: env.RETRIEVE_TOP_K,
	});

	try {
		// Extract the latest user message for RAG retrieval
		const latestUserMessage = messages
			.filter((m) => m.role === "user")
			.slice(-1)[0];
		if (!latestUserMessage) {
			return new Response(
				JSON.stringify({ error: "No user message found" }),
				{ status: 400, headers: { "content-type": "application/json" } }
			);
		}

		// Extract text from the latest user message
		const query = latestUserMessage.parts
			.filter((p) => p.type === "text" && p.text)
			.map((p) => p.text)
			.join(" ");

		if (!query.trim()) {
			return new Response(
				JSON.stringify({ error: "Query text is required" }),
				{ status: 400, headers: { "content-type": "application/json" } }
			);
		}

		// Perform RAG retrieval
		const collection = await getDocumentsCollection();
		console.log("Using collection", { name: "documents" });
		const results = await searchByText(query, collection, env.RETRIEVE_TOP_K);
		console.log("Query results", {
			ids: results.ids.length,
			documents: results.documents.length,
			metadatas: results.metadatas.length,
			distances: results.distances,
		});

		// Format context and build system prompt
		const context = formatContexts(results);
		const systemPrompt = buildPrompt(query, context);

		// Extract referenced nodes and create suggested actions
		const referencedNodes: string[] = [];
		const suggestedActions: Array<{
			type: "openFileRange" | "focusNode" | "expandPath";
			target: string;
			metadata?: Record<string, unknown>;
		}> = [];

		for (let i = 0; i < results.metadatas.length; i++) {
			const metadata = results.metadatas[i];
			const path = metadata?.path as string | undefined;
			const repo = metadata?.repo as string | undefined;
			const startLine = metadata?.startLine as number | undefined;
			const endLine = metadata?.endLine as number | undefined;

			if (path && repo) {
				const nodeId =
					startLine && endLine
						? `${repo}:${path}#L${startLine}-${endLine}`
						: `${repo}:${path}`;
				referencedNodes.push(nodeId);

				if (startLine && endLine) {
					suggestedActions.push({
						type: "openFileRange",
						target: path,
						metadata: {
							repo,
							startLine,
							endLine,
						},
					});
				}
			}
		}

		// Convert UIMessages to CoreMessages for the AI SDK
		const coreMessages = convertToModelMessages(messages as UIMessage[]);

		// Stream the response with RAG context
		// The system prompt already includes the RAG context, so the AI will have
		// access to relevant code snippets while generating the response
		const result = await streamResponse(coreMessages, systemPrompt);

		// Return the streaming response (includes x-vercel-ai-ui-message-stream header)
		// Note: Source metadata (referencedNodes, suggestedActions) can be added
		// via custom data parts in the future if needed
		return result.toUIMessageStreamResponse();
	} catch (err) {
		console.error("/api/chat/query failed", err);
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
		console.warn(
			"/api/chat/add validation failed",
			z.treeifyError(parsed.error)
		);
		return new Response(
			JSON.stringify({
				error: "Invalid payload",
				details: z.treeifyError(parsed.error),
			}),
			{ status: 400, headers: { "content-type": "application/json" } }
		);
	}

	const { text, source, idPrefix } = parsed.data;
	// TODO: When I added source it worked
	console.log(parsed.data);
	console.log("/api/chat/add received", {
		source,
		idPrefix,
		textLength: text.length,
	});

	try {
		const collection = await getDocumentsCollection();
		console.log("Using collection", { name: "documents" });
		const ids = await addText(collection, text, { source, idPrefix });
		console.log("Added text to collection", { insertedCount: ids.length, ids });
		return new Response(JSON.stringify({ ok: true, ids }), {
			headers: { "content-type": "application/json" },
		});
	} catch (err) {
		console.error("/api/chat/add failed", err);
		return new Response(JSON.stringify({ error: "Internal Server Error" }), {
			status: 500,
			headers: { "content-type": "application/json" },
		});
	}
};

