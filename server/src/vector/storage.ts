import type { Collection, Metadata } from "chromadb";
import type { Chunk } from "./chunkers";
import { chunkText } from "./chunkers";

// Adding new data to vector db embeddings
export async function addText(
	collection: Collection,
	text: string,
	options: {
		source?: string;
		idPrefix?: string;
		metadata?: Metadata;
	} = {}
): Promise<string[]> {
	const chunks = chunkText(text);

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
			...(options.metadata ?? {}),
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

export async function addGitHubChunks(
	collection: Collection,
	chunks: Chunk[],
	options: {
		owner: string;
		repo: string;
		branch: string;
		path: string;
		sha: string;
		language: string;
	}
): Promise<string[]> {
	const ids: string[] = [];
	const documents: string[] = [];
	const metadatas: Metadata[] = [];

	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		if (!chunk) continue;

		const id = `gh:${options.owner}/${options.repo}:${options.branch}:${options.path}#L${chunk.startLine}-${chunk.endLine}:${options.sha}`;
		ids.push(id);
		documents.push(chunk.text);

		// ChromaDB doesn't accept null values in metadata - use empty string instead
		const metadata: Metadata = {
			repo: `${options.owner}/${options.repo}`,
			branch: options.branch,
			path: options.path,
			language: options.language,
			blobSha: options.sha,
			startLine: chunk.startLine,
			endLine: chunk.endLine,
			symbolName: chunk.metadata?.symbolName || "",
			symbolKind: chunk.metadata?.symbolKind || "",
			ingestedAt: Date.now(),
		};
		metadatas.push(metadata);
	}

	if (ids.length === 0) {
		return [];
	}

	await collection.add({
		ids,
		documents,
		metadatas,
	});

	return ids;
}

