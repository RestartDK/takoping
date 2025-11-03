import { z } from "zod";

// CreateDiagram tool schema
export const createDiagramSchema = z.object({
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
export const queryFileTreeSchema = z.object({
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
export const updateDiagramFiltersSchema = z.object({
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

