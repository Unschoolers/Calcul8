import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createLocalJWKSet, jwtVerify } from 'jose';

export const DEV = Object.freeze({
  issuer: 'https://whatfees.ca.auth0.com/',
  jwksUri: 'https://whatfees.ca.auth0.com/.well-known/jwks.json',
  clientId: 'iJ91FR4M6AIgD8P68qPQ8Zpo3BgO8Qhe',
  callbackUrl: 'http://127.0.0.1:8787/callback',
});
const fail = () => new Error('OAuth login check failed.');
const random = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('base64url');
const MAX_BODY = 65536;
const MAX_URL = 8192;

async function jsonRequest(fetchImpl, url, init, signal) {
  const controller = new AbortController();
  let timer;
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const aborted = new Promise((_, reject) => {
    if (controller.signal.aborted) reject(fail());
    else controller.signal.addEventListener('abort', () => reject(fail()), { once: true });
  });
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(fail()); }, 10000);
  });
  try {
    return await Promise.race([(async () => {
      const response = await fetchImpl(url, { ...init, redirect: 'error', signal: controller.signal });
      if (!response.ok || !response.body) throw fail();
      const reader = response.body.getReader();
      const chunks = []; let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > MAX_BODY) { await reader.cancel(); throw fail(); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      return JSON.parse(Buffer.concat(chunks.map(x => Buffer.from(x))).toString('utf8'));
    })(), timeout, aborted]);
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); controller.abort(); }
}

function parseCallback(callbackUrl, state) {
  if (typeof callbackUrl !== 'string' || callbackUrl.length > MAX_URL || callbackUrl.includes('#') || /%(?![\da-fA-F]{2})/.test(callbackUrl)) throw fail();
  const callback = new URL(callbackUrl);
  if (callback.href !== callbackUrl || callback.origin + callback.pathname !== DEV.callbackUrl || callback.username || callback.password) throw fail();
  const seen = new Set();
  for (const [key] of callback.searchParams) { if (seen.has(key)) throw fail(); seen.add(key); }
  if (callback.searchParams.get('state') !== state || callback.searchParams.get('iss') !== DEV.issuer) throw fail();
  const code = callback.searchParams.get('code'), error = callback.searchParams.get('error');
  if ((callback.searchParams.has('code') && callback.searchParams.has('error')) || (!code && !error)) throw fail();
  return { code, error };
}

export function createPkceAttempt({ fetchImpl = globalThis.fetch, now = Date.now, signal } = {}) {
  const verifier = random(), state = random(), nonce = random();
  const deadline = now() + 300000;
  let consumed = false;
  const checkLifetime = () => { if (signal?.aborted || now() >= deadline) throw fail(); };
  const authorization = new URL('authorize', DEV.issuer);
  authorization.search = new URLSearchParams({ client_id: DEV.clientId, redirect_uri: DEV.callbackUrl,
    response_type: 'code', response_mode: 'query', scope: 'openid', state, nonce,
    code_challenge: hash(verifier), code_challenge_method: 'S256' });
  async function finish(callbackUrl) {
    try {
      checkLifetime();
      if (consumed) throw fail();
      const { code, error } = parseCallback(callbackUrl, state);
      consumed = true;
      if (error) throw fail();
      const token = await jsonRequest(fetchImpl, `${DEV.issuer}oauth/token`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'authorization_code', client_id: DEV.clientId, redirect_uri: DEV.callbackUrl, code, code_verifier: verifier }).toString(),
      }, signal);
      checkLifetime();
      if (!token || typeof token !== 'object' || typeof token.id_token !== 'string' || !token.id_token || Object.hasOwn(token, 'refresh_token')) throw fail();
      const jwks = await jsonRequest(fetchImpl, DEV.jwksUri, {}, signal);
      checkLifetime();
      const current = now() / 1000;
      const { payload } = await jwtVerify(token.id_token, createLocalJWKSet(jwks), { algorithms: ['RS256'], issuer: DEV.issuer, audience: DEV.clientId, currentDate: new Date(current * 1000), clockTolerance: 0 });
      if (payload.aud !== DEV.clientId || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255 ||
        !Number.isFinite(payload.iat) || !Number.isFinite(payload.exp) || payload.iat >= payload.exp ||
        payload.iat > current + 30 || payload.iat < current - 330 || payload.exp <= current || payload.nonce !== nonce ||
        (payload.azp !== undefined && payload.azp !== DEV.clientId)) throw fail();
      if (payload.at_hash !== undefined) {
        if (typeof token.access_token !== 'string' || !token.access_token || typeof payload.at_hash !== 'string') throw fail();
        const expected = createHash('sha256').update(token.access_token).digest().subarray(0, 16).toString('base64url');
        const a = Buffer.from(expected), b = Buffer.from(payload.at_hash);
        if (a.length !== b.length || !timingSafeEqual(a, b)) throw fail();
      }
      checkLifetime();
      return Object.freeze({ status: 'pkce_login_verified', activationReady: false });
    } catch { throw fail(); }
  }
  return Object.freeze({ authorizationUrl: authorization.href, finish });
}

export async function runProbe({ fetchImpl = globalThis.fetch, now = Date.now, signal,
  onAuthorization = value => console.log(value), onResult = value => console.log(JSON.stringify(value)),
  onFailure = () => console.error('OAuth login check failed.') } = {}) {
  const lifetime = new AbortController();
  const attempt = createPkceAttempt({ fetchImpl, now, signal: lifetime.signal });
  const sockets = new Set();
  let done = false, stopped = false, timer;
  let resolveClosed;
  const closed = new Promise(resolve => { resolveClosed = resolve; });
  const server = createServer(async (req, res) => {
    if (done || req.method !== 'GET' || req.rawHeaders.filter((_, i) => i % 2 === 0 && req.rawHeaders[i].toLowerCase() === 'host').length !== 1 || req.headers.host !== '127.0.0.1:8787' || typeof req.url !== 'string' || req.url.length > MAX_URL || !req.url.startsWith('/callback?')) {
      res.writeHead(400, { 'content-type': 'text/plain', connection: 'close' }); res.end('Invalid request.'); return;
    }
    const callbackUrl = `http://127.0.0.1:8787${req.url}`;
    const expected = new URL(attempt.authorizationUrl).searchParams.get('state');
    try { parseCallback(callbackUrl, expected); }
    catch { res.writeHead(400, { connection: 'close' }); res.end('Invalid request.'); return; }
    done = true;
    try {
      const result = await attempt.finish(callbackUrl);
      if (stopped) return;
      res.writeHead(200, { 'content-type': 'text/plain', connection: 'close' }); res.end('Login verified.');
      onResult(result);
      shutdown();
    } catch {
      if (stopped) return;
      res.writeHead(400, { 'content-type': 'text/plain', connection: 'close' }); res.end('Login check failed.');
      onFailure(); shutdown();
    }
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  function shutdown() {
    if (stopped) return;
    stopped = true; done = true;
    clearTimeout(timer); signal?.removeEventListener('abort', interrupt);
    lifetime.abort();
    server.close(resolveClosed); server.closeIdleConnections();
    setTimeout(() => { for (const socket of sockets) socket.destroy(); }, 1000).unref();
  }
  function interrupt() { if (!stopped) { onFailure(); shutdown(); } }
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(8787, '127.0.0.1', resolve); });
  signal?.addEventListener('abort', interrupt, { once: true });
  if (signal?.aborted) interrupt();
  if (!stopped) {
    timer = setTimeout(interrupt, 300000);
    onAuthorization(attempt.authorizationUrl);
  }
  await closed;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') { console.log('Usage: node check-external-oauth-login.mjs'); return; }
  if (args.length) throw fail();
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  try {
    await runProbe({ signal: controller.signal, onFailure: () => { console.error('OAuth login check failed.'); process.exitCode = 1; } });
  } finally { process.removeListener('SIGINT', interrupt); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(() => { console.error('OAuth login check failed.'); process.exitCode = 1; });
