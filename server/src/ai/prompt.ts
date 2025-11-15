import { env } from "@/env";
import type { Metadata } from "chromadb";

export function buildPrompt(
	activeDiagramId: string,
	owner: string,
	repo: string,
	classification?: { isDiagramRequest: boolean; reasoning: string } | null
): string {
	let diagramInstructions = "";

	if (classification?.isDiagramRequest) {
		diagramInstructions = `

=== DIAGRAM REQUEST DETECTED ===

The user wants a diagram. The RAG context above contains file paths.

STEP 1 - EXTRACT FILTERS FROM CONTEXT:
Look at the [[SOURCE X | repo:path]] labels in the context above.

Examples:
- See "src/routes/api.ts", "src/routes/auth.ts" → use pathPatterns: ["src/routes/**"]
- See "src/components/Button.tsx", "src/components/Input.tsx" → use pathPatterns: ["src/components/**"]
- User says "all files" or "whole project" → omit pathPatterns (shows everything)

Common directory patterns: "src/**", "lib/**", "app/**", "components/**"

STEP 2 - CALL createDiagram TOOL:
Immediately call the createDiagram tool with:
- name: Descriptive name based on user request (e.g., "Dependency Graph", "API Routes Structure")
- description: Brief description
- filters.pathPatterns: Array of patterns you extracted
- filters.languages: If user mentions language (e.g., "typescript")

EXAMPLE:
Context: [[SOURCE 1 | repo:src/routes/api.ts]], [[SOURCE 2 | repo:src/routes/auth.ts]]
User: "show me API routes"
→ createDiagram({ name: "API Routes", filters: { pathPatterns: ["src/routes/**"] } })

DO NOT describe the tool or output JSON - CALL IT DIRECTLY.`;
	}

	return `You are a coding assistant for the ${owner}/${repo} repository.

Answer questions using the provided context. Cite sources and quote code when helpful.

TOOLS AVAILABLE:
- createDiagram: Creates a new diagram visualization
- updateDiagramFilters: Updates existing diagram (ID: ${activeDiagramId})
${diagramInstructions}

For non-diagram questions, just answer directly.`;
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



// FIXME: Maybe use the routing technique if this does not work