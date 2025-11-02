import { useState, useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { FileNode, Edge } from "@/types/reactflow";
import { config } from "@/config";

const API_BASE = config.apiBase;

interface UseDiagramReturn {
	nodes: FileNode[];
	edges: Edge[];
	loading: boolean;
	loadDiagram: (
		owner: string,
		repo: string
	) => Promise<{ nodeCount: number; edgeCount: number }>;
	savePreset: (
		owner: string,
		repo: string,
		name?: string,
		description?: string
	) => Promise<void>;
	setNodes: Dispatch<SetStateAction<FileNode[]>>;
	setEdges: Dispatch<SetStateAction<Edge[]>>;
	reset: () => void;
}

export function useDiagram(): UseDiagramReturn {
	const [nodes, setNodes] = useState<FileNode[]>([]);
	const [edges, setEdges] = useState<Edge[]>([]);
	const [loading, setLoading] = useState(false);

	const loadDiagram = useCallback(
		async (
			owner: string,
			repo: string
		): Promise<{ nodeCount: number; edgeCount: number }> => {
			setLoading(true);
			setNodes([]);
			setEdges([]);

			try {
				const res = await fetch(
					`${API_BASE}/api/diagrams/tree?owner=${owner}&repo=${repo}`
				);

				if (!res.ok) {
					const errorData = await res.json();
					throw new Error(errorData.error || "Failed to load diagram");
				}

				const data = await res.json();
				const loadedNodes = data.nodes || [];
				const loadedEdges = data.edges || [];
				setNodes(loadedNodes);
				setEdges(loadedEdges);
				return { nodeCount: loadedNodes.length, edgeCount: loadedEdges.length };
			} finally {
				setLoading(false);
			}
		},
		[]
	);

	const savePreset = useCallback(
		async (
			owner: string,
			repo: string,
			name: string = "Demo Preset",
			description: string = "Saved from demo"
		): Promise<void> => {
			setLoading(true);

			try {
				const res = await fetch(`${API_BASE}/api/diagrams/preset`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						owner,
						repo,
						name,
						description,
						type: "custom",
						config: { nodes: nodes.length },
					}),
				});

				if (!res.ok) {
					throw new Error("Failed to save preset");
				}
			} finally {
				setLoading(false);
			}
		},
		[nodes.length]
	);

	const reset = useCallback(() => {
		setNodes([]);
		setEdges([]);
	}, []);

	return {
		nodes,
		edges,
		loading,
		loadDiagram,
		savePreset,
		setNodes,
		setEdges,
		reset,
	};
}
