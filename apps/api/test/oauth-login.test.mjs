import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { DEV, createPkceAttempt } from '../scripts/check-external-oauth-login.mjs';

const now = 2000000000000;
let keys, jwks;
before(async () => {
  keys = await generateKeyPair('RS256');
  jwks = { keys: [{ ...await exportJWK(keys.publicKey), kid: 'test', alg: 'RS256' }] };
});
function fixture(claims = {}, response = {}) {
  let url, count = 0;
  const attempt = createPkceAttempt({ now: () => now, fetchImpl: async (endpoint) => {
    count++;
    if (endpoint === DEV.jwksUri) return Response.json(jwks);
    const token = await new SignJWT({ sub: 'test', nonce: url.searchParams.get('nonce'), ...claims })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(DEV.issuer)
      .setAudience(DEV.clientId).setIssuedAt(now / 1000).setExpirationTime(now / 1000 + 60).sign(keys.privateKey);
    return Response.json({ id_token: token, access_token: 'access', ...response });
  } });
  url = new URL(attempt.authorizationUrl);
  const callback = new URL(DEV.callbackUrl);
  callback.search = new URLSearchParams({ state: url.searchParams.get('state'), iss: DEV.issuer, code: 'private-code' });
  return { attempt, callback, calls: () => count };
}
const failure = action => assert.rejects(action, { message: 'OAuth login check failed.' });

test('valid signed identity is returned once without claims', async () => {
  const { attempt, callback, calls } = fixture();
  const results = await Promise.allSettled([attempt.finish(callback.href), attempt.finish(callback.href)]);
  assert.deepEqual(results.filter(x => x.status === 'fulfilled').map(x => x.value), [{ status: 'pkce_login_verified', activationReady: false }]);
  assert.equal(calls(), 2);
});

test('invalid callback does not exchange a code', async () => {
  for (const change of [u => u.searchParams.append('state', 'other'), u => { u.hash = '#x'; }, u => u.searchParams.delete('iss'), u => u.searchParams.set('state', 'wrong')]) {
    const { attempt, callback, calls } = fixture(); change(callback);
    await failure(() => attempt.finish(callback.href)); assert.equal(calls(), 0);
  }
});

test('rejects signed invalid nonce, unexpected refresh and oversized body', async () => {
  for (const [claims, response] of [[{ nonce: 'wrong' }, {}], [{}, { refresh_token: 'secret' }], [{}, { padding: 'x'.repeat(70000) }]]) {
    const { attempt, callback } = fixture(claims, response);
    await failure(() => attempt.finish(callback.href));
    await failure(() => attempt.finish(callback.href));
  }
});

test('CLI rejects arguments and handles a loopback provider denial without leaking it', async () => {
  const script = new URL('../scripts/check-external-oauth-login.mjs', import.meta.url).pathname;
  const invalid = spawn(process.execPath, [script, '--bad']);
  let invalidOutput = ''; invalid.stdout.on('data', d => invalidOutput += d); invalid.stderr.on('data', d => invalidOutput += d);
  assert.notEqual(await new Promise(r => invalid.on('close', r)), 0);
  assert.doesNotMatch(invalidOutput, /--bad/);
  const child = spawn(process.execPath, [script]);
  let output = ''; child.stderr.on('data', d => output += d);
  const auth = await new Promise((resolve, reject) => {
    child.stdout.on('data', d => { output += d; const line = output.split('\n').find(x => x.startsWith('https://')); if (line) resolve(new URL(line)); });
    child.on('error', reject); child.on('exit', code => reject(new Error(`early exit ${code}`)));
  });
  const callback = new URL(DEV.callbackUrl);
  callback.search = new URLSearchParams({ state: auth.searchParams.get('state'), iss: DEV.issuer, error: 'private-denial' });
  const result = await fetch(callback);
  assert.equal(result.status, 400);
  assert.notEqual(await new Promise(r => child.on('close', r)), 0);
  assert.doesNotMatch(output, /private-denial/);
  await assert.rejects(fetch(DEV.callbackUrl));
});

test('rejects invalid signature and access token hash', async () => {
  const wrong = await generateKeyPair('RS256');
  for (const mode of ['signature', 'hash']) {
    let request;
    const attempt = createPkceAttempt({ now: () => now, fetchImpl: async url => {
      if (url === DEV.jwksUri) return Response.json(jwks);
      const token = await new SignJWT({ sub: 'subject', nonce: request.searchParams.get('nonce'), ...(mode === 'hash' ? { at_hash: 'wrong' } : {}) })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(DEV.issuer).setAudience(DEV.clientId)
        .setIssuedAt(now / 1000).setExpirationTime(now / 1000 + 60).sign(mode === 'signature' ? wrong.privateKey : keys.privateKey);
      return Response.json({ id_token: token, access_token: 'access' });
    } });
    request = new URL(attempt.authorizationUrl);
    const callback = new URL(DEV.callbackUrl);
    callback.search = new URLSearchParams({ state: request.searchParams.get('state'), iss: DEV.issuer, code: 'code' });
    await failure(() => attempt.finish(callback.href));
  }
});

test('network failure is redacted and consumes the matching callback', async () => {
  let calls = 0;
  const attempt = createPkceAttempt({ fetchImpl: async () => { calls++; throw new Error('private network detail'); } });
  const request = new URL(attempt.authorizationUrl);
  const callback = new URL(DEV.callbackUrl);
  callback.search = new URLSearchParams({ state: request.searchParams.get('state'), iss: DEV.issuer, code: 'code' });
  await failure(() => attempt.finish(callback.href));
  await failure(() => attempt.finish(callback.href));
  assert.equal(calls, 1);
});

test('a stalled network request times out and remains consumed', { timeout: 12000 }, async () => {
  const attempt = createPkceAttempt({ fetchImpl: () => new Promise(() => {}) });
  const request = new URL(attempt.authorizationUrl), callback = new URL(DEV.callbackUrl);
  callback.search = new URLSearchParams({ state: request.searchParams.get('state'), iss: DEV.issuer, code: 'code' });
  await failure(() => attempt.finish(callback.href));
  await failure(() => attempt.finish(callback.href));
});

test('mixed code and empty error is rejected before any exchange', async () => {
  const { attempt, callback, calls } = fixture();
  callback.searchParams.set('error', '');
  await failure(() => attempt.finish(callback.href));
  assert.equal(calls(), 0);
});

test('equal future iat and exp is rejected', async () => {
  let request;
  const attempt = createPkceAttempt({ now: () => now, fetchImpl: async url => {
    if (url === DEV.jwksUri) return Response.json(jwks);
    const token = await new SignJWT({ sub: 'subject', nonce: request.searchParams.get('nonce') })
      .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(DEV.issuer).setAudience(DEV.clientId)
      .setIssuedAt(now / 1000 + 10).setExpirationTime(now / 1000 + 10).sign(keys.privateKey);
    return Response.json({ id_token: token });
  } });
  request = new URL(attempt.authorizationUrl);
  const callback = new URL(DEV.callbackUrl);
  callback.search = new URLSearchParams({ state: request.searchParams.get('state'), iss: DEV.issuer, code: 'code' });
  await failure(() => attempt.finish(callback.href));
});

test('abort signal cancels a stalled exchange and deadline is rechecked after network', { timeout: 2000 }, async () => {
  for (const mode of ['abort', 'deadline']) {
    let current = now, release, networkSignal;
    const abort = new AbortController();
    const attempt = createPkceAttempt({ now: () => current, signal: abort.signal, fetchImpl: (_url, init) => {
      networkSignal = init.signal;
      return new Promise(resolve => { release = resolve; });
    } });
    const request = new URL(attempt.authorizationUrl), callback = new URL(DEV.callbackUrl);
    callback.search = new URLSearchParams({ state: request.searchParams.get('state'), iss: DEV.issuer, code: 'code' });
    const result = attempt.finish(callback.href);
    if (mode === 'abort') {
      abort.abort();
      await failure(() => result);
      assert.equal(networkSignal.aborted, true);
    } else {
      current += 300000;
      release(Response.json({ id_token: 'bad' }));
      await failure(() => result);
    }
  }
});


test('production listener succeeds with a signed identity and closes', async () => {
  const { runProbe } = await import('../scripts/check-external-oauth-login.mjs');
  let authorization, resolveAuth, output;
  const ready = new Promise(resolve => { resolveAuth = resolve; });
  const run = runProbe({ now: () => now, onAuthorization: value => { authorization = new URL(value); resolveAuth(); },
    onResult: value => { output = value; }, onFailure: () => {}, fetchImpl: async url => {
      if (url === DEV.jwksUri) return Response.json(jwks);
      const token = await new SignJWT({ sub: 'subject', nonce: authorization.searchParams.get('nonce') })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(DEV.issuer).setAudience(DEV.clientId)
        .setIssuedAt(now / 1000).setExpirationTime(now / 1000 + 60).sign(keys.privateKey);
      return Response.json({ id_token: token });
    } });
  await ready;
  const callback = new URL(DEV.callbackUrl);
  callback.search = new URLSearchParams({ state: authorization.searchParams.get('state'), iss: DEV.issuer, code: 'code' });
  const response = await fetch(callback, { headers: { connection: 'close' } });
  assert.equal(response.status, 200);
  await run;
  assert.deepEqual(output, { status: 'pkce_login_verified', activationReady: false });
  await assert.rejects(fetch(DEV.callbackUrl));
});

test('production listener aborts stalled exchange and closes without success', async () => {
  const { runProbe } = await import('../scripts/check-external-oauth-login.mjs');
  const abort = new AbortController(); let authorization, resolveAuth, entered, resolveEntered, networkSignal, results = 0;
  const ready = new Promise(resolve => { resolveAuth = resolve; });
  entered = new Promise(resolve => { resolveEntered = resolve; });
  const run = runProbe({ signal: abort.signal, onAuthorization: value => { authorization = new URL(value); resolveAuth(); },
    onResult: () => { results++; }, onFailure: () => {}, fetchImpl: (_url, init) => {
      networkSignal = init.signal; resolveEntered(); return new Promise(() => {});
    } });
  await ready;
  const callback = new URL(DEV.callbackUrl);
  callback.search = new URLSearchParams({ state: authorization.searchParams.get('state'), iss: DEV.issuer, code: 'code' });
  const request = fetch(callback).catch(() => null);
  await entered; abort.abort(); await run; await request;
  assert.equal(networkSignal.aborted, true); assert.equal(results, 0);
  await assert.rejects(fetch(DEV.callbackUrl));
});


test('production listener rejects a deadline reached during exchange and closes', async () => {
  const { runProbe } = await import('../scripts/check-external-oauth-login.mjs');
  let current = now, authorization, resolveAuth, release, resolveEntered, results = 0, failures = 0;
  const ready = new Promise(resolve => { resolveAuth = resolve; });
  const entered = new Promise(resolve => { resolveEntered = resolve; });
  const run = runProbe({ now: () => current, onAuthorization: value => { authorization = new URL(value); resolveAuth(); },
    onResult: () => { results++; }, onFailure: () => { failures++; }, fetchImpl: url => {
      if (url === DEV.jwksUri) return Promise.resolve(Response.json(jwks));
      resolveEntered(); return new Promise(resolve => { release = resolve; });
    } });
  await ready;
  const callback = new URL(DEV.callbackUrl);
  callback.search = new URLSearchParams({ state: authorization.searchParams.get('state'), iss: DEV.issuer, code: 'code' });
  const responsePromise = fetch(callback, { headers: { connection: 'close' } });
  await entered;
  const token = await new SignJWT({ sub: 'subject', nonce: authorization.searchParams.get('nonce') })
    .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(DEV.issuer).setAudience(DEV.clientId)
    .setIssuedAt(now / 1000).setExpirationTime(now / 1000 + 600).sign(keys.privateKey);
  current += 300000; release(Response.json({ id_token: token }));
  const response = await responsePromise;
  assert.equal(response.status, 400); await run;
  assert.equal(results, 0); assert.equal(failures, 1);
  await assert.rejects(fetch(DEV.callbackUrl));
});

test('production deadline aborts a stalled network exchange and closes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { runProbe } = await import('../scripts/check-external-oauth-login.mjs');
  let authorization, resolveAuth, resolveEntered, networkSignal, results = 0;
  const ready = new Promise(resolve => { resolveAuth = resolve; });
  const entered = new Promise(resolve => { resolveEntered = resolve; });
  const run = runProbe({ onAuthorization: value => { authorization = new URL(value); resolveAuth(); },
    onResult: () => { results++; }, onFailure: () => {}, fetchImpl: (_url, init) => {
      networkSignal = init.signal; resolveEntered(); return new Promise(() => {});
    } });
  await ready;
  t.mock.timers.tick(299000);
  const callback = new URL(DEV.callbackUrl);
  callback.search = new URLSearchParams({ state: authorization.searchParams.get('state'), iss: DEV.issuer, code: 'code' });
  const request = fetch(callback).catch(() => null);
  await entered;
  t.mock.timers.tick(1000);
  t.mock.timers.tick(1000);
  await run; await request;
  assert.equal(networkSignal.aborted, true); assert.equal(results, 0);
  await assert.rejects(fetch(DEV.callbackUrl));
});

test('CLI SIGINT closes its listener and reports failure', async () => {
  const script = new URL('../scripts/check-external-oauth-login.mjs', import.meta.url).pathname;
  const child = spawn(process.execPath, [script]);
  let output = '';
  child.stderr.on('data', data => { output += data; });
  await new Promise((resolve, reject) => {
    child.stdout.once('data', resolve); child.once('error', reject);
    child.once('exit', code => reject(new Error(`early exit ${code}`)));
  });
  child.kill('SIGINT');
  assert.notEqual(await new Promise(resolve => child.once('close', resolve)), 0);
  assert.match(output, /OAuth login check failed\./);
  await assert.rejects(fetch(DEV.callbackUrl));
});

test('empty fragment delimiter is rejected before exchange', async () => {
  const { attempt, callback, calls } = fixture();
  await failure(() => attempt.finish(`${callback.href}#`));
  assert.equal(calls(), 0);
});

test('production listener ignores malformed matching callbacks then accepts the valid callback', async () => {
  const { runProbe } = await import('../scripts/check-external-oauth-login.mjs');
  let authorization, resolveAuth, calls = 0, result;
  const ready = new Promise(resolve => { resolveAuth = resolve; });
  const run = runProbe({ now: () => now, onAuthorization: value => { authorization = new URL(value); resolveAuth(); },
    onResult: value => { result = value; }, onFailure: () => {}, fetchImpl: async url => {
      calls++;
      if (url === DEV.jwksUri) return Response.json(jwks);
      const token = await new SignJWT({ sub: 'subject', nonce: authorization.searchParams.get('nonce') })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' }).setIssuer(DEV.issuer).setAudience(DEV.clientId)
        .setIssuedAt(now / 1000).setExpirationTime(now / 1000 + 60).sign(keys.privateKey);
      return Response.json({ id_token: token });
    } });
  await ready;
  const callback = new URL(DEV.callbackUrl);
  callback.search = new URLSearchParams({ state: authorization.searchParams.get('state'), iss: DEV.issuer });
  const missing = await fetch(callback, { headers: { connection: 'close' } });
  assert.equal(missing.status, 400);
  const duplicate = new URL(callback);
  duplicate.searchParams.append('code', 'one'); duplicate.searchParams.append('code', 'two');
  const invalid = await fetch(duplicate, { headers: { connection: 'close' } });
  assert.equal(invalid.status, 400); assert.equal(calls, 0);
  callback.searchParams.set('code', 'valid');
  const valid = await fetch(callback, { headers: { connection: 'close' } });
  assert.equal(valid.status, 200); await run;
  assert.deepEqual(result, { status: 'pkce_login_verified', activationReady: false });
  assert.equal(calls, 2);
  await assert.rejects(fetch(DEV.callbackUrl));
});
