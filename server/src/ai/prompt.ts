import { env } from "../env";
import type { Metadata } from "chromadb";

export function buildPrompt(context: string): string {
	// System prompt provides general instructions
	// The actual context is injected directly into the conversation messages
	const system = `You are a helpful coding assistant specialized in answering questions about codebases.

When the user provides context from a codebase, you MUST:
1. Use that context to answer their questions
2. Cite sources using [SOURCE 1], [SOURCE 2], etc. format
3. Quote specific code when relevant, mentioning file paths and line numbers
4. If the context doesn't contain needed information, explicitly say so
5. Be precise and reference exact code from the provided context`;

	return system;
}

export function sourcesWithIndices(results: {
	ids: string[];
	documents: string[];
	metadatas: Metadata[];
	distances: number[];
}) {
  const length = Math.max(
		results.ids.length,
		results.documents.length,
		results.metadatas.length,
		results.distances.length
	);
  
  return Array.from({ length }, (_, i) => ({
    id: results.ids[i] ?? String(i),
    metadata: results.metadatas[i] ?? {},
    text: results.documents[i] ?? "",
    distance: results.distances[i] ?? Number.NaN,
    index: i + 1,
  }));
}



