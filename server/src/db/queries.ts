import { pg } from "./client";

// React Flow-compatible types (no React dependency needed)
export interface ReactFlowNodeData {
	label: string;
	path: string;
	size: number | null;
	cumulativeSize: number | null;
	fileCount: number | null;
	language: string | null;
	extension: string | null;
	hasChunks: boolean | null;
	chunkCount: number | null;
}

export interface ReactFlowNode {
	id: string;
	type?: string;
	position: { x: number; y: number };
	data: ReactFlowNodeData;
	style?: {
		width?: string;
		height?: string;
		backgroundColor?: string;
		[key: string]: string | number | undefined;
	};
	width?: number;
	height?: number;
}

export interface ReactFlowEdge {
	id: string;
	source: string;
	target: string;
	type?: string;
}

// Repository operations
export async function upsertRepository(data: {
	owner: string;
	repo: string;
	description?: string;
	defaultBranch?: string;
	stars?: number;
	language?: string;
	treeSha?: string;
}) {
	const ownerRepo = `${data.owner}/${data.repo}`;

	const result = await pg`
    INSERT INTO repositories (owner_repo, owner, repo, description, default_branch, stars, language, tree_sha)
    VALUES (${ownerRepo}, ${data.owner}, ${data.repo}, ${data.description || null}, 
            ${data.defaultBranch || "main"}, ${data.stars || 0}, ${data.language || null}, ${data.treeSha || null})
    ON CONFLICT (owner_repo) 
    DO UPDATE SET 
      description = EXCLUDED.description,
      updated_at = NOW()
    RETURNING *
  `;

	return result[0];
}

export async function getRepository(ownerRepo: string) {
	const result = await pg`SELECT * FROM repositories WHERE owner_repo = ${ownerRepo}`;
	return result[0] || null;
}

export async function updateRepositoryIndexingStatus(ownerRepo: string, status: string, error?: string) {
	await pg`
    UPDATE repositories 
    SET indexing_status = ${status},
        indexing_error = ${error || null},
        last_indexed_at = ${status === "done" ? pg`NOW()` : pg`last_indexed_at`}
    WHERE owner_repo = ${ownerRepo}
  `;
}

// File tree operations
export async function buildFileTree(
	repoId: string,
	treeData: Array<{
		path: string;
		name: string;
		type: "file" | "directory";
		parentPath?: string;
		size?: number;
		language?: string;
		extension?: string;
		blobSha?: string;
	}>
) {
	await pg`DELETE FROM file_tree_nodes WHERE repo_id = ${repoId}`;

	// Insert nodes
	for (const node of treeData) {
		const nodeId = `${repoId}:${node.path}`;
		const parentNode = node.parentPath ? `${repoId}:${node.parentPath}` : null;
		const depth = node.path.split("/").length - 1;

		// Ensure file_size is a safe integer for PostgreSQL BIGINT
		let fileSize = 0;
		if (node.size !== undefined && node.size !== null) {
			const numSize = Number(node.size);
			if (!isNaN(numSize) && numSize >= 0 && numSize <= 9223372036854775807) {
				fileSize = Math.floor(numSize);
			} else {
				console.warn(`[POSTGRES] Invalid size for ${node.path}: ${node.size} (type: ${typeof node.size}), defaulting to 0`);
			}
		}

		await pg`
      INSERT INTO file_tree_nodes (
        id, repo_id, path, name, node_type, parent_node, 
        file_size, depth, language, extension, blob_sha
      )
      VALUES (
        ${nodeId}, ${repoId}, ${node.path}, ${node.name}, ${node.type}, ${parentNode},
        ${fileSize}, ${depth}, ${node.language || null}, 
        ${node.extension || null}, ${node.blobSha || null}
      )
    `;
	}

	// Update cumulative metrics
	await updateCumulativeMetrics(repoId);
}

async function updateCumulativeMetrics(repoId: string) {
	// Compute cumulative sizes bottom-up
	const nodes = await pg`
    SELECT id, parent_node, file_size, node_type
    FROM file_tree_nodes
    WHERE repo_id = ${repoId}
    ORDER BY depth DESC
  `;

	console.log(`[POSTGRES] Updating cumulative metrics for ${nodes.length} nodes`);

	const sizeMap = new Map<string, number>();
	const countMap = new Map<string, number>();

	for (const node of nodes) {
		const size = Number(node.file_size) + (sizeMap.get(node.id) || 0);
		const count = (node.node_type === "file" ? 1 : 0) + (countMap.get(node.id) || 0);

		sizeMap.set(node.id, size);
		countMap.set(node.id, count);

		if (node.parent_node) {
			sizeMap.set(node.parent_node, (sizeMap.get(node.parent_node) || 0) + size);
			countMap.set(node.parent_node, (countMap.get(node.parent_node) || 0) + count);
		}
	}

	// Update database
	for (const [id, cumulativeSize] of sizeMap) {
		// Ensure cumulative_size is safe for PostgreSQL BIGINT
		const safeCumulativeSize = Math.min(Math.floor(cumulativeSize), 9223372036854775807);
		const fileCount = countMap.get(id) || 0;
		
		console.log(`[POSTGRES] Updating node ${id}: cumulative_size=${safeCumulativeSize}, file_count=${fileCount}`);
		
		await pg`
      UPDATE file_tree_nodes
      SET cumulative_size = ${safeCumulativeSize}, file_count = ${fileCount}
      WHERE id = ${id}
    `;
	}
	
	console.log(`[POSTGRES] Cumulative metrics updated successfully`);
}

export async function markFileAsIndexed(repoId: string, path: string, chunkCount: number) {
	const nodeId = `${repoId}:${path}`;
	await pg`
    UPDATE file_tree_nodes
    SET has_chunks = TRUE, chunk_count = ${chunkCount}
    WHERE id = ${nodeId}
  `;
}

// Get tree and format for React Flow
export async function getFileTreeForReactFlow(
	ownerRepo: string,
	options?: {
		maxDepth?: number;
		minArea?: number;
	}
): Promise<{
	nodes: ReactFlowNode[];
	edges: ReactFlowEdge[];
} | null> {
	const repo = await getRepository(ownerRepo);
	if (!repo) return null;

	const nodes = await pg`
    SELECT * FROM file_tree_nodes 
    WHERE repo_id = ${repo.id}
    ORDER BY path
  `;

	// Compute treemap layout
	const layoutResult = computeTreemapLayout(nodes, options);

	return layoutResult;
}

// Sugiyama hierarchical layout algorithm
function computeTreemapLayout(
	dbNodes: any[],
	options: { maxDepth?: number; minArea?: number } = {}
): {
	nodes: ReactFlowNode[];
	edges: ReactFlowEdge[];
} {
	const { maxDepth = 10 } = options;

	// Filter nodes by maxDepth
	const filteredNodes = dbNodes.filter((n) => (n.depth || 0) <= maxDepth);
	
	// Group nodes by depth (layers)
	const layers = new Map<number, any[]>();
	for (const node of filteredNodes) {
		const depth = node.depth || 0;
		if (!layers.has(depth)) {
			layers.set(depth, []);
		}
		layers.get(depth)!.push(node);
	}

	const reactFlowNodes: ReactFlowNode[] = [];
	const reactFlowEdges: ReactFlowEdge[] = [];

	// Layout constants
	const layerHeight = 150; // Vertical spacing between layers
	const nodeWidth = 120; // Fixed width for all nodes
	const nodeHeight = 60; // Fixed height for all nodes
	const horizontalSpacing = 20; // Horizontal spacing between nodes
	const verticalOffset = 100; // Top margin

	// Calculate max width needed for each layer (all nodes same size)
	const layerWidths = new Map<number, number>();
	for (const [depth, layerNodes] of layers) {
		const totalWidth = layerNodes.length * (nodeWidth + horizontalSpacing);
		layerWidths.set(depth, totalWidth);
	}

	const maxLayerWidth = Math.max(...Array.from(layerWidths.values()), 2000);
	const startX = 100; // Left margin

	// Position nodes in layers (Sugiyama style)
	const nodePositions = new Map<string, { x: number; y: number; width: number; height: number }>();

	for (const [depth, layerNodes] of layers) {
		// Sort nodes by path for consistent ordering
		layerNodes.sort((a, b) => a.path.localeCompare(b.path));

		const layerY = depth * layerHeight + verticalOffset;
		let currentX = startX + (maxLayerWidth - (layerWidths.get(depth) || 0)) / 2; // Center the layer

		for (const node of layerNodes) {
			nodePositions.set(node.id, {
				x: currentX,
				y: layerY,
				width: nodeWidth,
				height: nodeHeight,
			});

			currentX += nodeWidth + horizontalSpacing;
		}
	}

	// Create React Flow nodes
	for (const node of filteredNodes) {
		const pos = nodePositions.get(node.id);
		if (!pos) continue;

		const rfNode: ReactFlowNode = {
			id: node.id,
			type: node.node_type,
			position: { x: pos.x, y: pos.y },
			data: {
				label: node.name,
				path: node.path,
				size: node.file_size,
				cumulativeSize: node.cumulative_size,
				fileCount: node.file_count,
				language: node.language,
				extension: node.extension,
				hasChunks: node.has_chunks,
				chunkCount: node.chunk_count,
			},
			style: {
				width: `${pos.width}px`,
				height: `${pos.height}px`,
				backgroundColor: getColorForNode(node),
			},
		};

		reactFlowNodes.push(rfNode);
	}

	// Create edges (parent to child)
	for (const node of filteredNodes) {
		if (node.parent_node && nodePositions.has(node.parent_node) && nodePositions.has(node.id)) {
			const edge: ReactFlowEdge = {
				id: `${node.parent_node}-${node.id}`,
				source: node.parent_node,
				target: node.id,
				type: "smoothstep",
			};
			reactFlowEdges.push(edge);
		}
	}

	console.log(`[POSTGRES] Sugiyama layout complete: ${reactFlowNodes.length} nodes rendered, ${reactFlowEdges.length} edges created (total DB nodes: ${dbNodes.length})`);

	return {
		nodes: reactFlowNodes,
		edges: reactFlowEdges,
	};
}


function getColorForNode(node: any): string {
	// Color by language/type
	const colorMap: Record<string, string> = {
		typescript: "#3178c6",
		javascript: "#f7df1e",
		python: "#3776ab",
		rust: "#ce422b",
		go: "#00add8",
		java: "#b07219",
		directory: "#e0e0e0",
	};

	return colorMap[node.language] || colorMap[node.node_type] || "#cccccc";
}

// Diagram preset operations
export async function saveDiagramPreset(data: {
	repoId: string;
	userId?: string;
	name: string;
	description?: string;
	type: string;
	config: Record<string, unknown>;
}) {
	const result = await pg`
    INSERT INTO diagram_presets (repo_id, user_id, name, description, diagram_type, config)
    VALUES (${data.repoId}, ${data.userId || null}, ${data.name}, ${data.description || null},
            ${data.type}, ${JSON.stringify(data.config)})
    ON CONFLICT (repo_id, name) DO UPDATE SET config = EXCLUDED.config
    RETURNING *
  `;
	return result[0];
}

export async function getDiagramPresets(ownerRepo: string) {
	const repo = await getRepository(ownerRepo);
	if (!repo) return [];

	return await pg`
    SELECT * FROM diagram_presets WHERE repo_id = ${repo.id}
    ORDER BY is_default DESC, created_at DESC
  `;
}

export async function getDiagramPresetById(presetId: string) {
	const result = await pg`
    SELECT dp.*, r.owner_repo
    FROM diagram_presets dp
    JOIN repositories r ON dp.repo_id = r.id
    WHERE dp.id = ${presetId}
  `;
	return result[0] || null;
}

