import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { config } from '@/config';

interface Preset {
  id: string;
  name: string;
  description: string | null;
  type: string;
  config: Record<string, unknown>;
  created_at: string;
}

interface PresetsListProps {
  owner?: string;
  repo?: string;
}

const API_BASE = config.apiBase;

export default function PresetsList({ owner, repo }: PresetsListProps) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!owner || !repo) {
      setPresets([]);
      return;
    }

    const fetchPresets = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_BASE}/api/diagrams/presets?owner=${owner}&repo=${repo}`);
        
        if (!res.ok) {
          const errorData = await res.json();
          setError(errorData.error || 'Failed to load presets');
          return;
        }

        const data = await res.json();
        setPresets(data.presets || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load presets');
      } finally {
        setLoading(false);
      }
    };

    fetchPresets();
  }, [owner, repo]);

  if (!owner || !repo) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <p className="text-sm">Load a repository to see diagram presets</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (presets.length === 0) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <p className="text-sm">No presets saved yet</p>
        <p className="text-xs mt-2">Save a preset from the diagram to see it here</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {presets.map((preset) => (
        <Card key={preset.id} className="cursor-pointer hover:bg-accent transition-colors">
          <CardHeader>
            <div className="flex items-start justify-between">
              <CardTitle className="text-base">{preset.name}</CardTitle>
              <Badge variant="outline">{preset.type}</Badge>
            </div>
            {preset.description && (
              <CardDescription className="text-sm">{preset.description}</CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              Created: {new Date(preset.created_at).toLocaleDateString()}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

