import { type NextFunction, type Request, type Response } from 'express';

export function json(res: Response, statusCode: number, payload: unknown) {
  res.status(statusCode).json(payload);
}

export function isSameOrigin(req: Request) {
  const origin = req.headers.origin || req.headers.referer || '';
  const host = req.headers.host || '';
  if (!origin) return true;

  try {
    const parsed = new URL(origin);
    return parsed.host === host || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

export function createVerifyApiAuth(devToken: string) {
  return function verifyApiAuth(req: Request, res: Response, next: NextFunction) {
    if (isSameOrigin(req)) {
      next();
      return;
    }

    const headerToken = req.header('x-repoview-token') || req.header('x-dev-token');
    const queryToken = typeof req.query.repoview_token === 'string' ? req.query.repoview_token : '';
    if (headerToken === devToken || queryToken === devToken) {
      next();
      return;
    }

    json(res, 401, { error: 'Unauthorized' });
  };
}
