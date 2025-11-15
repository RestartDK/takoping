import { z } from "zod";
import { getRepository, getFileTreeForReactFlow, getDiagramPresets, saveDiagramPreset, getDiagramPresetById } from "@/db/queries";

const SavePresetSchema = z.object({
	owner: z.string().min(1, "owner is required"),
	repo: z.string().min(1, "repo is required"),
	name: z.string().min(1, "name is required"),
	description: z.string().optional(),
	type: z.string().min(1, "type is required"),
	config: z.record(z.string(), z.unknown()),
});

export const getTreeRoute = async (req: Request) => {
	const url = new URL(req.url);
	const owner = url.searchParams.get("owner");
	const repo = url.searchParams.get("repo");
	const maxDepth = parseInt(url.searchParams.get("maxDepth") || "10");

	if (!owner || !repo) {
		return new Response(JSON.stringify({ error: "owner and repo required" }), {
			status: 400,
			headers: { "content-type": "application/json" },
		});
	}

	try {
		const ownerRepo = `${owner}/${repo}`;
		const repoRecord = await getRepository(ownerRepo);
		
		if (!repoRecord) {
			return new Response(JSON.stringify({ error: "Repository not found" }), {
				status: 404,
				headers: { "content-type": "application/json" },
			});
		}

		const layoutResult = await getFileTreeForReactFlow(ownerRepo, { maxDepth });

		if (!layoutResult) {
			return new Response(JSON.stringify({ error: "Failed to generate diagram layout" }), {
				status: 500,
				headers: { "content-type": "application/json" },
			});
		}

		// Get or create a default preset for this repository
		// Check for existing default preset first
		const existingPresets = await getDiagramPresets(ownerRepo);
		let defaultPreset = existingPresets.find((p: { is_default?: boolean }) => p.is_default === true) || existingPresets[0];
		
		// If no preset exists, create a default one
		if (!defaultPreset) {
			const fileNodes = layoutResult.nodes.filter((n) => n.type === "file");
			const directoryNodes = layoutResult.nodes.filter((n) => n.type === "directory");
			const totalSize = layoutResult.nodes.reduce((sum: number, node) => {
				const nodeSize = (node.data as { size?: number })?.size;
				return sum + (nodeSize || 0);
			}, 0);

			defaultPreset = await saveDiagramPreset({
				repoId: repoRecord.id,
				name: "Default View",
				description: "Default file tree visualization",
				type: "file_tree",
				config: {
					maxDepth,
					nodeCount: layoutResult.nodes.length,
					edgeCount: layoutResult.edges.length,
					fileCount: fileNodes.length,
					directoryCount: directoryNodes.length,
					totalSize,
				},
			});
		}

		// Return React Flow compatible format with nodes, edges, and diagramId
		return new Response(
			JSON.stringify({
				diagramId: defaultPreset.id,
				nodes: layoutResult.nodes,
				edges: layoutResult.edges,
			}),
			{
				headers: { "content-type": "application/json" },
			}
		);
	} catch (err) {
		console.error(err);
		return new Response(JSON.stringify({ error: "Internal Server Error" }), {
			status: 500,
			headers: { "content-type": "application/json" },
		});
	}
};

export const getPresetsRoute = async (req: Request) => {
	const url = new URL(req.url);
	const owner = url.searchParams.get("owner");
	const repo = url.searchParams.get("repo");

	if (!owner || !repo) {
		return new Response(JSON.stringify({ error: "owner and repo required" }), {
			status: 400,
			headers: { "content-type": "application/json" },
		});
	}

	try {
		const presets = await getDiagramPresets(`${owner}/${repo}`);
		return new Response(JSON.stringify({ presets }), {
			headers: { "content-type": "application/json" },
		});
	} catch (err) {
		console.error(err);
		return new Response(JSON.stringify({ error: "Internal Server Error" }), {
			status: 500,
			headers: { "content-type": "application/json" },
		});
	}
};

export const getPresetByIdRoute = async (req: Request, params?: { id: string }) => {
	const presetId = params?.id;

	if (!presetId) {
		return new Response(JSON.stringify({ error: "preset id required" }), {
			status: 400,
			headers: { "content-type": "application/json" },
		});
	}

	try {
		// Get the preset details
		const preset = await getDiagramPresetById(presetId);
		
		if (!preset) {
			return new Response(JSON.stringify({ error: "Preset not found" }), {
				status: 404,
				headers: { "content-type": "application/json" },
			});
		}

		// Extract owner/repo from the preset's owner_repo field
		const ownerRepo = preset.owner_repo as string;
		if (!ownerRepo) {
			return new Response(JSON.stringify({ error: "Invalid preset data" }), {
				status: 500,
				headers: { "content-type": "application/json" },
			});
		}

		// Get the preset config to check for maxDepth
		const config = preset.config as Record<string, unknown> || {};
		const maxDepth = typeof config.maxDepth === 'number' ? config.maxDepth : 10;

		// Get the file tree for this repository
		const layoutResult = await getFileTreeForReactFlow(ownerRepo, { maxDepth });

		if (!layoutResult) {
			return new Response(JSON.stringify({ error: "Failed to generate diagram layout" }), {
				status: 500,
				headers: { "content-type": "application/json" },
			});
		}

		// Return React Flow compatible format with nodes, edges, and diagramId
		return new Response(
			JSON.stringify({
				diagramId: preset.id,
				nodes: layoutResult.nodes,
				edges: layoutResult.edges,
				preset: {
					id: preset.id,
					name: preset.name,
					description: preset.description,
					type: preset.type,
				},
			}),
			{
				headers: { "content-type": "application/json" },
			}
		);
	} catch (err) {
		console.error(err);
		return new Response(JSON.stringify({ error: "Internal Server Error" }), {
			status: 500,
			headers: { "content-type": "application/json" },
		});
	}
};

export const savePresetRoute = async (req: Request) => {
	if (req.method !== "POST") {
		return new Response("Method Not Allowed", { status: 405 });
	}

	const contentType = req.headers.get("content-type") || "";
	if (!contentType.includes("application/json")) {
		return new Response(
			JSON.stringify({ error: "Expected application/json" }),
			{
				status: 400,
				headers: { "content-type": "application/json" },
			}
		);
	}

	const parsed = SavePresetSchema.safeParse(await req.json());
	if (!parsed.success) {
		return new Response(
			JSON.stringify({
				error: "Invalid payload",
				details: z.treeifyError(parsed.error),
			}),
			{ status: 400, headers: { "content-type": "application/json" } }
		);
	}

	const { owner, repo: repoName, name, description, type, config } = parsed.data;
	const repo = await getRepository(`${owner}/${repoName}`);

	if (!repo) {
		return new Response(JSON.stringify({ error: "Repository not found" }), {
			status: 404,
			headers: { "content-type": "application/json" },
		});
	}

	try {
		const preset = await saveDiagramPreset({
			repoId: repo.id,
			name,
			description,
			type,
			config,
		});

		return new Response(JSON.stringify({ preset }), {
			headers: { "content-type": "application/json" },
		});
	} catch (err) {
		console.error(err);
		return new Response(JSON.stringify({ error: "Internal Server Error" }), {
			status: 500,
			headers: { "content-type": "application/json" },
		});
	}
};

