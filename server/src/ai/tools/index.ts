import { tool } from "ai";
import { z } from "zod";

// CreateDiagram tool schema
const createDiagramSchema = z.object({
	owner: z.string().describe("Repository owner (e.g., 'facebook', 'vercel')"),
	repo: z.string().describe("Repository name"),
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

// QueryFileTree tool schema
const queryFileTreeSchema = z.object({
	owner: z.string().describe("Repository owner"),
	repo: z.string().describe("Repository name"),
	query: z.string().describe("Natural language query about the repository structure"),
	filters: z
		.object({
			pathPatterns: z.array(z.string()).optional(),
			languages: z.array(z.string()).optional(),
			maxDepth: z.number().optional(),
		})
		.optional(),
});

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

export const createDiagramTool = tool({
	description:
		"Generate a new file tree diagram/visualization of the codebase with customizable filters. Use this when the user asks to create, generate, or show a diagram, visualization, or visual representation of the codebase structure.",
	inputSchema: createDiagramSchema,
	execute: async (params) => {
		const { createDiagram } = await import("./createDiagram");
		return await createDiagram(params);
	},
});

export const queryFileTreeTool = tool({
	description:
		"Answer questions about the repository structure, statistics, and file organization without generating a full diagram. Use this when users ask about file counts, sizes, languages, or directory structure.",
	inputSchema: queryFileTreeSchema,
	execute: async (params) => {
		const { queryFileTree } = await import("./queryFileTree");
		return await queryFileTree(params);
	},
});

export const updateDiagramFiltersTool = tool({
	description:
		"Modify an existing diagram's filters to hide, show, or filter files. Use this when users want to update the current diagram by hiding test files, excluding folders, filtering by language, or changing depth. IMPORTANT: When the system prompt indicates there is an active diagram ID, use that diagramId. If the user says 'this diagram', 'current diagram', or 'the diagram' without specifying an ID, use the activeDiagramId from the system prompt.",
	inputSchema: updateDiagramFiltersSchema,
	execute: async (params) => {
		const { updateDiagramFilters } = await import("./updateDiagramFilters");
		return await updateDiagramFilters(params);
	},
});

