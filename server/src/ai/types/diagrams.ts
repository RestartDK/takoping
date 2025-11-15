export interface DiagramEntity {
	id: string;
	label: string;
	kind: "api" | "service" | "component" | "data" | "file" | "external" | "database" | "middleware" | "layer" | "function" | "module";
	metadata?: {
		domain?: string; // e.g., "google.com", "stripe.com"
		path?: string; // for files or API endpoints
		method?: string; // for API calls (GET, POST, etc.)
		layer?: string; // for architecture diagrams
		description?: string;
		sourceRefs?: string[]; // references back to RAG results (e.g., ["SOURCE 1", "SOURCE 2"])
		httpMethod?: string; // for network requests
		endpoint?: string; // for API endpoints
		dataType?: string; // for data flow diagrams
		language?: string; // programming language
		[key: string]: unknown; // allow additional metadata
	};
}

export interface DiagramRelationship {
	id: string;
	source: string; // entity id
	target: string; // entity id
	type: "calls" | "imports" | "uses" | "transforms" | "sends" | "receives" | "depends_on" | "implements" | "contains" | "belongs_to";
	label?: string;
	metadata?: {
		dataType?: string; // for data flow
		httpMethod?: string; // for API calls
		frequency?: string; // e.g., "per_request", "batch"
		description?: string;
	};
}

export type DiagramType =
	| "network_requests"
	| "architecture"
	| "dependency_graph"
	| "data_flow"
	| "component_hierarchy"
	| "file_tree";

export type LayoutType = "hierarchical" | "force_directed" | "layered" | "treemap";

