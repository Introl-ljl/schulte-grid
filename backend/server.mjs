import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { closeSql, getSql } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import * as users from './routes/users.mjs';
import * as session from './routes/session.mjs';
import * as leaderboard from './routes/leaderboard.mjs';
import * as runsStart from './routes/runs-start.mjs';
import * as runsFinish from './routes/runs-finish.mjs';

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_BACKEND_URL = process.env.PUBLIC_BACKEND_URL || 'https://schulte.introl.me';
const routes = new Map([
  ['/api/users', users],
  ['/api/session', session],
  ['/api/leaderboard', leaderboard],
  ['/api/runs/start', runsStart],
  ['/api/runs/finish', runsFinish]
]);

if (!process.env.PROXY_SECRET) throw new Error('PROXY_SECRET is not configured');
await migrate();

const server = createServer(async (incoming, outgoing) => {
  const startedAt = Date.now();
  const url = new URL(incoming.url || '/', PUBLIC_BACKEND_URL);
  try {
    if (url.pathname === '/healthz' && incoming.method === 'GET') {
      await getSql()`SELECT 1 AS healthy`;
      return send(outgoing, Response.json({ ok: true, service: 'schulte-api' }, { headers: { 'Cache-Control': 'no-store' } }), startedAt, incoming.method, url.pathname);
    }
    const route = routes.get(url.pathname);
    const handler = route?.[incoming.method || ''];
    if (!handler) {
      const status = route ? 405 : 404;
      return send(outgoing, Response.json({ error: status === 405 ? '请求方法不支持' : '接口不存在' }, { status }), startedAt, incoming.method, url.pathname);
    }
    if (!validProxySecret(incoming.headers['x-schulte-proxy-secret'])) {
      return send(outgoing, Response.json({ error: 'Unauthorized', code: 'INVALID_PROXY' }, { status: 401 }), startedAt, incoming.method, url.pathname);
    }
    const body = ['GET', 'HEAD'].includes(incoming.method || '') ? undefined : await readBody(incoming);
    const request = new Request(url, {
      method: incoming.method,
      headers: incoming.headers,
      body
    });
    const response = await handler(request);
    return send(outgoing, response, startedAt, incoming.method, url.pathname);
  } catch (error) {
    console.error('Backend request failed', { method: incoming.method, path: url.pathname, error });
    return send(outgoing, Response.json({ error: '服务器暂时不可用', code: 'INTERNAL_ERROR' }, { status: 500 }), startedAt, incoming.method, url.pathname);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Schulte API listening on 0.0.0.0:${PORT}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, async () => {
    server.close();
    await closeSql();
    process.exit(0);
  });
}

function validProxySecret(value) {
  if (typeof value !== 'string') return false;
  const actual = Buffer.from(value);
  const expected = Buffer.from(process.env.PROXY_SECRET);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 128 * 1024) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function send(outgoing, response, startedAt, method, path) {
  outgoing.statusCode = response.status;
  const setCookies = response.headers.getSetCookie?.() || [];
  for (const [name, value] of response.headers) {
    if (name.toLowerCase() !== 'set-cookie') outgoing.setHeader(name, value);
  }
  if (setCookies.length) outgoing.setHeader('Set-Cookie', setCookies);
  outgoing.end(Buffer.from(await response.arrayBuffer()));
  if (path !== '/healthz') console.log(JSON.stringify({ method, path, status: response.status, durationMs: Date.now() - startedAt }));
}
