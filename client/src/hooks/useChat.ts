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

import type { Edge } from "@xyflow/react";
import type { FileNode } from "@/types/reactflow";

interface UseChatOptions {
	owner: string;
	repo: string;
	activeDiagramId: string;
	onDiagramCreated?: (data: {
		id: string;
		name: string;
		nodes: FileNode[];
		edges: Edge[];
	}) => void;
	onDiagramUpdated?: (diagramId: string, nodes: FileNode[], edges: Edge[]) => void;
}

interface UseChatReturn {
	messages: UIMessage[];
	isLoading: boolean;
	sendMessage: (input: { text: string }) => void;
	clearHistory: () => void;
}

export function useChat(options: UseChatOptions): UseChatReturn {
	const { owner, repo, activeDiagramId, onDiagramCreated, onDiagramUpdated } = options;
	const initialLoadRef = useRef(false);
	const ownerRef = useRef(owner);
	const repoRef = useRef(repo);
	const activeDiagramIdRef = useRef(activeDiagramId);
	const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);

	// Keep refs in sync with current values
	useEffect(() => {
		ownerRef.current = owner;
		repoRef.current = repo;
		activeDiagramIdRef.current = activeDiagramId;
	}, [owner, repo, activeDiagramId]);

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
				
				// Parse existing body if present, or create empty object
				let body = {};
				if (options?.body) {
					try {
						body = typeof options.body === 'string' 
							? JSON.parse(options.body) 
							: options.body;
					} catch (e) {
						console.error("Failed to parse request body:", e);
						body = {};
					}
				}
				
				// Merge owner, repo, and activeDiagramId into the request body
				// activeDiagramId must always be provided (never null)
				const currentDiagramId = activeDiagramIdRef.current;
				if (!currentDiagramId) {
					throw new Error("activeDiagramId is required but was not provided");
				}
				
				const mergedBody = {
					...body,
					owner: trimmedOwner,
					repo: trimmedRepo,
					activeDiagramId: currentDiagramId,
				};
				
				console.log("[useChat] Sending request with:", {
					owner: trimmedOwner,
					repo: trimmedRepo,
					activeDiagramId: activeDiagramIdRef.current,
				});
				
				return fetch(url, {
					...options,
					body: JSON.stringify(mergedBody),
					headers: {
						...options?.headers,
						'Content-Type': 'application/json',
					},
				});
			},
		}),
		onFinish: () => {
			// Tool calls are handled via message parts in the messages array
			// We'll process them when messages update
		},
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

	// Process tool calls from messages and save history
	useEffect(() => {
		if (initialLoadRef.current && messages.length > 0) {
			saveChatHistory(owner, repo, messages);
			
			// Check the latest assistant message for tool calls
			const lastMessage = messages[messages.length - 1];
			if (lastMessage && lastMessage.role === "assistant" && lastMessage.parts) {
				for (const part of lastMessage.parts) {
					// Tool calls come as parts with type "tool-call" or similar
					// Type assertion needed as AI SDK types may vary
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const toolPart = part as any;
					if (
						part.type === "tool-call" ||
						(toolPart.toolName && toolPart.state === "result" && toolPart.result)
					) {
						if (toolPart.state === "result" && toolPart.result) {
							const result = toolPart.result;
							
							// Handle createDiagram tool result
							if (toolPart.toolName === "createDiagram" && result?.action?.type === "CREATE_DIAGRAM_TAB") {
								if (onDiagramCreated && result.nodes && result.edges) {
									onDiagramCreated({
										id: result.diagramId || result.action.diagramId,
										name: result.name,
										nodes: result.nodes,
										edges: result.edges,
									});
								}
							}
							
							// Handle updateDiagramFilters tool result
							if (toolPart.toolName === "updateDiagramFilters" && result?.action?.type === "UPDATE_DIAGRAM") {
								if (onDiagramUpdated && result.nodes && result.edges) {
									onDiagramUpdated(
										result.diagramId || result.action.diagramId,
										result.nodes,
										result.edges
									);
								}
							}
						}
					}
				}
			}
		}
	}, [messages, owner, repo, onDiagramCreated, onDiagramUpdated]);

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
