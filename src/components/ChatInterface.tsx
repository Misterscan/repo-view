import React, { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, Trash2, CheckCircle2, AlertCircle, Save, X, LucideBrain, Paperclip, FileText, Image as ImageIcon } from 'lucide-react';
import Markdown from 'react-markdown';
import { Message } from '../types';
import { readApiError, readApiResult } from '../lib/api';
import { cn } from '../lib/utils';
import { getMimeType } from '../lib/gemini';

type DiffLine = {
  kind: 'same' | 'add' | 'remove';
  text: string;
  leftNumber: number | null;
  rightNumber: number | null;
};

function buildLineDiff(previousText: string, nextText: string): DiffLine[] {
  const left = previousText.split(/\r?\n/);
  const right = nextText.split(/\r?\n/);
  const dp = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      dp[i][j] = left[i] === right[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let leftNumber = 1;
  let rightNumber = 1;

  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      lines.push({ kind: 'same', text: left[i], leftNumber, rightNumber });
      i += 1;
      j += 1;
      leftNumber += 1;
      rightNumber += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      lines.push({ kind: 'remove', text: left[i], leftNumber, rightNumber: null });
      i += 1;
      leftNumber += 1;
    } else {
      lines.push({ kind: 'add', text: right[j], leftNumber: null, rightNumber });
      j += 1;
      rightNumber += 1;
    }
  }

  while (i < left.length) {
    lines.push({ kind: 'remove', text: left[i], leftNumber, rightNumber: null });
    i += 1;
    leftNumber += 1;
  }

  while (j < right.length) {
    lines.push({ kind: 'add', text: right[j], leftNumber: null, rightNumber });
    j += 1;
    rightNumber += 1;
  }

  return lines;
}

interface ChatInterfaceProps {
  messages: Message[];
  query: string;
  setQuery: (q: string) => void;
  isThinking: boolean;
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  temperaturePreset: 'focused' | 'balanced' | 'creative';
  setTemperaturePreset: (preset: 'focused' | 'balanced' | 'creative') => void;
  thinkingLevel: 'minimal' | 'low' | 'medium' | 'high';
  setThinkingLevel: (level: 'minimal' | 'low' | 'medium' | 'high') => void;
  draftQueryTokens: number;
  lastRequestTokens: number | null;
  indexState: string;
  useGrounding: boolean;
  setUseGrounding: (b: boolean) => void;
  onSend: (attachments?: { name: string, mimeType: string, data: string }[]) => void;
  onDeleteMessage: (index: number) => void;
  onClear: () => void;
  currentSessionId: string | null;
}

const CodeBlock = ({ children, className, sessionId }: { children: any, className?: string, sessionId?: string | null }) => {
  const [status, setStatus] = useState<'idle' | 'applying' | 'success' | 'error'>('idle');
  const [targetPath, setTargetPath] = useState(() => {
    const text = String(children);
    // Try to find common path patterns at the start of the block
    const firstLine = text.split('\n')[0].trim();
    const pathMatch = firstLine.match(/\/\/\s*File:\s*(.+)|#\s*File:\s*(.+)/i);
    if (pathMatch) return pathMatch[1] || pathMatch[2];
    
    // Check if the block content starts with a path like /home/user/... or C:\...
    if (firstLine.startsWith('/') || firstLine.match(/^[a-zA-Z]:\\/)) return firstLine;
    
    return '';
  });
  const [showApply, setShowApply] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const nextText = String(children);

  const previewDiff = async () => {
    if (!targetPath) {
      alert('Please specify a target path before previewing the diff.');
      return;
    }

    setShowDiff(true);
    setIsDiffLoading(true);
    setDiffError(null);
    try {
      const response = await fetch('/api/read-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: targetPath, sessionId }),
      });
      const data = await readApiResult<{ content?: string }>(response, 'Failed to read file');
      setDiffLines(buildLineDiff(String(data?.content || ''), nextText));
    } catch (error: any) {
      setDiffLines([]);
      setDiffError(error?.message || 'Failed to generate diff preview');
    } finally {
      setIsDiffLoading(false);
    }
  };

  const applyChange = async () => {
    if (!targetPath) {
      alert("Please specify a target path.");
      return;
    }
    setStatus('applying');
    try {
      const response = await fetch('/api/write-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: targetPath, content: nextText, sessionId }),
      });
      if (!response.ok) await readApiError(response, 'Write failed');
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
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
              <span className="text-[0.6rem] font-black uppercase text-[var(--accent)] tracking-widest">Apply to File (OVERWRITES EXISTING)</span>
              {status === 'success' && <div className="flex items-center gap-1 text-[var(--ok)] text-[0.6rem] font-bold"><CheckCircle2 className="w-3 h-3" /> APPLIED</div>}
              {status === 'error' && <div className="flex items-center gap-1 text-[var(--bad)] text-[0.6rem] font-bold"><AlertCircle className="w-3 h-3" /> FAILED</div>}
            </div>
            <div className="flex gap-2">
              <input 
                type="text" 
                placeholder="Target Path [eg. 'path/to/file']" 
                value={targetPath}
                onChange={e => {
                  setTargetPath(e.target.value);
                  setShowDiff(false);
                  setDiffError(null);
                }}
                className="flex-1 bg-[#09211b] border border-[var(--border)] rounded px-2 py-1 text-xs text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
              />
              <button 
                onClick={previewDiff}
                disabled={isDiffLoading}
                className="border border-[var(--border)] px-3 py-1 rounded text-[0.6rem] font-black uppercase hover:border-[var(--accent)] disabled:opacity-50"
              >
                {isDiffLoading ? 'Loading...' : 'Preview Diff'}
              </button>
              <button 
                onClick={applyChange}
                disabled={status === 'applying'}
                className="bg-[var(--accent)] text-black px-3 py-1 rounded text-[0.6rem] font-black uppercase hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
              >
                Confirm
              </button>
            </div>
            {showDiff && (
              <div className="mt-2 rounded-lg border border-[var(--border)] bg-[#020a08] overflow-hidden">
                <div className="px-3 py-2 border-b border-[var(--border)] text-[0.58rem] uppercase font-black tracking-widest text-[var(--text-muted)]">
                  Diff Preview
                </div>
                {diffError ? (
                  <div className="px-3 py-3 text-[0.65rem] text-[var(--bad)]">{diffError}</div>
                ) : isDiffLoading ? (
                  <div className="px-3 py-3 text-[0.65rem] text-[var(--text-muted)]">Loading current file...</div>
                ) : (
                  <div className="max-h-64 overflow-auto font-mono text-[0.65rem]">
                    {diffLines.length === 0 ? (
                      <div className="px-3 py-3 text-[var(--text-muted)]">No diff to show.</div>
                    ) : diffLines.map((line, index) => (
                      <div
                        key={`${line.kind}-${index}`}
                        className={cn(
                          'grid grid-cols-[3rem_3rem_1.5rem_1fr] gap-2 px-3 py-0.5 whitespace-pre-wrap',
                          line.kind === 'add' && 'bg-[rgba(0,255,157,0.08)] text-[var(--ok)]',
                          line.kind === 'remove' && 'bg-[rgba(255,80,80,0.08)] text-[var(--bad)]',
                          line.kind === 'same' && 'text-[var(--text-main)]/80'
                        )}
                      >
                        <span className="opacity-40 text-right">{line.leftNumber ?? ''}</span>
                        <span className="opacity-40 text-right">{line.rightNumber ?? ''}</span>
                        <span>{line.kind === 'add' ? '+' : line.kind === 'remove' ? '-' : ' '}</span>
                        <span>{line.text || ' '}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export function ChatInterface({
  messages, query, setQuery, isThinking, selectedModel, setSelectedModel, temperaturePreset, setTemperaturePreset, thinkingLevel, setThinkingLevel, draftQueryTokens, lastRequestTokens, indexState, useGrounding, setUseGrounding, onSend, onDeleteMessage, onClear, currentSessionId
}: ChatInterfaceProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<{ file: File; data: string }[]>([]);

  useEffect(() => { 
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      const cleanBase64 = base64.split(',')[1];
      setAttachments(prev => [...prev, { file, data: cleanBase64 }]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendWithAttachments = () => {
    const atts = attachments.map(a => ({
      name: a.file.name,
      mimeType: a.file.type || getMimeType(a.file.name),
      data: a.data
    }));
    onSend(atts);
    setAttachments([]);
  };

  return (
    <div className="w-[450px] flex-shrink-0 border-l border-[var(--border)] flex flex-col bg-[var(--sidebar-bg)] relative z-20">
      <div className="h-10 bg-[rgba(6,26,21,0.9)] border-b border-[var(--border)] flex items-center justify-between px-4 text-[0.65rem] font-mono text-[var(--accent)] uppercase tracking-tighter">
        <div className="flex items-center gap-4">
          <div className="repoview-logo-wrapper" aria-hidden>
            <img src="/logo.png" alt="repoview" className="repoview-logo" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          </div>
          <span>CODING AGENT</span>
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
                {m.role === 'user' ? 'Operator' : 'repoview Agent'}
              </span>
              <span className="text-[0.5rem] opacity-30 font-mono">L{m.text.length}</span>
            </div>
            
            {m.attachments && m.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {m.attachments.map((att, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 bg-black/40 border border-[var(--border)]/30 rounded px-2 py-1 text-[0.65rem] text-[var(--accent)] max-w-[150px] overflow-hidden">
                    {att.mimeType.startsWith('image/') ? <ImageIcon className="w-3 h-3 flex-shrink-0" /> : <FileText className="w-3 h-3 flex-shrink-0" />}
                    <span className="truncate">{att.name}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="prose prose-slate prose-invert max-w-none text-[0.85rem] leading-relaxed prose-code:text-[var(--accent-hover)] prose-code:bg-[var(--accent-dim)]/50 prose-code:px-1 prose-code:rounded prose-pre:bg-[#010806] prose-pre:border prose-pre:border-[var(--border)]">
              <Markdown components={{
                code({ className, children, ...props }) {
                  const isBlock = !!className && className.includes('language-');
                  return isBlock ? (
                    <CodeBlock className={className} sessionId={currentSessionId} {...props}>{children}</CodeBlock>
                  ) : <code {...props as any}>{children}</code>
                }
              }}>{m.text}</Markdown>
            </div>
          </div>
        ))}
        {isThinking && (
          <div className="flex items-center gap-3 p-4 text-[var(--accent)] animate-pulse bg-[var(--accent)]/5 rounded-xl border border-[var(--accent)]/20">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="text-[0.65rem] uppercase font-black tracking-widest">Thinking...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 bg-[var(--sidebar-bg)] border-t border-[var(--border)] shadow-[0_-10px_30px_rgba(0,0,0,0.5)]">
        <div className="flex flex-col gap-3">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-1">
              {attachments.map((a, i) => (
                <div key={i} className="flex items-center gap-1.5 bg-[var(--accent)]/10 border border-[var(--accent)]/30 rounded-md px-2 py-1 text-[0.65rem] text-[var(--accent)] group/att">
                  {a.file.type.startsWith('image/') ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                  <span className="max-w-[100px] truncate">{a.file.name}</span>
                  <button onClick={() => removeAttachment(i)} className="hover:text-[var(--bad)] text-[var(--text-muted)]">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <textarea 
              value={query} 
              onChange={e => setQuery(e.target.value)} 
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendWithAttachments(); } }} 
              placeholder="Ask a question (eg. 'Can you verify that my build runs without lint errors?')..." 
              className="w-full bg-[#09211b] text-[var(--text-main)] border border-[var(--border)] rounded-xl p-3 pr-20 min-h-[80px] max-h-40 resize-none outline-none focus:border-[var(--accent)] transition-all text-xs placeholder:text-[var(--text-muted)] placeholder:uppercase placeholder:font-bold placeholder:tracking-tighter" 
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                multiple 
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="text-[var(--text-muted)] hover:text-[var(--accent)] transition-colors p-1"
                title="Attach Files"
                disabled={isThinking}
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button 
                onClick={handleSendWithAttachments} 
                disabled={isThinking || (!query.trim() && attachments.length === 0)} 
                className="text-[var(--accent)] disabled:opacity-10 hover:scale-110 transition-transform p-1"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 opacity-80">
            <Bot className="w-3 h-3" /> 
          <select 
            value={selectedModel} 
            onChange={e => setSelectedModel(e.target.value)} 
            className="bg-transparent border-none text-[var(--accent)] focus:ring-0 cursor-pointer opacity-60 hover:opacity-100 text-[0.6rem] font-bold uppercase"
          >
            <option value="gemini-3.1-pro-preview">Model: Pro</option>
            <option value="gemini-3.1-flash-lite-preview">Model: Flash-Lite</option>
            <option value="gemini-3-flash-preview">Model: Flash</option>
          </select>
        </div>

          <div className="flex items-center gap-1.5 opacity-80">
          <span className="text-[0.55rem] font-bold uppercase opacity-70">Temp</span>
          <select
            value={temperaturePreset}
            onChange={(e) => setTemperaturePreset(e.target.value as 'focused' | 'balanced' | 'creative')}
            className="bg-transparent border-none text-[var(--accent)] focus:ring-0 cursor-pointer text-[0.6rem] font-bold uppercase"
            aria-label="Temperature"
          >
            <option value="focused">Focused (0.1)</option>
            <option value="balanced">Balanced (0.3)</option>
            <option value="creative">Creative (0.5)</option>
          </select>
        </div>
        <div className="flex items-center gap-1.5 opacity-80">
          <LucideBrain className="w-3 h-3" />
          <select
            value={thinkingLevel}
            onChange={(e) => setThinkingLevel(e.target.value as 'minimal' | 'low' | 'medium' | 'high')}
            className="bg-transparent border-none text-[var(--accent)] focus:ring-0 cursor-pointer text-[0.6rem] font-bold uppercase"
            aria-label="Thinking level"
          >
            <option value="minimal">Think: Minimal</option>
            <option value="low">Think: Low</option>
            <option value="medium">Think: Medium</option>
            <option value="high">Think: High</option>
          </select>
          {isThinking && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />}
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

          <div className="flex items-center justify-between gap-3 text-[0.58rem] font-mono text-[var(--text-muted)]">
            <span>Draft: ~{draftQueryTokens} tok</span>
            <span>{lastRequestTokens !== null ? `${isThinking ? 'Sending' : 'Last send'}: ~${lastRequestTokens} tok` : 'Last send: -'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
