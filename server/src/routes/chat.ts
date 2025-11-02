import { env } from "../env";
import { z } from "zod";
import { formatContexts, searchByText, addText, type SearchFilters } from "../ai/retriever";
import { buildPrompt } from "../ai/prompt";
import { streamResponse } from "../ai/client";
import { getDocumentsCollection } from "../vector/collections";
import { convertToModelMessages, type UIMessage, type CoreMessage, type ModelMessage } from "ai";

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
	owner: z.string().min(1, "owner is required"),
	repo: z.string().min(1, "repo is required"),
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

	const { messages, owner, repo } = parsed.data;
	console.log("/api/chat/query received", {
		messageCount: messages.length,
		topK: env.RETRIEVE_TOP_K,
		owner,
		repo,
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

		// Perform RAG retrieval with repository filter
		const collection = await getDocumentsCollection();
		console.log("Using collection", { name: "documents" });
		
		// Build filters for repository-scoped search (owner and repo are required)
		const filters: SearchFilters = {
			repo: `${owner}/${repo}`,
		};
		
		const results = await searchByText(query, collection, env.RETRIEVE_TOP_K, filters);
		console.log("Query results", {
			ids: results.ids.length,
			documents: results.documents.length,
			metadatas: results.metadatas.length,
			distances: results.distances,
		});

		// Format context and build system prompt
		const context = formatContexts(results);
		console.log("Formatted context length:", context.length);
		console.log("Formatted context preview:", context.substring(0, 500));
		const systemPrompt = buildPrompt(context);

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

		// Helper function to extract text content from a message
		const extractTextFromContent = (content: unknown): string => {
			if (typeof content === "string") {
				return content;
			}
			if (Array.isArray(content)) {
				// Handle array of objects with text property
				return content
					.map((item) => {
						if (typeof item === "object" && item !== null) {
							if ("text" in item && typeof item.text === "string") {
								return item.text;
							}
							// Fallback: stringify the item
							return JSON.stringify(item);
						}
						return String(item);
					})
					.join(" ");
			}
			if (typeof content === "object" && content !== null) {
				// Try to extract text from object
				if ("text" in content && typeof (content as { text: unknown }).text === "string") {
					return (content as { text: string }).text;
				}
			}
			return JSON.stringify(content);
		};

		// Convert UIMessages to CoreMessages for the AI SDK
		const coreMessages = convertToModelMessages(messages as UIMessage[]);
		
		// Normalize message content to ensure all messages have string content
		// Create ModelMessages with string content
		const normalizedMessages: ModelMessage[] = coreMessages.map((msg) => {
			const textContent = extractTextFromContent(msg.content);
			return {
				role: msg.role,
				content: textContent,
			} as ModelMessage;
		});
		
		// Log original messages received from client
		console.log("=== ORIGINAL MESSAGES FROM CLIENT ===");
		console.log(`Total messages: ${messages.length}`);
		messages.forEach((msg, idx) => {
			const textParts = msg.parts
				.filter((p) => p.type === "text" && p.text)
				.map((p) => p.text!)
				.join(" ");
			console.log(`[${idx}] ${msg.role}:`, {
				id: msg.id,
				text: textParts.substring(0, 100) + (textParts.length > 100 ? "..." : ""),
				parts: msg.parts.map(p => ({ type: p.type, textLength: p.text?.length || 0 })),
			});
		});
		
		// Log converted and normalized messages (before context injection)
		console.log("\n=== NORMALIZED MESSAGES (BEFORE CONTEXT) ===");
		console.log(`Total messages: ${normalizedMessages.length}`);
		normalizedMessages.forEach((msg, idx) => {
			const contentStr = typeof msg.content === "string" ? msg.content : extractTextFromContent(msg.content);
			const preview = contentStr.substring(0, 200) + (contentStr.length > 200 ? "..." : "");
			console.log(`[${idx}] ${msg.role} (${contentStr.length} chars): ${preview}`);
		});
		
		// Inject context only for the latest user message
		// Keep conversation history intact, only add context to the new question
		const lastMessageIndex = normalizedMessages.length - 1;
		const messagesWithContext: ModelMessage[] = [...normalizedMessages];
		
		if (lastMessageIndex >= 0 && normalizedMessages[lastMessageIndex]?.role === "user") {
			// Add context as a separate user message before the question
			// This keeps the conversation history clear and the question prominent
			const lastUserMessage = normalizedMessages[lastMessageIndex];
			const lastUserQuestion = typeof lastUserMessage.content === "string" 
				? lastUserMessage.content 
				: extractTextFromContent(lastUserMessage.content);
			
			// Insert context message right before the last user message
			messagesWithContext[lastMessageIndex] = {
				role: "user",
				content: `Here is relevant context from the codebase:\n\n${context}\n\n---\n\nNow answer this question:\n\n${lastUserQuestion}`,
			} as ModelMessage;
			console.log("\n=== CONTEXT INJECTION: ADDED AS SEPARATE SECTION IN LAST USER MESSAGE ===");
			console.log(`Last question: "${lastUserQuestion}"`);
		} else {
			// Fallback: prepend context if structure is unexpected
			messagesWithContext.unshift({
				role: "user",
				content: `Here is relevant context from the codebase:\n\n${context}\n\n---\n\nNow answer my question:`,
			} as ModelMessage);
			console.log("\n=== CONTEXT INJECTION: PREPENDED AS NEW MESSAGE (UNEXPECTED STRUCTURE) ===");
		}
		
		// Log the final messages being sent with context
		console.log("\n=== FINAL MESSAGES WITH CONTEXT (BEING SENT TO AI) ===");
		console.log(`Total messages: ${messagesWithContext.length}`);
		console.log(`System prompt length: ${systemPrompt.length} characters`);
		console.log("\nFull conversation history:");
		messagesWithContext.forEach((msg, idx) => {
			const contentStr = typeof msg.content === "string" ? msg.content : extractTextFromContent(msg.content);
			const contentLength = contentStr.length;
			const isLastMessage = idx === messagesWithContext.length - 1;
			const hasContext = contentStr.includes(context.substring(0, 100));
			
			console.log(`\n[${idx}] ${msg.role} (${contentLength} chars)`);
			
			// For non-last messages, show full content (they're short)
			if (!isLastMessage) {
				console.log(`  Content: ${contentStr}`);
			} else {
				// For last message, show preview and indicate context
				const preview = contentStr.substring(0, 400) + (contentLength > 400 ? "..." : "");
				console.log(`  Content preview: ${preview}`);
				console.log(`  Has context: ${hasContext}`);
				
				// Extract and show the actual question if it's in the last message
				if (hasContext && contentStr.includes("Now answer this question:")) {
					const questionMatch = contentStr.split("Now answer this question:")[1]?.trim();
					if (questionMatch) {
						const questionPreview = questionMatch.substring(0, 200) + (questionMatch.length > 200 ? "..." : "");
						console.log(`  Actual question: "${questionPreview}"`);
					}
				}
			}
		});
		
		// Log context preview separately
		console.log("\n=== CONTEXT BEING INCLUDED ===");
		console.log(`Context length: ${context.length} characters`);
		console.log(`Context preview (first 500 chars):`);
		console.log(context.substring(0, 500));
		console.log("==========================================\n");

		// Stream the response with RAG context
		// The system prompt includes instructions, and the messages include the context + question
		const result = await streamResponse(messagesWithContext, systemPrompt);

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

