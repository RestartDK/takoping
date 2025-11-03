import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	ResizablePanelGroup,
	ResizablePanel,
	ResizableHandle,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { PanelLeft, MessageSquare, Code2, Network, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useState, useEffect, useRef } from "react";
import type { FileNode } from "@/types/reactflow";
import FileTree from "./FileTree";
import FileViewer from "./FileViewer";
import PresetsList from "./PresetsList";

interface Message {
	id: string;
	role: "user" | "assistant" | "system";
	parts: Array<{ type: string; text?: string }>;
}

interface SidePanelProps {
	nodes: FileNode[];
	chatInput: string;
	setChatInput: (value: string) => void;
	messages: Message[];
	onSendChat: () => void;
	onClearHistory: () => void;
	loading: boolean;
	owner?: string;
	repo?: string;
	onLoadPreset: (presetId: string) => void;
	onCollapse: () => void;
}

export default function SidePanel({
	nodes,
	chatInput,
	setChatInput,
	messages,
	onSendChat,
	onClearHistory,
	loading,
	owner,
	repo,
	onLoadPreset,
	onCollapse,
}: SidePanelProps) {
	const [selectedFile, setSelectedFile] = useState<string | null>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const scrollAreaRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when new messages arrive
	useEffect(() => {
		// Find the ScrollArea viewport element using the data attribute
		const viewport = scrollAreaRef.current?.querySelector(
			'[data-slot="scroll-area-viewport"]'
		) as HTMLElement;
		if (viewport && messagesEndRef.current) {
			viewport.scrollTo({
				top: viewport.scrollHeight,
				behavior: "smooth",
			});
		}
	}, [messages, loading]);

	return (
		<div className="border-l flex flex-col h-full w-full bg-background">
			<Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0">
				<div className="flex items-center gap-2 p-2 border-b shrink-0">
					<Button
						variant="ghost"
						size="icon"
						onClick={onCollapse}
						className="shrink-0"
					>
						<PanelLeft className="h-4 w-4" />
					</Button>
					<TabsList className="flex-1">
						<TabsTrigger value="chat" className="flex-1 gap-2">
							<MessageSquare className="h-4 w-4" />
							<span>Chat</span>
						</TabsTrigger>
						<TabsTrigger value="code" className="flex-1 gap-2">
							<Code2 className="h-4 w-4" />
							<span>Code</span>
						</TabsTrigger>
						<TabsTrigger value="diagrams" className="flex-1 gap-2">
							<Network className="h-4 w-4" />
							<span>Diagrams</span>
						</TabsTrigger>
					</TabsList>
				</div>

				<TabsContent
					value="chat"
					className="mt-0 flex-1 flex flex-col min-h-0 overflow-hidden"
				>
					<div className="flex-1 flex flex-col min-h-0 overflow-hidden">
						<div className="flex items-center justify-between p-2 border-b shrink-0">
							<span className="text-sm font-medium">Chat</span>
							{messages.length > 0 && (
								<Button
									variant="ghost"
									size="sm"
									onClick={onClearHistory}
									className="h-7 gap-1"
								>
									<Trash2 className="h-3 w-3" />
									Clear
								</Button>
							)}
						</div>
						<ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0">
							<div className="p-4">
								{messages.length === 0 && (
									<div className="text-muted-foreground text-sm text-center py-8">
										Start a conversation about the codebase
									</div>
								)}
								{messages.map((message) => {
									if (message.role === "system") return null;

									const textParts = message.parts
										.filter((p) => p.type === "text" && p.text)
										.map((p) => p.text)
										.join("");

									if (!textParts) return null;

									const isUser = message.role === "user";

									return (
										<div
											key={message.id}
											className={`mb-4 flex ${
												isUser ? "justify-end" : "justify-start"
											}`}
										>
											<Card
												className={`max-w-[80%] ${
													isUser ? "bg-primary text-primary-foreground" : ""
												}`}
											>
												<CardContent className="p-3">
													<div className="text-xs font-medium mb-1 opacity-70">
														{isUser ? "You" : "Assistant"}
													</div>
													<div className="text-sm whitespace-pre-wrap break-words">
														{textParts}
													</div>
												</CardContent>
											</Card>
										</div>
									);
								})}
								{loading && (
									<div className="mb-4 flex justify-start">
										<Card>
											<CardContent className="p-3">
												<div className="text-xs font-medium mb-1 opacity-70">
													Assistant
												</div>
												<div className="text-sm text-muted-foreground">
													Thinking...
												</div>
											</CardContent>
										</Card>
									</div>
								)}
								<div ref={messagesEndRef} />
							</div>
						</ScrollArea>
					</div>
					<div className="p-4 border-t flex gap-2 shrink-0">
						<Input
							type="text"
							value={chatInput}
							onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
								setChatInput(e.target.value)
							}
							placeholder="Ask about the codebase..."
							className="flex-1"
							onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
								if (e.key === "Enter" && !loading) {
									onSendChat();
								}
							}}
							disabled={loading}
						/>
						<Button
							onClick={onSendChat}
							disabled={loading || !chatInput.trim()}
						>
							Send
						</Button>
					</div>
				</TabsContent>

				<TabsContent value="code" className="mt-0 flex-1 min-h-0">
					<ResizablePanelGroup direction="horizontal" className="h-full">
						<ResizablePanel defaultSize={40} minSize={30}>
							<div className="h-full border-r flex flex-col bg-background">
								<div className="flex items-center p-2 border-b text-sm font-medium shrink-0 h-[57px] bg-background">
									Files
								</div>
								<ScrollArea className="flex-1">
									<FileTree
										nodes={nodes}
										onFileSelect={setSelectedFile}
										selectedFile={selectedFile}
									/>
								</ScrollArea>
							</div>
						</ResizablePanel>
						<ResizableHandle withHandle />
						<ResizablePanel defaultSize={60} minSize={40}>
							<FileViewer filePath={selectedFile} owner={owner} repo={repo} />
						</ResizablePanel>
					</ResizablePanelGroup>
				</TabsContent>

				<TabsContent value="diagrams" className="mt-0 flex-1 min-h-0">
					<ScrollArea className="h-full p-4">
						<PresetsList owner={owner} repo={repo} onPresetClick={onLoadPreset} />
					</ScrollArea>
				</TabsContent>
			</Tabs>
		</div>
	);
}
