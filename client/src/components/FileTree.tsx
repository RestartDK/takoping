import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Node } from '@xyflow/react';

interface FileTreeProps {
  nodes: Node[];
  onFileSelect: (path: string | null) => void;
  selectedFile: string | null;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children: TreeNode[];
  isDirectory: boolean;
}

export default function FileTree({ nodes, onFileSelect, selectedFile }: FileTreeProps) {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

  const tree = useMemo(() => {
    const root: TreeNode = {
      name: '',
      path: '',
      type: 'directory',
      children: [],
      isDirectory: true,
    };

    const pathMap = new Map<string, TreeNode>();
    // Track which paths are actual nodes (not just intermediate paths)
    const actualNodeTypes = new Map<string, 'file' | 'directory'>();

    // First pass: collect all actual node types
    nodes.forEach((node) => {
      const path = node.data.path;
      const nodeType = node.type as 'file' | 'directory' | undefined;
      if (nodeType === 'file' || nodeType === 'directory') {
        actualNodeTypes.set(path, nodeType);
      }
    });

    // Second pass: build tree structure
    nodes.forEach((node) => {
      const path = node.data.path;
      const parts = path.split('/');
      const nodeType = actualNodeTypes.get(path);

      let currentPath = '';
      let parent = root;

      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isLast = index === parts.length - 1;

        if (!pathMap.has(currentPath)) {
          // If this is an actual node path, use its type; otherwise it's a directory (intermediate)
          const actualType = actualNodeTypes.get(currentPath);
          const isFile = actualType === 'file';
          const isDirectory = !isFile;
          
          const treeNode: TreeNode = {
            name: part,
            path: currentPath,
            type: isFile ? 'file' : 'directory',
            children: [],
            isDirectory,
          };
          pathMap.set(currentPath, treeNode);
          parent.children.push(treeNode);
        } else {
          // If this path already exists but we now know it's an actual node, update its type
          const existingNode = pathMap.get(currentPath)!;
          const actualType = actualNodeTypes.get(currentPath);
          if (actualType && existingNode.type !== actualType) {
            existingNode.type = actualType;
            existingNode.isDirectory = actualType === 'directory';
          }
        }

        parent = pathMap.get(currentPath)!;
      });
    });

    // Sort children: directories first, then files
    const sortTree = (node: TreeNode) => {
      node.children.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
      node.children.forEach(sortTree);
    };

    sortTree(root);
    return root;
  }, [nodes]);

  const toggleExpand = (path: string) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    if (!node.name) {
      // Render root children
      return node.children.map((child) => renderNode(child, 0));
    }

    const isExpanded = expandedPaths.has(node.path);
    const isSelected = selectedFile === node.path;
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.path}>
        <div
          className={cn(
            'flex items-center gap-1 px-2 py-1.5 text-sm cursor-pointer hover:bg-accent',
            isSelected && 'bg-accent',
            'select-none'
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (node.isDirectory && hasChildren) {
              toggleExpand(node.path);
            } else if (!node.isDirectory) {
              onFileSelect(node.path);
            }
          }}
        >
          {node.isDirectory ? (
            <>
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                )
              ) : (
                <div className="w-4" />
              )}
              {isExpanded ? (
                <FolderOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </>
          ) : (
            <>
              <div className="w-4" />
              <File className="h-4 w-4 shrink-0 text-muted-foreground" />
            </>
          )}
          <span className="truncate">{node.name}</span>
        </div>
        {node.isDirectory && isExpanded && hasChildren && (
          <div>
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full">
      {tree.children.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground text-center">
          No files loaded. Load a repository to see the file tree.
        </div>
      ) : (
        renderNode(tree)
      )}
    </div>
  );
}

