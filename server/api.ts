/**
 * The Biomedix API, mounted at /api. Written as a Connect-style middleware so
 * the Vite dev and preview servers and the production server (server/start.ts)
 * all run the same code. Routes live in server/routes/.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { sessionUser, sweep } from './auth.ts';
import { checkOrigin, clientIp, HttpError, readBody, send, type Route } from './http.ts';
import { accountRoutes } from './routes/account.ts';
import { authRoutes } from './routes/auth.ts';
import { devRoutes } from './routes/dev.ts';
import { orgRoutes } from './routes/orgs.ts';
import { projectRoutes } from './routes/projects.ts';
import { staffRoutes } from './routes/staff.ts';

type Next = (err?: unknown) => void;

let warned = false;

/** Origin for links in emails. Set BIOMEDIX_APP_URL in production so links can't be pointed elsewhere by a forged Host header. */
function appUrl(req: IncomingMessage, dev: boolean) {
  const fixed = process.env.BIOMEDIX_APP_URL?.replace(/\/+$/, '');
  if (fixed) return fixed;
  if (!dev && !warned) {
    warned = true;
    console.warn('[api] BIOMEDIX_APP_URL is not set; email links use the request’s Host header.');
  }
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() || ('encrypted' in req.socket ? 'https' : 'http');
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost');
  return `${proto}://${host}`;
}

export function apiMiddleware({ dev = false }: { dev?: boolean } = {}) {
  const routes: Route[] = [...authRoutes, ...accountRoutes, ...orgRoutes, ...projectRoutes, ...staffRoutes, ...(dev ? devRoutes : [])];
  let swept = false;

  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') return next();
    const path = url.pathname.slice(4) || '/';
    try {
      if (!swept) {
        swept = true;
        sweep();
        setInterval(sweep, 60 * 60_000).unref();
      }
      checkOrigin(req);
      const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req);
      let pathMatched = false;
      for (const r of routes) {
        const m = path.match(r.re);
        if (!m) continue;
        pathMatched = true;
        if (r.method !== req.method) continue;
        const session = sessionUser(req);
        if (r.auth === 'user' && !session) throw new HttpError(401, 'Sign in to continue.', 'signed_out');
        const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
        const out = await r.handler({
          req,
          res,
          params,
          query: url.searchParams,
          body,
          user: session?.user ?? null,
          sessionId: session?.sessionId ?? null,
          ip: clientIp(req),
          dev,
          appUrl: appUrl(req, dev),
        });
        return send(res, r.status, out);
      }
      throw pathMatched ? new HttpError(405, 'Method not allowed.') : new HttpError(404, 'Not found.');
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message, ...(err.code ? { code: err.code } : {}) });
      console.error('[api]', err);
      return send(res, 500, { error: 'Something went wrong on our side. Try again.' });
    }
  };
}
