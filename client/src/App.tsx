import { useState, useCallback, useRef } from 'react';
import { ReactFlow, applyNodeChanges, applyEdgeChanges, Background, Controls, MiniMap, type NodeChange, type EdgeChange, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import SidePanel from '@/components/SidePanel';
import { PanelLeft } from 'lucide-react';
import { config } from '@/config';

const API_BASE = config.apiBase;

export default function App() {
  const [repoInput, setRepoInput] = useState('restartdk/leetcode-automation');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [owner, setOwner] = useState<string>('');
  const [repo, setRepo] = useState<string>('');
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  const sidePanelRef = useRef<ImperativePanelHandle>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nodesSnapshot) => applyNodeChanges(changes, nodesSnapshot)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((edgesSnapshot) => applyEdgeChanges(changes, edgesSnapshot)),
    [],
  );

  const pollIngestionStatus = async (jobId: string) => {
    while (true) {
      const res = await fetch(`${API_BASE}/api/github/ingest/status/${jobId}`);
      const data = await res.json();
      setStatus(`Ingesting... Files: ${data.counts?.files || 0}, Chunks: ${data.counts?.chunks || 0}`);
      
      if (data.status === 'done') {
        setStatus('Ingestion complete! Loading tree...');
        return true;
      }
      if (data.status === 'error') {
        setStatus(`Error: ${data.error || 'Unknown error'}`);
        return false;
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  };

  const loadRepo = async () => {
    setLoading(true);
    setStatus('Loading repository...');
    setNodes([]);
    setEdges([]);
    
    const [ownerName, repoName] = repoInput.split('/');
    if (!ownerName || !repoName) {
      setStatus('Invalid format. Use: owner/repo');
      setLoading(false);
      return;
    }
    
    setOwner(ownerName);
    setRepo(repoName);

    try {
      // Try to fetch tree
      let res = await fetch(`${API_BASE}/api/diagrams/tree?owner=${ownerName}&repo=${repoName}`);
      
      // If 404, trigger ingestion
      if (res.status === 404) {
        setStatus('Repository not found. Starting ingestion...');
        const ingestRes = await fetch(`${API_BASE}/api/github/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner: ownerName, repo: repoName, branch: 'main' }),
        });
        const ingestData = await ingestRes.json();
        
        if (ingestData.jobId) {
          const success = await pollIngestionStatus(ingestData.jobId);
          if (!success) {
            setLoading(false);
            return;
          }
          
          // Retry fetching tree
          res = await fetch(`${API_BASE}/api/diagrams/tree?owner=${ownerName}&repo=${repoName}`);
        }
      }

      if (!res.ok) {
        const errorData = await res.json();
        setStatus(`Error: ${errorData.error || 'Failed to load tree'}`);
        setLoading(false);
        return;
      }

      const data = await res.json();
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
      setStatus(`Loaded ${data.nodes?.length || 0} nodes`);
    } catch (err) {
      setStatus(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    
    setLoading(true);
    setStatus('Sending query...');
    
    try {
      const res = await fetch(`${API_BASE}/api/chat/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: chatInput }),
      });
      
      const data = await res.json();
      setChatResponse(data.answer || data.error || 'No response');
      setStatus(`Found ${data.sources?.documents?.length || 0} sources`);
    } catch (err) {
      setChatResponse(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const savePreset = async () => {
    if (!owner || !repo) return;
    
    setLoading(true);
    setStatus('Saving preset...');
    
    try {
      const res = await fetch(`${API_BASE}/api/diagrams/preset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner,
          repo,
          name: 'Demo Preset',
          description: 'Saved from demo',
          type: 'custom',
          config: { nodes: nodes.length },
        }),
      });
      
      const data = await res.json();
      setStatus(`Preset saved: ${data.preset?.id || 'Success'}`);
    } catch (err) {
      setStatus(`Error saving preset: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-screen h-screen flex flex-col">
      {/* Top: Repo Input */}
      <div className="p-2.5 flex gap-2.5 items-center border-b shrink-0">
        <Input
          type="text"
          value={repoInput}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRepoInput(e.target.value)}
          placeholder="owner/repo"
          className="flex-1"
          onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && loadRepo()}
        />
        <Button onClick={loadRepo} disabled={loading}>
          Load Repo
        </Button>
        <Button onClick={savePreset} disabled={loading || nodes.length === 0} variant="outline">
          Save Preset
        </Button>
        <div className="px-2 py-2 text-muted-foreground text-xs whitespace-nowrap">
          {status || 'Ready'}
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