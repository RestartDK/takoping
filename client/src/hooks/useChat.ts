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
	owner?: string;
	repo?: string;
}

interface UseChatReturn {
	messages: UIMessage[];
	isLoading: boolean;
	sendMessage: (input: { text: string }) => void;
	clearHistory: () => void;
}

export function useChat(options?: UseChatOptions): UseChatReturn {
	const { owner, repo } = options || {};
	const initialLoadRef = useRef(false);
	const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);

	const {
		messages,
		sendMessage: aiSendMessage,
		status,
		setMessages,
	} = useAIChat({
		messages: initialMessages,
		transport: new DefaultChatTransport({
			api: `${API_BASE}/api/chat/query`,
		}),
	});

	// Load chat history when owner/repo changes
	useEffect(() => {
		if (owner && repo && !initialLoadRef.current) {
			const history = loadChatHistory(owner, repo);
			if (history.length > 0) {
				setInitialMessages(history);
				setMessages(history);
			}
			initialLoadRef.current = true;
		} else if (!owner || !repo) {
			// Clear messages when no repo is selected
			setInitialMessages([]);
			setMessages([]);
			initialLoadRef.current = false;
		}
	}, [owner, repo, setMessages]);

	// Save history whenever messages change (except during initial load)
	useEffect(() => {
		if (owner && repo && initialLoadRef.current && messages.length > 0) {
			saveChatHistory(owner, repo, messages);
		}
	}, [messages, owner, repo]);

	const sendMessage = (input: { text: string }) => {
		aiSendMessage({ text: input.text });
	};

	const clearHistory = () => {
		if (owner && repo) {
			clearChatHistory(owner, repo);
			setInitialMessages([]);
			setMessages([]);
		}
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
