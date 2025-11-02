<!-- 23a063d4-f69c-478d-a96c-9cb9037712c0 b6936771-5eb8-4bca-bd29-63f1282c8ad9 -->
# Implement Right Side Panel with Tabs

## 1. Install Required shadcn Components

Add the following shadcn components:

- `tabs` - For tab switching between Chat/Code/Diagrams
- `resizable` - For resizable and collapsible side panel
- `scroll-area` - For scrollable content in panels
- `badge` - For file type badges and preset tags
```bash
bunx --bun shadcn@latest add tabs resizable scroll-area badge
```


## 2. Update App Layout Structure

Restructure `client/src/App.tsx` to implement the new layout:

**Current structure:**

```
- Top header (repo input + buttons + status)
- Center ReactFlow diagram
- Bottom chat input/response
```

**New structure:**

```
- Top header (repo input + buttons + status) - keep existing
- Main container with:
  - Left: ReactFlow diagram (flex-1)
  - Right: Resizable panel with tabs (Chat/Code/Diagrams)
```

## 3. Create Side Panel Component

Create `client/src/components/SidePanel.tsx`:

- Use `ResizablePanelGroup` with horizontal orientation
- Left panel: ReactFlow (min 50%, default 70%)
- Right panel: Tabs content (min 20%, default 30%)
- Add collapse button to hide/show right panel
- Use `Tabs` component with three tabs: Chat, Code, Diagrams

## 4. Implement Chat Tab

Move existing chat functionality to side panel:

- Input field at bottom of panel
- Chat messages/responses in scrollable area above
- Keep existing API integration (`/api/chat/query`)
- Display suggested actions from chat response

## 5. Implement Code Tab (File Browser + Content Viewer)

Split Code tab into two sections:

1. **Left: File Tree** - `client/src/components/FileTree.tsx`
2. **Right: File Content Viewer** - `client/src/components/FileViewer.tsx`

**FileTree component:**

- Fetch file tree from repository nodes data
- Build hierarchical tree structure from flat nodes list
- Display folders with expand/collapse icons using lucide-react icons
- Show files with appropriate file type icons
- Make items clickable to select and view file content
- Use `ScrollArea` for large directory trees
- Highlight selected file with accent color
- Style with Tailwind classes for hover states

File tree structure will be derived from existing `nodes` data in ReactFlow, which includes:

- `data.path` - full file path
- `data.label` - file/folder name
- `data.fileCount` - indicates if it's a directory

**FileViewer component:**

- Display selected file content with syntax highlighting
- Use a code block with monospace font and line numbers
- Show file path and size in header
- Add copy button for file content
- Display "Select a file" message when no file is selected
- Use `ScrollArea` for long files
- Fetch file content from GitHub API or vector store metadata

**Layout for Code tab:**

- Use nested ResizablePanelGroup (vertical orientation)
- File tree on left (min 30%, default 40%)
- File viewer on right (min 40%, default 60%)
- Both sections scrollable independently

## 6. Implement Diagrams Tab (Presets List)

Create `client/src/components/PresetsList.tsx`:

- Fetch presets using existing API: `GET /api/diagrams/preset?owner={owner}&repo={repo}`
- Display presets as `Card` components in a scrollable list
- Show preset name, description, type, and creation date
- Add click handler to load preset into diagram
- Add empty state when no presets exist

## 7. Update State Management

Add new state variables to `App.tsx`:

- `activeTab` - tracks which tab is active (chat/code/diagrams)
- `presets` - stores fetched diagram presets
- `isPanelCollapsed` - controls side panel visibility
- `selectedFile` - tracks selected file in code tab

## 8. Style with Tailwind Classes

Apply consistent styling:

- Side panel background: `bg-background`
- Tab triggers: use shadcn tabs default styling
- File tree items: hover states with `hover:bg-accent`
- Preset cards: `border rounded-lg p-4` with hover effects
- Maintain consistent spacing with `gap-2.5` throughout

## 9. Preserve Existing Features

Keep unchanged:

- Top header with repo input, Load Repo, and Save Preset buttons
- ReactFlow diagram with Background, Controls, and MiniMap
- All existing API integrations
- Repository loading and ingestion logic

### To-dos

- [ ] Install shadcn tabs, resizable, scroll-area, and badge components
- [ ] Create SidePanel component with resizable layout and tabs structure
- [ ] Move chat functionality to Chat tab in side panel
- [ ] Create FileTree component and implement Code tab with file browser
- [ ] Create PresetsList component and implement Diagrams tab
- [ ] Restructure App.tsx to use new layout with resizable panels
- [ ] Apply consistent Tailwind styling and test responsiveness