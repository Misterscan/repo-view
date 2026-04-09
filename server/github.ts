import { execFile, spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { type Express, type Request, type Response } from 'express';

const execFileAsync = promisify(execFile);

type GitHubRemote = {
  owner: string;
  repo: string;
  htmlUrl: string;
};

type WorkflowRun = {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  htmlUrl: string;
  branch: string;
  event: string;
  createdAt: string;
  updatedAt: string;
};

type PullRequest = {
  id: number;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  author: string;
  createdAt: string;
  updatedAt: string;
};

type Issue = {
  id: number;
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  author: string;
  createdAt: string;
  updatedAt: string;
};

type SearchRepoResult = {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  private: boolean;
  cloneUrl: string;
  defaultBranch: string;
  htmlUrl: string;
  owner: string;
};

type CloneJob = {
  id: string;
  status: 'running' | 'completed' | 'failed';
  logs: string[];
  clonedPath: string | null;
  inspection: Awaited<ReturnType<typeof inspectRepo>> | null;
  error: string | null;
};

const cloneJobs = new Map<string, CloneJob>();

async function runGit(repoPath: string, args: string[]) {
  const { stdout, stderr } = await execFileAsync('git', ['-C', repoPath, ...args], {
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 8,
  });
  return (stdout || stderr).trim();
}

function getToken() {
  return process.env.GITHUB_TOKEN || process.env.REPOVIEW_GITHUB_TOKEN || '';
}

async function getAuthenticatedGitHubLogin() {
  const token = getToken();
  if (!token) return '';

  const data = await fetchGitHubJson('https://api.github.com/user') as { login?: string };
  return data.login || '';
}

async function fetchGitHubJson(url: string) {
  const token = getToken();
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'repoview',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API returned ${response.status}`);
  }
  return response.json();
}

function parseTracking(tracking: string | undefined) {
  let ahead = 0;
  let behind = 0;
  if (!tracking) return { ahead, behind };

  const aheadMatch = tracking.match(/ahead\s+(\d+)/i);
  const behindMatch = tracking.match(/behind\s+(\d+)/i);
  if (aheadMatch) ahead = Number(aheadMatch[1]);
  if (behindMatch) behind = Number(behindMatch[1]);
  return { ahead, behind };
}

function parseGitStatus(raw: string) {
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const branchLine = lines[0] || '';
  const branchMatch = branchLine.match(/^##\s+([^.\s]+|HEAD)(?:\.\.\.([^\s]+))?(?:\s+\[(.+)\])?/);
  const branch = branchMatch?.[1] === 'HEAD' ? 'detached' : (branchMatch?.[1] || 'unknown');
  const upstream = branchMatch?.[2] || null;
  const { ahead, behind } = parseTracking(branchMatch?.[3]);

  const counts = {
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
    conflicts: 0,
  };

  const changedFiles = lines.slice(1).map((line) => {
    const code = line.slice(0, 2);
    const filePath = line.slice(3).trim();

    if (code === '??') counts.untracked += 1;
    else if (code.includes('U') || code === 'AA' || code === 'DD') counts.conflicts += 1;
    else if (code.includes('R')) counts.renamed += 1;
    else if (code.includes('A')) counts.added += 1;
    else if (code.includes('D')) counts.deleted += 1;
    else counts.modified += 1;

    return { code, path: filePath };
  });

  return {
    branch,
    upstream,
    ahead,
    behind,
    changedFiles,
    counts,
    hasChanges: changedFiles.length > 0,
  };
}

function parseGitHubRemote(remoteUrl: string): GitHubRemote | null {
  const cleaned = remoteUrl.trim().replace(/\.git$/i, '');
  const sshMatch = cleaned.match(/^git@github\.com:(.+?)\/(.+)$/i);
  if (sshMatch) {
    const owner = sshMatch[1];
    const repo = sshMatch[2];
    return { owner, repo, htmlUrl: `https://github.com/${owner}/${repo}` };
  }

  try {
    const parsed = new URL(cleaned);
    if (parsed.hostname.toLowerCase() !== 'github.com') return null;
    const parts = parsed.pathname.replace(/^\/+/, '').split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1];
    return { owner, repo, htmlUrl: `https://github.com/${owner}/${repo}` };
  } catch {
    return null;
  }
}

function normalizeRepoPath(rootDir: string, repoPathRaw: string) {
  return path.isAbsolute(repoPathRaw) ? path.normalize(repoPathRaw) : path.resolve(rootDir, repoPathRaw);
}

async function ensureRepo(rootDir: string, repoPathRaw: string) {
  const normalized = normalizeRepoPath(rootDir, repoPathRaw);
  const stat = await fs.stat(normalized).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error('repoPath must point to an existing directory');
  }
  await runGit(normalized, ['rev-parse', '--is-inside-work-tree']);
  return runGit(normalized, ['rev-parse', '--show-toplevel']);
}

async function getBranches(repoPath: string) {
  const raw = await runGit(repoPath, ['branch', '--format=%(refname:short)|%(HEAD)']);
  return raw.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name = '', head = ''] = line.split('|');
    return { name, current: head.trim() === '*' };
  });
}

async function fetchWorkflowRuns(remote: GitHubRemote) {
  try {
    const data = await fetchGitHubJson(`https://api.github.com/repos/${remote.owner}/${remote.repo}/actions/runs?per_page=5`) as { workflow_runs?: any[] };
    const workflowRuns: WorkflowRun[] = (data.workflow_runs || []).map((run) => ({
      id: run.id,
      name: run.name || 'Workflow',
      status: run.status || 'unknown',
      conclusion: run.conclusion || null,
      htmlUrl: run.html_url,
      branch: run.head_branch || '',
      event: run.event || '',
      createdAt: run.created_at || '',
      updatedAt: run.updated_at || '',
    }));
    return { workflowRuns, actionsError: null };
  } catch (error: any) {
    return { workflowRuns: [], actionsError: error?.message || 'Failed to contact GitHub API' };
  }
}

async function fetchPullRequests(remote: GitHubRemote) {
  try {
    const data = await fetchGitHubJson(`https://api.github.com/repos/${remote.owner}/${remote.repo}/pulls?state=open&per_page=5`) as any[];
    const pullRequests: PullRequest[] = data.map((pr) => ({
      id: pr.id,
      number: pr.number,
      title: pr.title,
      state: pr.state,
      htmlUrl: pr.html_url,
      author: pr.user?.login || 'unknown',
      createdAt: pr.created_at || '',
      updatedAt: pr.updated_at || '',
    }));
    return { pullRequests, pullRequestsError: null };
  } catch (error: any) {
    return { pullRequests: [], pullRequestsError: error?.message || 'Failed to fetch pull requests' };
  }
}

async function fetchIssues(remote: GitHubRemote) {
  try {
    const data = await fetchGitHubJson(`https://api.github.com/repos/${remote.owner}/${remote.repo}/issues?state=open&per_page=5`) as any[];
    const issues: Issue[] = data.filter((issue) => !issue.pull_request).map((issue) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      state: issue.state,
      htmlUrl: issue.html_url,
      author: issue.user?.login || 'unknown',
      createdAt: issue.created_at || '',
      updatedAt: issue.updated_at || '',
    }));
    return { issues, issuesError: null };
  } catch (error: any) {
    return { issues: [], issuesError: error?.message || 'Failed to fetch issues' };
  }
}

function formatGitHubPermissionError(feature: string, error: string | null) {
  if (!error) return null;
  if (/GitHub API returned 403/i.test(error)) {
    return `${feature} permission missing or denied by the configured GitHub token.`;
  }
  if (/GitHub API returned 401/i.test(error)) {
    return `${feature} request was rejected because the configured GitHub token is invalid.`;
  }
  return error;
}

async function fetchUserRepos(query: string) {
  const token = getToken();
  if (!token) {
    throw new Error('GITHUB_TOKEN is required to search your GitHub repositories');
  }

  const data = await fetchGitHubJson('https://api.github.com/user/repos?per_page=100&sort=updated&direction=desc&affiliation=owner,collaborator,organization_member') as any[];
  const normalizedQuery = query.trim().toLowerCase();
  const repos: SearchRepoResult[] = data
    .map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: Boolean(repo.private),
      cloneUrl: repo.clone_url,
      defaultBranch: repo.default_branch || 'main',
      htmlUrl: repo.html_url,
      owner: repo.owner?.login || '',
    }))
    .filter((repo) => {
      if (!normalizedQuery) return true;
      return repo.name.toLowerCase().includes(normalizedQuery)
        || repo.fullName.toLowerCase().includes(normalizedQuery)
        || (repo.description || '').toLowerCase().includes(normalizedQuery);
    })
    .slice(0, 25);

  return repos;
}

async function githubAuthArgs(cloneUrl: string) {
  const token = getToken();
  if (!token || !cloneUrl.startsWith('https://github.com/')) return [] as string[];

  let login = 'git';
  try {
    login = await getAuthenticatedGitHubLogin() || login;
  } catch {
    login = 'git';
  }

  const auth = Buffer.from(`${login}:${token}`).toString('base64');
  return ['-c', `http.https://github.com/.extraheader=AUTHORIZATION: basic ${auth}`];
}

function gitNonInteractiveCloneArgs() {
  return ['-c', 'credential.helper=', '-c', 'credential.interactive=never'] as string[];
}

function isGitHubAuthError(output: string) {
  return /403|write access to repository not granted|authentication failed|repository not found|could not read username|access denied|unable to get password from user|unable to get password/i.test(output);
}

function buildCloneErrorMessage(output: string) {
  const trimmed = output.trim();
  if (isGitHubAuthError(trimmed)) {
    return `${trimmed}\nGitHub rejected the clone credentials or the process could not prompt for a password. For private repositories, set a token with repository Contents: Read access in the environment variable GITHUB_TOKEN (or REPOVIEW_GITHUB_TOKEN). For interactive credential prompts, remove non-interactive settings.`;
  }
  return trimmed;
}

async function pathExists(targetPath: string) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

function appendJobLog(job: CloneJob, chunk: string) {
  const text = chunk.trim();
  if (!text) return;
  job.logs.push(...text.split(/\r?\n/).filter(Boolean));
  if (job.logs.length > 200) {
    job.logs.splice(0, job.logs.length - 200);
  }
}

async function runCloneProcess(job: CloneJob, args: string[]) {
  return await new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    let combinedOutput = '';
    const child = spawn('git', args, {
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GCM_INTERACTIVE: 'Never',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      combinedOutput += text;
      appendJobLog(job, text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      combinedOutput += text;
      appendJobLog(job, text);
    });

    child.on('error', (error) => reject(error));
    child.on('close', (code) => resolve({ code, output: combinedOutput }));
  });
}

async function inspectRepo(rootDir: string, repoPathRaw: string) {
  const topLevel = await ensureRepo(rootDir, repoPathRaw);
  const statusRaw = await runGit(topLevel, ['status', '--porcelain=v1', '--branch']);
  const status = parseGitStatus(statusRaw);
  const branches = await getBranches(topLevel);

  let remoteUrl = '';
  try {
    remoteUrl = await runGit(topLevel, ['remote', 'get-url', 'origin']);
  } catch {
    remoteUrl = '';
  }

  let commit = null;
  try {
    const lastCommitRaw = await runGit(topLevel, ['log', '-1', '--pretty=format:%H%n%s%n%an%n%ad']);
    const [hash = '', subject = '', author = '', date = ''] = lastCommitRaw.split(/\r?\n/);
    commit = { hash, shortHash: hash.slice(0, 7), subject, author, date };
  } catch {
    commit = null;
  }

  const github = parseGitHubRemote(remoteUrl);
  const { workflowRuns, actionsError } = github ? await fetchWorkflowRuns(github) : { workflowRuns: [], actionsError: null };
  const { pullRequests, pullRequestsError } = github ? await fetchPullRequests(github) : { pullRequests: [], pullRequestsError: null };
  const { issues, issuesError } = github ? await fetchIssues(github) : { issues: [], issuesError: null };

  return {
    repoPath: topLevel,
    remoteUrl: remoteUrl || null,
    github,
    status,
    lastCommit: commit,
    branches,
    workflowRuns,
    pullRequests,
    issues,
    actionsError: formatGitHubPermissionError('GitHub Actions', actionsError),
    pullRequestsError: formatGitHubPermissionError('Pull request', pullRequestsError),
    issuesError: formatGitHubPermissionError('Issue', issuesError),
  };
}

async function buildUntrackedDiff(repoPath: string, filePath: string) {
  const absolute = path.resolve(repoPath, filePath);
  const content = await fs.readFile(absolute, 'utf8');
  const lines = content.split(/\r?\n/);
  return [
    `diff --git a/${filePath} b/${filePath}`,
    'new file mode 100644',
    '--- /dev/null',
    `+++ b/${filePath}`,
    `@@ -0,0 +1,${lines.length} @@`,
    ...lines.map((line) => `+${line}`),
  ].join('\n');
}

export function registerGitHubRoutes(app: Express, rootDir: string) {
  app.post('/api/github/search-repos', async (req: Request, res: Response) => {
    try {
      const query = String(req.body?.query || '').trim();
      res.json({ repos: await fetchUserRepos(query) });
    } catch (error: any) {
      const message = error?.message || 'Failed to search repositories';
      res.status(500).json({ error: String(message).trim() });
    }
  });

  app.post('/api/github/clone/start', async (req: Request, res: Response) => {
    try {
      const cloneUrl = String(req.body?.cloneUrl || '').trim();
      const destinationPathRaw = String(req.body?.destinationPath || '').trim();
      const repoName = String(req.body?.repoName || '').trim();

      if (!cloneUrl || !destinationPathRaw || !repoName) {
        res.status(400).json({ error: 'cloneUrl, destinationPath, and repoName are required' });
        return;
      }

      const destinationPath = path.isAbsolute(destinationPathRaw)
        ? path.normalize(destinationPathRaw)
        : path.resolve(rootDir, destinationPathRaw);

      await fs.mkdir(destinationPath, { recursive: true });
      const targetPath = path.join(destinationPath, repoName);
      const targetGitPath = path.join(targetPath, '.git');

      if (!(await pathExists(targetGitPath)) && await pathExists(targetPath)) {
        const entries = await fs.readdir(targetPath);
        if (entries.length > 0) {
          res.status(400).json({ error: 'Target directory already exists and is not an empty git repository' });
          return;
        }
      }

      const jobId = crypto.randomUUID();
      const job: CloneJob = {
        id: jobId,
        status: 'running',
        logs: [],
        clonedPath: targetPath,
        inspection: null,
        error: null,
      };
      cloneJobs.set(jobId, job);

      if (await pathExists(targetGitPath)) {
        appendJobLog(job, `Updating existing clone at ${targetPath}`);
        runGit(targetPath, ['pull', '--ff-only'])
          .then(async (output) => {
            appendJobLog(job, output || 'Already up to date.');
            job.inspection = await inspectRepo(rootDir, targetPath);
            job.status = 'completed';
          })
          .catch((error: any) => {
            job.error = String(error?.stderr || error?.message || 'Failed to update repository').trim();
            appendJobLog(job, job.error);
            job.status = 'failed';
          });
      } else {
        appendJobLog(job, `Cloning ${cloneUrl} into ${targetPath}`);
        void (async () => {
          try {
            const initialAuthArgs = await githubAuthArgs(cloneUrl);
            let result = await runCloneProcess(job, [...gitNonInteractiveCloneArgs(), ...initialAuthArgs, 'clone', '--progress', cloneUrl, targetPath]);

            if (result.code !== 0 && await pathExists(targetPath)) {
              await fs.rm(targetPath, { recursive: true, force: true });
            }

            if (result.code !== 0 && cloneUrl.startsWith('https://github.com/') && isGitHubAuthError(result.output) && getToken()) {
              appendJobLog(job, 'Retrying clone with configured GitHub token...');
              const authArgs = await githubAuthArgs(cloneUrl);
              result = await runCloneProcess(job, [...gitNonInteractiveCloneArgs(), ...authArgs, 'clone', '--progress', cloneUrl, targetPath]);
            }

            if (result.code === 0) {
              try {
                job.inspection = await inspectRepo(rootDir, targetPath);
                appendJobLog(job, 'Clone completed successfully.');
                job.status = 'completed';
              } catch (error: any) {
                job.error = String(error?.message || 'Clone completed but inspection failed');
                appendJobLog(job, job.error);
                job.status = 'failed';
              }
              return;
            }

            job.error = buildCloneErrorMessage(result.output) || `git clone exited with code ${result.code}`;
            appendJobLog(job, `git clone exited with code ${result.code}`);
            job.status = 'failed';
          } catch (error: any) {
            job.error = String(error?.message || 'Failed to clone repository');
            appendJobLog(job, job.error);
            job.status = 'failed';
          }
        })();
      }

      res.json({ ok: true, jobId, clonedPath: targetPath });
    } catch (error: any) {
      const message = error?.stderr || error?.message || 'Failed to clone repository';
      res.status(500).json({ error: String(message).trim() });
    }
  });

  app.get('/api/github/clone/status/:jobId', async (req: Request, res: Response) => {
    const job = cloneJobs.get(String(req.params.jobId || ''));
    if (!job) {
      res.status(404).json({ error: 'Clone job not found' });
      return;
    }

    res.json({
      id: job.id,
      status: job.status,
      logs: job.logs,
      clonedPath: job.clonedPath,
      inspection: job.inspection,
      error: job.error,
    });
  });

  app.post('/api/github/clone', async (req: Request, res: Response) => {
    try {
      const forwardReq = { ...req, url: '/api/github/clone/start' };
      void forwardReq;
      res.status(410).json({ error: 'Use /api/github/clone/start instead' });
    } catch (error: any) {
      res.status(500).json({ error: String(error?.message || 'Clone endpoint error') });
    }
  });

  app.post('/api/github/inspect', async (req: Request, res: Response) => {
    try {
      const repoPathRaw = String(req.body?.repoPath || '').trim();
      if (!repoPathRaw) {
        res.status(400).json({ error: 'repoPath is required' });
        return;
      }

      res.json(await inspectRepo(rootDir, repoPathRaw));
    } catch (error: any) {
      const message = error?.stderr || error?.message || 'Failed to inspect repository';
      res.status(500).json({ error: String(message).trim() });
    }
  });

  app.post('/api/github/action', async (req: Request, res: Response) => {
    try {
      const repoPathRaw = String(req.body?.repoPath || '').trim();
      const action = String(req.body?.action || '').trim();
      const message = String(req.body?.message || '').trim();
      const ref = String(req.body?.ref || '').trim();
      const branchName = String(req.body?.branchName || '').trim();

      if (!repoPathRaw || !action) {
        res.status(400).json({ error: 'repoPath and action are required' });
        return;
      }

      const repoPath = await ensureRepo(rootDir, repoPathRaw);
      let output = '';

      if (action === 'commit') {
        if (!message) {
          res.status(400).json({ error: 'Commit message is required' });
          return;
        }
        await runGit(repoPath, ['add', '-A']);
        output = await runGit(repoPath, ['commit', '-m', message]);
      } else if (action === 'pull') {
        output = await runGit(repoPath, ['pull', '--ff-only']);
      } else if (action === 'push') {
        output = await runGit(repoPath, ['push']);
      } else if (action === 'checkout') {
        if (!ref) {
          res.status(400).json({ error: 'Checkout target is required' });
          return;
        }
        output = await runGit(repoPath, ['checkout', ref]);
      } else if (action === 'create-branch') {
        if (!branchName) {
          res.status(400).json({ error: 'Branch name is required' });
          return;
        }
        output = await runGit(repoPath, ['checkout', '-b', branchName]);
      } else {
        res.status(400).json({ error: 'Unsupported action' });
        return;
      }

      res.json({ ok: true, output, inspection: await inspectRepo(rootDir, repoPath) });
    } catch (error: any) {
      const message = error?.stderr || error?.message || 'Git action failed';
      res.status(500).json({ error: String(message).trim() });
    }
  });

  app.post('/api/github/diff', async (req: Request, res: Response) => {
    try {
      const repoPathRaw = String(req.body?.repoPath || '').trim();
      const filePath = String(req.body?.filePath || '').trim();
      const code = String(req.body?.code || '').trim();

      if (!repoPathRaw || !filePath) {
        res.status(400).json({ error: 'repoPath and filePath are required' });
        return;
      }

      const repoPath = await ensureRepo(rootDir, repoPathRaw);
      let diff = '';

      if (code === '??') {
        diff = await buildUntrackedDiff(repoPath, filePath);
      } else {
        diff = await runGit(repoPath, ['diff', '--', filePath]);
        if (!diff) {
          diff = await runGit(repoPath, ['diff', '--cached', '--', filePath]);
        }
      }

      res.json({ filePath, diff: diff || 'No textual diff available.' });
    } catch (error: any) {
      const message = error?.stderr || error?.message || 'Failed to load diff';
      res.status(500).json({ error: String(message).trim() });
    }
  });
}