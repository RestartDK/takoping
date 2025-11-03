<!-- cc47230e-324b-4366-a0ff-dd8ebced44fd 868b2069-7aba-42af-b0ea-1f9f004d36c2 -->
# Fix Agent Tool Execution for Chat Interface

## Problem

Current implementation uses `agent.generate()` followed by `streamText()`, which executes tools but loses tool execution context. The client never sees tool calls, so diagrams aren't created when requested.

## Solution

Use `agent.respond()` method which is specifically designed for chat interfaces and properly streams tool calls to the client.

## Changes Required

### 1. Update `server/src/ai/agent.ts`

**Replace the entire `streamResponseWithTools` function:**

```typescript
export async function streamResponseWithTools(
	messages: any[], // UIMessages from client (after RAG context injection)
	activeDiagramId: string,
	system?: string,
) {
	console.log("[agent] streamResponseWithTools called with activeDiagramId:", activeDiagramId);
	
	// Build enhanced system prompt with activeDiagramId
	const enhancedSystem = (system || "") + `\n\nIMPORTANT: There is currently an active diagram with ID: ${activeDiagramId}

When the user asks to update, modify, filter, hide, show, exclude, or change anything about "this diagram", "the current diagram", or "the diagram", you MUST use the updateDiagramFilters tool with diagramId: "${activeDiagramId}". 

Do NOT create a new diagram when the user wants to modify the existing one. Always use updateDiagramFilters with the active diagram ID.`;

	// Get model
	let model;
	if (env.AI_PROVIDER === "ollama") {
		const ollama = createOllama({ baseURL: env.OLLAMA_BASE_URL });
		if (!env.OLLAMA_REASONING_MODEL) {
			throw new Error("OLLAMA_REASONING_MODEL is required for ollama provider");
		}
		model = ollama(env.OLLAMA_REASONING_MODEL);
	} else {
		if (!env.NIM_OPENAI_API_KEY || !env.NIM_OPENAI_BASE_URL || !env.NIM_MODEL) {
			throw new Error(
				"NIM_OPENAI_API_KEY, NIM_OPENAI_BASE_URL and NIM_MODEL are required for nim provider"
			);
		}
		const nim = createOpenAICompatible({
			name: "nim",
			apiKey: env.NIM_OPENAI_API_KEY,
			baseURL: env.NIM_OPENAI_BASE_URL,
		});
		model = nim(env.NIM_MODEL);
	}

	// Create agent with system prompt
	const agent = new Agent({
		model,
		system: enhancedSystem,
		tools: {
			createDiagram: createDiagramTool,
			queryFileTree: queryFileTreeTool,
			updateDiagramFilters: updateDiagramFiltersTool,
		},
		stopWhen: stepCountIs(10),
	});

	// Use agent.respond() for chat - streams tool calls properly
	return agent.respond({
		messages, // UIMessages with RAG context already injected
	});
}
```

**Remove the `createAgent` function** - it's no longer needed since we create the agent inline with the system prompt.

**Update imports at the top:**

- Remove `streamText` and `StreamTextResult` (no longer used)
- Keep `Agent` and `stepCountIs`

### 2. Update `server/src/routes/chat.ts`

**Change the message conversion and agent call (lines 184-302):**

Keep RAG retrieval and context formatting as-is. The key change is how we call the agent:

After building `messagesWithContext` (around line 249), instead of converting to ModelMessages, keep them as the original message format but with context injected.

**Replace the agent call section:**

```typescript
// messagesWithContext already has RAG context injected in the last user message
// Pass them directly to the agent as UIMessages
console.log("[chat] Calling streamResponseWithTools with activeDiagramId:", activeDiagramId);

// Convert the messages format for the agent
// The messages are currently in a custom format, need to ensure they match UIMessage structure
const uiMessages = messagesWithContext.map(msg => ({
	role: msg.role,
	content: typeof msg.content === 'string' ? msg.content : extractTextFromContent(msg.content),
}));

const result = await streamResponseWithTools(
	uiMessages,
	activeDiagramId,
	systemPrompt
);

// agent.respond() returns a Response object ready for the client
return result;
```

**Remove the `.toUIMessageStreamResponse()` call** - `agent.respond()` already returns the proper Response format.

## Why This Works

1. **`agent.respond()` is designed for chat UIs**: It accepts messages, streams tool calls as they happen, and returns a Response compatible with `useChat`
2. **The agent loop runs automatically**: When LLM calls a tool, the Agent executes it and feeds the result back to the LLM, which can then call more tools if needed
3. **RAG context is preserved**: We still inject context into messages before passing to the agent
4. **Tool calls stream to client**: Unlike `generate()`, `respond()` streams tool execution in real-time so the client can react (e.g., create diagram tabs)

## Expected Behavior After Fix

When user says "use your tool to make diagrams":

1. Agent receives message with RAG context
2. LLM calls `createDiagram` tool
3. Agent executes it automatically
4. Tool result (diagram data) streams to client
5. Client `useChat` hook receives tool call in message parts
6. `onDiagramCreated` callback fires
7. Diagram appears in UI