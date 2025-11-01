import { z } from "zod";
import { getRepository, getFileTreeForReactFlow, getDiagramPresets, saveDiagramPreset } from "../db/postgres";

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
		const reactFlowNodes = await getFileTreeForReactFlow(ownerRepo, { maxDepth });

		if (!reactFlowNodes) {
			return new Response(JSON.stringify({ error: "Repository not found" }), {
				status: 404,
				headers: { "content-type": "application/json" },
			});
		}

		// Return React Flow compatible format
		return new Response(
			JSON.stringify({
				nodes: reactFlowNodes,
				edges: [], // No edges for treemap visualization
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

