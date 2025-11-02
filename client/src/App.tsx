import { useState, useCallback, useRef } from "react";
import {
	ReactFlow,
	applyNodeChanges,
	applyEdgeChanges,
	Background,
	Controls,
	MiniMap,
	type NodeChange,
	type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@/components/ui/resizable";
import type { ImperativePanelHandle } from "react-resizable-panels";
import SidePanel from "@/components/SidePanel";
import { PanelLeft } from "lucide-react";
import { useRepository } from "@/hooks/useRepository";
import { useDiagram } from "@/hooks/useDiagram";
import { useChat } from "@/hooks/useChat";

export default function App() {
	const [repoInput, setRepoInput] = useState("");
	const [chatInput, setChatInput] = useState("");
	const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
	const sidePanelRef = useRef<ImperativePanelHandle>(null);

	const {
		status: repoStatus,
		loading: repoLoading,
		owner,
		repo,
		loadRepository,
		setStatus: setRepoStatus,
	} = useRepository();
	const {
		nodes,
		edges,
		loading: diagramLoading,
		loadDiagram,
		savePreset,
		setNodes,
		setEdges,
	} = useDiagram();
	const { response: chatResponse, loading: chatLoading, sendQuery } = useChat();

	const loading = repoLoading || diagramLoading || chatLoading;
	const status = repoStatus || "Ready";

	const onNodesChange = useCallback(
		(changes: NodeChange[]) =>
			setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)),
		[setNodes]
	);
	const onEdgesChange = useCallback(
		(changes: EdgeChange[]) =>
			setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
		[setEdges]
	);

	const loadRepo = useCallback(async () => {
		const success = await loadRepository(repoInput);
		if (success) {
			// Owner and repo are set by loadRepository, but we need to wait for state update
			// So we parse it again to get the values
			const [ownerName, repoName] = repoInput.split("/");
			if (ownerName && repoName) {
				setRepoStatus("Loading diagram...");
				try {
					const { nodeCount } = await loadDiagram(ownerName, repoName);
					setRepoStatus(`Loaded ${nodeCount} nodes`);
				} catch (err) {
					setRepoStatus(
						`Error loading diagram: ${
							err instanceof Error ? err.message : String(err)
						}`
					);
				}
			}
		}
	}, [repoInput, loadRepository, loadDiagram, setRepoStatus]);

	const sendChat = useCallback(() => {
		sendQuery(chatInput);
		setChatInput("");
	}, [chatInput, sendQuery]);

	const handleSavePreset = useCallback(async () => {
		if (!owner || !repo) return;
		try {
			await savePreset(owner, repo);
			setRepoStatus("Preset saved successfully");
		} catch (err) {
			setRepoStatus(
				`Error saving preset: ${
					err instanceof Error ? err.message : String(err)
				}`
			);
		}
	}, [owner, repo, savePreset, setRepoStatus]);

	return (
		<div className="w-screen h-screen flex flex-col">
			{/* Top: Repo Input */}
			<div className="p-2.5 flex gap-2.5 items-center border-b shrink-0">
				<Input
					type="text"
					value={repoInput}
					onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
						setRepoInput(e.target.value)
					}
					placeholder="owner/repo"
					className="flex-1"
					onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) =>
						e.key === "Enter" && loadRepo()
					}
				/>
				<Button onClick={loadRepo} disabled={loading}>
					Load Repo
				</Button>
				<Button
					onClick={handleSavePreset}
					disabled={loading || nodes.length === 0}
					variant="outline"
				>
					Save Preset
				</Button>
				<div className="px-2 py-2 text-muted-foreground text-xs whitespace-nowrap">
					{status || "Ready"}
				</div>
			</div>

			{/* Main Content: React Flow Canvas + Side Panel */}
			<ResizablePanelGroup direction="horizontal" className="flex-1">
				<ResizablePanel defaultSize={isPanelCollapsed ? 100 : 70} minSize={50}>
					<div className="h-full relative">
						<ReactFlow
							nodes={nodes}
							edges={edges}
							onNodesChange={onNodesChange}
							onEdgesChange={onEdgesChange}
							fitView
						>
							<Background />
							<Controls />
							<MiniMap />
						</ReactFlow>
					</div>
				</ResizablePanel>
				{!isPanelCollapsed && (
					<ResizableHandle
						withHandle
						className="group bg-transparent hover:bg-border transition-colors cursor-col-resize [&>div]:opacity-0 [&>div]:group-hover:opacity-100 [&>div]:transition-opacity"
					/>
				)}
				{isPanelCollapsed ? (
					<div className="border-l relative">
						<Button
							variant="ghost"
							size="icon"
							onClick={() => {
								setIsPanelCollapsed(false);
								// Restore panel size after a brief delay to ensure DOM is updated
								setTimeout(() => {
									sidePanelRef.current?.resize(30);
								}, 0);
							}}
							className="absolute top-2 right-2"
						>
							<PanelLeft className="h-4 w-4" />
						</Button>
					</div>
				) : (
					<ResizablePanel
						ref={sidePanelRef}
						defaultSize={30}
						minSize={20}
						collapsible={true}
						onCollapse={() => setIsPanelCollapsed(true)}
					>
						<SidePanel
							nodes={nodes}
							chatInput={chatInput}
							setChatInput={setChatInput}
							chatResponse={chatResponse}
							onSendChat={sendChat}
							loading={loading}
							owner={owner}
							repo={repo}
							onCollapse={() => {
								sidePanelRef.current?.collapse();
							}}
						/>
					</ResizablePanel>
				)}
			</ResizablePanelGroup>
		</div>
	);
}
