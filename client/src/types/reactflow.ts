import type { Node, Edge } from "@xyflow/react";

/**
 * React Flow Node Data structure matching the server's ReactFlowNodeData
 */
export interface FileNodeData {
	label: string;
	path: string;
	size: number | null;
	cumulativeSize: number | null;
	fileCount: number | null;
	language: string | null;
	extension: string | null;
	hasChunks: boolean | null;
	chunkCount: number | null;
	[key: string]: unknown;
}

/**
 * Typed React Flow Node with FileNodeData
 */
export type FileNode = Node<FileNodeData>;

/**
 * Re-export Edge for convenience
 */
export type { Edge };
