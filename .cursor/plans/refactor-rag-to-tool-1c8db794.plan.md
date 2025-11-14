<!-- 1c8db794-4108-4c06-a524-f8cd04dd9c99 127c8eb6-7f09-451e-93ff-c371d3dc9d7a -->
# Refactor RAG to Tool-Based Approach

## 1. Define searchKnowledge tool inline in `server/src/routes/chat.ts`

Create the tool inline within the chat route handler to keep it simple while figuring out the agent structure.

## 3. Refactor `server/src/routes/chat.ts`

Remove manual RAG retrieval (lines 152-208) and replace with `streamText`:

```typescript
// Remove: collection fetching, searchByText, context injection into messages

// Replace streamResponseWithTools call with:
const result = streamText({
  model, // Get model same way as agent.ts does
  messages: convertToModelMessages(messages),
  stopWhen: stepCountIs(10),
  tools: {
    createDiagram: createDiagramTool,
    updateDiagramFilters: updateDiagramFiltersTool,
    searchKnowledge: searchKnowledgeTool, // needs repo context
  },
});

return result.toUIMessageStreamResponse();
```

## 4. Use the tool factory in chat.ts

In the chat route, instantiate the searchKnowledge tool with owner/repo:

```typescript
tools: {
  createDiagram: createDiagramTool,
  updateDiagramFilters: updateDiagramFiltersTool,
  searchKnowledge: createSearchKnowledgeTool(owner, repo),
}
```

The tool returns raw documents array without any formatting.

## 5. Move model initialization logic

Extract model creation from `agent.ts` into a reusable function or inline it in `chat.ts` since we're not using the Agent class anymore.

## Files to modify

- `server/src/ai/tools/index.ts` - Add searchKnowledge tool factory
- `server/src/routes/chat.ts` - Remove manual RAG, use streamText with tools
- `server/src/ai/agent.ts` - Can be deprecated or kept for reference (not used)

## Key changes

1. Manual pre-retrieval removed from chat route
2. Model decides when to call searchKnowledge tool
3. Tool extracts query from the `question` parameter (model fills this from conversation)
4. No system prompt (as requested)
5. Agent class replaced with streamText + tools

### To-dos

- [ ] Create searchKnowledge tool factory in server/src/ai/tools/index.ts that accepts owner/repo and returns a tool
- [ ] Refactor server/src/routes/chat.ts to remove manual RAG retrieval and use streamText with tools
- [ ] Verify the tool is called correctly by the model and returns proper context