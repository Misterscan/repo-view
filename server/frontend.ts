import express, { type Express } from 'express';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';

export async function attachFrontend(opts: {
  isDev: boolean;
  rootDir: string;
  distDir: string;
  indexHtmlPath: string;
  app: Express;
  httpServer: any;
}) {
  const { isDev, rootDir, distDir, indexHtmlPath, app, httpServer } = opts;

  const frontendRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  });

  if (isDev) {
    const vite = await createViteServer({
      root: rootDir,
      appType: 'custom',
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
      },
    });

    app.use(vite.middlewares);

    app.use(frontendRateLimiter, async (req, res, next) => {
      if (req.originalUrl.startsWith('/api/')) {
        next();
        return;
      }

      try {
        const template = await vite.transformIndexHtml(req.originalUrl, readFileSync(indexHtmlPath, 'utf8'));
        res.status(200).setHeader('Content-Type', 'text/html').end(template);
      } catch (error: any) {
        vite.ssrFixStacktrace(error);
        next(error);
      }
    });

    return;
  }

  if (!existsSync(path.join(distDir, 'index.html'))) {
    throw new Error('Production build not found. Run `npm run build` first.');
  }

  app.use(express.static(distDir));
  app.get('*', frontendRateLimiter, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}
