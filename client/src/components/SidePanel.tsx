import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { PanelLeft, MessageSquare, Code2, Network } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useState } from 'react';
import type { FileNode } from '@/types/reactflow';
import FileTree from './FileTree';
import FileViewer from './FileViewer';
import PresetsList from './PresetsList';

interface SidePanelProps {
  nodes: FileNode[];
  chatInput: string;
  setChatInput: (value: string) => void;
  chatResponse: string;
  onSendChat: () => void;
  loading: boolean;
  owner?: string;
  repo?: string;
  onCollapse: () => void;
}

export default function SidePanel({
  nodes,
  chatInput,
  setChatInput,
  chatResponse,
  onSendChat,
  loading,
  owner,
  repo,
  onCollapse,
}: SidePanelProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

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
        
        <TabsContent value="chat" className="mt-0 flex-1 flex flex-col min-h-0">
          <ScrollArea className="flex-1 p-4">
            {chatResponse && (
              <Card className="mb-4">
                <CardContent className="p-4 text-sm whitespace-pre-wrap">
                  {chatResponse}
                </CardContent>
              </Card>
            )}
            {!chatResponse && (
              <div className="text-muted-foreground text-sm text-center py-8">
                Start a conversation about the codebase
              </div>
            )}
          </ScrollArea>
          <div className="p-4 border-t flex gap-2 shrink-0">
            <Input
              type="text"
              value={chatInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setChatInput(e.target.value)}
              placeholder="Ask about the codebase..."
              className="flex-1"
              onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && onSendChat()}
            />
            <Button onClick={onSendChat} disabled={loading}>
              Send
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="code" className="mt-0 flex-1 min-h-0">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            <ResizablePanel defaultSize={40} minSize={30}>
              <div className="h-full border-r flex flex-col bg-background">
                <div className="flex items-center p-2 border-b text-sm font-medium shrink-0 h-[57px] bg-background">Files</div>
                <ScrollArea className="flex-1">
                  <FileTree nodes={nodes} onFileSelect={setSelectedFile} selectedFile={selectedFile} />
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
            <PresetsList owner={owner} repo={repo} />
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

