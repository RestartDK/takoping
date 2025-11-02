import { useState, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Copy, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { codeToHtml } from 'shiki';
import type { BundledLanguage } from 'shiki';
import { config } from '@/config';

interface FileViewerProps {
  filePath: string | null;
  owner?: string;
  repo?: string;
}

const API_BASE = config.apiBase;

// Detect language from file extension, mapping to Shiki's language names
function detectLanguageFromPath(path: string): BundledLanguage | string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, BundledLanguage | string> = {
    ts: 'typescript',
    js: 'javascript',
    tsx: 'tsx',
    jsx: 'jsx',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    cpp: 'cpp',
    cc: 'cpp',
    cxx: 'cpp',
    c: 'c',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    scala: 'scala',
    r: 'r',
    md: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
    json: 'json',
    xml: 'xml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    sass: 'sass',
    less: 'less',
    sql: 'sql',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
    cmake: 'cmake',
    txt: 'text',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    fish: 'fish',
    vue: 'vue',
    svelte: 'svelte',
  };
  return langMap[ext] || 'text';
}

export default function FileViewer({ filePath, owner, repo }: FileViewerProps) {
  const [content, setContent] = useState<string>('');
  const [highlightedHtml, setHighlightedHtml] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!filePath || !owner || !repo) {
      setContent('');
      setHighlightedHtml('');
      setError(null);
      return;
    }

    const fetchFileContent = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // First, try to get file content from the vector store via chat search
        // We'll search for the file path to get its content from metadata
        const res = await fetch(`${API_BASE}/api/github/file?owner=${owner}&repo=${repo}&path=${encodeURIComponent(filePath)}`, {
          method: 'GET',
        });

        if (res.ok) {
          const data = await res.json();
          const fileContent = data.content || '';
          setContent(fileContent);
          
          // Highlight the code with Shiki
          if (fileContent && filePath) {
            try {
              const language = detectLanguageFromPath(filePath);
              const html = await codeToHtml(fileContent, {
                lang: language,
                theme: 'github-light',
              });
              setHighlightedHtml(html);
            } catch (highlightError) {
              console.error('Failed to highlight code:', highlightError);
              // Fallback to plain text if highlighting fails
              setHighlightedHtml('');
            }
          } else {
            setHighlightedHtml('');
          }
        } else if (res.status === 404) {
          // If endpoint doesn't exist, try alternative approach
          // For now, show a message that file content fetching needs to be implemented
          setError('File content endpoint not yet implemented. Please implement GET /api/github/file endpoint.');
        } else {
          const errorData = await res.json();
          setError(errorData.error || 'Failed to load file content');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load file content');
      } finally {
        setLoading(false);
      }
    };

    fetchFileContent();
  }, [filePath, owner, repo]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
  };

  if (!filePath) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Select a file to view its contents</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <Card className="w-full">
          <CardContent className="p-4">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Count lines for line numbers
  const lines = content.split('\n');
  const lineCount = lines.length;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <div className="flex items-center justify-between p-2 border-b shrink-0 h-[57px]">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{filePath}</p>
          <p className="text-xs text-muted-foreground">{lineCount} lines</p>
        </div>
        <Button variant="ghost" size="icon" onClick={copyToClipboard}>
          <Copy className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4">
          {highlightedHtml ? (
            <div 
              className="shiki-wrapper [&_pre]:m-0 [&_pre]:p-0 [&_pre]:text-xs [&_pre]:font-mono [&_pre]:leading-relaxed [&_pre]:overflow-visible"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          ) : (
            <pre className="text-xs font-mono leading-relaxed">
              <code>
                {lines.map((line, index) => (
                  <div key={index} className="flex">
                    <span className="text-muted-foreground select-none mr-4 w-8 text-right">
                      {index + 1}
                    </span>
                    <span className="flex-1">{line || ' '}</span>
                  </div>
                ))}
              </code>
            </pre>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

