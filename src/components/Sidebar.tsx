import { useRef, useState } from 'react';
import { Bot, Code2, Folder, Loader2, Search, Upload, History, Database, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { FileNode } from '../types';
import { FileTreeItem } from './FileTree';
import { RepoSession } from '../lib/db';
import { cn } from '../lib/utils';

// Assume tree builder
function buildTree(files: FileNode[]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const root: any = { name: 'root', path: '', isDirectory: true, children: {} };
  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current.children[part] = { name: part, path: file.path, isDirectory: false, children: {}, file };
      } else {
        if (!current.children[part]) {
          current.children[part] = { name: part, path: parts.slice(0, i + 1).join('/'), isDirectory: true, children: {} };
        }
        current = current.children[part];
      }
    }
  }
  return root;
}

interface SidebarProps {
  files: FileNode[];
  selectedFile: FileNode | null;
  onSelectFile: (f: FileNode | null) => void;
  isIndexing: boolean;
  indexProgress: number;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStartIndexing: () => void;
  onStartFullReview: () => void;
  isThinking: boolean;
  sessions: RepoSession[];
  currentSessionId: string | null;
  onLoadSession: (id: string) => void;
  onToggleTerminal: () => void;
  terminalActive: boolean;
}

export function Sidebar({
  files, 
  selectedFile, 
  onSelectFile, 
  isIndexing, 
  indexProgress, 
  onFileUpload, 
  onStartIndexing, 
  onStartFullReview, 
  isThinking, 
  sessions, 
  currentSessionId, 
  onLoadSession,
  onToggleTerminal,
  terminalActive
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const [showSessions, setShowSessions] = useState(false);
  
  const tree = buildTree(files);

  return (
    <div className="w-80 flex-shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--sidebar-bg)] shadow-[2px_0_20px_rgba(0,255,157,0.05)] z-20">
      <div className="p-4 flex flex-col gap-4 border-b border-[var(--border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-md font-bold text-[var(--accent)] tracking-widest neon-glow">
            <Code2 className="w-5 h-5" />
            <span>CODING AGENT</span>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={onToggleTerminal} 
              className={cn("p-1.5 rounded-md border transition-all", terminalActive ? "bg-[var(--accent)] text-black border-[var(--accent)] shadow-[0_0_15px_var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)]")}
              title="Toggle Terminal"
            >
              <div className="flex items-center px-0.5"><span className="text-[0.6rem] font-black mr-0.5">$</span></div>
            </button>
            <button 
              onClick={() => setShowSessions(!showSessions)} 
              className={cn("p-1.5 rounded-md border transition-all", showSessions ? "bg-[var(--accent)] text-black border-[var(--accent)]" : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--accent)]")}
              title="Repo History"
            >
              <History className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="row flex gap-2">
            <button onClick={() => dirInputRef.current?.click()} className="flex items-center justify-center gap-2 flex-1 py-1.5 bg-[#09211b] border border-[var(--border)] rounded-md text-[var(--text-main)] text-[0.65rem] uppercase font-bold hover:bg-[var(--accent-dim)] transition-colors">
              <Folder className="w-3 h-3" /> Folder
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="flex items-center justify-center gap-2 flex-1 py-1.5 bg-[#09211b] border border-[var(--border)] rounded-md text-[var(--text-main)] text-[0.65rem] uppercase font-bold hover:bg-[var(--accent-dim)] transition-colors">
              <Upload className="w-3 h-3" /> Files
            </button>
          </div>

          <input type="file" multiple className="hidden" ref={fileInputRef} onChange={onFileUpload} />
          {/* @ts-ignore */}
          <input type="file" multiple webkitdirectory="true" directory="true" className="hidden" ref={dirInputRef} onChange={onFileUpload} />

          <button onClick={onStartIndexing} disabled={isIndexing || files.length === 0} className="action-btn-jungle w-full py-2 flex items-center justify-center gap-2 disabled:opacity-30 text-[0.65rem] font-bold">
            {isIndexing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
            {isIndexing ? `INDEXING ${indexProgress}%` : `INDEX & UPLOAD`}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-style">
        {showSessions ? (
          <div className="space-y-2 p-2">
             <div className="px-2 py-2 text-[0.6rem] uppercase text-[var(--text-muted)] font-black tracking-[0.2em] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-3 h-3 text-[var(--accent)]" />
                History
              </div>
            </div>
            {sessions.slice().reverse().map(s => (
              <div 
                key={s.id} 
                onClick={() => { onLoadSession(s.id); setShowSessions(false); }}
                className={cn("p-3 rounded-lg border cursor-pointer transition-all hover:border-[var(--accent)] group relative", s.id === currentSessionId ? "bg-[var(--accent)]/10 border-[var(--accent)]" : "bg-black/20 border-white/5")}
              >
                <div className="text-[0.7rem] font-bold uppercase text-[var(--text-main)] mb-1 truncate pr-6">{s.name}</div>
                <div className="flex items-center gap-3 text-[0.55rem] text-[var(--text-muted)] font-mono">
                  <span>{new Date(s.timestamp).toLocaleDateString()}</span>
                  <span>{s.chunksCount} chunks</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="px-2 py-2 text-[0.6rem] uppercase text-[var(--text-muted)] font-black tracking-[0.2em] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 bg-[var(--accent)] rounded-full animate-pulse" />
                Repository
              </div>
              <span className="text-[0.55rem] opacity-50">{files.length} items</span>
            </div>
            {files.length === 0 ? (
              <div className="h-40 flex items-center justify-center text-[var(--text-muted)] text-[0.65rem] italic opacity-40">
                Vault is empty.
              </div>
            ) : (
              <div className="mt-1">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {Object.values(tree.children).sort((a: any, b: any) => (a.isDirectory === b.isDirectory) ? a.name.localeCompare(b.name) : (a.isDirectory ? -1 : 1)).map((child: any) => (
                  <FileTreeItem key={child.path} node={child} selectedPath={selectedFile?.path || null} onSelect={onSelectFile} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="p-3 border-t border-[var(--border)]">
        <button onClick={onStartFullReview} disabled={isThinking || files.length === 0} className="w-full py-2 rounded-md border border-[var(--accent)]/30 text-[var(--accent)] text-[0.6rem] uppercase font-black tracking-widest hover:bg-[var(--accent)]/10 transition-all disabled:opacity-20 flex items-center justify-center gap-2">
          <Search className="w-3 h-3" /> Audit Repository
        </button>
      </div>
    </div>
  );
}
