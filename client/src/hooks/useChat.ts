import { useState, useCallback } from "react";
import { config } from "@/config";

const API_BASE = config.apiBase;

interface ChatResponse {
	answer?: string;
	error?: string;
	sources?: {
		documents?: unknown[];
	};
}

interface UseChatReturn {
	response: string;
	loading: boolean;
	sourceCount: number;
	sendQuery: (query: string) => Promise<void>;
	setResponse: (response: string) => void;
	reset: () => void;
}

export function useChat(): UseChatReturn {
	const [response, setResponse] = useState("");
	const [loading, setLoading] = useState(false);
	const [sourceCount, setSourceCount] = useState(0);

	const sendQuery = useCallback(async (query: string): Promise<void> => {
		if (!query.trim()) return;

		setLoading(true);

		try {
			const res = await fetch(`${API_BASE}/api/chat/query`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query }),
			});

			const data: ChatResponse = await res.json();
			setResponse(data.answer || data.error || "No response");
			setSourceCount(data.sources?.documents?.length || 0);
		} catch (err) {
			setResponse(`Error: ${err instanceof Error ? err.message : String(err)}`);
			setSourceCount(0);
		} finally {
			setLoading(false);
		}
	}, []);

	const reset = useCallback(() => {
		setResponse("");
		setSourceCount(0);
	}, []);

	return {
		response,
		loading,
		sourceCount,
		sendQuery,
		setResponse,
		reset,
	};
}
