import { env } from "../env";
import type { Metadata } from "chromadb";

export function buildPrompt(query: string, context: string): string {
  const system = `You are a concise assistant. Answer the user's question using the provided context. If uncertain, say you are unsure. Cite sources inline as [S1], [S2], etc. Keep answers focused.`;

  const instructions = `Context:\n${context}\n\nUser question: ${query}\n\nAnswer:`;

  const maxTokensNote = `(Max tokens: ${env.MAX_TOKENS})`;

  return `${system}\n\n${instructions}\n\n${maxTokensNote}`;
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



