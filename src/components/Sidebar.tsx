import { useRef, useState } from 'react';
import { Bot, Code2, FolderSync, Loader2, Search, History, Database, Upload, GitBranch, RefreshCw, AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { FileNode, GitChangedFile, GitHubInspection, GitHubRepoSearchResult } from '../types';
import { FileTreeItem } from './FileTree';
import { RepoSession } from '../lib/db';
import { readApiResult } from '../lib/api';
import { cn } from '../lib/utils';

// Assume tree builder
function buildTree(files: FileNode[]) {
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
  onDeleteSession: (id: string) => Promise<void>;
  onReupload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadRepoZip: (file: File | null) => void;
  onUploadRepoFolder: (files: FileList | null) => void;
  onToggleTerminal: () => void;
  terminalActive: boolean;
  githubRepoPath: string;
  onGitHubRepoPathChange: (value: string) => void;
  onInspectGitHubRepo: (repoPathOverride?: string) => Promise<void>;
  onImportLocalRepo: (repoPath: string) => Promise<void>;
  githubInspection: GitHubInspection | null;
  githubError: string | null;
  isGitHubLoading: boolean;
}

function workflowTone(conclusion: string | null, status: string) {
  if (status !== 'completed') return 'text-yellow-300 border-yellow-500/30';
  if (conclusion === 'success') return 'text-[var(--ok)] border-[var(--ok)]/30';
  if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'cancelled') return 'text-[var(--bad)] border-[var(--bad)]/30';
  return 'text-[var(--text-muted)] border-[var(--border)]';
}

export function Sidebar({
  files, 
  selectedFile, 
  onSelectFile, 
  isIndexing, 
  indexProgress, 
  onFileUpload, 
  onReupload,
  onUploadRepoZip,
  onUploadRepoFolder,
  onStartIndexing, 
  onStartFullReview, 
  isThinking, 
  sessions, 
  currentSessionId, 
  onLoadSession,
  onDeleteSession,
  onToggleTerminal,
  terminalActive,
  githubRepoPath,
  onGitHubRepoPathChange,
  onInspectGitHubRepo,
  onImportLocalRepo,
  githubInspection,
  githubError,
  isGitHubLoading,
}: SidebarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);
  const syncDirInputRef = useRef<HTMLInputElement>(null);
  const reuploadRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [checkoutRef, setCheckoutRef] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [gitActionBusy, setGitActionBusy] = useState<string | null>(null);
  const [gitActionResult, setGitActionResult] = useState<string | null>(null);
  const [gitActionError, setGitActionError] = useState<string | null>(null);
  const [selectedDiffFile, setSelectedDiffFile] = useState<GitChangedFile | null>(null);
  const [diffBusy, setDiffBusy] = useState(false);
  const [diffText, setDiffText] = useState('');
  const [diffError, setDiffError] = useState<string | null>(null);
  const [repoSearchResults, setRepoSearchResults] = useState<GitHubRepoSearchResult[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState('');
  const [showRepoDropdown, setShowRepoDropdown] = useState(false);
  const [repoSearchBusy, setRepoSearchBusy] = useState(false);
  const [repoSearchError, setRepoSearchError] = useState<string | null>(null);
  const [cloneDestination, setCloneDestination] = useState(() => localStorage.getItem('repoview.githubCloneDestination') || 'C:\\Users\\owner\\Documents');
  const [cloneBusyRepoId, setCloneBusyRepoId] = useState<number | null>(null);
  const [cloneError, setCloneError] = useState<string | null>(null);
  const [cloneResult, setCloneResult] = useState<string | null>(null);
  const [cloneLogs, setCloneLogs] = useState<string[]>([]);
  const [localImportBusy, setLocalImportBusy] = useState(false);
  const [isGitHubPanelOpen, setIsGitHubPanelOpen] = useState(true);

  const tree = buildTree(files);

  const runGitAction = async (action: 'commit' | 'pull' | 'push' | 'checkout' | 'create-branch', payload?: { message?: string; ref?: string; branchName?: string }) => {
    if (!githubInspection?.repoPath) return;
    setGitActionBusy(action);
    setGitActionResult(null);
    setGitActionError(null);
    try {
      const response = await fetch('/api/github/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath: githubInspection.repoPath, action, ...payload }),
      });
      const data = await readApiResult<{ output?: string }>(response, 'Git action failed');
      setGitActionResult(data.output || `${action} complete`);
      if (action === 'commit') setCommitMessage('');
      if (action === 'create-branch') setNewBranchName('');
      await onInspectGitHubRepo(githubInspection.repoPath);
    } catch (error: any) {
      setGitActionError(error?.message || 'Git action failed');
    } finally {
      setGitActionBusy(null);
    }
  };

  const loadDiff = async (file: GitChangedFile) => {
    if (!githubInspection?.repoPath) return;
    setSelectedDiffFile(file);
    setDiffBusy(true);
    setDiffText('');
    setDiffError(null);
    try {
      const response = await fetch('/api/github/diff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoPath: githubInspection.repoPath, filePath: file.path, code: file.code }),
      });
      const data = await readApiResult<{ diff?: string }>(response, 'Failed to load diff');
      setDiffText(data.diff || 'No textual diff available.');
    } catch (error: any) {
      setDiffError(error?.message || 'Failed to load diff');
    } finally {
      setDiffBusy(false);
    }
  };

  const searchRepos = async () => {
    setRepoSearchBusy(true);
    setRepoSearchError(null);
    setCloneError(null);
    try {
      const response = await fetch('/api/github/search-repos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '' }),
      });
      const data = await readApiResult<{ repos?: GitHubRepoSearchResult[] }>(response, 'Failed to search repositories');
      const repos = data.repos || [];
      setRepoSearchResults(repos);
      setSelectedRepoId((current) => (repos.some((repo) => String(repo.id) === current) ? current : String(repos[0]?.id || '')));
      setShowRepoDropdown(repos.length > 0);
    } catch (error: any) {
      setRepoSearchResults([]);
      setSelectedRepoId('');
      setShowRepoDropdown(false);
      setRepoSearchError(error?.message || 'Failed to search repositories');
    } finally {
      setRepoSearchBusy(false);
    }
  };

  const cloneRepo = async (repo: GitHubRepoSearchResult) => {
    if (!cloneDestination.trim()) {
      setCloneError('Destination folder is required');
      return;
    }
    setCloneBusyRepoId(repo.id);
    setCloneError(null);
    setCloneResult(null);
    setCloneLogs([]);
    try {
      localStorage.setItem('repoview.githubCloneDestination', cloneDestination.trim());
      const response = await fetch('/api/github/clone/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cloneUrl: repo.cloneUrl,
          destinationPath: cloneDestination.trim(),
          repoName: repo.name,
        }),
      });
      const data = await readApiResult<{ jobId: string; clonedPath?: string }>(response, 'Failed to clone repository');

      const jobId = data.jobId as string;
      const fallbackClonedPath = data.clonedPath || `${cloneDestination.trim()}\\${repo.name}`;

      while (true) {
        const statusResponse = await fetch(`/api/github/clone/status/${jobId}`);
        const statusData = await readApiResult<{ logs?: string[]; status?: string; clonedPath?: string; error?: string }>(statusResponse, 'Failed to read clone status');

        setCloneLogs(statusData.logs || []);

        if (statusData.status === 'completed') {
          const clonedPath = statusData.clonedPath || fallbackClonedPath;
          setCloneResult(`Imported to ${clonedPath}`);
          onGitHubRepoPathChange(clonedPath);
          await onImportLocalRepo(clonedPath);
          await onInspectGitHubRepo(clonedPath);
          break;
        }

        if (statusData.status === 'failed') {
          throw new Error(statusData.error || 'Clone failed');
        }

        await new Promise((resolve) => window.setTimeout(resolve, 700));
      }
    } catch (error: any) {
      setCloneError(error?.message || 'Failed to clone repository');
    } finally {
      setCloneBusyRepoId(null);
    }
  };

  const importConnectedRepo = async () => {
    const repoPath = githubInspection?.repoPath || githubRepoPath.trim();
    if (!repoPath) return;
    setLocalImportBusy(true);
    setCloneError(null);
    setCloneResult(null);
    try {
      await onImportLocalRepo(repoPath);
      setCloneResult(`Loaded ${repoPath} into the current workspace session.`);
    } catch (error: any) {
      setCloneError(error?.message || 'Failed to load repository files');
    } finally {
      setLocalImportBusy(false);
    }
  };

  const selectedRepo = repoSearchResults.find((repo) => String(repo.id) === selectedRepoId) || null;

  const chooseRepo = (repo: GitHubRepoSearchResult) => {
    setSelectedRepoId(String(repo.id));
    setShowRepoDropdown(false);
  };

  const openRepoDropdown = async () => {
    if (!repoSearchResults.length) {
      await searchRepos();
      return;
    }
    setShowRepoDropdown((current) => !current);
  };

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

        <div className="flex flex-col gap-3">
          {/* Unified Workspace Action */}
          <div className="flex flex-col gap-2">
            <button 
              onClick={() => syncDirInputRef.current?.click()} 
              className="w-full py-2.5 bg-[var(--accent)] text-black rounded-md text-[0.7rem] uppercase font-black tracking-wider shadow-[0_0_10px_var(--accent)] hover:opacity-90 hover:scale-[1.02] transition-all flex items-center justify-center gap-2"
            >
              <FolderSync className="w-4 h-4" /> Open Folder
            </button>
            <div className="flex gap-2">
              <button 
                onClick={() => zipInputRef.current?.click()} 
                className="flex-1 py-1.5 bg-[#09211b] border border-[var(--border)] rounded-md text-[var(--text-muted)] text-[0.6rem] uppercase font-bold hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors flex items-center justify-center gap-1.5"
              >
                <History className="w-3 h-3" /> Open Zip
              </button>
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="flex-1 py-1.5 bg-[#09211b] border border-[var(--border)] rounded-md text-[var(--text-muted)] text-[0.6rem] uppercase font-bold hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors flex items-center justify-center gap-1.5"
              >
                <Upload className="w-3 h-3" /> Upload Files
              </button>
            </div>
          </div>
          {/* @ts-expect-error non-standard directory input attributes */}
          <input type="file" multiple webkitdirectory="true" directory="true" className="hidden" ref={dirInputRef} onChange={onFileUpload} />
          {/* Standard files input */}
          <input type="file" multiple className="hidden" ref={fileInputRef} onChange={onFileUpload} />
          {/* @ts-expect-error non-standard directory input attributes */}
          <input type="file" multiple webkitdirectory="true" directory="true" className="hidden" ref={syncDirInputRef} onChange={(e) => onUploadRepoFolder(e.target.files)} />
          <input type="file" multiple className="hidden" ref={reuploadRef} onChange={onReupload} />
          <input type="file" accept=".zip" className="hidden" ref={zipInputRef} onChange={(e) => onUploadRepoZip(e.target.files ? e.target.files[0] : null)} />

          <button 
            onClick={onStartIndexing} 
            disabled={isIndexing || files.length === 0} 
            className="action-btn-jungle w-full py-2 flex items-center justify-center gap-2 disabled:opacity-30 text-[0.65rem] font-bold"
          >
            {isIndexing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bot className="w-3 h-3" />}
            {isIndexing ? `INDEXING ${indexProgress}%` : `GENERATE EMBEDDINGS (RAG)`}
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const ok = window.confirm(`Delete session "${s.name}" and its indexed cache?`);
                    if (!ok) return;
                    void onDeleteSession(s.id);
                  }}
                  className="absolute right-2 top-2 rounded border border-transparent p-1 text-[var(--text-muted)] opacity-0 transition group-hover:opacity-100 hover:border-[var(--bad)]/40 hover:text-[var(--bad)]"
                  title="Delete session"
                  aria-label={`Delete session ${s.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
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
            <div className="rounded-lg border border-[var(--border)] bg-black/20 p-3 mb-3 transition-all">
              <div 
                className="flex items-center justify-between cursor-pointer group"
                onClick={() => setIsGitHubPanelOpen(!isGitHubPanelOpen)}
              >
                <div className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.18em] text-[var(--text-muted)] font-black group-hover:text-[var(--text-main)] transition-colors">
                  <GitBranch className="w-3.5 h-3.5 text-[var(--accent)]" />
                  GitHub
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); void onInspectGitHubRepo(); }}
                    disabled={isGitHubLoading || !githubRepoPath.trim()}
                    className="text-[0.55rem] uppercase font-bold text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-30 flex items-center gap-1 mr-2 px-1"
                    title="Refresh GitHub data"
                  >
                    <RefreshCw className={cn('w-3 h-3', isGitHubLoading && 'animate-spin')} />
                  </button>
                  {isGitHubPanelOpen ? <ChevronDown className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-main)] transition-colors" /> : <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-main)] transition-colors" />}
                </div>
              </div>

              {isGitHubPanelOpen && (
                <div className="mt-3 space-y-3">
                  <div className="space-y-2">
                    <div className="text-[0.58rem] uppercase tracking-[0.18em] text-[var(--text-muted)] font-black">Import From GitHub</div>
                <div className="relative">
                  <button
                    onClick={() => { void openRepoDropdown(); }}
                    disabled={repoSearchBusy}
                    className="flex w-full items-center justify-between rounded-md border border-[var(--border)] bg-[#071612] px-3 py-2 text-left text-[0.7rem] text-[var(--text-main)] outline-none hover:border-[var(--accent)] disabled:opacity-40"
                  >
                    <span className="truncate">
                      {selectedRepo ? selectedRepo.fullName : repoSearchBusy ? 'Loading repositories...' : 'Select a GitHub repository'}
                    </span>
                    <span className="ml-3 text-[var(--text-muted)]">{showRepoDropdown ? '▲' : '▼'}</span>
                  </button>
                  <div className="mt-2 flex justify-end">
                  <button
                    onClick={() => { void searchRepos(); }}
                    disabled={repoSearchBusy}
                    className="rounded-md border border-[var(--accent)]/30 px-3 py-2 text-[0.62rem] uppercase font-black tracking-wider text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-30"
                  >
                    {repoSearchBusy ? '...' : 'Refresh List'}
                  </button>
                  </div>
                  {showRepoDropdown && repoSearchResults.length > 0 && (
                    <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 max-h-56 overflow-y-auto rounded-md border border-[var(--border)] bg-[#06110d] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
                      {repoSearchResults.map((repo) => {
                        const isSelected = String(repo.id) === selectedRepoId;
                        return (
                          <button
                            key={repo.id}
                            onClick={() => chooseRepo(repo)}
                            className={cn(
                              'w-full rounded px-2 py-2 text-left text-[0.62rem] transition-colors',
                              isSelected ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--text-main)] hover:bg-white/5'
                            )}
                          >
                            <div className="font-semibold truncate">{repo.fullName}</div>
                            <div className="mt-1 flex items-center gap-2 text-[var(--text-muted)]">
                              <span>{repo.private ? 'Private' : 'Public'}</span>
                              <span>{repo.defaultBranch}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {selectedRepo && (
                  <div className="rounded border border-[var(--border)] px-2 py-2 text-[0.62rem]">
                    <div className="font-semibold text-[var(--text-main)] truncate">{selectedRepo.fullName}</div>
                    <div className="mt-1 text-[var(--text-muted)] truncate">{selectedRepo.description || 'No description'}</div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-[var(--text-muted)]">
                      <span>{selectedRepo.private ? 'Private' : 'Public'}</span>
                      <span>{selectedRepo.defaultBranch}</span>
                    </div>
                  </div>
                )}
                <input
                  type="text"
                  value={cloneDestination}
                  onChange={(e) => setCloneDestination(e.target.value)}
                  placeholder="Clone destination folder"
                  className="w-full rounded-md border border-[var(--border)] bg-[#071612] px-3 py-2 text-[0.7rem] text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                />
                {repoSearchError && <div className="rounded border border-[var(--bad)]/30 bg-[var(--bad)]/10 px-2 py-2 text-[0.62rem] text-[var(--bad)]">{repoSearchError}</div>}
                {cloneError && <div className="rounded border border-[var(--bad)]/30 bg-[var(--bad)]/10 px-2 py-2 text-[0.62rem] text-[var(--bad)]">{cloneError}</div>}
                {cloneResult && <div className="rounded border border-[var(--ok)]/30 bg-[var(--ok)]/10 px-2 py-2 text-[0.62rem] text-[var(--ok)]">{cloneResult}</div>}
                {cloneLogs.length > 0 && (
                  <div className="rounded border border-[var(--border)] bg-[#04100c]">
                    <div className="px-2 py-2 border-b border-[var(--border)] text-[0.58rem] uppercase font-black tracking-widest text-[var(--text-muted)]">
                      Clone Progress
                    </div>
                    <div className="max-h-40 overflow-auto px-2 py-2 space-y-1 font-mono text-[0.58rem] text-[var(--text-main)]">
                      {cloneLogs.map((line, index) => (
                        <div key={`${index}-${line}`}>{line}</div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  {selectedRepo && (
                    <a href={selectedRepo.htmlUrl} target="_blank" rel="noreferrer" className="flex-1 rounded-md border border-[var(--border)] px-3 py-2 text-center text-[0.6rem] uppercase font-black tracking-wider text-[var(--text-main)] hover:border-[var(--accent)] hover:text-[var(--accent)]">
                      Open Repo
                    </a>
                  )}
                  <button
                    onClick={() => { if (selectedRepo) { void cloneRepo(selectedRepo); } }}
                    disabled={!selectedRepo || cloneBusyRepoId === selectedRepo.id}
                    className="flex-1 rounded-md border border-[var(--accent)]/30 px-3 py-2 text-[0.6rem] uppercase font-black tracking-wider text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-30"
                  >
                    {selectedRepo && cloneBusyRepoId === selectedRepo.id ? 'Importing...' : 'Clone Selected Repo'}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-[0.58rem] uppercase tracking-[0.18em] text-[var(--text-muted)] font-black">Connected Local Repo</div>
                <input
                  type="text"
                  value={githubRepoPath}
                  onChange={(e) => onGitHubRepoPathChange(e.target.value)}
                  placeholder="C:\\Users\\owner\\Documents\\my-repo"
                  className="w-full rounded-md border border-[var(--border)] bg-[#071612] px-3 py-2 text-[0.7rem] text-[var(--text-main)] outline-none focus:border-[var(--accent)]"
                />
                <button
                  onClick={() => { void onInspectGitHubRepo(); }}
                  disabled={isGitHubLoading || !githubRepoPath.trim()}
                  className="w-full py-2 rounded-md border border-[var(--accent)]/30 text-[0.65rem] uppercase font-black tracking-wider text-[var(--accent)] hover:bg-[var(--accent)]/10 disabled:opacity-30"
                >
                  {isGitHubLoading ? 'Connecting...' : 'Connect Git Repository'}
                </button>
                <button
                  onClick={() => { void importConnectedRepo(); }}
                  disabled={localImportBusy || !(githubInspection?.repoPath || githubRepoPath.trim())}
                  className="w-full py-2 rounded-md border border-[var(--border)] text-[0.65rem] uppercase font-black tracking-wider text-[var(--text-main)] hover:border-[var(--accent)] disabled:opacity-30"
                >
                  {localImportBusy ? 'Loading Files...' : 'Load Repo Files Into Index'}
                </button>
              </div>

              {githubError && (
                <div className="rounded-md border border-[var(--bad)]/30 bg-[var(--bad)]/10 px-3 py-2 text-[0.65rem] text-[var(--bad)] flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
                  <span>{githubError}</span>
                </div>
              )}

              {githubInspection && (
                <div className="space-y-3 text-[0.68rem]">
                  <div className="rounded-md border border-[var(--border)] bg-[#06130f] p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-[var(--text-main)] font-bold min-w-0">
                        <GitBranch className="w-3.5 h-3.5 text-[var(--accent)] flex-shrink-0" />
                        <span className="truncate">{githubInspection.status.branch}</span>
                      </div>
                      {githubInspection.github ? (
                        <a href={githubInspection.github.htmlUrl} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline truncate">
                          {githubInspection.github.owner}/{githubInspection.github.repo}
                        </a>
                      ) : (
                        <span className="text-[var(--text-muted)]">No GitHub remote</span>
                      )}
                    </div>
                    <div className="text-[var(--text-muted)] break-all">{githubInspection.repoPath}</div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded border border-[var(--border)] py-2">
                        <div className="text-[0.55rem] uppercase text-[var(--text-muted)]">Changes</div>
                        <div className="font-black text-[var(--text-main)]">{githubInspection.status.changedFiles.length}</div>
                      </div>
                      <div className="rounded border border-[var(--border)] py-2">
                        <div className="text-[0.55rem] uppercase text-[var(--text-muted)]">Ahead</div>
                        <div className="font-black text-[var(--text-main)]">{githubInspection.status.ahead}</div>
                      </div>
                      <div className="rounded border border-[var(--border)] py-2">
                        <div className="text-[0.55rem] uppercase text-[var(--text-muted)]">Behind</div>
                        <div className="font-black text-[var(--text-main)]">{githubInspection.status.behind}</div>
                      </div>
                    </div>
                    {githubInspection.lastCommit && (
                      <div className="rounded border border-[var(--border)] px-2 py-2 text-[var(--text-muted)]">
                        <div className="flex items-center gap-2 text-[var(--text-main)]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                          <span className="font-semibold truncate">{githubInspection.lastCommit.subject}</span>
                        </div>
                        <div className="mt-1">{githubInspection.lastCommit.shortHash} by {githubInspection.lastCommit.author}</div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-[0.58rem] uppercase tracking-[0.18em] text-[var(--text-muted)] font-black">Git Actions</div>
                    <div className="grid grid-cols-2 gap-2 text-[0.62rem]">
                      <button onClick={() => { void runGitAction('pull'); }} disabled={!!gitActionBusy} className="rounded border border-[var(--border)] px-2 py-2 hover:border-[var(--accent)] disabled:opacity-30">Pull</button>
                      <button onClick={() => { void runGitAction('push'); }} disabled={!!gitActionBusy} className="rounded border border-[var(--border)] px-2 py-2 hover:border-[var(--accent)] disabled:opacity-30">Push</button>
                    </div>
                    <div className="flex gap-2">
                      <input value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} placeholder="Commit message" className="flex-1 rounded border border-[var(--border)] bg-[#071612] px-2 py-2 text-[0.65rem] text-[var(--text-main)] outline-none focus:border-[var(--accent)]" />
                      <button onClick={() => { void runGitAction('commit', { message: commitMessage }); }} disabled={!!gitActionBusy || !commitMessage.trim()} className="rounded border border-[var(--accent)]/40 px-3 py-2 text-[0.62rem] uppercase font-bold text-[var(--accent)] disabled:opacity-30">Commit</button>
                    </div>
                    <div className="flex gap-2">
                      <select value={selectedBranch} onChange={(e) => setSelectedBranch(e.target.value)} className="flex-1 rounded border border-[var(--border)] bg-[#071612] px-2 py-2 text-[0.65rem] text-[var(--text-main)] outline-none focus:border-[var(--accent)]">
                        <option value="">Switch branch...</option>
                        {githubInspection.branches.map((branch) => (
                          <option key={branch.name} value={branch.name}>{branch.current ? `* ${branch.name}` : branch.name}</option>
                        ))}
                      </select>
                      <button onClick={() => { void runGitAction('checkout', { ref: selectedBranch }); }} disabled={!!gitActionBusy || !selectedBranch} className="rounded border border-[var(--border)] px-3 py-2 text-[0.62rem] uppercase font-bold disabled:opacity-30">Switch</button>
                    </div>
                    <div className="flex gap-2">
                      <input value={checkoutRef} onChange={(e) => setCheckoutRef(e.target.value)} placeholder="Checkout ref / branch / sha" className="flex-1 rounded border border-[var(--border)] bg-[#071612] px-2 py-2 text-[0.65rem] text-[var(--text-main)] outline-none focus:border-[var(--accent)]" />
                      <button onClick={() => { void runGitAction('checkout', { ref: checkoutRef }); }} disabled={!!gitActionBusy || !checkoutRef.trim()} className="rounded border border-[var(--border)] px-3 py-2 text-[0.62rem] uppercase font-bold disabled:opacity-30">Checkout</button>
                    </div>
                    <div className="flex gap-2">
                      <input value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} placeholder="Create and switch to new branch" className="flex-1 rounded border border-[var(--border)] bg-[#071612] px-2 py-2 text-[0.65rem] text-[var(--text-main)] outline-none focus:border-[var(--accent)]" />
                      <button onClick={() => { void runGitAction('create-branch', { branchName: newBranchName }); }} disabled={!!gitActionBusy || !newBranchName.trim()} className="rounded border border-[var(--border)] px-3 py-2 text-[0.62rem] uppercase font-bold disabled:opacity-30">Create</button>
                    </div>
                    {gitActionResult && <div className="rounded border border-[var(--ok)]/30 bg-[var(--ok)]/10 px-2 py-2 text-[0.62rem] text-[var(--ok)] whitespace-pre-wrap">{gitActionResult}</div>}
                    {gitActionError && <div className="rounded border border-[var(--bad)]/30 bg-[var(--bad)]/10 px-2 py-2 text-[0.62rem] text-[var(--bad)] whitespace-pre-wrap">{gitActionError}</div>}
                  </div>

                  <div className="space-y-2">
                    <div className="text-[0.58rem] uppercase tracking-[0.18em] text-[var(--text-muted)] font-black">Changed Files</div>
                    <div className="grid grid-cols-2 gap-2 text-[0.62rem]">
                      <div className="rounded border border-[var(--border)] px-2 py-2">Modified: <span className="text-[var(--text-main)] font-bold">{githubInspection.status.counts.modified}</span></div>
                      <div className="rounded border border-[var(--border)] px-2 py-2">Added: <span className="text-[var(--text-main)] font-bold">{githubInspection.status.counts.added}</span></div>
                      <div className="rounded border border-[var(--border)] px-2 py-2">Deleted: <span className="text-[var(--text-main)] font-bold">{githubInspection.status.counts.deleted}</span></div>
                      <div className="rounded border border-[var(--border)] px-2 py-2">Untracked: <span className="text-[var(--text-main)] font-bold">{githubInspection.status.counts.untracked}</span></div>
                    </div>
                    {githubInspection.status.changedFiles.length > 0 && (
                      <div className="max-h-28 overflow-y-auto rounded border border-[var(--border)] bg-[#06110d] px-2 py-2 space-y-1">
                        {githubInspection.status.changedFiles.slice(0, 12).map((file) => (
                          <button key={`${file.code}:${file.path}`} onClick={() => { void loadDiff(file); }} className="w-full flex items-center gap-2 text-[0.62rem] text-left hover:text-[var(--accent)]">
                            <span className="font-mono text-[var(--accent)]">{file.code}</span>
                            <span className="truncate text-[var(--text-main)]">{file.path}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedDiffFile && (
                      <div className="rounded border border-[var(--border)] bg-[#04100c]">
                        <div className="flex items-center justify-between px-2 py-2 border-b border-[var(--border)] text-[0.62rem]">
                          <span className="truncate text-[var(--text-main)]">{selectedDiffFile.path}</span>
                          <button onClick={() => { setSelectedDiffFile(null); setDiffText(''); setDiffError(null); }} className="text-[var(--text-muted)] hover:text-[var(--accent)]">Close</button>
                        </div>
                        {diffBusy ? (
                          <div className="px-2 py-3 text-[0.62rem] text-[var(--text-muted)]">Loading diff...</div>
                        ) : diffError ? (
                          <div className="px-2 py-3 text-[0.62rem] text-[var(--bad)]">{diffError}</div>
                        ) : (
                          <pre className="max-h-48 overflow-auto px-2 py-3 text-[0.58rem] leading-5 text-[var(--text-main)] whitespace-pre-wrap">{diffText}</pre>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-[0.58rem] uppercase tracking-[0.18em] text-[var(--text-muted)] font-black">Pull Requests</div>
                    {githubInspection.pullRequestsError ? (
                      <div className="rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-2 text-[0.62rem] text-yellow-200">{githubInspection.pullRequestsError}</div>
                    ) : githubInspection.pullRequests.length === 0 ? (
                      <div className="rounded border border-[var(--border)] px-2 py-2 text-[0.62rem] text-[var(--text-muted)]">No open pull requests.</div>
                    ) : (
                      <div className="space-y-2">
                        {githubInspection.pullRequests.map((pr) => (
                          <a key={pr.id} href={pr.htmlUrl} target="_blank" rel="noreferrer" className="block rounded border border-[var(--border)] px-2 py-2 text-[0.62rem] hover:bg-white/5">
                            <div className="font-semibold text-[var(--text-main)] truncate">#{pr.number} {pr.title}</div>
                            <div className="mt-1 text-[var(--text-muted)]">{pr.author}</div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-[0.58rem] uppercase tracking-[0.18em] text-[var(--text-muted)] font-black">Issues</div>
                    {githubInspection.issuesError ? (
                      <div className="rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-2 text-[0.62rem] text-yellow-200">{githubInspection.issuesError}</div>
                    ) : githubInspection.issues.length === 0 ? (
                      <div className="rounded border border-[var(--border)] px-2 py-2 text-[0.62rem] text-[var(--text-muted)]">No open issues.</div>
                    ) : (
                      <div className="space-y-2">
                        {githubInspection.issues.map((issue) => (
                          <a key={issue.id} href={issue.htmlUrl} target="_blank" rel="noreferrer" className="block rounded border border-[var(--border)] px-2 py-2 text-[0.62rem] hover:bg-white/5">
                            <div className="font-semibold text-[var(--text-main)] truncate">#{issue.number} {issue.title}</div>
                            <div className="mt-1 text-[var(--text-muted)]">{issue.author}</div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-[0.58rem] uppercase tracking-[0.18em] text-[var(--text-muted)] font-black">GitHub Actions</div>
                    {githubInspection.actionsError ? (
                      <div className="rounded border border-yellow-500/30 bg-yellow-500/10 px-2 py-2 text-[0.62rem] text-yellow-200">{githubInspection.actionsError}</div>
                    ) : githubInspection.workflowRuns.length === 0 ? (
                      <div className="rounded border border-[var(--border)] px-2 py-2 text-[0.62rem] text-[var(--text-muted)]">No workflow runs found.</div>
                    ) : (
                      <div className="space-y-2">
                        {githubInspection.workflowRuns.map((run) => (
                          <a key={run.id} href={run.htmlUrl} target="_blank" rel="noreferrer" className={cn('block rounded border px-2 py-2 text-[0.62rem] hover:bg-white/5', workflowTone(run.conclusion, run.status))}>
                            <div className="font-semibold text-[var(--text-main)] truncate">{run.name}</div>
                            <div className="mt-1 flex items-center justify-between gap-2 text-[var(--text-muted)]">
                              <span className="truncate">{run.branch || run.event}</span>
                              <span>{run.conclusion || run.status}</span>
                            </div>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
                </div>
              )}
            </div>

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
