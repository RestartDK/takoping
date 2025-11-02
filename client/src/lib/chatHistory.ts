import type { UIMessage } from "@ai-sdk/react";

const CHAT_HISTORY_PREFIX = "chat-history-";

function getStorageKey(owner: string, repo: string): string {
	return `${CHAT_HISTORY_PREFIX}${owner}/${repo}`;
}

export function saveChatHistory(
	owner: string,
	repo: string,
	messages: UIMessage[]
): void {
	if (!owner || !repo) return;
	try {
		const key = getStorageKey(owner, repo);
		localStorage.setItem(key, JSON.stringify(messages));
	} catch (err) {
		console.error("Failed to save chat history:", err);
	}
}

export function loadChatHistory(owner: string, repo: string): UIMessage[] {
	if (!owner || !repo) return [];
	try {
		const key = getStorageKey(owner, repo);
		const stored = localStorage.getItem(key);
		if (!stored) return [];
		return JSON.parse(stored) as UIMessage[];
	} catch (err) {
		console.error("Failed to load chat history:", err);
		return [];
	}
}

export function clearChatHistory(owner: string, repo: string): void {
	if (!owner || !repo) return;
	try {
		const key = getStorageKey(owner, repo);
		localStorage.removeItem(key);
	} catch (err) {
		console.error("Failed to clear chat history:", err);
	}
}

