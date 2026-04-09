export interface ExtendedFile extends File {
  webkitRelativePath: string;
}

export interface FileNode {
  name: string;
  path: string;
  content?: string;
  blob?: Blob;
  type: string;
  isIndexed?: boolean;
}

export interface Message {
  role: 'user' | 'model' | 'ai';
  text: string;
}

export interface ChunkDoc {
  text: string;
  vec: number[];
  file: string;
  isMedia?: boolean;
  mimeType?: string;
}

export interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: Record<string, TreeNode>;
  file?: FileNode;
}

export interface GitChangedFile {
  code: string;
  path: string;
}

export interface GitStatusSummary {
  branch: string;
  upstream: string | null;
  ahead: number;
  behind: number;
  changedFiles: GitChangedFile[];
  counts: {
    modified: number;
    added: number;
    deleted: number;
    renamed: number;
    untracked: number;
    conflicts: number;
  };
  hasChanges: boolean;
}

export interface GitHubRemoteInfo {
  owner: string;
  repo: string;
  htmlUrl: string;
}

export interface GitWorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  branch: string;
  event: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitBranchInfo {
  name: string;
  current: boolean;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  author: string;
  createdAt: string;
  updatedAt: string;
}

export interface GitHubRepoSearchResult {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  cloneUrl: string;
  defaultBranch: string;
  htmlUrl: string;
  owner: string;
}

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: string;
}

export interface GitHubInspection {
  repoPath: string;
  remoteUrl: string | null;
  github: GitHubRemoteInfo | null;
  status: GitStatusSummary;
  lastCommit: GitCommitInfo | null;
  branches: GitBranchInfo[];
  workflowRuns: GitWorkflowRun[];
  pullRequests: GitHubPullRequest[];
  issues: GitHubIssue[];
  actionsError: string | null;
  pullRequestsError: string | null;
  issuesError: string | null;
}
