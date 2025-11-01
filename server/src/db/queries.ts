import { pg } from "./client";

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
) {
	const repo = await getRepository(ownerRepo);
	if (!repo) return null;

	const nodes = await pg`
    SELECT * FROM file_tree_nodes 
    WHERE repo_id = ${repo.id}
    ORDER BY path
  `;

	// Compute treemap layout
	const reactFlowNodes = computeTreemapLayout(nodes, options);

	return reactFlowNodes;
}

// Treemap layout algorithm (squarified)
function computeTreemapLayout(
	dbNodes: any[],
	options: { maxDepth?: number; minArea?: number } = {}
): Array<{
	id: string;
	type: string;
	position: { x: number; y: number };
	data: any;
	style?: any;
	parentNode?: string;
	extent?: "parent";
	width?: number;
	height?: number;
}> {
	const { maxDepth = 10, minArea = 100 } = options;

	// Build hierarchy
	const nodeMap = new Map(dbNodes.map((n) => [n.id, n]));
	const roots = dbNodes.filter((n) => !n.parent_node);

	const reactFlowNodes: any[] = [];
	const totalWidth = 2000;
	const totalHeight = 1500;

	let skippedCount = 0;

	function layoutNode(node: any, x: number, y: number, width: number, height: number, currentDepth: number) {
		// Skip if too deep or too small
		if (currentDepth > maxDepth) {
			skippedCount++;
			return;
		}
		if (width * height < minArea) {
			skippedCount++;
			return;
		}

		const rfNode = {
			id: node.id,
			type: node.node_type,
			position: { x, y },
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
				width: `${width}px`,
				height: `${height}px`,
				backgroundColor: getColorForNode(node),
			},
			...(node.parent_node
				? {
						parentNode: node.parent_node,
						extent: "parent" as const,
					}
				: {}),
		};

		reactFlowNodes.push(rfNode);

		// Layout children if directory
		if (node.node_type === "directory") {
			const children = dbNodes.filter((n) => n.parent_node === node.id);
			if (children.length > 0) {
				const childLayouts = squarify(children, width, height);
				children.forEach((child, i) => {
					const layout = childLayouts[i];
					if (layout) {
						layoutNode(child, x + layout.x, y + layout.y, layout.width, layout.height, currentDepth + 1);
					}
				});
			}
		}
	}

	// Layout roots
	roots.forEach((root, i) => {
		const rootWidth = totalWidth / Math.ceil(Math.sqrt(roots.length));
		const rootHeight = totalHeight / Math.ceil(Math.sqrt(roots.length));
		const col = i % Math.ceil(Math.sqrt(roots.length));
		const row = Math.floor(i / Math.ceil(Math.sqrt(roots.length)));

		layoutNode(root, col * rootWidth, row * rootHeight, rootWidth, rootHeight, 0);
	});

	console.log(`[POSTGRES] Layout complete: ${reactFlowNodes.length} nodes rendered, ${skippedCount} skipped (total DB nodes: ${dbNodes.length})`);

	return reactFlowNodes;
}

// Squarified treemap helper
function squarify(
	children: any[],
	width: number,
	height: number
): Array<{ x: number; y: number; width: number; height: number }> {
	if (children.length === 0) return [];
	
	const totalSize = children.reduce((sum, child) => sum + Math.max(child.cumulative_size || 0, 1), 0);
	const minSize = Math.min(width / children.length, height / children.length, 50); // Ensure minimum 50px
	
	// If all sizes are zero, give equal space
	if (totalSize === 0 || totalSize === children.length) {
		const itemHeight = height / children.length;
		return children.map((_, i) => ({ 
			x: 0, 
			y: i * itemHeight, 
			width: Math.max(width, minSize), 
			height: Math.max(itemHeight, minSize) 
		}));
	}

	const layouts: any[] = [];
	let x = 0,
		y = 0,
		currentRowHeight = 0;

	children.forEach((child) => {
		const size = Math.max(child.cumulative_size || 0, 1);
		const ratio = size / totalSize;
		const area = ratio * width * height;
		
		// Ensure minimum size
		const childWidth = Math.max(Math.sqrt(area * (width / height)), minSize);
		const childHeight = Math.max(area / childWidth, minSize);

		// Simple row-based layout (improved squarified would be better, but this works for demo)
		if (x + childWidth > width && x > 0) {
			x = 0;
			y += currentRowHeight;
			currentRowHeight = 0;
		}

		layouts.push({ x, y, width: childWidth, height: childHeight });
		currentRowHeight = Math.max(currentRowHeight, childHeight);
		x += childWidth;
		
		if (x >= width) {
			x = 0;
			y += currentRowHeight;
			currentRowHeight = 0;
		}
	});

	return layouts;
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

