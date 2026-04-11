import { type Express, type Request, type Response } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import path from 'path';
import { createHash } from 'crypto';
import { IGNORED_DIRS, IGNORED_EXTS } from '../src/lib/constants.ts';
import { promises as fs } from 'fs';
import rateLimit from 'express-rate-limit';

const upload = multer({ storage: multer.memoryStorage() });
const repoMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

function isIgnoredPath(p: string) {
  const normalized = p.replace(/\\/g, '/');
  console.log(`[IGNORE_CHECK] (Server-Repo) Checking path: "${p}" -> normalized: "${normalized}"`);
  const lower = normalized.toLowerCase();
  if (IGNORED_EXTS.some(ext => lower.endsWith(ext.toLowerCase()))) {
    console.log(`[IGNORE_CHECK] (Server-Repo) Ignoring path: ${p} (matched extension)`);
    return true;
  }
  const parts = normalized.split('/').filter(Boolean);
  const matchedPart = parts.find(part => IGNORED_DIRS.includes(part.toLowerCase()));
  if (matchedPart) {
    console.log(`[IGNORE_CHECK] (Server-Repo) Ignoring path: ${p} (matched part: "${matchedPart}")`);
    return true;
  }
  return false;
}

export function registerRepoRoutes(app: Express, rootDir: string) {
  app.delete('/api/repo/upload-session/:sessionId', repoMutationLimiter, async (req: Request, res: Response) => {
    try {
      const sessionIdRaw = String(req.params.sessionId || '').trim();
      if (!/^\d+$/.test(sessionIdRaw)) {
        res.status(400).json({ error: 'Invalid sessionId' });
        return;
      }

      const uploadsDir = path.join(rootDir, 'server_uploads');
      const extractDir = path.join(uploadsDir, sessionIdRaw);
      const zipPath = path.join(uploadsDir, `${sessionIdRaw}.zip`);

      await fs.rm(extractDir, { recursive: true, force: true });
      await fs.rm(zipPath, { force: true });

      res.json({ ok: true, sessionId: sessionIdRaw });
    } catch (error: any) {
      console.error('Repo upload session delete error:', error);
      res.status(500).json({ error: error.message || 'Failed to delete upload session' });
    }
  });

  app.get('/api/repo/session-path/:sessionId', async (req: Request, res: Response) => {
    try {
      const sessionIdRaw = String(req.params.sessionId || '').trim();
      if (!/^\d+$/.test(sessionIdRaw)) {
        res.status(400).json({ error: 'Invalid sessionId' });
        return;
      }

      const uploadsDir = path.join(rootDir, 'server_uploads');
      const sessionDir = path.join(uploadsDir, sessionIdRaw);
      
      const stat = await fs.stat(sessionDir).catch(() => null);
      if (!stat || !stat.isDirectory()) {
        res.status(404).json({ error: 'Session directory not found' });
        return;
      }

      // Check for a single subdirectory (the actual repo)
      const entries = await fs.readdir(sessionDir, { withFileTypes: true });
      const subdirs = entries.filter(e => e.isDirectory());
      
      let finalPath = sessionDir;
      if (subdirs.length === 1) {
        finalPath = path.join(sessionDir, subdirs[0].name);
      }

      res.json({ path: finalPath });
    } catch (error: any) {
      res.status(500).json({ error: error.message || 'Failed to get session path' });
    }
  });

  app.post('/api/repo/compare', upload.single('file'), async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'zip file required in field `file`' });
        return;
      }

      const clientHashes = req.body.clientHashes ? JSON.parse(req.body.clientHashes) : {};

      const zip = new AdmZip(req.file.buffer);
      const entries = zip.getEntries();

      const files: { path: string; hash: string; size: number }[] = [];

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const rel = entry.entryName.replace(/^\/+/, '');
        console.log(`[COMPARE_LOOP_1] Processing entry: "${rel}"`);
        if (isIgnoredPath(rel)) continue;
        const data = entry.getData();
        const hash = createHash('sha256').update(data).digest('hex');
        files.push({ path: rel, hash, size: data.length });
      }

      const changed: string[] = [];
      const changedFiles: { path: string; data: string; size: number }[] = [];
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const rel = entry.entryName.replace(/^\/+/, '');
        console.log(`[COMPARE_LOOP_2] Processing entry: "${rel}"`);
        if (isIgnoredPath(rel)) continue;
        const data = entry.getData();
        const hash = createHash('sha256').update(data).digest('hex');
        const clientHash = clientHashes[rel];
        if (!clientHash || clientHash !== hash) {
          changed.push(rel);
          changedFiles.push({ path: rel, data: data.toString('base64'), size: data.length });
        }
      }

      res.json({ files, changed, changedFiles });
    } catch (error: any) {
      console.error('Repo compare error:', error);
      res.status(500).json({ error: error.message || 'Failed to compare repo' });
    }
  });
  
    // Persist zip and extract into server-side session
    app.post('/api/repo/upload', repoMutationLimiter, upload.single('file'), async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: 'zip file required in field `file`' });
          return;
        }
      
        const clientHashes = req.body.clientHashes ? JSON.parse(req.body.clientHashes) : {};
      
        const sessionId = Date.now().toString();
        const uploadsDir = path.join(rootDir, 'server_uploads');
        await fs.mkdir(uploadsDir, { recursive: true });
      
        const zipPath = path.join(uploadsDir, `${sessionId}.zip`);
        await fs.writeFile(zipPath, req.file.buffer);
      
        const extractDir = path.join(uploadsDir, sessionId);
        const zip = new AdmZip(req.file.buffer);
        zip.extractAllTo(extractDir, true);
      
        // enumerate files and compute hashes
        const entries = zip.getEntries();
        const files: { path: string; hash: string; size: number }[] = [];
        const changed: string[] = [];
        const changedFiles: { path: string; data: string; size: number }[] = [];
      
        for (const entry of entries) {
          if (entry.isDirectory) continue;
          const rel = entry.entryName.replace(/^\/+/, '');
          if (isIgnoredPath(rel)) continue;
          const data = entry.getData();
          const hash = createHash('sha256').update(data).digest('hex');
          files.push({ path: rel, hash, size: data.length });
          const clientHash = clientHashes[rel];
          if (!clientHash || clientHash !== hash) {
            changed.push(rel);
            changedFiles.push({ path: rel, data: data.toString('base64'), size: data.length });
          }
        }
      
        // save manifest
        const manifest = { sessionId, files, extractedAt: Date.now() };
        await fs.writeFile(path.join(extractDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      
        res.json({ sessionId, files, changed, changedFiles, zipPath, extractDir });
      } catch (error: any) {
        console.error('Repo upload error:', error);
        res.status(500).json({ error: error.message || 'Failed to upload repo' });
      }
    });
}
