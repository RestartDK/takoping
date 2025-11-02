import { useState, useCallback } from "react";
import { config } from "@/config";

const API_BASE = config.apiBase;

interface IngestionStatus {
	status: "pending" | "done" | "error";
	counts?: {
		files: number;
		chunks: number;
	};
	error?: string;
}

interface UseRepositoryReturn {
	status: string;
	loading: boolean;
	owner: string;
	repo: string;
	loadRepository: (repoInput: string) => Promise<boolean>;
	setStatus: (status: string) => void;
	reset: () => void;
}

export function useRepository(): UseRepositoryReturn {
	const [status, setStatus] = useState("");
	const [loading, setLoading] = useState(false);
	const [owner, setOwner] = useState<string>("");
	const [repo, setRepo] = useState<string>("");

	const pollIngestionStatus = useCallback(
		async (jobId: string): Promise<boolean> => {
			while (true) {
				const res = await fetch(
					`${API_BASE}/api/github/ingest/status/${jobId}`
				);
				const data: IngestionStatus = await res.json();
				setStatus(
					`Ingesting... Files: ${data.counts?.files || 0}, Chunks: ${
						data.counts?.chunks || 0
					}`
				);

				if (data.status === "done") {
					setStatus("Ingestion complete!");
					return true;
				}
				if (data.status === "error") {
					setStatus(`Error: ${data.error || "Unknown error"}`);
					return false;
				}

				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
		},
		[]
	);

	const loadRepository = useCallback(
		async (repoInput: string): Promise<boolean> => {
			setLoading(true);
			setStatus("Loading repository...");

			const [ownerName, repoName] = repoInput.split("/");
			if (!ownerName || !repoName) {
				setStatus("Invalid format. Use: owner/repo");
				setLoading(false);
				return false;
			}

			setOwner(ownerName);
			setRepo(repoName);

			try {
				// Try to check if repository exists (by attempting to fetch tree)
				const res = await fetch(
					`${API_BASE}/api/diagrams/tree?owner=${ownerName}&repo=${repoName}`
				);

				// If 404, trigger ingestion
				if (res.status === 404) {
					setStatus("Repository not found. Starting ingestion...");
					const ingestRes = await fetch(`${API_BASE}/api/github/ingest`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							owner: ownerName,
							repo: repoName,
							branch: "main",
						}),
					});
					const ingestData = await ingestRes.json();

					if (ingestData.jobId) {
						const success = await pollIngestionStatus(ingestData.jobId);
						setLoading(false);
						return success;
					}
				}

				if (!res.ok) {
					const errorData = await res.json();
					setStatus(`Error: ${errorData.error || "Failed to load repository"}`);
					setLoading(false);
					return false;
				}

				setStatus("Repository ready");
				return true;
			} catch (err) {
				setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
				setLoading(false);
				return false;
			}
		},
		[pollIngestionStatus]
	);

	const reset = useCallback(() => {
		setStatus("");
		setOwner("");
		setRepo("");
	}, []);

	return {
		status,
		loading,
		owner,
		repo,
		loadRepository,
		setStatus,
		reset,
	};
}
