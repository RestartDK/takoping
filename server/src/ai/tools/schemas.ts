import { z } from "zod";

// CreateDiagram tool schema
export const createDiagramSchema = z.object({
	owner: z.string().describe("Repository owner"),
	repo: z.string().describe("Repository name"),
	name: z.string().optional().describe("Diagram title - infer from user request"),
	description: z.string().optional().describe("Brief description of the diagram"),
	filters: z
		.object({
			pathPatterns: z.array(z.string()).optional().describe("Include paths matching patterns"),
			excludePaths: z.array(z.string()).optional().describe("Exclude paths matching patterns"),
			languages: z.array(z.string()).optional().describe("Filter by programming language"),
			maxDepth: z.number().optional().describe("Max tree depth (default: 7)"),
		})
		.optional(),
	layoutType: z.enum(["hierarchical", "treemap"]).optional().describe("Layout type"),
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

