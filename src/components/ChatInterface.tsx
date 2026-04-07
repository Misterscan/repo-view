import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Trash2, CheckCircle2, AlertCircle, Save, X } from 'lucide-react';
import Markdown from 'react-markdown';
import { Message } from '../types';
import { cn } from '../lib/utils';

interface ChatInterfaceProps {
  messages: Message[];
  query: string;
  setQuery: (q: string) => void;
  isThinking: boolean;
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  indexState: string;
  useGrounding: boolean;
  setUseGrounding: (b: boolean) => void;
  onSend: () => void;
  onDeleteMessage: (index: number) => void;
  onClear: () => void;
}

const CodeBlock = ({ children, className }: { children: any, className?: string }) => {
  const [status, setStatus] = useState<'idle' | 'applying' | 'success' | 'error'>('idle');
  const [targetPath, setTargetPath] = useState('');
  const [showApply, setShowApply] = useState(false);

  const applyChange = async () => {
    if (!targetPath) {
      alert("Please specify a target path relative to the repository root.");
      return;
    }
    setStatus('applying');
    try {
      const response = await fetch('/api/write-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: targetPath, content: String(children) }),
      });
      if (!response.ok) throw new Error('Write failed');
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 5000);
    }
  };

  return (
    <div className="relative group/code my-4">
      <pre className="!m-0 !p-4"><code className={className}>{children}</code></pre>
      
      <div className="absolute top-2 right-2 flex items-center gap-2 opacity-0 group-hover/code:opacity-100 transition-opacity">
        <button 
          onClick={() => navigator.clipboard.writeText(String(children))} 
          className="bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black px-2 py-1 rounded text-[0.55rem] font-bold border border-[var(--accent)]/50 backdrop-blur-md"
        >
          COPY
        </button>
        <button 
          onClick={() => setShowApply(!showApply)} 
          className="bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black px-2 py-1 rounded text-[0.55rem] font-bold border border-[var(--accent)]/50 backdrop-blur-md flex items-center gap-1"
        >
          <Save className="w-3 h-3" />
          {status === 'applying' ? 'WRITING...' : 'APPLY'}
        </button>
      </div>

      {showApply && (
        <div className="mt-2 p-3 bg-black/40 border border-[var(--accent)]/30 rounded-lg animate-in slide-in-from-top-1 duration-200">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[0.6rem] font-black uppercase text-[var(--accent)] tracking-widest">Apply to Filesystem</span>
              {status === 'success' && <div className="flex items-center gap-1 text-[var(--ok)] text-[0.6rem] font-bold"><CheckCircle2 className="w-3 h-3" /> APPLIED</div>}
              {status === 'error' && <div className="flex items-center gap-1 text-[var(--bad)] text-[0.6rem] font-bold"><AlertCircle className="w-3 h-3" /> FAILED</div>}
            </div>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Target Path (OVERWRITES EXISTING)" 
                value={targetPath}
                onChange={e => setTargetPath(e.target.value)}
                className="flex-1 bg-[#09211b] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
              />
              <button 
                onClick={applyChange}
                disabled={status === 'applying'}
                className="bg-[var(--accent)] text-black px-3 py-1 rounded text-[0.6rem] font-black uppercase hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export function ChatInterface({
  messages, query, setQuery, isThinking, selectedModel, setSelectedModel, indexState, useGrounding, setUseGrounding, onSend, onDeleteMessage, onClear
}: ChatInterfaceProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { 
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages]);

  return (
    <div className="w-[450px] flex-shrink-0 border-l border-[var(--border)] flex flex-col bg-[var(--sidebar-bg)] relative z-20">
      <div className="h-10 bg-[rgba(6,26,21,0.9)] border-b border-[var(--border)] flex items-center justify-between px-4 text-[0.65rem] font-mono text-[var(--accent)] uppercase tracking-tighter">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Bot className="w-3 h-3" /> Intelligence Panel
          </div>
          <select 
            value={selectedModel} 
            onChange={e => setSelectedModel(e.target.value)} 
            className="bg-transparent border-none text-[var(--accent)] focus:ring-0 cursor-pointer opacity-60 hover:opacity-100 text-[0.6rem] font-bold uppercase"
          >
            <option value="gemini-3.1-pro-preview">Pro</option>
            <option value="gemini-3.1-flash-lite-preview">Flash-Lite</option>
            <option value="gemini-3-flash-preview">Flash</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("w-1.5 h-1.5 rounded-full shadow-[0_0_8px_rgba(0,255,157,0.5)]", indexState.includes('Ready') ? "bg-[var(--ok)]" : "bg-[var(--bad)] animate-pulse")} />
          {indexState.includes('Ready') ? 'Active' : 'Unsynced'}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-style bg-[radial-gradient(circle_at_top_right,rgba(0,255,157,0.03),transparent)]">
        {messages.map((m, i) => (
          <div key={i} className={cn("message p-4 rounded-xl border border-[var(--border)]/30 transition-all hover:bg-white/5 relative group", m.role === 'user' ? "bg-[var(--accent)]/5 border-[var(--accent)]/20" : "bg-black/20")}>
            <button 
              onClick={() => onDeleteMessage(i)}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-[var(--bad)] text-[var(--text-muted)]"
              title="Delete Message"
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[0.6rem] uppercase font-black tracking-widest text-[var(--accent)] opacity-70">
                {m.role === 'user' ? 'Operator' : 'repoview'}
              </span>
              <span className="text-[0.5rem] opacity-30 font-mono">L{m.text.length}</span>
            </div>
            <div className="prose prose-slate prose-invert max-w-none text-[0.85rem] leading-relaxed prose-code:text-[var(--accent-hover)] prose-code:bg-[var(--accent-dim)]/50 prose-code:px-1 prose-code:rounded prose-pre:bg-[#010806] prose-pre:border prose-pre:border-[var(--border)]">
              <Markdown components={{
                code({ className, children, ...props }) {
                  const isBlock = !!className && className.includes('language-');
                  return isBlock ? (
                    <CodeBlock className={className} {...props}>{children}</CodeBlock>
                  ) : <code {...props as any}>{children}</code>
                }
              }}>{m.text}</Markdown>
            </div>
          </div>
        ))}
        {isThinking && (
          <div className="flex items-center gap-3 p-4 text-[var(--accent)] animate-pulse bg-[var(--accent)]/5 rounded-xl border border-[var(--accent)]/20">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-[0.65rem] uppercase font-black tracking-widest">Constructing Insight...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 bg-[var(--sidebar-bg)] border-t border-[var(--border)] shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col gap-3">
          <div className="relative">
            <textarea 
              value={query} 
              onChange={e => setQuery(e.target.value)} 
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }} 
              placeholder="Query core documentation..." 
              className="w-full bg-[#09211b] text-[var(--text-main)] border border-[var(--border)] rounded-xl p-3 pr-10 min-h-[80px] max-h-40 resize-none outline-none focus:border-[var(--accent)] transition-all text-xs placeholder:text-[var(--text-muted)] placeholder:uppercase placeholder:font-bold placeholder:tracking-tighter" 
            />
            <button 
              onClick={onSend} 
              disabled={isThinking || !query.trim()} 
              className="absolute bottom-3 right-3 text-[var(--accent)] disabled:opacity-10 hover:scale-110 transition-transform"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input 
                type="checkbox" 
                checked={useGrounding} 
                onChange={e => setUseGrounding(e.target.checked)} 
                className="accent-[var(--accent)] w-3.5 h-3.5" 
              />
              <span className="text-[0.6rem] font-black uppercase text-[var(--text-muted)] group-hover:text-[var(--accent)] transition-colors">Grounding</span>
            </label>
            <button 
              onClick={onClear} 
              className="text-[0.6rem] uppercase font-black text-[var(--text-muted)] hover:text-[var(--bad)] transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" /> Clear Buffer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
