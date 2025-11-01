import { useState, useCallback } from 'react';
import { ReactFlow, applyNodeChanges, applyEdgeChanges, Background, Controls, MiniMap, type NodeChange, type EdgeChange, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const API_BASE = 'http://localhost:3000';

export default function App() {
  const [repoInput, setRepoInput] = useState('restartdk/leetcode-automation');
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

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
    
    const [owner, repo] = repoInput.split('/');
    if (!owner || !repo) {
      setStatus('Invalid format. Use: owner/repo');
      setLoading(false);
      return;
    }

    try {
      // Try to fetch tree
      let res = await fetch(`${API_BASE}/api/diagrams/tree?owner=${owner}&repo=${repo}`);
      
      // If 404, trigger ingestion
      if (res.status === 404) {
        setStatus('Repository not found. Starting ingestion...');
        const ingestRes = await fetch(`${API_BASE}/api/github/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner, repo, branch: 'main' }),
        });
        const ingestData = await ingestRes.json();
        
        if (ingestData.jobId) {
          const success = await pollIngestionStatus(ingestData.jobId);
          if (!success) {
            setLoading(false);
            return;
          }
          
          // Retry fetching tree
          res = await fetch(`${API_BASE}/api/diagrams/tree?owner=${owner}&repo=${repo}`);
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
    const [owner, repo] = repoInput.split('/');
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
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top: Repo Input */}
      <div style={{ padding: '10px', borderBottom: '1px solid #ccc', display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          placeholder="owner/repo"
          style={{ flex: 1, padding: '8px' }}
          onKeyPress={(e) => e.key === 'Enter' && loadRepo()}
        />
        <button onClick={loadRepo} disabled={loading} style={{ padding: '8px 16px' }}>
          Load Repo
        </button>
        <button onClick={savePreset} disabled={loading || nodes.length === 0} style={{ padding: '8px 16px' }}>
          Save Preset
        </button>
        <div style={{ padding: '8px', color: '#666', fontSize: '12px' }}>
          {status || 'Ready'}
        </div>
      </div>

      {/* Middle: React Flow Canvas */}
      <div style={{ flex: 1, position: 'relative' }}>
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

      {/* Bottom: Chat */}
      <div style={{ padding: '10px', borderTop: '1px solid #ccc', display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask about the codebase..."
            style={{ flex: 1, padding: '8px' }}
            onKeyPress={(e) => e.key === 'Enter' && sendChat()}
          />
          <button onClick={sendChat} disabled={loading} style={{ padding: '8px 16px' }}>
            Send
          </button>
        </div>
        {chatResponse && (
          <div style={{ 
            padding: '10px', 
            background: '#f5f5f5', 
            borderRadius: '4px', 
            fontSize: '12px',
            maxHeight: '100px',
            overflow: 'auto'
          }}>
            {chatResponse}
          </div>
        )}
      </div>
    </div>
  );
}