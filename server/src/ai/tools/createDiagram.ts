import { tool } from "ai";
import { z } from "zod";
import {
	getFileTreeForReactFlow,
	saveDiagramPreset,
	getRepository,
} from "../../db/queries";

// CreateDiagram tool schema
const createDiagramSchema = z.object({
	name: z.string().describe("Diagram title (e.g., 'TypeScript Source Files')"),
	description: z.string().optional().describe("Human-readable description of the diagram"),
	filters: z
		.object({
			pathPatterns: z
				.array(z.string())
				.optional()
				.describe("Include paths matching these patterns (e.g., ['src/**', 'lib/**'])"),
			excludePaths: z
				.array(z.string())
				.optional()
				.describe("Exclude paths matching these patterns (e.g., ['**/*.test.ts', 'node_modules/**'])"),
			languages: z
				.array(z.string())
				.optional()
				.describe("Filter by programming languages (e.g., ['typescript', 'python'])"),
			maxDepth: z.number().optional().describe("Maximum tree depth to show (default: 7)"),
		})
		.optional(),
	layoutType: z.enum(["hierarchical", "treemap"]).optional().describe("Layout algorithm to use"),
});

/**
 * Factory function that creates a createDiagram tool with request variables.
 * This allows the tool to access owner/repo information from the request.
 */
export function makeCreateDiagramTool(owner: string, repo: string) {
	return tool({
		description:
			"Generate a new file tree diagram/visualization of the codebase with customizable filters. Use this when the user asks to create, generate, or show a diagram, visualization, or visual representation of the codebase structure.",
		inputSchema: createDiagramSchema,
		execute: async (params) => {
			return await createDiagram({ ...params, owner, repo });
		},
	});
}

export async function createDiagram(params: {
	name?: string;
	description?: string;
	filters?: {
		pathPatterns?: string[];
		excludePaths?: string[];
		languages?: string[];
		maxDepth?: number;
	};
	layoutType?: string;
	owner: string;
	repo: string;
}) {
	const { filters, layoutType, owner, repo } = params;
	
	// Generate name if not provided (agent should provide this, but fallback for edge cases)
	let name = params.name;
	if (!name) {
		const parts = [];
		if (filters?.languages && filters.languages.length > 0) {
			parts.push(filters.languages.join(", "));
		}
		if (filters?.pathPatterns && filters.pathPatterns.length > 0) {
			parts.push(filters.pathPatterns.join(", "));
		}
		if (parts.length > 0) {
			name = `${parts.join(" - ")} Diagram`;
		} else {
			name = `${repo} File Tree`;
		}
	}
	
	// Generate description if not provided (agent should provide this, but fallback for edge cases)
	let description = params.description;
	if (!description) {
		const descParts = [];
		if (filters?.languages && filters.languages.length > 0) {
			descParts.push(`${filters.languages.join(", ")} files`);
		}
		if (filters?.pathPatterns && filters.pathPatterns.length > 0) {
			descParts.push(`in ${filters.pathPatterns.join(", ")}`);
		}
		if (filters?.excludePaths && filters.excludePaths.length > 0) {
			descParts.push(`excluding ${filters.excludePaths.join(", ")}`);
		}
		if (descParts.length > 0) {
			description = `File tree showing ${descParts.join(" ")}`;
		} else {
			description = `Complete file tree for ${repo}`;
		}
	}

	const repoKey = `${owner}/${repo}`;
	
	// Get repository to find repoId
	const repoRecord = await getRepository(repoKey);
	if (!repoRecord) {
		throw new Error(`Repository ${repoKey} not found`);
	}

	// Build options for getFileTreeForReactFlow
	const options: { maxDepth?: number; minArea?: number } = {};
	if (filters?.maxDepth !== undefined) {
		options.maxDepth = filters.maxDepth;
	} else {
		options.maxDepth = 7; // Default depth
	}

	// Generate the diagram nodes and edges
	const layoutResult = await getFileTreeForReactFlow(repoKey, options);

	if (!layoutResult) {
		throw new Error("Failed to generate diagram layout");
	}

	// Apply filters to nodes (pathPatterns, excludePaths, languages)
	let filteredNodes = layoutResult.nodes;
	let filteredEdges = layoutResult.edges;

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

	// Calculate statistics
	const fileNodes = filteredNodes.filter((n) => n.type === "file");
	const directoryNodes = filteredNodes.filter((n) => n.type === "directory");
	const totalSize = filteredNodes.reduce((sum, node) => {
		return sum + ((node.data as any).size || 0);
	}, 0);

	// Generate diagram ID (will be replaced with preset ID after save)
	const diagramId = `diagram-${Date.now()}`;

	// Save as preset for persistence
	const preset = await saveDiagramPreset({
		repoId: repoRecord.id,
		name,
		description,
		type: layoutType || "file_tree",
		config: {
			filters,
			layoutType: layoutType || "hierarchical",
			nodeCount: filteredNodes.length,
			edgeCount: filteredEdges.length,
			fileCount: fileNodes.length,
			directoryCount: directoryNodes.length,
			totalSize,
		},
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

