/**
 * Production server: the built site from dist/ plus the account API.
 *   npm run build && npm start
 * PORT (default 3000), HOST (default 0.0.0.0) and BIOMEDIX_DATA_DIR (default ./data).
 * Set BIOMEDIX_APP_URL (the public https:// address) and BIOMEDIX_MAIL_WEBHOOK so
 * verification, reset and invitation emails go out. See README → Accounts.
 */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { apiMiddleware } from './api.ts';

const DIST = resolve('dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function fileFor(pathname: string): string | null {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  const full = join(DIST, rel);
  if (!full.startsWith(DIST)) return null;
  try {
    return statSync(full).isFile() ? full : null;
  } catch {
    return null;
  }
}

const api = apiMiddleware({ dev: process.env.BIOMEDIX_DEV === '1' });

const server = createServer((req, res) => {
  api(req, res, () => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.statusCode = 405;
      return res.end();
    }
    const { pathname } = new URL(req.url ?? '/', 'http://local');
    // Unknown paths are app routes: serve the single-page app.
    const file = fileFor(pathname) ?? join(DIST, 'index.html');
    res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (req.method === 'HEAD') return res.end();
    createReadStream(file)
      .on('error', () => {
        res.statusCode = 404;
        res.end('Not found');
      })
      .pipe(res);
  });
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
server.listen(port, host, () => console.log(`Biomedix running at http://localhost:${port}`));
