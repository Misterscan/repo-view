import { useEffect, useState } from 'react';
import JSZip from 'jszip';
import { GitCommit } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { FileViewer } from './components/FileViewer';
import { ChatInterface } from './components/ChatInterface';
import { Terminal } from './components/Terminal';
import { useIndexer } from './hooks/useIndexer';
import { useAgent } from './hooks/useAgent';
import { getSessionFileBlob, getSessionFileContent, getSessionFileMetas, createSession, updateSessionServerUploadId } from './lib/db';
import { getMimeType } from './lib/gemini';
import { readApiResult } from './lib/api';
import { IGNORED_DIRS, IGNORED_EXTS } from './lib/constants';
import { FileNode, GitHubInspection } from './types';
import { useUIState, useIndexerState } from './store/appState';

type ChangedRepoFile = {
  path: string;
  size: number;
};

const WELCOME_DISMISSED_KEY = 'repoview.hideWelcome';

function isIgnoredUpload(f: File) {
  const path = f.webkitRelativePath || f.name;
  const lowerName = f.name.toLowerCase();
  if (IGNORED_EXTS.some(ext => lowerName.endsWith(ext))) return true;
  const pathParts = path.split('/');
  if (pathParts.some(part => IGNORED_DIRS.includes(part))) return true;
  return false;
}

function WelcomeScreen({
  onContinue,
  dontShowAgain,
  onToggleDontShowAgain,
}: {
  onContinue: () => void;
  dontShowAgain: boolean;
  onToggleDontShowAgain: (value: boolean) => void;
}) {
  const [commits, setCommits] = useState<{sha: string; message: string; date: string; author: string; url: string; files: string[]}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCommits = async () => {
      try {
        const res = await fetch('https://api.github.com/repos/Misterscan/repo-view/commits?per_page=3');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        
        if (Array.isArray(data)) {
          const detailedCommits = await Promise.all(data.map(async (c: any) => {
            try {
              const detailRes = await fetch(c.url);
              const detailData = await detailRes.json();
              return {
                sha: c.sha.substring(0, 7),
                message: c.commit.message.split('\n')[0],
                date: new Date(c.commit.author.date).toLocaleDateString(),
                author: c.commit.author.name,
                url: c.html_url,
                files: (detailData.files || []).map((f: any) => f.filename)
              };
            } catch {
              return {
                sha: c.sha.substring(0, 7),
                message: c.commit.message.split('\n')[0],
                date: new Date(c.commit.author.date).toLocaleDateString(),
                author: c.commit.author.name,
                url: c.html_url,
                files: []
              };
            }
          }));
          setCommits(detailedCommits);
        }
      } catch (err) {
        console.error("Failed to fetch commits", err);
      } finally {
        setLoading(false);
      }
    };
    fetchCommits();
  }, []);

  return (
    <div className="flex h-screen w-full items-center justify-center jungle-grid overflow-hidden px-6">
      <div className="w-full max-w-5xl rounded-[28px] border border-[var(--border)] bg-[linear-gradient(180deg,rgba(6,26,21,0.96),rgba(2,13,10,0.98))] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)] md:p-12">
        <div className="grid items-center gap-10 md:grid-cols-[360px_minmax(0,1fr)]">
          <div className="flex items-center justify-center rounded-[24px] border border-[var(--border)] bg-[radial-gradient(circle_at_center,rgba(0,255,157,0.1),transparent_65%)] p-6">
            <img src="/full-size-logo.png" alt="repoview" className="h-auto w-full max-w-[280px] object-contain" />
          </div>

          <div className="space-y-6">
            <div className="space-y-3">
              <div className="text-[0.72rem] font-black uppercase tracking-[0.32em] text-[var(--accent)]">
                repoview version 1.3.4
              </div>
              <h1 className="text-4xl font-black uppercase tracking-tight text-[var(--text-main)] md:text-6xl">
                Welcome to repoview
              </h1>
              <p className="max-w-2xl text-base leading-7 text-[var(--text-muted)] md:text-lg">
                Load a repository, inspect files, ask grounded questions, and move into edits without leaving the workspace.
              </p>
            </div>

            <div className="flex flex-wrap gap-3 text-[0.72rem] uppercase tracking-[0.18em] text-[var(--text-muted)]">
              <span className="rounded-full border border-[var(--border)] px-3 py-1">Repo import</span>
              <span className="rounded-full border border-[var(--border)] px-3 py-1">Grounded chat</span>
              <span className="rounded-full border border-[var(--border)] px-3 py-1">Diff review</span>
            </div>

            <div className="flex flex-wrap items-center gap-4 pt-2">
              <button
                type="button"
                onClick={onContinue}
                className="rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-6 py-3 text-sm font-black uppercase tracking-[0.18em] text-black shadow-[0_0_24px_rgba(0,255,157,0.25)] transition hover:brightness-110"
              >
                Open Workspace
              </button>
              <label className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={dontShowAgain}
                  onChange={(event) => onToggleDontShowAgain(event.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                Don&apos;t show again
              </label>
            </div>

            <div className="pt-6 mt-4 border-t border-[var(--border)]/50">
              <div className="flex items-center gap-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-[var(--accent)] mb-4">
                <GitCommit className="w-3.5 h-3.5" /> Recent Updates
              </div>
              {loading ? (
                <div className="text-sm text-[var(--text-muted)] animate-pulse">Fetching latest changes...</div>
              ) : commits.length > 0 ? (
                <div className="space-y-4">
                  {commits.map(c => (
                    <a key={c.sha} href={c.url} target="_blank" rel="noreferrer" className="block group">
                      <div className="text-[0.8rem] font-medium text-[var(--text-main)] group-hover:text-[var(--accent)] transition-colors truncate">{c.message}</div>
                      <div className="text-[0.65rem] text-[var(--text-muted)] flex gap-2 mt-1 flex-wrap">
                        <span className="font-mono">{c.sha}</span>
                        <span>•</span>
                        <span>{c.date}</span>
                        <span>•</span>
                        <span>{c.author}</span>
                      </div>
                      {c.files.length > 0 && (
                        <div className="mt-2 text-[0.6rem] text-[var(--accent)]/50 font-mono italic flex flex-wrap gap-x-3 gap-y-1">
                          {c.files.slice(0, 3).map((f: string) => (
                            <span key={f} className="truncate max-w-[150px]">{f.split('/').pop()}</span>
                          ))}
                          {c.files.length > 3 && <span>+{c.files.length - 3} more</span>}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-[0.8rem] text-[var(--text-muted)]">No recent changes found.</div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function WorkspaceApp() {
  const {
    selectedFile,
    setSelectedFile,
    setViewMode,
    showTerminal,
    setShowTerminal,
  } = useUIState();

  const {
    sessions,
    currentSessionId,
    loadSession,
    files,
    isIndexing,
    indexProgress,
    indexState,
    db,
    uploadedUris,
    deleteSessionById,
    handleFileUpload,
    handleReupload,
    uploadFiles,
    createSessionFromImportedFiles,
    startIndexing,
    resetState
  } = useIndexer();

  const [repoChangedFiles, setRepoChangedFiles] = useState<ChangedRepoFile[] | null>(null);
  const [pendingRepoZip, setPendingRepoZip] = useState<File | null>(null);
  const [githubRepoPath, setGithubRepoPath] = useState(() => localStorage.getItem('repoview.githubRepoPath') || '');
  const [githubInspection, setGithubInspection] = useState<GitHubInspection | null>(null);
  const [githubError, setGithubError] = useState<string | null>(null);
  const [isGitHubLoading, setIsGitHubLoading] = useState(false);

  const importLocalRepoIntoSession = async (repoPathRaw: string) => {
    const repoPath = repoPathRaw.trim();
    if (!repoPath) return;

    const response = await fetch('/api/import-local-repo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repoPath }),
    });

    if (!response.ok) {
      let msg = 'Failed to import local repository';
      try {
        const errJson = await response.json();
        msg = errJson.error || msg;
      } catch {
        const text = await response.text();
        msg = text || msg;
      }
      throw new Error(msg);
    }

    const blob = await response.blob();
    const zip = await JSZip.loadAsync(blob);

    const filePromises: Promise<{ path: string; name: string; type: string; blob: Blob }>[] = [];
    zip.forEach((relativePath, zipEntry) => {
      if (zipEntry.dir) return;
      filePromises.push(
        zipEntry.async('blob').then(b => ({
          path: relativePath,
          name: relativePath.split('/').pop() || '',
          type: b.type || getMimeType(relativePath.split('/').pop() || ''),
          blob: b,
        }))
      );
    });

    const filesToUpload = await Promise.all(filePromises);

    if (!filesToUpload.length) {
      throw new Error('No importable files were found in that repository');
    }

    const sessionName = repoPath.split(/[\\/]/).filter(Boolean).pop() || `Import-${Date.now()}`;
    await createSessionFromImportedFiles(sessionName, filesToUpload);
  };

  const inspectGitHubRepo = async (repoPathOverride?: string) => {
    const repoPath = (repoPathOverride ?? githubRepoPath).trim();
    if (!repoPath) {
      setGithubInspection(null);
      setGithubError(null);
      return;
    }

    setIsGitHubLoading(true);
    setGithubError(null);
    try {
      const response = await fetch('/api/github/inspect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath }),
      });
      const data = await readApiResult<GitHubInspection>(response, 'Failed to inspect repository');
      setGithubInspection(data);
      localStorage.setItem('repoview.githubRepoPath', repoPath);
    } catch (error: any) {
      setGithubInspection(null);
      setGithubError(error?.message || 'Failed to inspect repository');
    } finally {
      setIsGitHubLoading(false);
    }
  };

  useEffect(() => {
    if (githubRepoPath.trim()) {
      inspectGitHubRepo(githubRepoPath);
    }
  }, []);

  const handleSelectFile = async (f: FileNode | null) => {
    if (!f || !currentSessionId) {
      setSelectedFile(null);
      return;
    }
    
    // Check if it's a known binary type
    const mime = getMimeType(f.path);
    const isBinary = !mime.startsWith('text/') && mime !== 'application/json' && !f.path.endsWith('.md') && !f.path.endsWith('.ts') && !f.path.endsWith('.tsx') && !f.path.endsWith('.js') && !f.path.endsWith('.css');
    
    if (isBinary) {
      const blob = await getSessionFileBlob(currentSessionId, f.path);
      setSelectedFile({ ...f, blob: blob || undefined, content: '' });
    } else {
      const content = await getSessionFileContent(currentSessionId, f.path);
      setSelectedFile({ ...f, content: content || "" });
    }
  };

  const {
    setCurrentSessionId,
    setSessions
  } = useIndexerState();

  const handleServerUploadCompare = async (file: File | Blob, filename: string) => {
    if (!file) return;
    try {
      let targetSessionId = currentSessionId;
      if (!targetSessionId) {
        // First upload! Create a new session.
        const name = filename.replace(/\.zip$/i, '') || "Upload-" + Date.now();
        const session = await createSession(name);
        setCurrentSessionId(session.id);
        setSessions(prev => [...prev, session]);
        targetSessionId = session.id;
      }

      const metas = await getSessionFileMetas(targetSessionId);
      const clientHashes: Record<string,string> = {};
      for (const m of metas) if (m.hash) clientHashes[m.path] = m.hash;

      const form = new FormData();
      form.append('file', file, filename);
      form.append('clientHashes', JSON.stringify(clientHashes));

      const resp = await fetch('/api/repo/compare', { method: 'POST', body: form });
  const data = await readApiResult<{ changedFiles?: { path: string; size: number }[] }>(resp, 'Compare failed');
      
      // If it's a brand new upload, everything is technically "changed" from the empty state
      if (!data.changedFiles || data.changedFiles.length === 0) {
        alert('No files detected in upload.');
        setPendingRepoZip(null);
        setRepoChangedFiles(null);
        return;
      }

      setPendingRepoZip(file instanceof File ? file : new File([file], filename));
      setRepoChangedFiles(data.changedFiles.map((changedFile: { path: string; size: number }) => ({
        path: changedFile.path,
        size: changedFile.size,
      })));
    } catch (e: any) {
      alert('Upload inspection failed: ' + e.message);
    }
  };

  const onUploadRepoZip = async (file: File | null) => {
    if (file) await handleServerUploadCompare(file, file.name);
  };

  const onUploadRepoFolder = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const zip = new JSZip();
      let folderName = '';
      let resolvedFolderName = false;

      // First pass: collect files and try to resolve a folder name from webkitRelativePath
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (isIgnoredUpload(file)) continue;
        const relativePath = file.webkitRelativePath || file.name;
        if (!resolvedFolderName && file.webkitRelativePath) {
          const parts = file.webkitRelativePath.split('/');
          if (parts[0]) {
            folderName = parts[0];
            resolvedFolderName = true;
          }
        }
        if (relativePath) zip.file(relativePath, file);
      }

      // Fallback: derive from first non-ignored file name
      if (!resolvedFolderName) {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          if (isIgnoredUpload(f)) continue;
          if (f.webkitRelativePath) {
            const parts = f.webkitRelativePath.split('/');
            if (parts[0]) {
              folderName = parts[0];
              resolvedFolderName = true;
              break;
            }
          }
          // use file name without extension
          const nameOnly = f.name.replace(/\.[^/.]+$/, '');
          if (nameOnly) {
            folderName = nameOnly;
            resolvedFolderName = true;
            break;
          }
        }
      }

      if (!folderName) folderName = `Upload-${Date.now()}`;

      const blob = await zip.generateAsync({ type: 'blob' });
      await handleServerUploadCompare(blob, `${folderName}.zip`);
    } catch (e: any) {
      alert('Folder sync failed: ' + e.message);
    }
  };

  const {
    messages,
    query,
    setQuery,
    appendQuery,
    isThinking,
    selectedModel,
    setSelectedModel,
    temperaturePreset,
    setTemperaturePreset,
    thinkingLevel,
    setThinkingLevel,
    draftQueryTokens,
    lastRequestTokens,
    useGrounding,
    setUseGrounding,
    handleSend,
    startFullReview,
    clearMessages,
    deleteMessage,
    addMessage
  } = useAgent(db, uploadedUris, currentSessionId);

  const handleContextualize = (text: string) => {
    appendQuery(text);
  };

  const handleStartIndexing = () => {
    startIndexing(
      (newUris, newDb) => {
        addMessage({ role: 'ai', text: `**Indexing Complete.**\n- **${newUris.length}** files uploaded to Files API.\n- **${newDb.length}** RAG chunks indexed.` });
      },
      (e) => {
        addMessage({ role: 'ai', text: `**Indexing Failed:** ${e.message}` });
      }
    );
  };

  return (
    <div className="flex h-screen w-full jungle-grid overflow-hidden">
      <Sidebar
        files={files}
        selectedFile={selectedFile}
        onSelectFile={handleSelectFile}
        isIndexing={isIndexing}
        indexProgress={indexProgress}
        onFileUpload={handleFileUpload}
        onReupload={(e: React.ChangeEvent<HTMLInputElement>) => { if (currentSessionId) handleReupload(currentSessionId, e); }}
        onUploadRepoZip={onUploadRepoZip}
        onUploadRepoFolder={onUploadRepoFolder}
        onStartIndexing={handleStartIndexing}
        onStartFullReview={startFullReview}
        onNewSession={resetState}
        isThinking={isThinking}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onLoadSession={loadSession}
        onDeleteSession={deleteSessionById}
        onToggleTerminal={() => setShowTerminal(!showTerminal)}
        terminalActive={showTerminal}
        githubRepoPath={githubRepoPath}
        onGitHubRepoPathChange={setGithubRepoPath}
        onInspectGitHubRepo={inspectGitHubRepo}
        onImportLocalRepo={importLocalRepoIntoSession}
        githubInspection={githubInspection}
        githubError={githubError}
        isGitHubLoading={isGitHubLoading}
      />
      <FileViewer 
        selectedFile={selectedFile} 
        onContextualize={handleContextualize} 
      />
      <ChatInterface
        messages={messages}
        query={query}
        setQuery={setQuery}
        isThinking={isThinking}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        temperaturePreset={temperaturePreset}
        setTemperaturePreset={setTemperaturePreset}
        thinkingLevel={thinkingLevel}
        setThinkingLevel={setThinkingLevel}
        draftQueryTokens={draftQueryTokens}
        lastRequestTokens={lastRequestTokens}
        indexState={indexState}
        useGrounding={useGrounding}
        setUseGrounding={setUseGrounding}
        onSend={(attachments) => handleSend(setViewMode, attachments)}
        onDeleteMessage={deleteMessage}
        onClear={clearMessages}
        currentSessionId={currentSessionId}
      />

      {showTerminal && <Terminal onClose={() => setShowTerminal(false)} />}
      {repoChangedFiles && repoChangedFiles.length > 0 && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-black/95 border border-[var(--border)] rounded-md p-4 w-96">
            <div className="flex items-center justify-between mb-2">
              <div className="font-bold">Changed files</div>
              <button onClick={() => setRepoChangedFiles(null)} className="text-sm opacity-60">Close</button>
            </div>
            <div className="h-48 overflow-y-auto text-sm mb-3 border-t border-b border-[var(--border)] py-2">
              {repoChangedFiles.map((f) => (
                <div key={f.path} className="px-2 py-1 truncate">{f.path} <span className="text-xs opacity-60">({f.size} bytes)</span></div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button className="px-3 py-1 rounded border" onClick={() => { setRepoChangedFiles(null); setPendingRepoZip(null); }}>Cancel</button>
              <button className="px-3 py-1 rounded bg-[var(--accent)]" onClick={async () => {
                if (!currentSessionId || !pendingRepoZip) return;
                try {
                  const metas = await getSessionFileMetas(currentSessionId);
                  const clientHashes: Record<string,string> = {};
                  for (const m of metas) if (m.hash) clientHashes[m.path] = m.hash;

                  const form = new FormData();
                  form.append('file', pendingRepoZip, pendingRepoZip.name);
                  form.append('clientHashes', JSON.stringify(clientHashes));

                  const resp = await fetch('/api/repo/upload', { method: 'POST', body: form });
                  const data = await readApiResult<{ sessionId?: string; changedFiles?: { path: string; data: string }[] }>(resp, 'Upload failed');

                  if (data.sessionId) {
                    await updateSessionServerUploadId(currentSessionId, data.sessionId);
                  }

                  const toUpload: { path: string; name: string; type: string; blob: Blob }[] = [];
                  for (const f of data.changedFiles || []) {
                    const bstr = atob(f.data);
                    const u8 = new Uint8Array(bstr.length);
                    for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i);
                    const mimeType = getMimeType(f.path);
                    const blob = new Blob([u8], { type: mimeType });
                    const name = f.path.split('/').pop() || f.path;
                    toUpload.push({ path: f.path, name, type: mimeType, blob });
                  }
                  await uploadFiles(currentSessionId, toUpload);
                  // start indexing after upload
                  startIndexing(
                    (newUris, newDb) => {
                      alert(`Reindex complete. ${newDb.length} chunks indexed.`);
                      setRepoChangedFiles(null);
                      setPendingRepoZip(null);
                    },
                    (e) => {
                      alert('Reindex failed: ' + e.message);
                    }
                  );
                } catch (e: any) {
                  alert('Upload failed: ' + e.message);
                }
              }}>Reindex changed</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [showWelcome, setShowWelcome] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.localStorage.getItem(WELCOME_DISMISSED_KEY) !== '1';
  });
  const [dontShowAgain, setDontShowAgain] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(WELCOME_DISMISSED_KEY) === '1';
  });

  const handleToggleDontShowAgain = (value: boolean) => {
    setDontShowAgain(value);
    if (value) {
      window.localStorage.setItem(WELCOME_DISMISSED_KEY, '1');
      return;
    }
    window.localStorage.removeItem(WELCOME_DISMISSED_KEY);
  };

  if (showWelcome) {
    return (
      <WelcomeScreen
        onContinue={() => setShowWelcome(false)}
        dontShowAgain={dontShowAgain}
        onToggleDontShowAgain={handleToggleDontShowAgain}
      />
    );
  }

  return <WorkspaceApp />;
}
