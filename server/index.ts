import 'dotenv/config';

import express from 'express';
import { promises as fs } from 'fs';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import { createVerifyApiAuth, json } from './auth';
import { registerGeminiRoutes } from './gemini';
import { registerGitHubRoutes } from './github';
import { setupTerminal } from './terminal';
import { attachFrontend } from './frontend';
import { registerRepoRoutes } from './repo';

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

const IGNORED_DIRS = new Set(['node_modules', '.git', '.idea', '.vscode', 'dist', 'build', '__pycache__', 'venv', '.netlify', '.github', '.vercel']);
const IGNORED_EXTS = ['.exe', '.dll', '.zip', '.tar.gz', '.pyc', '.log', 'env', '.env', 'logs', 'tmp', 'temp', 'package-lock.json', '.DS_Store', '.next'];

app.use(express.json({ limit: '50mb' }));

app.use('/api', createVerifyApiAuth(devToken));

function shouldIgnoreImportPath(relativePath: string) {
  const normalized = relativePath.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => IGNORED_DIRS.has(part))) return true;

  const lowerPath = normalized.toLowerCase();
  const lowerName = parts[parts.length - 1]?.toLowerCase() || lowerPath;
  return IGNORED_EXTS.some((value) => lowerPath.endsWith(value.toLowerCase()) || lowerName === value.toLowerCase());
}

async function collectImportableFiles(baseDir: string, currentDir: string, results: Array<{ path: string; name: string; type: string; data: string }>) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(baseDir, absolutePath).replace(/\\/g, '/');

    if (!relativePath || shouldIgnoreImportPath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await collectImportableFiles(baseDir, absolutePath, results);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const buffer = await fs.readFile(absolutePath);
    results.push({
      path: relativePath,
      name: entry.name,
      type: '',
      data: buffer.toString('base64'),
    });
  }
}

app.post('/api/write-file', async (req, res) => {
  try {
    const { filePath, content } = req.body || {};
    const requested = filePath || 'temp_saved_file.txt';
    
    // Resolve absolute path or relative to rootDir
    const fullPath = path.isAbsolute(requested) ? requested : path.resolve(rootDir, requested);

    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, String(content ?? ''));
    json(res, 200, { success: true, path: fullPath });
  } catch (error: any) {
    console.error('File write error:', error);
    json(res, 500, { error: `Failed to write file: ${error.message}` });
  }
});

app.post('/api/read-file', async (req, res) => {
  try {
    const requested = String(req.body?.filePath || '').trim();
    if (!requested) {
      json(res, 400, { error: 'filePath is required' });
      return;
    }

    const fullPath = path.isAbsolute(requested) ? requested : path.resolve(rootDir, requested);

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

    const files: Array<{ path: string; name: string; type: string; data: string }> = [];
    await collectImportableFiles(fullPath, fullPath, files);

    json(res, 200, {
      repoPath: fullPath,
      files,
    });
  } catch (error: any) {
    console.error('Local repo import error:', error);
    json(res, 500, { error: `Failed to import local repository: ${error.message}` });
  }
});

registerGeminiRoutes(app, geminiApiKey);
registerRepoRoutes(app, rootDir);
registerGitHubRoutes(app, rootDir);

app.get('/api/health', (_req, res) => {
  json(res, 200, { ok: true, mode: isDev ? 'development' : 'production' });
});

// Terminal / shell setup (encapsulated)
setupTerminal(httpServer, rootDir, devToken);

await attachFrontend({ isDev, rootDir, distDir, indexHtmlPath, app, httpServer });

httpServer.listen(port, () => {
  console.log(`[repoview] Server listening on http://localhost:${port} (${isDev ? 'dev' : 'prod'})`);
});