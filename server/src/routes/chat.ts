import { env } from "../env";
import { z } from "zod";
// import { generateObject } from "ai"; // removed: no longer classifying intent
import { createOllama } from "ai-sdk-ollama";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { formatContexts, searchByText, addText, type SearchFilters } from "../ai/retriever";
import { buildPrompt } from "../ai/prompt";
import { streamResponseWithTools } from "../ai/agent";
import { getDocumentsCollection } from "../vector/collections";
import type { UIMessage } from "ai";

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
	activeDiagramId: z.string().min(1, "activeDiagramId is required"),
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

	const { messages, owner, repo, activeDiagramId } = parsed.data;
	console.log("/api/chat/query received", {
		messageCount: messages.length,
		topK: env.RETRIEVE_TOP_K,
		owner,
		repo,
		activeDiagramId,
	});

	try {
		// Get model for classification and extraction
		let model;
		if (env.AI_PROVIDER === "ollama") {
			const ollama = createOllama({ baseURL: env.OLLAMA_BASE_URL });
			if (!env.OLLAMA_REASONING_MODEL) {
				throw new Error("OLLAMA_REASONING_MODEL is required");
			}
			model = ollama(env.OLLAMA_REASONING_MODEL);
		} else {
			if (!env.NIM_API_KEY || !env.NIM_BASE_URL || !env.NIM_MODEL) {
				throw new Error("NIM credentials required");
			}
			const nim = createOpenAICompatible({
				name: "nim",
				apiKey: env.NIM_API_KEY,
				baseURL: env.NIM_BASE_URL,
			});
			model = nim(env.NIM_MODEL);
		}
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
		// Agent will infer whether to call a tool directly from the conversation
		const context = formatContexts(results);
		console.log("Formatted context length:", context.length);
		console.log("Formatted context preview:", context.substring(0, 500));
		const systemPrompt = buildPrompt(
			activeDiagramId,
			owner,
			repo,
			null
		);

		// NIM connectivity preflight diagnostics (non-blocking):
		if (env.AI_PROVIDER === "nim" && env.NIM_BASE_URL && env.NIM_API_KEY) {
			try {
				const preflightStart = Date.now();
				const controller = new AbortController();
				const timer = setTimeout(() => controller.abort(), 5000);
				const url = `${env.NIM_BASE_URL.replace(/\/$/, "")}/models`;
				console.log(`[preflight] GET ${url}`);
				const resp = await fetch(url, {
					headers: { Authorization: `Bearer ${env.NIM_API_KEY}` },
					signal: controller.signal,
				});
				clearTimeout(timer);
				const dur = Date.now() - preflightStart;
				let bodyPreview = "";
				try {
					const text = await resp.text();
					bodyPreview = text.substring(0, 300);
				} catch {}
				console.log("[preflight] models status:", resp.status, resp.statusText, "durationMs:", dur);
				console.log("[preflight] models body preview:", bodyPreview);
			} catch (e) {
				console.warn("[preflight] models request failed:", e);
			}
		}

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
		
		// Inject context into the latest user message
		// Ensure all messages have ids and normalize parts to only include text
		// This filters out tool execution parts from previous conversations that may have invalid types
		const messagesWithContext = messages.map(msg => {
			// Only keep text parts to avoid validation errors from tool/step parts
			const textParts = msg.parts.filter(p => p.type === "text" && p.text);
			
			return {
				id: msg.id || `msg-${Date.now()}-${Math.random()}`,
				role: msg.role,
				parts: textParts.length > 0 ? textParts : [{ type: "text", text: "" }],
			};
		}) as UIMessage[];
		const lastMessageIndex = messagesWithContext.length - 1;
		
		if (lastMessageIndex >= 0 && messagesWithContext[lastMessageIndex]?.role === "user") {
			const lastUserMessage = messagesWithContext[lastMessageIndex];
			// Extract the user's question from text parts
			const userQuestion = lastUserMessage.parts
				.filter((p) => p.type === "text" && "text" in p && p.text)
				.map((p) => ("text" in p ? p.text : ""))
				.join(" ");
			
			// Replace the last user message with context + question
			messagesWithContext[lastMessageIndex] = {
				...lastUserMessage,
				parts: [
					{
						type: "text",
						text: `Here is relevant context from the codebase:\n\n${context}\n\n---\n\nNow answer this question:\n\n${userQuestion}`,
					},
				],
			};
			console.log("\n=== CONTEXT INJECTION: ADDED AS SEPARATE SECTION IN LAST USER MESSAGE ===");
			console.log(`Last question: "${userQuestion}"`);
		} else {
			// Fallback: prepend context as new message if structure is unexpected
			messagesWithContext.unshift({
				id: `context-${Date.now()}`,
				role: "user",
				parts: [
					{
						type: "text",
						text: `Here is relevant context from the codebase:\n\n${context}\n\n---\n\nNow answer my question:`,
					},
				],
			});
			console.log("\n=== CONTEXT INJECTION: PREPENDED AS NEW MESSAGE (UNEXPECTED STRUCTURE) ===");
		}
		
		// Log the final messages being sent with context
		console.log("\n=== FINAL MESSAGES WITH CONTEXT (BEING SENT TO AI) ===");
		console.log(`Total messages: ${messagesWithContext.length}`);
		console.log(`System prompt length: ${systemPrompt.length} characters`);
		console.log("\nFull conversation history:");
		messagesWithContext.forEach((msg, idx) => {
			const textParts = msg.parts
				.filter((p) => p.type === "text" && "text" in p && p.text)
				.map((p) => ("text" in p ? p.text : ""))
				.join(" ");
			const contentLength = textParts.length;
			const isLastMessage = idx === messagesWithContext.length - 1;
			const hasContext = textParts.includes(context.substring(0, 100));
			
			console.log(`\n[${idx}] ${msg.role} (${contentLength} chars)`);
			
			// For non-last messages, show full content (they're short)
			if (!isLastMessage) {
				console.log(`  Content: ${textParts}`);
			} else {
				// For last message, show preview and indicate context
				const preview = textParts.substring(0, 400) + (contentLength > 400 ? "..." : "");
				console.log(`  Content preview: ${preview}`);
				console.log(`  Has context: ${hasContext}`);
				
				// Extract and show the actual question if it's in the last message
				if (hasContext && textParts.includes("Now answer this question:")) {
					const questionMatch = textParts.split("Now answer this question:")[1]?.trim();
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

		// Stream the response with RAG context and tools
		// The system prompt includes instructions, and the messages include the context + question
		console.log("[chat] Calling streamResponseWithTools with activeDiagramId:", activeDiagramId);
		
		// agent.respond() returns a Response object ready for the client
		return await streamResponseWithTools(
			messagesWithContext,
			activeDiagramId,
			owner,
			repo,
			systemPrompt
		);
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

