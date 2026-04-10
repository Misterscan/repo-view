import 'dotenv/config';

import express from 'express';
import { promises as fs } from 'fs';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

import { createVerifyApiAuth, json } from './auth';
import { registerGeminiRoutes } from './gemini';
import { registerGitHubRoutes } from './github';
import { setupTerminal } from './terminal';
import { attachFrontend } from './frontend';
import { registerRepoRoutes } from './repo';
import AdmZip from 'adm-zip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.resolve(rootDir, 'dist');
const indexHtmlPath = path.resolve(rootDir, 'index.html');
const isDev = process.argv.includes('--dev');
const port = Number(process.env.PORT || 3000);

const geminiApiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
let devToken = process.env.REPOVIEW_DEV_TOKEN || '';
if (!devToken) {
  devToken = Math.random().toString(36).slice(2, 12);
  console.warn('[repoview] Generated REPOVIEW_DEV_TOKEN for local dev:', devToken);
}

const app = express();
const httpServer = createServer(app);

// Verbose logging flag (enable in development or via env)
const verbose = Boolean(process.env.REPOVIEW_VERBOSE === '1' || process.env.DEBUG === '1' || isDev);

// Simple request logger middleware
function requestLogger(req: any, res: any, next: any) {
  // prevent double-logging if middleware attached multiple times
  if ((req as any).__repoview_logged) return next();
  (req as any).__repoview_logged = true;

  const start = Date.now();
  const { method, url } = req;
  const shortHeaders = { host: req.headers.host, origin: req.headers.origin };

  // on finish, log a single consolidated line
  res.once('finish', () => {
    const ms = Date.now() - start;
    const line = `[repoview] ${method} ${url} -> ${res.statusCode} ${ms}ms headers=${JSON.stringify(shortHeaders)}`;
    if (verbose) console.log(line);

    // optional file logging
    const logFile = process.env.REPOVIEW_LOG_FILE || path.resolve(rootDir, 'logs', 'server.log');
    // ensure logs dir exists (fire-and-forget)
    fs.mkdir(path.dirname(logFile), { recursive: true }).catch(() => null).then(() => {
      fs.appendFile(logFile, `${new Date().toISOString()} ${line}\n`).catch(() => null);
    }).catch(() => null);
  });

  next();
}

if (verbose) app.use(requestLogger);

const API_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 300 };
const FILEOPS_RATE_LIMIT = { windowMs: 15 * 60 * 1000, max: 100 };

const apiLimiter = rateLimit({
  windowMs: API_RATE_LIMIT.windowMs,
  max: API_RATE_LIMIT.max,
  standardHeaders: true,
  legacyHeaders: false,
});

const fileOpsLimiter = rateLimit({
  windowMs: FILEOPS_RATE_LIMIT.windowMs,
  max: FILEOPS_RATE_LIMIT.max,
  standardHeaders: true,
  legacyHeaders: false
});

const IGNORED_DIRS = new Set(['node_modules', '.git', '.idea', '.vscode', 'dist', 'build', '__pycache__', 'venv', '.netlify', '.github', '.vercel', 'server_uploads']);
const IGNORED_EXTS = [
  '.exe', '.dmg', '.app', '.dll', '.zip', '.tar.gz', '.pyc', '.log', 'env', '.env', 'logs', 'tmp', 'temp', 'package-lock.json', '.DS_Store', '.next',
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.mp4', '.avi', '.mov', '.wmv', '.flv', '.mkv', '.iso', '.bin', '.img', '.msi', '.deb', '.rpm'
];

app.use(express.json({ limit: '50mb' }));

app.use('/api', apiLimiter, createVerifyApiAuth(devToken));

function shouldIgnoreImportPath(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => IGNORED_DIRS.has(part))) return true;

  const lowerPath = normalized.toLowerCase();
  const lowerName = parts[parts.length - 1]?.toLowerCase() || lowerPath;
  return IGNORED_EXTS.some((value) => lowerPath.endsWith(value.toLowerCase()) || lowerName === value.toLowerCase());
}

function resolvePathUnderRoot(requestedPath: string): string {
  const trimmed = String(requestedPath || '').trim();
  if (!trimmed) {
    throw new Error('filePath is required');
  }
  if (path.isAbsolute(trimmed)) {
    throw new Error('Absolute paths are not allowed');
  }

  const resolved = path.resolve(rootDir, trimmed);
  const rel = path.relative(rootDir, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path escapes the allowed root directory');
  }

  return resolved;
}

app.post('/api/write-file', fileOpsLimiter, async (req, res) => {
  try {
    const { filePath, content } = req.body || {};
    const requested = String(filePath || 'temp_saved_file.txt');
    const fullPath = resolvePathUnderRoot(requested);

    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, String(content ?? ''));
    json(res, 200, { success: true, path: fullPath });
  } catch (error: any) {
    console.error('File write error:', error);
    if (error?.message === 'filePath is required' || error?.message === 'Absolute paths are not allowed' || error?.message === 'Path escapes the allowed root directory') {
      json(res, 400, { error: error.message });
      return;
    }
    json(res, 500, { error: `Failed to write file: ${error.message}` });
  }
});

app.post('/api/read-file', fileOpsLimiter, async (req, res) => {
  try {
    const requested = String(req.body?.filePath || '').trim();
    if (!requested) {
      json(res, 400, { error: 'filePath is required' });
      return;
    }

    const fullPath = resolvePathUnderRoot(requested);

    try {
      const content = await fs.readFile(fullPath, 'utf8');
      json(res, 200, { exists: true, path: fullPath, content });
    } catch (error: any) {
      if (error?.code === 'ENOENT') {
        json(res, 200, { exists: false, path: fullPath, content: '' });
        return;
      }
      throw error;
    }
  } catch (error: any) {
    console.error('File read error:', error);
    if (error?.message === 'filePath is required' || error?.message === 'Absolute paths are not allowed' || error?.message === 'Path escapes the allowed root directory') {
      json(res, 400, { error: error.message });
      return;
    }
    json(res, 500, { error: `Failed to read file: ${error.message}` });
  }
});

app.post('/api/import-local-repo', async (req, res) => {
  try {
    const requested = String(req.body?.repoPath || '').trim();
    if (!requested) {
      json(res, 400, { error: 'repoPath is required' });
      return;
    }

    const fullPath = path.isAbsolute(requested) ? path.normalize(requested) : path.resolve(rootDir, requested);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      json(res, 400, { error: 'repoPath must point to an existing directory' });
      return;
    }

    const zip = new AdmZip();

    async function collectZipFiles(baseDir: string, currentDir: string) {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const absolutePath = path.join(currentDir, entry.name);
        const relativePath = path.relative(baseDir, absolutePath).replace(/\\/g, '/');

        if (!relativePath || shouldIgnoreImportPath(relativePath)) {
          continue;
        }

        if (entry.isDirectory()) {
          await collectZipFiles(baseDir, absolutePath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const fileStat = await fs.stat(absolutePath);
        if (fileStat.size > 25 * 1024 * 1024) { // Ignore gigantic files over 25MB
          continue; 
        }

        const folderNameInZip = path.dirname(relativePath).replace(/\\/g, '/');
        const zipDir = folderNameInZip === '.' ? '' : folderNameInZip;
        zip.addLocalFile(absolutePath, zipDir);
      }
    }

    await collectZipFiles(fullPath, fullPath);

    const buffer = zip.toBuffer();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('X-Repo-Path', encodeURIComponent(fullPath));
    res.status(200).send(buffer);
  } catch (error: any) {
    console.error('Local repo import error:', error);
    if (!res.headersSent) {
      json(res, 500, { error: `Failed to import local repository: ${error.message}` });
    }
  }
});

registerGeminiRoutes(app, geminiApiKey);
registerRepoRoutes(app, rootDir);
registerGitHubRoutes(app, rootDir);

// Integrations health endpoint (masked configuration)
app.get('/api/integrations', (_req, res) => {
  const mask = (v?: string) => v ? `***${String(v).slice(-4)}` : null;
  const geminiEnv = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
  const githubEnv = process.env.GITHUB_TOKEN || process.env.REPOVIEW_GITHUB_TOKEN || '';
  json(res, 200, {
    gemini: geminiEnv ? { configured: true, key: mask(geminiEnv) } : { configured: false },
    github: githubEnv ? { configured: true, token: mask(githubEnv) } : { configured: false },
    devToken: devToken ? { configured: true } : { configured: false },
  });
});

// If verbose mode is enabled, list registered routes and log rate-limit settings
function listRoutes() {
  try {
    const stack = (app as any)._router?.stack || [];
    const routes: string[] = [];
    for (const layer of stack) {
      if (layer.route && layer.route.path) {
        const methods = Object.keys(layer.route.methods || {}).join(',').toUpperCase();
        routes.push(`${methods} ${layer.route.path}`);
      } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
        for (const nested of layer.handle.stack) {
          if (nested.route && nested.route.path) {
            const methods = Object.keys(nested.route.methods || {}).join(',').toUpperCase();
            routes.push(`${methods} ${nested.route.path}`);
          }
        }
      }
    }
    console.log('[repoview] Registered routes:');
    routes.forEach(r => console.log('  -', r));
  } catch (e) {
    console.warn('[repoview] Failed to list routes', e);
  }
}

if (verbose) {
  console.log('[repoview] Verbose logging enabled');
  listRoutes();
  console.log(`[repoview] Rate limits: api=${API_RATE_LIMIT.max}/${API_RATE_LIMIT.windowMs}ms, fileOps=${FILEOPS_RATE_LIMIT.max}/${FILEOPS_RATE_LIMIT.windowMs}ms`);
  const mask = (v?: string) => v ? `***${String(v).slice(-4)}` : '(none)';
  const geminiEnv = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
  const githubEnv = process.env.GITHUB_TOKEN || process.env.REPOVIEW_GITHUB_TOKEN || '';
  const devTokenMsg = devToken ? `${mask(devToken)} (masked)` : '(none) — set REPOVIEW_DEV_TOKEN to protect /api routes from external access';
  const geminiMsg = geminiEnv ? `${mask(geminiEnv)} (masked)` : '(none) — set GEMINI_API_KEY or VITE_GEMINI_API_KEY to enable LLM features';
  const githubMsg = githubEnv ? `${mask(githubEnv)} (masked)` : '(none) — set GITHUB_TOKEN or REPOVIEW_GITHUB_TOKEN to enable GitHub integration';

  console.log(`[repoview] Dev token: ${devTokenMsg}`);
  console.log(`[repoview] Gemini API key: ${geminiMsg}`);
  console.log(`[repoview] GitHub token: ${githubMsg}`);
  console.log(`[repoview] Env: ${process.env.NODE_ENV || (isDev ? 'development' : 'production')}, Port: ${port}`);
}

app.get('/api/health', (_req, res) => {
  json(res, 200, { ok: true, mode: isDev ? 'development' : 'production' });
});

// Terminal / shell setup (encapsulated)
setupTerminal(httpServer, rootDir, devToken);

await attachFrontend({ isDev, rootDir, distDir, indexHtmlPath, app, httpServer });

function startServer(startPort: number, attempts = 5) {
  const tryPort = startPort;

  const onError = (err: any) => {
    if (err && err.code === 'EADDRINUSE') {
      console.warn(`[repoview] Port ${tryPort} in use.`);
      if (attempts > 0) {
        const nextPort = tryPort + 1;
        console.log(`[repoview] Trying port ${nextPort}...`);
        // slight delay before retrying to give OS time to free sockets
        setTimeout(() => startServer(nextPort, attempts - 1), 200);
        return;
      }
      console.error(`[repoview] Failed to bind to port ${startPort} after multiple attempts.`);
      console.error(`[repoview] To free the port, run (Windows):
  netstat -ano | findstr :3000
  taskkill /PID <pid> /F
or (PowerShell):
  Get-Process -Id <pid> | Stop-Process
or restart your machine.`);
      process.exit(1);
    }

    console.error('[repoview] Server error:', err);
    process.exit(1);
  };

  httpServer.once('error', onError);
  httpServer.listen(tryPort, () => {
    httpServer.removeListener('error', onError);
    console.log(`[repoview] Server listening on http://localhost:${tryPort} (${isDev ? 'dev' : 'prod'})`);
  });
}

startServer(port);

// Graceful shutdown helpers so Ctrl+C reliably stops the running server
function shutdown(reason?: string) {
  try {
    console.log(`[repoview] Shutting down${reason ? ` (${reason})` : ''}...`);
    // stop accepting new connections
    httpServer.close(() => {
      console.log('[repoview] HTTP server closed');
      process.exit(0);
    });

    // Force exit if close doesn't complete in time
    const t = setTimeout(() => {
      console.error('[repoview] Shutdown timed out — forcing exit');
      process.exit(1);
    }, 5000);
    if (typeof t === 'object' && typeof (t as any).unref === 'function') (t as any).unref();
  } catch (err) {
    console.error('[repoview] Error during shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', (err) => {
  console.error('[repoview] Uncaught exception:', err);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('[repoview] Unhandled rejection:', reason);
  shutdown('unhandledRejection');
});