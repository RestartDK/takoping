import { tool } from "ai";
import { z } from "zod";
import { pg } from "@/db/client";
import {
	getFileTreeForReactFlow,
	saveDiagramPreset,
	getRepository,
} from "@/db/queries";

// UpdateDiagramFilters tool schema
const updateDiagramFiltersSchema = z.object({
	diagramId: z.string().describe("ID of the diagram preset to update"),
	filters: z.object({
		pathPatterns: z.array(z.string()).optional(),
		excludePaths: z.array(z.string()).optional(),
		languages: z.array(z.string()).optional(),
		maxDepth: z.number().optional(),
	}),
	additive: z
		.boolean()
		.optional()
		.default(false)
		.describe("If true, adds to existing filters; if false, replaces them"),
});

/**
 * Factory function that creates an updateDiagram tool with request variables.
 * The activeDiagramId can be used as a default if diagramId is not provided.
 */
export function makeUpdateDiagramTool(activeDiagramId: string) {
	return tool({
		description:
			"Modify an existing diagram's filters to hide, show, or filter files. Use this when users want to update the current diagram by hiding test files, excluding folders, filtering by language, or changing depth. IMPORTANT: When the system prompt indicates there is an active diagram ID, use that diagramId. If the user says 'this diagram', 'current diagram', or 'the diagram' without specifying an ID, use the activeDiagramId from the system prompt.",
		inputSchema: updateDiagramFiltersSchema,
		execute: async (params) => {
			// Use activeDiagramId as default if diagramId is not provided or is a placeholder
			const diagramId = params.diagramId || activeDiagramId;
			return await updateDiagram({ ...params, diagramId });
		},
	});
}

export async function updateDiagram(params: {
	diagramId: string;
	filters: {
		pathPatterns?: string[];
		excludePaths?: string[];
		languages?: string[];
		maxDepth?: number;
	};
	additive?: boolean;
}) {
	const { diagramId, filters, additive = false } = params;

	// Get the existing preset
	const presetResult = await pg`
    SELECT dp.*, r.owner_repo
    FROM diagram_presets dp
    JOIN repositories r ON dp.repo_id = r.id
    WHERE dp.id = ${diagramId}
  `;

	if (!presetResult || presetResult.length === 0) {
		throw new Error(`Diagram preset with ID ${diagramId} not found`);
	}

	const preset = presetResult[0];
	const ownerRepo = preset.owner_repo as string;
	const existingConfig = preset.config as {
		filters?: {
			pathPatterns?: string[];
			excludePaths?: string[];
			languages?: string[];
			maxDepth?: number;
		};
		[key: string]: unknown;
	};

	// Merge or replace filters
	let mergedFilters: {
		pathPatterns?: string[];
		excludePaths?: string[];
		languages?: string[];
		maxDepth?: number;
	};

	if (additive && existingConfig.filters) {
		// Additive: merge with existing filters
		mergedFilters = {
			pathPatterns: [
				...(existingConfig.filters.pathPatterns || []),
				...(filters.pathPatterns || []),
			],
			excludePaths: [
				...(existingConfig.filters.excludePaths || []),
				...(filters.excludePaths || []),
			],
			languages: [
				...(existingConfig.filters.languages || []),
				...(filters.languages || []),
			],
			maxDepth: filters.maxDepth ?? existingConfig.filters.maxDepth,
		};
	} else {
		// Replace: use new filters, fallback to existing if not provided
		mergedFilters = {
			pathPatterns: filters.pathPatterns ?? existingConfig.filters?.pathPatterns,
			excludePaths: filters.excludePaths ?? existingConfig.filters?.excludePaths,
			languages: filters.languages ?? existingConfig.filters?.languages,
			maxDepth: filters.maxDepth ?? existingConfig.filters?.maxDepth ?? 7,
		};
	}

	// Get repository
	const repoRecord = await getRepository(ownerRepo);
	if (!repoRecord) {
		throw new Error(`Repository ${ownerRepo} not found`);
	}

	// Regenerate diagram with merged filters
	const options: { maxDepth?: number; minArea?: number } = {};
	if (mergedFilters.maxDepth !== undefined) {
		options.maxDepth = mergedFilters.maxDepth;
	} else {
		options.maxDepth = 7;
	}

	const layoutResult = await getFileTreeForReactFlow(ownerRepo, options);

	if (!layoutResult) {
		throw new Error("Failed to regenerate diagram layout");
	}

	// Apply filters to nodes
	let filteredNodes = layoutResult.nodes;
	let filteredEdges = layoutResult.edges;

	// Filter by path patterns (include)
	if (mergedFilters.pathPatterns && mergedFilters.pathPatterns.length > 0) {
		const patternRegexes = mergedFilters.pathPatterns.map((p) =>
			new RegExp(p.replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*"))
		);
		filteredNodes = filteredNodes.filter((node) => {
			const path = (node.data as any).path || "";
			return patternRegexes.some((regex) => regex.test(path));
		});
		const nodeIds = new Set(filteredNodes.map((n) => n.id));
		filteredEdges = filteredEdges.filter(
			(e) => nodeIds.has(e.source) && nodeIds.has(e.target)
		);
	}

	// Filter by exclude paths
	if (mergedFilters.excludePaths && mergedFilters.excludePaths.length > 0) {
		const excludeRegexes = mergedFilters.excludePaths.map((p) =>
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
	if (mergedFilters.languages && mergedFilters.languages.length > 0) {
		const languageSet = new Set(mergedFilters.languages.map((l) => l.toLowerCase()));
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

	// Update preset in database
	const updatedPreset = await saveDiagramPreset({
		repoId: repoRecord.id,
		name: preset.name as string,
		description: preset.description as string | undefined,
		type: preset.diagram_type as string,
		config: {
			...existingConfig,
			filters: mergedFilters,
			nodeCount: filteredNodes.length,
			edgeCount: filteredEdges.length,
			fileCount: fileNodes.length,
			directoryCount: directoryNodes.length,
			totalSize,
		},
	});

	return {
		diagramId: updatedPreset.id,
		nodes: filteredNodes,
		edges: filteredEdges,
		appliedFilters: mergedFilters,
		stats: {
			nodeCount: filteredNodes.length,
			fileCount: fileNodes.length,
		},
		action: {
			type: "UPDATE_DIAGRAM",
			diagramId: updatedPreset.id,
		},
	};
}

