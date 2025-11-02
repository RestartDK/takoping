import { useEffect, useRef, useState } from "react";
import { useChat as useAIChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { config } from "@/config";
import {
	saveChatHistory,
	loadChatHistory,
	clearChatHistory,
} from "@/lib/chatHistory";

const API_BASE = config.apiBase;

interface UseChatOptions {
	owner: string;
	repo: string;
}

interface UseChatReturn {
	messages: UIMessage[];
	isLoading: boolean;
	sendMessage: (input: { text: string }) => void;
	clearHistory: () => void;
}

export function useChat(options: UseChatOptions): UseChatReturn {
	const { owner, repo } = options;
	const initialLoadRef = useRef(false);
	const ownerRef = useRef(owner);
	const repoRef = useRef(repo);
	const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);

	// Keep refs in sync with current values
	useEffect(() => {
		ownerRef.current = owner;
		repoRef.current = repo;
	}, [owner, repo]);

	const {
		messages,
		sendMessage: aiSendMessage,
		status,
		setMessages,
	} = useAIChat({
		messages: initialMessages,
		transport: new DefaultChatTransport({
			api: `${API_BASE}/api/chat/query`,
			fetch: async (url, options) => {
				// Use refs to get the latest owner/repo values
				const trimmedOwner = ownerRef.current.trim();
				const trimmedRepo = repoRef.current.trim();
				
				// Validate owner and repo are present and non-empty before sending
				if (!trimmedOwner || !trimmedRepo) {
					throw new Error("Owner and repo are required to send chat messages");
				}
				
				// Merge owner and repo into the request body
				const body = options?.body ? JSON.parse(options.body as string) : {};
				const mergedBody = {
					...body,
					owner: trimmedOwner,
					repo: trimmedRepo,
				};
				return fetch(url, {
					...options,
					body: JSON.stringify(mergedBody),
				});
			},
		}),
	});

	// Load chat history when owner/repo changes
	useEffect(() => {
		if (!initialLoadRef.current) {
			const history = loadChatHistory(owner, repo);
			if (history.length > 0) {
				setInitialMessages(history);
				setMessages(history);
			}
			initialLoadRef.current = true;
		}
	}, [owner, repo, setMessages]);

	// Save history whenever messages change (except during initial load)
	useEffect(() => {
		if (initialLoadRef.current && messages.length > 0) {
			saveChatHistory(owner, repo, messages);
		}
	}, [messages, owner, repo]);

	const sendMessage = (input: { text: string }) => {
		// Validate owner and repo are present before attempting to send
		if (!owner.trim() || !repo.trim()) {
			console.error("Cannot send message: owner and repo are required");
			return;
		}
		aiSendMessage({ text: input.text });
	};

	const clearHistory = () => {
		clearChatHistory(owner, repo);
		setInitialMessages([]);
		setMessages([]);
	};

	// Determine loading state from status
	const isLoading = status === "submitted" || status === "streaming";

	return {
		messages,
		isLoading,
		sendMessage,
		clearHistory,
	};
}
