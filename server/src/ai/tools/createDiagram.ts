import { tool } from "ai";
import { z } from "zod";
import {
	getFileTreeForReactFlow,
	saveDiagramPreset,
	getRepository,
	type ReactFlowNode,
	type ReactFlowEdge,
} from "@/db/queries";
import type { DiagramEntity, DiagramRelationship } from "@/ai/types/diagrams";

// Entity schema for Zod validation
const entitySchema = z.object({
	id: z.string(),
	label: z.string(),
	kind: z.enum(["api", "service", "component", "data", "external", "file", "function", "module", "database", "middleware", "layer"]),
	metadata: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("Additional metadata (domain, path, method, layer, description, sourceRefs, etc.)"),
});

// Relationship schema for Zod validation
const relationshipSchema = z.object({
	id: z.string(),
	source: z.string().describe("Source entity ID"),
	target: z.string().describe("Target entity ID"),
	type: z.enum(["calls", "imports", "uses", "transforms", "depends_on", "sends_to", "receives_from", "sends", "receives", "implements", "contains", "belongs_to"]),
	label: z.string().optional(),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

// CreateDiagram tool schema
const createDiagramSchema = z.object({
	diagramType: z
		.enum([
			"file_tree",
			"network_requests",
			"architecture",
			"dependency_graph",
			"data_flow",
			"component_hierarchy",
		])
		.describe(
			"Type of diagram to create: 'file_tree' for codebase structure, 'network_requests' for API/fetch calls, 'architecture' for MVC/layers/patterns, 'dependency_graph' for imports/dependencies, 'data_flow' for data transformations, 'component_hierarchy' for UI components"
		),
	name: z.string().describe("Diagram title (e.g., 'API Network Requests', 'MVC Architecture', 'TypeScript Source Files')"),
	description: z.string().optional().describe("Human-readable description of the diagram"),
	entities: z
		.array(entitySchema)
		.optional()
		.describe("Entities to visualize, extracted from search results. Required for conceptual diagrams (network_requests, architecture, data_flow, etc.). Not needed for file_tree."),
	relationships: z
		.array(relationshipSchema)
		.optional()
		.describe("Relationships between entities. Required for conceptual diagrams. Not needed for file_tree."),
	filters: z
		.object({
			pathPatterns: z
				.array(z.string())
				.optional()
				.describe("Include paths matching these patterns (e.g., ['src/**', 'lib/**']). Only used for file_tree diagrams."),
			excludePaths: z
				.array(z.string())
				.optional()
				.describe("Exclude paths matching these patterns (e.g., ['**/*.test.ts', 'node_modules/**']). Only used for file_tree diagrams."),
			languages: z
				.array(z.string())
				.optional()
				.describe("Filter by programming languages (e.g., ['typescript', 'python']). Only used for file_tree diagrams."),
			maxDepth: z.number().optional().describe("Maximum tree depth to show (default: 7). Only used for file_tree diagrams."),
		})
		.optional(),
	layoutType: z
		.enum(["hierarchical", "treemap", "force_directed", "layered"])
		.optional()
		.describe("Layout algorithm to use: 'hierarchical' for tree structures, 'treemap' for size-based, 'force_directed' for networks, 'layered' for architecture diagrams"),
	config: z
		.record(z.string(), z.unknown())
		.optional()
		.describe("Additional configuration specific to diagram type (e.g., for architecture: { pattern: 'MVC', layers: ['controller', 'model', 'view'] })"),
});

/**
 * Factory function that creates a createDiagram tool with request variables.
 * This allows the tool to access owner/repo information from the request.
 */
export function makeCreateDiagramTool(owner: string, repo: string) {
	return tool({
		description:
			"Generate various types of diagrams and visualizations of the codebase. Use this when the user asks to create, generate, or show any diagram or visualization. Supports multiple diagram types: file_tree (codebase structure), network_requests (API calls, fetch requests, HTTP endpoints), architecture (MVC, layered architecture, design patterns), dependency_graph (imports, module dependencies), data_flow (data transformations, pipelines), component_hierarchy (UI component structure). Choose the appropriate diagramType based on what the user wants to visualize.",
		inputSchema: createDiagramSchema,
		execute: async (params) => {
			return await createDiagram({
				...params,
				owner,
				repo,
				entities: params.entities as DiagramEntity[] | undefined,
				relationships: params.relationships as DiagramRelationship[] | undefined,
			});
		},
	});
}

/**
 * Build diagram from entities and relationships (for conceptual diagrams)
 */
export function buildDiagramFromEntities(
	entities: DiagramEntity[],
	relationships: DiagramRelationship[],
	diagramType: string,
	layoutType: string = "hierarchical"
): { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] } {
	// Convert entities to ReactFlow nodes
	const nodes: ReactFlowNode[] = entities.map((entity) => {
		const style = getNodeStyle(entity.kind);
		return {
			id: entity.id,
			type: getNodeType(entity.kind),
			position: { x: 0, y: 0 }, // Will be positioned by layout
			data: {
				label: entity.label,
				path: entity.metadata?.path || entity.label,
				size: null,
				cumulativeSize: null,
				fileCount: null,
				language: (entity.metadata && "language" in entity.metadata ? (entity.metadata.language as string | undefined) : undefined) || null,
				extension: null,
				hasChunks: null,
				chunkCount: null,
				kind: entity.kind,
				...entity.metadata,
			},
			style: {
				backgroundColor: style.background,
				border: `2px solid ${style.border}`,
				borderRadius: "8px",
				padding: "10px",
			},
		};
	});

	// Convert relationships to ReactFlow edges
	const edges: ReactFlowEdge[] = relationships.map((rel) => {
		const edgeStyle = getEdgeStyle(rel.type);
		return {
			id: rel.id,
			source: rel.source,
			target: rel.target,
			type: "smoothstep",
			label: rel.label || rel.type,
			animated: rel.type === "sends" || rel.type === "receives" || rel.type === "transforms",
			style: edgeStyle,
			labelStyle: {
				fontSize: "12px",
				fontWeight: 500,
			},
			labelBgStyle: {
				fill: "#fff",
				fillOpacity: 0.8,
			},
		};
	});

	// Apply layout based on diagram type
	const positionedNodes = applyLayout(nodes, edges, diagramType, layoutType);

	return { nodes: positionedNodes, edges };
}

/**
 * Get node style based on entity kind
 */
function getNodeStyle(kind: string): { background: string; border: string } {
	const styles: Record<string, { background: string; border: string }> = {
		api: { background: "#e3f2fd", border: "#2196f3" },
		service: { background: "#e8f5e9", border: "#4caf50" },
		component: { background: "#fff3e0", border: "#ff9800" },
		data: { background: "#fce4ec", border: "#e91e63" },
		external: { background: "#f3e5f5", border: "#9c27b0" },
		database: { background: "#e0f2f1", border: "#009688" },
		middleware: { background: "#f1f8e9", border: "#8bc34a" },
		file: { background: "#fafafa", border: "#9e9e9e" },
		layer: { background: "#e3f2fd", border: "#2196f3" },
		function: { background: "#fff9c4", border: "#fbc02d" },
		module: { background: "#f3e5f5", border: "#9c27b0" },
	};
	const defaultStyle: { background: string; border: string } = { background: "#fafafa", border: "#9e9e9e" };
	return styles[kind] ?? defaultStyle;
}

/**
 * Get node type for ReactFlow based on entity kind
 */
function getNodeType(kind: string): string {
	const typeMap: Record<string, string> = {
		api: "api",
		service: "service",
		component: "component",
		data: "data",
		external: "external",
		database: "database",
		middleware: "middleware",
		layer: "layer",
		function: "function",
		module: "module",
	};
	return typeMap[kind] || "default";
}

/**
 * Get edge style based on relationship type
 */
function getEdgeStyle(relType: string): { stroke?: string; strokeWidth?: number } {
	const styles: Record<string, { stroke: string; strokeWidth: number }> = {
		calls: { stroke: "#2196f3", strokeWidth: 2 },
		imports: { stroke: "#4caf50", strokeWidth: 2 },
		uses: { stroke: "#ff9800", strokeWidth: 2 },
		transforms: { stroke: "#e91e63", strokeWidth: 3 },
		depends_on: { stroke: "#9e9e9e", strokeWidth: 1 },
		sends: { stroke: "#9c27b0", strokeWidth: 2 },
		receives: { stroke: "#009688", strokeWidth: 2 },
		sends_to: { stroke: "#9c27b0", strokeWidth: 2 },
		receives_from: { stroke: "#009688", strokeWidth: 2 },
		implements: { stroke: "#607d8b", strokeWidth: 2 },
		contains: { stroke: "#795548", strokeWidth: 1 },
		belongs_to: { stroke: "#795548", strokeWidth: 1 },
	};
	return styles[relType] || { stroke: "#9e9e9e", strokeWidth: 1 };
}

/**
 * Get default layout type for a diagram type
 */
function getDefaultLayoutType(diagramType: string): string {
	const defaults: Record<string, string> = {
		network_requests: "force_directed",
		architecture: "layered",
		data_flow: "hierarchical",
		dependency_graph: "force_directed",
		component_hierarchy: "hierarchical",
	};
	return defaults[diagramType] || "hierarchical";
}

/**
 * Apply layout algorithm based on diagram type
 */
function applyLayout(
	nodes: ReactFlowNode[],
	edges: ReactFlowEdge[],
	diagramType: string,
	layoutType: string
): ReactFlowNode[] {
	// Use layoutType if specified, otherwise use diagram-specific default
	const effectiveLayoutType = layoutType || getDefaultLayoutType(diagramType);

	switch (effectiveLayoutType) {
		case "layered":
			return applyLayeredLayout(nodes, edges);
		case "force_directed":
			return applyForceDirectedLayout(nodes, edges);
		case "hierarchical":
			return applyHierarchicalLayout(nodes, edges);
		default:
			// Fallback to diagram-specific layout
			switch (diagramType) {
				case "network_requests":
					return applyNetworkLayout(nodes, edges);
				case "architecture":
					return applyLayeredLayout(nodes, edges);
				case "data_flow":
					return applyDataFlowLayout(nodes, edges);
				case "dependency_graph":
					return applyForceDirectedLayout(nodes, edges);
				case "component_hierarchy":
					return applyHierarchicalLayout(nodes, edges);
				default:
					return applyHierarchicalLayout(nodes, edges);
			}
	}
}

/**
 * Network requests layout: External APIs on left, services in middle, databases on right
 */
function applyNetworkLayout(nodes: ReactFlowNode[], edges: ReactFlowEdge[]): ReactFlowNode[] {
	const externalNodes: ReactFlowNode[] = [];
	const serviceNodes: ReactFlowNode[] = [];
	const apiNodes: ReactFlowNode[] = [];
	const databaseNodes: ReactFlowNode[] = [];
	const otherNodes: ReactFlowNode[] = [];

	nodes.forEach((node) => {
		const kind = (node.data as any).kind || "";
		if (kind === "external") {
			externalNodes.push(node);
		} else if (kind === "service") {
			serviceNodes.push(node);
		} else if (kind === "api") {
			apiNodes.push(node);
		} else if (kind === "database") {
			databaseNodes.push(node);
		} else {
			otherNodes.push(node);
		}
	});

	let x = 100;
	const ySpacing = 150;
	const xSpacing = 300;

	// Position external APIs on the left
	externalNodes.forEach((node, idx) => {
		node.position = { x, y: idx * ySpacing + 100 };
	});

	x += xSpacing;

	// Position services in the middle
	serviceNodes.forEach((node, idx) => {
		node.position = { x, y: idx * ySpacing + 100 };
	});

	x += xSpacing;

	// Position internal APIs
	apiNodes.forEach((node, idx) => {
		node.position = { x, y: idx * ySpacing + 100 };
	});

	x += xSpacing;

	// Position databases on the right
	databaseNodes.forEach((node, idx) => {
		node.position = { x, y: idx * ySpacing + 100 };
	});

	// Position other nodes below
	otherNodes.forEach((node, idx) => {
		node.position = { x: 100 + (idx % 3) * xSpacing, y: Math.max(...nodes.map((n) => n.position.y)) + ySpacing + idx * 100 };
	});

	return nodes;
}

/**
 * Layered layout for architecture diagrams: vertical layers
 */
function applyLayeredLayout(nodes: ReactFlowNode[], edges: ReactFlowEdge[]): ReactFlowNode[] {
	const layerMap = new Map<string, ReactFlowNode[]>();

	// Group nodes by layer
	nodes.forEach((node) => {
		const layer = (node.data as any).metadata?.layer || (node.data as any).layer || "default";
		if (!layerMap.has(layer)) {
			layerMap.set(layer, []);
		}
		layerMap.get(layer)!.push(node);
	});

	const layers = Array.from(layerMap.keys());
	const layerHeight = 200;
	const nodeSpacing = 150;
	const startX = 100;

	layers.forEach((layer, layerIdx) => {
		const layerNodes = layerMap.get(layer)!;
		layerNodes.forEach((node, nodeIdx) => {
			node.position = {
				x: startX + nodeIdx * nodeSpacing,
				y: layerIdx * layerHeight + 100,
			};
		});
	});

	return nodes;
}

/**
 * Data flow layout: left to right flow
 */
function applyDataFlowLayout(nodes: ReactFlowNode[], edges: ReactFlowEdge[]): ReactFlowNode[] {
	// Simple left-to-right positioning
	const xSpacing = 250;
	const ySpacing = 150;
	const startX = 100;
	const startY = 100;

	nodes.forEach((node, idx) => {
		const row = Math.floor(idx / 3);
		const col = idx % 3;
		node.position = {
			x: startX + col * xSpacing,
			y: startY + row * ySpacing,
		};
	});

	return nodes;
}

/**
 * Force-directed layout simulation (simple grid-based approximation)
 */
function applyForceDirectedLayout(nodes: ReactFlowNode[], edges: ReactFlowEdge[]): ReactFlowNode[] {
	// Simple grid layout as approximation
	const cols = Math.ceil(Math.sqrt(nodes.length));
	const xSpacing = 200;
	const ySpacing = 150;
	const startX = 100;
	const startY = 100;

	nodes.forEach((node, idx) => {
		const row = Math.floor(idx / cols);
		const col = idx % cols;
		node.position = {
			x: startX + col * xSpacing,
			y: startY + row * ySpacing,
		};
	});

	return nodes;
}

/**
 * Hierarchical layout: tree structure
 */
function applyHierarchicalLayout(nodes: ReactFlowNode[], edges: ReactFlowEdge[]): ReactFlowNode[] {
	// Build adjacency map
	const childrenMap = new Map<string, string[]>();
	const parentMap = new Map<string, string>();

	edges.forEach((edge) => {
		if (!childrenMap.has(edge.source)) {
			childrenMap.set(edge.source, []);
		}
		childrenMap.get(edge.source)!.push(edge.target);
		parentMap.set(edge.target, edge.source);
	});

	// Find root nodes (nodes with no incoming edges)
	const rootNodes = nodes.filter((node) => !parentMap.has(node.id));

	// Simple hierarchical positioning
	const xSpacing = 200;
	const ySpacing = 150;
	const startX = 100;
	const startY = 100;

	function positionNode(nodeId: string, level: number, siblingIndex: number): void {
		const node = nodes.find((n) => n.id === nodeId);
		if (!node) return;

		const children = childrenMap.get(nodeId) || [];
		node.position = {
			x: startX + siblingIndex * xSpacing,
			y: startY + level * ySpacing,
		};

		children.forEach((childId, childIdx) => {
			positionNode(childId, level + 1, siblingIndex * children.length + childIdx);
		});
	}

	rootNodes.forEach((root, idx) => {
		positionNode(root.id, 0, idx);
	});

	// Position any unconnected nodes
	nodes.forEach((node) => {
		if (node.position.x === 0 && node.position.y === 0) {
			node.position = {
				x: startX + nodes.indexOf(node) * xSpacing,
				y: startY + 500,
			};
		}
	});

	return nodes;
}

/**
 * Generate diagram nodes and edges based on diagram type
 * Transforms file tree data into different visualization types
 * DEPRECATED: This function is kept for backward compatibility but should not be used for conceptual diagrams
 */
async function generateDiagramFromType(
	diagramType: "network_requests" | "architecture" | "dependency_graph" | "data_flow" | "component_hierarchy",
	fileTreeData: { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] },
	options: { filters?: any; config?: Record<string, unknown> }
): Promise<{ nodes: ReactFlowNode[]; edges: ReactFlowEdge[] }> {
	const { nodes: fileNodes, edges: fileEdges } = fileTreeData;
	const { filters, config } = options;

	switch (diagramType) {
		case "network_requests": {
			// Extract API routes, fetch calls, HTTP endpoints
			// Look for files that might contain network requests
			const apiNodes = fileNodes
				.filter((node) => {
					const path = node.data?.path || "";
					const name = node.data?.label || "";
					// Match common API/route patterns
					return (
						/api|route|endpoint|fetch|http|request/i.test(path) ||
						/api|route|endpoint|fetch|http|request/i.test(name) ||
						path.includes("/routes/") ||
						path.includes("/api/") ||
						path.includes("/endpoints/")
					);
				})
				.map((node, idx) => ({
					...node,
					id: `api-${node.id}`,
					type: "api",
					position: { x: (idx % 5) * 200, y: Math.floor(idx / 5) * 150 },
					data: {
						...node.data,
						label: node.data?.label || node.data?.path?.split("/").pop() || "API",
						type: "endpoint",
					},
				}));

			// Create edges between related API nodes
			const apiEdges: ReactFlowEdge[] = apiNodes
				.slice(0, -1)
				.map((node, idx) => {
					const nextNode = apiNodes[idx + 1];
					if (!nextNode) return null;
					return {
						id: `api-edge-${idx}`,
						source: node.id,
						target: nextNode.id,
						type: "smoothstep",
					} as ReactFlowEdge;
				})
				.filter((e): e is ReactFlowEdge => e !== null);

			return { nodes: apiNodes, edges: apiEdges };
		}

		case "architecture": {
			// Group files by architectural layers/patterns
			const pattern = (config?.pattern as string) || "layered";
			const layers = (config?.layers as string[]) || ["controller", "model", "view", "service"];

			const layerNodes: ReactFlowNode[] = layers.map((layer, layerIdx) => ({
				id: `layer-${layer}`,
				type: "layer",
				position: { x: 100, y: layerIdx * 200 + 100 },
				data: {
					label: layer.charAt(0).toUpperCase() + layer.slice(1),
					path: layer,
					size: null,
					cumulativeSize: null,
					fileCount: null,
					language: null,
					extension: null,
					hasChunks: null,
					chunkCount: null,
				},
				style: {
					width: "300px",
					height: "150px",
					backgroundColor: "#e3f2fd",
				},
			}));

			// Group file nodes by layer based on path patterns
			const fileNodesByLayer = fileNodes
				.filter((node) => {
					const path = (node.data?.path || "").toLowerCase();
					return layers.some((layer) => path.includes(layer));
				})
				.map((node, idx) => {
					const path = (node.data?.path || "").toLowerCase();
					const layer = layers.find((l) => path.includes(l)) || (layers[0] ?? "default");
					const layerIdx = layers.indexOf(layer);
					return {
						...node,
						id: `arch-${node.id}`,
						position: {
							x: 450 + (idx % 3) * 150,
							y: layerIdx * 200 + 100 + (Math.floor(idx / 3) % 2) * 80,
						},
						data: {
							...node.data,
						},
					};
				});

			// Create edges from layers to files
			// Determine layer from path for each node
			const archEdges: ReactFlowEdge[] = fileNodesByLayer
				.map((node, idx) => {
					const path = (node.data?.path || "").toLowerCase();
					const layer = layers.find((l) => path.includes(l)) || (layers[0] ?? "default");
					return {
						id: `arch-edge-${idx}`,
						source: `layer-${layer}`,
						target: node.id,
						type: "smoothstep",
					} as ReactFlowEdge;
				});

			return {
				nodes: [...layerNodes, ...fileNodesByLayer],
				edges: archEdges,
			};
		}

		case "dependency_graph": {
			// Show import/dependency relationships
			// For now, create a graph based on file structure (parent-child relationships)
			// In a real implementation, you'd parse imports from source code
			const depNodes = fileNodes.map((node) => ({
				...node,
				id: `dep-${node.id}`,
				type: node.type === "file" ? "module" : "package",
				data: {
					...node.data,
					label: node.data?.label || node.data?.path?.split("/").pop() || "Module",
				},
			}));

			// Use existing edges but mark them as dependencies
			const depEdges = fileEdges.map((edge, idx) => ({
				...edge,
				id: `dep-${edge.id}`,
				source: `dep-${edge.source}`,
				target: `dep-${edge.target}`,
				type: "smoothstep",
			}));

			return { nodes: depNodes, edges: depEdges };
		}

		case "data_flow": {
			// Show data transformation pipeline
			// Group by file type/extension to show data flow
			const dataNodes = fileNodes
				.filter((node) => node.type === "file")
				.map((node, idx) => ({
					...node,
					id: `data-${node.id}`,
					type: "data",
					position: { x: idx * 180, y: Math.floor(idx / 4) * 150 + 100 },
					data: {
						...node.data,
						label: node.data?.label || node.data?.path?.split("/").pop() || "Data",
						stage: idx % 4, // Simulate data stages
					},
				}));

			// Create sequential flow edges
			const flowEdges: ReactFlowEdge[] = dataNodes
				.slice(0, -1)
				.map((node, idx) => {
					const nextNode = dataNodes[idx + 1];
					if (!nextNode) return null;
					return {
						id: `flow-edge-${idx}`,
						source: node.id,
						target: nextNode.id,
						type: "smoothstep",
					} as ReactFlowEdge;
				})
				.filter((e): e is ReactFlowEdge => e !== null);

			return { nodes: dataNodes, edges: flowEdges };
		}

		case "component_hierarchy": {
			// Show UI component structure
			// Filter for component files
			const componentNodes = fileNodes
				.filter((node) => {
					const path = (node.data?.path || "").toLowerCase();
					const name = (node.data?.label || "").toLowerCase();
					return (
						path.includes("component") ||
						path.includes("ui/") ||
						name.includes("component") ||
						/\.(tsx|jsx|vue)$/.test(path)
					);
				})
				.map((node, idx) => ({
					...node,
					id: `comp-${node.id}`,
					type: "component",
					position: { x: (idx % 4) * 200, y: Math.floor(idx / 4) * 180 + 100 },
					data: {
						...node.data,
						label: node.data?.label || node.data?.path?.split("/").pop() || "Component",
					},
				}));

			// Create hierarchical edges based on directory structure
			const compEdges = componentNodes
				.filter((node) => {
					const parentPath = (node.data?.path || "").split("/").slice(0, -1).join("/");
					return parentPath;
				})
				.map((node, idx) => {
					const parentPath = (node.data?.path || "").split("/").slice(0, -1).join("/");
					const parent = componentNodes.find(
						(n) => n.data?.path === parentPath || n.data?.path?.startsWith(parentPath)
					);
					if (parent) {
						return {
							id: `comp-edge-${idx}`,
							source: parent.id,
							target: node.id,
							type: "smoothstep",
						};
					}
					return null;
				})
				.filter((e): e is any => e !== null);

			return { nodes: componentNodes, edges: compEdges };
		}

		default:
			// Fallback to file tree
			return fileTreeData;
	}
}

export async function createDiagram(params: {
	diagramType: "file_tree" | "network_requests" | "architecture" | "dependency_graph" | "data_flow" | "component_hierarchy";
	name?: string;
	description?: string;
	entities?: DiagramEntity[];
	relationships?: DiagramRelationship[];
	filters?: {
		pathPatterns?: string[];
		excludePaths?: string[];
		languages?: string[];
		maxDepth?: number;
	};
	layoutType?: string;
	config?: Record<string, unknown>;
	owner: string;
	repo: string;
}) {
	const { diagramType, filters, layoutType, config, owner, repo, entities, relationships } = params;
	
	// Generate name if not provided (agent should provide this, but fallback for edge cases)
	let name = params.name;
	if (!name) {
		const typeNames: Record<string, string> = {
			file_tree: "File Tree",
			network_requests: "Network Requests",
			architecture: "Architecture",
			dependency_graph: "Dependency Graph",
			data_flow: "Data Flow",
			component_hierarchy: "Component Hierarchy",
		};
		const baseName = typeNames[diagramType] || "Diagram";
		const parts = [];
		if (config?.pattern) {
			parts.push(String(config.pattern));
		}
		if (filters?.languages && filters.languages.length > 0) {
			parts.push(filters.languages.join(", "));
		}
		if (filters?.pathPatterns && filters.pathPatterns.length > 0) {
			parts.push(filters.pathPatterns.join(", "));
		}
		if (parts.length > 0) {
			name = `${parts.join(" - ")} ${baseName}`;
		} else {
			name = `${repo} ${baseName}`;
		}
	}
	
	// Generate description if not provided (agent should provide this, but fallback for edge cases)
	let description = params.description;
	if (!description) {
		const typeDescriptions: Record<string, string> = {
			file_tree: "File tree visualization",
			network_requests: "Network requests and API calls",
			architecture: "Architecture and design patterns",
			dependency_graph: "Module and dependency relationships",
			data_flow: "Data flow and transformations",
			component_hierarchy: "Component structure and hierarchy",
		};
		const baseDesc = typeDescriptions[diagramType] || "Diagram visualization";
		const descParts = [baseDesc];
		if (config?.pattern) {
			descParts.push(`using ${config.pattern} pattern`);
		}
		if (filters?.languages && filters.languages.length > 0) {
			descParts.push(`for ${filters.languages.join(", ")} files`);
		}
		if (filters?.pathPatterns && filters.pathPatterns.length > 0) {
			descParts.push(`in ${filters.pathPatterns.join(", ")}`);
		}
		if (filters?.excludePaths && filters.excludePaths.length > 0) {
			descParts.push(`excluding ${filters.excludePaths.join(", ")}`);
		}
		description = descParts.join(" ");
	}

	const repoKey = `${owner}/${repo}`;
	
	// Get repository to find repoId
	const repoRecord = await getRepository(repoKey);
	if (!repoRecord) {
		throw new Error(`Repository ${repoKey} not found`);
	}

	// Route to appropriate diagram generator based on type
	let layoutResult: { nodes: ReactFlowNode[]; edges: ReactFlowEdge[] } | null = null;

	if (diagramType === "file_tree") {
		// File tree diagrams use repository file structure
		const options: { maxDepth?: number; minArea?: number } = {};
		if (filters?.maxDepth !== undefined) {
			options.maxDepth = filters.maxDepth;
		} else {
			options.maxDepth = 7; // Default depth
		}

		// Generate the diagram nodes and edges from file tree
		layoutResult = await getFileTreeForReactFlow(repoKey, options);
	} else {
		// Conceptual diagrams (network_requests, architecture, etc.) require entities and relationships
		if (!entities || !relationships) {
			throw new Error(
				`Conceptual diagram type "${diagramType}" requires entities and relationships. Please call searchKnowledge first to extract entities from the codebase, then provide them to createDiagram.`
			);
		}

		// Build diagram from entities and relationships
		const effectiveLayoutType = layoutType || getDefaultLayoutType(diagramType);
		layoutResult = buildDiagramFromEntities(entities, relationships, diagramType, effectiveLayoutType);
	}

	if (!layoutResult) {
		throw new Error("Failed to generate diagram layout");
	}

	// For file_tree diagrams, apply filters to nodes (pathPatterns, excludePaths, languages)
	// For conceptual diagrams, filters are not applicable (entities already represent filtered data)
	let filteredNodes = layoutResult.nodes;
	let filteredEdges = layoutResult.edges;

	if (diagramType === "file_tree") {
		// Filter by path patterns (include)
		if (filters?.pathPatterns && filters.pathPatterns.length > 0) {
			const patternRegexes = filters.pathPatterns.map((p) =>
				new RegExp(p.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"))
			);
			filteredNodes = filteredNodes.filter((node) => {
				const path = (node.data as any).path || "";
				return patternRegexes.some((regex) => regex.test(path));
			});
			// Filter edges to only include connections between filtered nodes
			const nodeIds = new Set(filteredNodes.map((n) => n.id));
			filteredEdges = filteredEdges.filter(
				(e) => nodeIds.has(e.source) && nodeIds.has(e.target)
			);
		}

		// Filter by exclude paths
		if (filters?.excludePaths && filters.excludePaths.length > 0) {
			const excludeRegexes = filters.excludePaths.map((p) =>
				new RegExp(p.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"))
			);
			filteredNodes = filteredNodes.filter((node) => {
				const path = (node.data as any).path || "";
				return !excludeRegexes.some((regex) => regex.test(path));
			});
			const nodeIds = new Set(filteredNodes.map((n) => n.id));
			filteredEdges = filteredEdges.filter(
				(e) => nodeIds.has(e.source) && nodeIds.has(e.target)
			);
		}

		// Filter by languages
		if (filters?.languages && filters.languages.length > 0) {
			const languageSet = new Set(filters.languages.map((l) => l.toLowerCase()));
			filteredNodes = filteredNodes.filter((node) => {
				const lang = ((node.data as any).language || "").toLowerCase();
				return lang && languageSet.has(lang);
			});
			const nodeIds = new Set(filteredNodes.map((n) => n.id));
			filteredEdges = filteredEdges.filter(
				(e) => nodeIds.has(e.source) && nodeIds.has(e.target)
			);
		}
	}

	// Calculate statistics
	const fileNodes = filteredNodes.filter((n) => n.type === "file");
	const directoryNodes = filteredNodes.filter((n) => n.type === "directory");
	const totalSize = filteredNodes.reduce((sum, node) => {
		return sum + ((node.data as any).size || 0);
	}, 0);

	// Generate diagram ID (will be replaced with preset ID after save)
	const diagramId = `diagram-${Date.now()}`;

	// Build config object for database storage
	const presetConfig: Record<string, unknown> = {
		diagramType,
		filters,
		layoutType: layoutType || (diagramType === "file_tree" ? "hierarchical" : getDefaultLayoutType(diagramType)),
		config: config || {},
		nodeCount: filteredNodes.length,
		edgeCount: filteredEdges.length,
		fileCount: fileNodes.length,
		directoryCount: directoryNodes.length,
		totalSize,
	};

	// For conceptual diagrams, save entities and relationships so diagram can be regenerated
	if (diagramType !== "file_tree" && entities && relationships) {
		presetConfig.entities = entities;
		presetConfig.relationships = relationships;
		console.log(`[createDiagram] Saving ${diagramType} diagram with ${entities.length} entities and ${relationships.length} relationships`);
	} else if (diagramType !== "file_tree") {
		console.warn(`[createDiagram] Warning: ${diagramType} diagram created without entities/relationships`);
	}

	// Save as preset for persistence
	const preset = await saveDiagramPreset({
		repoId: repoRecord.id,
		name,
		description,
		type: diagramType,
		config: presetConfig,
	});

	return {
		diagramId: preset.id,
		name,
		description,
		nodes: filteredNodes,
		edges: filteredEdges,
		stats: {
			nodeCount: filteredNodes.length,
			fileCount: fileNodes.length,
			directoryCount: directoryNodes.length,
			totalSize,
		},
		action: {
			type: "CREATE_DIAGRAM_TAB",
			diagramId: preset.id,
			name,
		},
	};
}

