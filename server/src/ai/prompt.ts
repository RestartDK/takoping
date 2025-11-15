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

The user wants a diagram. Follow these steps:

STEP 1 - DETERMINE DIAGRAM TYPE:
Based on the user's request, choose the appropriate diagramType:
- "file_tree" - for codebase structure, file organization, directory tree
- "network_requests" - for API calls, fetch requests, HTTP endpoints, routes, external API integrations
- "architecture" - for MVC patterns, layered architecture, design patterns, system structure
- "dependency_graph" - for imports, module dependencies, package relationships
- "data_flow" - for data transformations, pipelines, processing flows
- "component_hierarchy" - for UI components, React/Vue components, component structure

STEP 2 - SEARCH FOR CONTEXT:
Call searchKnowledge with a query that captures the user's intent.

Examples:
- "Google Maps API integration in the codebase"
- "user authentication flow"
- "background processing pipeline"
- "MVC architecture patterns"
- "API routes and endpoints"
- "data transformation pipeline"

STEP 3 - EXTRACT ENTITIES AND RELATIONSHIPS:
From the search results, identify:

ENTITIES: APIs, services, components, data objects, external systems, files, functions, modules
- Look for: API endpoints, external services (Google Maps, Stripe, etc.), internal services, components, data stores, files mentioned in code
- Entity kinds: "api", "service", "component", "data", "external", "file", "function", "module", "database", "middleware", "layer"

RELATIONSHIPS: calls, imports, uses, transforms, depends_on, sends_to, receives_from
- Look for: fetch() calls, import statements, function calls, data flow, API calls, service invocations
- Relationship types: "calls", "imports", "uses", "transforms", "depends_on", "sends_to", "receives_from", "sends", "receives"

Include sourceRefs in entity metadata to reference which search result they came from (e.g., ["SOURCE 1", "SOURCE 2"]).

STEP 4 - CALL createDiagram TOOL:

For file_tree diagrams:
createDiagram({
  diagramType: "file_tree",
  name: "File Structure",
  filters: { pathPatterns: ["src/**"] } // Optional filters
})

For conceptual diagrams (network_requests, architecture, data_flow, etc.):
createDiagram({
  diagramType: "network_requests", // or "architecture", "data_flow", etc.
  name: "Google Maps API Integration",
  description: "Shows how Google Maps API is queried from the Bun server",
  entities: [
    { id: "google-maps-api", label: "Google Maps API", kind: "external", metadata: { domain: "maps.googleapis.com", sourceRefs: ["SOURCE 1"] } },
    { id: "bun-server", label: "Bun Server", kind: "service", metadata: { path: "server/index.ts", sourceRefs: ["SOURCE 2"] } },
    { id: "location-service", label: "Location Service", kind: "service", metadata: { path: "server/src/services/location.ts", sourceRefs: ["SOURCE 3"] } }
  ],
  relationships: [
    { id: "r1", source: "bun-server", target: "google-maps-api", type: "calls", label: "GET /maps/api" },
    { id: "r2", source: "location-service", target: "bun-server", type: "sends_to", label: "location data" }
  ],
  layoutType: "force_directed" // Optional: "hierarchical", "layered", "force_directed"
})

For architecture diagrams:
createDiagram({
  diagramType: "architecture",
  name: "MVC Architecture",
  entities: [
    { id: "controller-layer", label: "Controllers", kind: "layer", metadata: { layer: "controller" } },
    { id: "model-layer", label: "Models", kind: "layer", metadata: { layer: "model" } },
    { id: "view-layer", label: "Views", kind: "layer", metadata: { layer: "view" } },
    { id: "user-controller", label: "UserController", kind: "service", metadata: { path: "src/controllers/user.ts", layer: "controller" } }
  ],
  relationships: [
    { id: "r1", source: "user-controller", target: "controller-layer", type: "belongs_to" }
  ],
  layoutType: "layered"
})

IMPORTANT:
- For conceptual diagrams (network_requests, architecture, data_flow, dependency_graph, component_hierarchy), you MUST provide entities and relationships extracted from searchKnowledge results
- For file_tree diagrams, use filters instead of entities
- Always include diagramType parameter
- Include sourceRefs in entity metadata to track which search results they came from

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