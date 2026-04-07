import { useState } from 'react';
import { TreeNode, FileNode } from '../types';
import { cn } from '../lib/utils';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';

interface FileTreeItemProps {
  node: TreeNode;
  level?: number;
  selectedPath: string | null;
  onSelect: (file: FileNode | null, node: TreeNode) => void;
}

export const FileTreeItem = ({ node, level = 0, selectedPath, onSelect }: FileTreeItemProps) => {
  const [isOpen, setIsOpen] = useState(true);
  
  if (!node.isDirectory && node.file) {
    const isSelected = selectedPath === node.path;
    return (
      <div 
        className={cn("flex items-center gap-2 py-1 px-2 cursor-pointer rounded-md text-sm transition-all duration-200 group", isSelected ? "bg-[var(--accent-dim)] text-[var(--accent)] font-medium" : "text-[var(--text-main)] hover:bg-[var(--accent-dim)]/50")} 
        style={{ paddingLeft: `${level * 12 + 8}px` }} 
        onClick={() => onSelect(node.file!, node)}
      >
        <FileText className={cn("w-4 h-4 opacity-70", node.file.isIndexed ? "text-[var(--ok)]" : "")} />
        <span className="truncate">{node.name}</span>
        {node.file.isIndexed && <div className="w-1.5 h-1.5 rounded-full bg-[var(--ok)] ml-auto" title="Indexed" />}
      </div>
    );
  }
  
  return (
    <div>
      <div 
        className="flex items-center gap-1 py-1 px-2 cursor-pointer rounded-md text-sm text-[var(--text-muted)] hover:text-[var(--text-main)] transition-colors" 
        style={{ paddingLeft: `${level * 12 + 8}px` }} 
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? <ChevronDown className="w-3 h-3 opacity-50" /> : <ChevronRight className="w-3 h-3 opacity-50" />}
        <Folder className="w-4 h-4 text-[var(--accent)] opacity-80" />
        <span className="truncate font-medium">{node.name}</span>
      </div>
      {isOpen && (
        <div className="flex flex-col">
          {Object.values(node.children)
            .sort((a, b) => (a.isDirectory === b.isDirectory) ? a.name.localeCompare(b.name) : (a.isDirectory ? -1 : 1))
            .map(child => (
            <FileTreeItem key={child.path} node={child} level={level + 1} selectedPath={selectedPath} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
};
