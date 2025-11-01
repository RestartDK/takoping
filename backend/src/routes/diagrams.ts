import { z } from "zod";
import { getRepository, getFileTreeForReactFlow, getDiagramPresets, saveDiagramPreset } from "../db/postgres";

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

	const data = await req.json();
	const repo = await getRepository(`${data.owner}/${data.repo}`);

	if (!repo) {
		return new Response(JSON.stringify({ error: "Repository not found" }), {
			status: 404,
			headers: { "content-type": "application/json" },
		});
	}

	try {
		const preset = await saveDiagramPreset({
			repoId: repo.id,
			name: data.name,
			description: data.description,
			type: data.type,
			config: data.config,
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

