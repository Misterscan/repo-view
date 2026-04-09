import { useEffect, useState } from 'react';
import JSZip from 'jszip';
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

function isIgnoredUpload(f: File) {
  const path = f.webkitRelativePath || f.name;
  const lowerName = f.name.toLowerCase();
  if (IGNORED_EXTS.some(ext => lowerName.endsWith(ext))) return true;
  const pathParts = path.split('/');
  if (pathParts.some(part => IGNORED_DIRS.includes(part))) return true;
  return false;
}

export default function App() {
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
    startIndexing
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
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (isIgnoredUpload(file)) continue;
        const relativePath = file.webkitRelativePath || file.name;
        // Keep the full relative path so it perfectly maps to the IndexDB hashes!
        if (relativePath) zip.file(relativePath, file);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      await handleServerUploadCompare(blob, 'folder-sync.zip');
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
        draftQueryTokens={draftQueryTokens}
        lastRequestTokens={lastRequestTokens}
        indexState={indexState}
        useGrounding={useGrounding}
        setUseGrounding={setUseGrounding}
        onSend={() => handleSend(setViewMode)}
        onDeleteMessage={deleteMessage}
        onClear={clearMessages}
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
