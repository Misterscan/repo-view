import { FileText, Send, Code2, Download, Image as ImageIcon, Video, Globe, Eye, Code } from 'lucide-react';
import Markdown from 'react-markdown';
import { FileNode } from '../types';
import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';

interface FileViewerProps {
  selectedFile: FileNode | null;
  onContextualize: (path: string) => void;
}

export function FileViewer({ selectedFile, onContextualize }: FileViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview');

  useEffect(() => {
    if (selectedFile?.blob) {
      const url = URL.createObjectURL(selectedFile.blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setBlobUrl(null);
    }
  }, [selectedFile]);

  // Reset view mode when file changes
  useEffect(() => {
    const isHtml = selectedFile?.name.toLowerCase().endsWith('.html');
    setViewMode(isHtml ? 'preview' : 'source');
  }, [selectedFile?.path]);

  const isImage = selectedFile?.name.match(/\.(jpg|jpeg|png|gif|webp|bmp|ico|svg)$/i);
  const isVideo = selectedFile?.name.match(/\.(mp4|webm|ogg|mov)$/i);
  const isPdf = selectedFile?.name.toLowerCase().endsWith('.pdf');
  const isHtml = selectedFile?.name.toLowerCase().endsWith('.html');

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#020a08] relative">
      <div className="h-10 bg-[rgba(1,15,12,0.8)] border-b border-[var(--border)] flex items-center justify-between px-4 text-[0.65rem] font-mono text-[var(--accent)] uppercase tracking-tighter sticky top-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-2">
            {isImage ? <ImageIcon className="w-3 h-3 text-[var(--accent)]" /> : isVideo ? <Video className="w-3 h-3 text-[var(--accent)]" /> : isHtml ? <Globe className="w-3 h-3 text-[var(--accent)]" /> : <FileText className="w-3 h-3 opacity-50" />}
            {selectedFile ? selectedFile.path : "Select a file to begin"}
          </span>
          {selectedFile && !isImage && !isVideo && (
            <button 
              onClick={() => onContextualize(`\nAnalyze this file: ${selectedFile.path}\n`)} 
              className="px-2 py-0.5 rounded border border-[var(--accent)]/40 hover:bg-[var(--accent)]/20 transition-all text-[var(--accent)] flex items-center gap-1 font-bold"
            >
              <Send className="w-2.5 h-2.5" /> Contextualize
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isHtml && (
            <div className="flex bg-black/40 rounded-md border border-[var(--border)] p-0.5 mr-2">
              <button 
                onClick={() => setViewMode('preview')} 
                className={cn("px-2 py-0.5 rounded text-[0.55rem] font-bold flex items-center gap-1 transition-all", viewMode === 'preview' ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-white")}
              >
                <Eye className="w-2.5 h-2.5" /> Preview
              </button>
              <button 
                onClick={() => setViewMode('source')} 
                className={cn("px-2 py-0.5 rounded text-[0.55rem] font-bold flex items-center gap-1 transition-all", viewMode === 'source' ? "bg-[var(--accent)] text-black" : "text-[var(--text-muted)] hover:text-white")}
              >
                <Code className="w-2.5 h-2.5" /> Source
              </button>
            </div>
          )}
          <span className="opacity-40">{selectedFile && selectedFile.content ? `${((selectedFile.content.length || 0) / 1024).toFixed(1)} KB` : selectedFile?.blob ? `${(selectedFile.blob.size / 1024).toFixed(1)} KB` : ""}</span>
          {selectedFile?.blob && (
            <a href={blobUrl || ''} download={selectedFile.name} className="p-1 hover:text-[var(--accent)] transition-colors" title="Download">
              <Download className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
        {!selectedFile ? (
          <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] animate-pulse">
            <div className="w-24 h-24 rounded-full border border-[var(--accent)]/10 flex items-center justify-center mb-6 shadow-[0_0_50px_rgba(0,255,157,0.05)]">
              <Code2 className="w-10 h-10 opacity-20" />
            </div>
            <p className="text-[0.65rem] uppercase font-black tracking-[0.3em] opacity-30">Waiting for Data Forge...</p>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto h-full">
            {isImage && blobUrl && (
              <div className="flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-500">
                <div className="p-2 bg-black/40 border border-[var(--border)] rounded-2xl shadow-2xl overflow-hidden group relative">
                    <img src={blobUrl} alt={selectedFile.name} className="max-w-full max-h-[70vh] object-contain rounded-lg shadow-inner" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                        <span className="text-[0.6rem] font-mono text-white/70">{selectedFile.name}</span>
                    </div>
                </div>
              </div>
            )}
            {isVideo && blobUrl && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                <video controls className="w-full max-h-[70vh] rounded-2xl border border-[var(--border)] shadow-2xl shadow-[var(--accent)]/5">
                  <source src={blobUrl} type={selectedFile.blob?.type} />
                </video>
              </div>
            )}
            {isPdf && blobUrl && (
              <iframe src={blobUrl} className="w-full h-[80vh] rounded-2xl border border-[var(--border)]" />
            )}
            {isHtml && viewMode === 'preview' && (
              <div className="w-full h-[80vh] bg-white rounded-2xl border border-[var(--border)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-500">
                <iframe 
                    srcDoc={selectedFile.content} 
                    title={selectedFile.name} 
                    className="w-full h-full border-none"
                    sandbox="allow-scripts"
                />
              </div>
            )}
            {(!isImage && !isVideo && !isPdf && (!isHtml || viewMode === 'source')) && (
               <>
                {selectedFile.name.toLowerCase().endsWith('.md') || selectedFile.name.toLowerCase().endsWith('.mdx') ? (
                    <div className="prose prose-invert prose-emerald max-w-none prose-headings:text-[var(--accent)] prose-a:text-[var(--accent-hover)] animate-in fade-in slide-in-from-top-2 duration-500">
                      <Markdown>{selectedFile.content || ""}</Markdown>
                    </div>
                  ) : (
                    <div className="relative group animate-in fade-in slide-in-from-bottom-2 duration-500">
                      <pre className="p-6 md:p-10 bg-[#010806] rounded-2xl border border-[var(--border)] overflow-x-auto text-[0.75rem] font-mono leading-relaxed shadow-2xl relative">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--accent)]/20 to-transparent" />
                        <code className="text-[#96f2d7] block min-w-full">{selectedFile.content || ""}</code>
                      </pre>
                      <button 
                        onClick={() => navigator.clipboard.writeText(selectedFile.content || "")} 
                        className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black border border-[var(--accent)] rounded-lg px-3 py-1.5 text-[0.7rem] font-bold uppercase shadow-lg backdrop-blur-sm"
                      >
                        Copy Code
                      </button>
                    </div>
                  )}
               </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
