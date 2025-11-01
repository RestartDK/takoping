import type { Collection, Metadata, Where } from "chromadb";
import { env } from "../env";

// Chunking strategy
// FIXME: Maybe remove this part here I already have /chunkers for this..?
const generateChunks = (input: string): string[] => {
	return input
		.trim()
		.split(".")
		.filter((i) => i !== "");
};

// Adding new data to vector db embeddings
export async function addText(
	collection: Collection,
	text: string,
	options: {
		source?: string;
		idPrefix?: string;
	} = {}
): Promise<string[]> {
	const chunks = generateChunks(text);

	if (chunks.length === 0) {
		return [];
	}

	const ids: string[] = [];
	const documents: string[] = [];
	const metadatas: Metadata[] = [];

	const timestamp = Date.now();
	const prefix = options.idPrefix ?? options.source ?? "doc";

	chunks.forEach((chunk, index) => {
		const id = `${prefix}_${timestamp}_${index}`;
		ids.push(id);
		documents.push(chunk.trim());
		
		const metadata: Metadata = {
			source: options.source ?? "",
			chunkIndex: index,
			totalChunks: chunks.length,
		};
		metadatas.push(metadata);
	});

	await collection.add({
		ids,
		documents,
		metadatas,
	});

	return ids;
}

export interface SearchFilters {
	repo?: string;
	path?: string;
	language?: string;
}

export async function searchByText(
	query: string,
	collection: Collection,
	topK = env.RETRIEVE_TOP_K,
	filters?: SearchFilters
) {
	let where: Where | undefined;
	if (filters?.repo || filters?.path || filters?.language) {
		const conditions: Where[] = [];
		if (filters?.repo) {
			conditions.push({ repo: filters.repo });
		}
		if (filters?.path) {
			conditions.push({ path: filters.path });
		}
		if (filters?.language) {
			conditions.push({ language: filters.language });
		}
		where = conditions.length === 1 ? conditions[0] : { $and: conditions };
	}

	const res = await collection.query({
		queryTexts: [query],
		nResults: topK,
		include: ["documents", "metadatas", "distances"],
		where,
	});

	console.log(`[DEBUG] Query response:`, {
		idsCount: res.ids?.[0]?.length ?? 0,
		documentsCount: res.documents?.[0]?.length ?? 0,
		metadatasCount: res.metadatas?.[0]?.length ?? 0,
		distancesCount: res.distances?.[0]?.length ?? 0,
		sampleMetadata: res.metadatas?.[0]?.[0],
		whereFilter: where,
	});

	return {
		ids: (res.ids?.[0] ?? []).filter((id): id is string => id !== null),
		documents: (res.documents?.[0] ?? []).filter(
			(doc): doc is string => doc !== null
		),
		metadatas: (res.metadatas?.[0] ?? []).filter(
			(meta): meta is Metadata => meta !== null
		),
		distances: (res.distances?.[0] ?? []).filter(
			(dist): dist is number => dist !== null
		),
	};
}

export function formatContexts(results: {
	ids: string[];
	documents: string[];
	metadatas?: Metadata[];
	distances: number[];
}): string {
	const length = Math.max(
		results.ids.length,
		results.documents.length,
		results.metadatas?.length ?? 0,
		results.distances.length
	);

	return Array.from({ length }, (_, i) => {
		const id = results.ids[i] ?? String(i);
		const text = results.documents[i] ?? "";
		if (!text) return "";

		const metadata = results.metadatas?.[i];
		const path = metadata?.path as string | undefined;
		const startLine = metadata?.startLine as number | undefined;
		const endLine = metadata?.endLine as number | undefined;
		const repo = metadata?.repo as string | undefined;

		let sourceLabel = `[[SOURCE ${i + 1} | id=${id}]]`;
		if (path) {
			const lineRange = startLine && endLine ? `#L${startLine}-${endLine}` : "";
			const repoPrefix = repo ? `${repo}:` : "";
			sourceLabel = `[[SOURCE ${i + 1} | ${repoPrefix}${path}${lineRange}]]`;
		}

		return `${sourceLabel}\n${text}`;
	})
		.filter((item) => item.length > 0)
		.join("\n\n---\n\n");
}
