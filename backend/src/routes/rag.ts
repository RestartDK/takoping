import { env } from "../env";
import { z } from "zod";
import { formatContexts, searchByText, addText } from "../ai/retriever";
import { buildPrompt } from "../ai/prompt";
import { generateRagAnswer } from "../ai/client";
import { getDocumentsCollection } from "../db/collections";

const QuerySchema = z.object({
	query: z.string().min(1, "query is required"),
});

const AddSchema = z.object({
	text: z.string().min(1, "text is required"),
	source: z.string().optional(),
	// optional: allow client to prepend an id prefix for easier tracing
	idPrefix: z.string().optional(),
});

export const ragRoute = async (req: Request) => {
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

	const parsed = QuerySchema.safeParse(await req.json());
	if (!parsed.success) {
		console.warn(
			"/api/rag/query validation failed",
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

	const { query } = parsed.data;
	console.log("/api/rag/query received", { query, topK: env.RETRIEVE_TOP_K });

	try {
		const collection = await getDocumentsCollection();
		console.log("Using collection", { name: "documents" });
		// Get the k most similar results from the collection
		// ChromaDB generates embeddings of the query text and performs cosine similarity search
		// Returns the k most similar results
		const results = await searchByText(query, collection, env.RETRIEVE_TOP_K);
		console.log("Query results", {
			ids: results.ids.length,
			documents: results.documents.length,
			metadatas: results.metadatas.length,
			distances: results.distances,
		});
		const context = formatContexts(results);
		const prompt = buildPrompt(query, context);
		const { text } = await generateRagAnswer(prompt);
		console.log("Generated answer length", { length: text.length });

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
				const nodeId = startLine && endLine ? `${repo}:${path}#L${startLine}-${endLine}` : `${repo}:${path}`;
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

		return new Response(
			JSON.stringify({
				answer: text,
				sources: results,
				referencedNodes,
				suggestedActions,
			}),
			{
				headers: { "content-type": "application/json" },
			}
		);
	} catch (err) {
		console.error(err);
		return new Response(JSON.stringify({ error: "Internal Server Error" }), {
			status: 500,
			headers: { "content-type": "application/json" },
		});
	}
};

export const ragAddRoute = async (req: Request) => {
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
			"/api/rag/add validation failed",
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
	console.log("/api/rag/add received", {
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
		console.error("/api/rag/add failed", err);
		return new Response(JSON.stringify({ error: "Internal Server Error" }), {
			status: 500,
			headers: { "content-type": "application/json" },
		});
	}
};
