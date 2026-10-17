import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const AUTH = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const MAX_BODY = 32_768;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

const base64url = (bytes) => Buffer.from(bytes).toString('base64url');
const random = () => base64url(randomBytes(32));
const equal = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function readJSON(request) {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new HttpError(415, 'JSON required');
  }
  let text = '';
  for await (const chunk of request) {
    text += chunk;
    if (text.length > MAX_BODY) throw new HttpError(413, 'Request too large');
  }
  try {
    return JSON.parse(text || '{}');
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJSON(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}

async function readOAuthJSON(fetcher, url, init) {
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new HttpError(response.status === 400 ? 401 : 502, data.error || 'OpenAI request failed');
  }
  return data;
}

function tokenForm(fields) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  };
}

function withTokens(account, token) {
  if (token.token_type?.toLowerCase() !== 'bearer' || !token.access_token || !token.refresh_token) {
    throw new HttpError(502, 'Incomplete token response');
  }
  const scopes = token.scope ? String(token.scope).split(/\s+/) : account.scopes || [];
  if (!scopes.includes('chatgpt.tokens.use.direct')) {
    throw new HttpError(403, 'ChatGPT plan use was not granted');
  }
  return {
    ...account,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    idToken: token.id_token || account.idToken,
    scopes,
    expiresAt: Date.now() + Math.max(0, Number(token.expires_in) || 0) * 1000,
  };
}

function outputFromCompleted(response) {
  return (response?.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === 'output_text')
    .map((item) => item.text || '')
    .join('');
}

/** Consume the terminal event. A partial stream must never become a decision. */
export async function readCompletedResponse(body) {
  if (!body) throw new HttpError(502, 'Empty inference stream');
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let completed = false;
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    if (buffer.length > 2_000_000) throw new HttpError(502, 'Inference stream too large');
    let boundary;
    while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary).replace(/^\r?\n\r?\n/, '');
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data || data === '[DONE]') continue;
      let event;
      try {
        event = JSON.parse(data);
      } catch {
        throw new HttpError(502, 'Invalid inference event');
      }
      if (event.type === 'response.output_text.delta') text += event.delta || '';
      if (text.length > 32_768) throw new HttpError(502, 'Inference output too large');
      if (
        event.type === 'response.failed' ||
        event.type === 'response.incomplete' ||
        event.type === 'error'
      ) {
        throw new HttpError(502, event.response?.error?.code || event.error?.code || event.type);
      }
      if (event.type === 'response.completed') {
        completed = true;
        text = outputFromCompleted(event.response) || text;
      }
    }
  }
  if (!completed) throw new HttpError(502, 'Inference stream ended before completion');
  return text;
}

/** Only callable from the loopback app. The injected store makes auth tests credential-free. */
export function createChatGPTLocalServer({
  port = 3001,
  dist = resolve('dist'),
  credentialStore,
  fetcher = fetch,
  verifyIdToken,
} = {}) {
  if (!credentialStore) throw new Error('A protected credential store is required');
  const origin = `http://127.0.0.1:${port}`;
  const callback = `${origin}/auth/callback`;
  const jwks = createRemoteJWKSet(new URL('https://auth.openai.com/.well-known/jwks.json'));
  const verify =
    verifyIdToken ||
    ((token, clientId, nonce) =>
      jwtVerify(token, jwks, { issuer: AUTH, audience: clientId }).then(({ payload }) => {
        if (!equal(payload.nonce, nonce) || !payload.sub)
          throw new HttpError(401, 'Invalid identity token');
        return payload;
      }));
  let db;
  let pending = null;
  let configEpoch = 0;
  const refreshPromises = new Map();
  const signingOut = new Set();

  const save = async () => credentialStore.save(db);
  const active = () => db.accounts.find((account) => account.clientId === db.activeId);
  const publicStatus = () => ({
    available: true,
    activeId: db.activeId,
    accounts: db.accounts.map((account) => ({
      id: account.clientId,
      email: account.email,
      signedIn: Boolean(account.refreshToken),
      model: account.model || null,
    })),
  });

  async function accessToken(account = active(), forceRefresh = false) {
    account = db.accounts.find((item) => item.clientId === account?.clientId);
    if (
      !account?.refreshToken ||
      signingOut.has(account.clientId) ||
      !account.scopes?.includes('chatgpt.tokens.use.direct')
    ) {
      throw new HttpError(401, 'Sign in with ChatGPT to use this backend');
    }
    if (!forceRefresh && account.expiresAt > Date.now() + 60_000) return account.accessToken;
    if (!refreshPromises.has(account.clientId)) {
      const renewal = (async () => {
        try {
          const token = await readOAuthJSON(
            fetcher,
            `${AUTH}/api/accounts/oauth/token`,
            tokenForm({
              grant_type: 'refresh_token',
              client_id: account.clientId,
              refresh_token: account.refreshToken,
              resource: RESOURCE,
            })
          );
          const updated = withTokens(account, token);
          db.accounts = db.accounts.map((item) =>
            item.clientId === account.clientId ? updated : item
          );
          await save();
          return updated.accessToken;
        } catch (error) {
          if (error.message === 'invalid_grant') {
            const stored = db.accounts.find((item) => item.clientId === account.clientId);
            if (stored) {
              delete stored.accessToken;
              delete stored.refreshToken;
              delete stored.idToken;
              delete stored.scopes;
              delete stored.expiresAt;
            }
            if (db.activeId === account.clientId) db.activeId = null;
            configEpoch++;
            await save();
          }
          throw error;
        }
      })().finally(() => refreshPromises.delete(account.clientId));
      refreshPromises.set(account.clientId, renewal);
    }
    return refreshPromises.get(account.clientId);
  }

  async function models(account = active()) {
    const requestModels = (access) =>
      fetcher(`${RESOURCE}/models`, {
        headers: { Authorization: `Bearer ${access}` },
        signal: AbortSignal.timeout(20_000),
      });
    let response = await requestModels(await accessToken(account));
    if (response.status === 401) response = await requestModels(await accessToken(account, true));
    if (!response.ok) throw new HttpError(502, `Model catalog unavailable (${response.status})`);
    if (db.activeId !== account.clientId || signingOut.has(account.clientId)) {
      throw new HttpError(409, 'Active ChatGPT account changed');
    }
    const data = await response.json();
    return (Array.isArray(data.models) ? data.models : [])
      .filter((model) => model.visibility === 'list' && typeof model.slug === 'string')
      .map((model) => ({ slug: model.slug, name: model.display_name || model.slug }));
  }

  async function handle(request, response) {
    if (request.headers.host !== `127.0.0.1:${port}`) throw new HttpError(403, 'Invalid host');
    const url = new URL(request.url, origin);
    if (request.method === 'POST' && request.headers.origin !== origin)
      throw new HttpError(403, 'Invalid origin');
    if (url.pathname.startsWith('/api/') && request.method === 'GET') {
      // No API response may be cached, including by the MillOS service worker.
      response.setHeader('Cache-Control', 'no-store');
    }

    if (url.pathname === '/api/chatgpt/status' && request.method === 'GET') {
      return sendJSON(response, 200, publicStatus());
    }
    if (url.pathname === '/api/chatgpt/start' && request.method === 'POST') {
      const input = await readJSON(request);
      if (pending && Date.now() > pending.expiresAt) pending = null;
      if (pending) throw new HttpError(409, 'A sign-in is already in progress');
      const selected = input.id
        ? db.accounts.find((account) => account.clientId === input.id)
        : null;
      if (input.id && !selected) throw new HttpError(404, 'Account not found');
      const state = random();
      const nonce = random();
      const verifier = random();
      pending = { state, nonce, verifier, selected, expiresAt: Date.now() + 300_000 };
      const authorize = new URL(`${AUTH}/api/accounts/authorize`);
      const params = {
        client_id: selected?.clientId || 'dynamic_agent_client',
        ext_agent_host_id: db.hostId,
        response_type: 'code',
        redirect_uri: callback,
        scope: SCOPES,
        resource: RESOURCE,
        state,
        nonce,
        code_challenge_method: 'S256',
        code_challenge: base64url(createHash('sha256').update(verifier).digest()),
      };
      if (selected) {
        if (selected.idToken) params.id_token_hint = selected.idToken;
        if (selected.email) params.login_hint = selected.email;
      } else params.agent_name_hint = 'MillOS';
      for (const [key, value] of Object.entries(params)) authorize.searchParams.set(key, value);
      // This URL may contain an ID-token hint. Never log it.
      return sendJSON(response, 200, { url: authorize.href });
    }
    if (url.pathname === '/auth/callback' && request.method === 'GET') {
      const attempt = pending;
      let message = 'ChatGPT sign-in did not complete.';
      let success = false;
      try {
        if (
          !attempt ||
          Date.now() > attempt.expiresAt ||
          !equal(url.searchParams.get('state'), attempt.state)
        ) {
          throw new HttpError(401, 'Invalid or expired sign-in state');
        }
        pending = null;
        if (url.searchParams.has('error'))
          throw new HttpError(401, 'ChatGPT authorization was declined');
        const code = url.searchParams.get('code');
        const returnedId = url.searchParams.get('client_id');
        const clientId = attempt.selected?.clientId || returnedId;
        if (
          !code ||
          !clientId ||
          clientId === 'dynamic_agent_client' ||
          (attempt.selected && returnedId && returnedId !== clientId)
        ) {
          throw new HttpError(401, 'Incomplete client registration');
        }
        const token = await readOAuthJSON(
          fetcher,
          `${AUTH}/api/accounts/oauth/token`,
          tokenForm({
            grant_type: 'authorization_code',
            client_id: clientId,
            code,
            code_verifier: attempt.verifier,
            redirect_uri: callback,
            resource: RESOURCE,
          })
        );
        if (!token.id_token) throw new HttpError(401, 'Identity token missing');
        const identity = await verify(token.id_token, clientId, attempt.nonce);
        if (!identity?.sub || (attempt.selected && identity.sub !== attempt.selected.subject)) {
          throw new HttpError(401, 'ChatGPT account did not match the selected registration');
        }
        const existing = db.accounts.find((item) => item.clientId === clientId);
        if (existing && existing.subject !== identity.sub)
          throw new HttpError(401, 'Client registration belongs to another account');
        const account = withTokens(
          {
            ...attempt.selected,
            clientId,
            subject: identity.sub,
            email: identity.email || attempt.selected?.email || '',
            model: attempt.selected?.model || null,
          },
          token
        );
        db.accounts = [...db.accounts.filter((item) => item.clientId !== clientId), account];
        db.activeId = clientId;
        configEpoch++;
        await save();
        message = 'Connected to ChatGPT. You can close this window.';
        success = true;
      } catch (error) {
        message = error instanceof HttpError ? error.message : 'ChatGPT sign-in failed.';
      }
      if (success) {
        response.writeHead(303, {
          Location: '/?chatgpt=connected',
          'Cache-Control': 'no-store',
          'Referrer-Policy': 'no-referrer',
        });
        response.end();
        return;
      }
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'",
        'Referrer-Policy': 'no-referrer',
      });
      const safeMessage = message
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
      response.end(
        `<!doctype html><title>MillOS ChatGPT sign-in</title><p>${safeMessage}</p><a href="/">Return to MillOS</a>`
      );
      return;
    }
    if (url.pathname === '/api/chatgpt/models' && request.method === 'GET') {
      return sendJSON(response, 200, { models: await models() });
    }
    if (url.pathname === '/api/chatgpt/model' && request.method === 'POST') {
      const { slug } = await readJSON(request);
      const account = active();
      const catalog = await models(account);
      if (!catalog.some((model) => model.slug === slug))
        throw new HttpError(400, 'Model is unavailable for this account');
      if (active()?.clientId !== account.clientId)
        throw new HttpError(409, 'Active ChatGPT account changed');
      account.model = slug;
      configEpoch++;
      await save();
      return sendJSON(response, 200, publicStatus());
    }
    if (url.pathname === '/api/chatgpt/select' && request.method === 'POST') {
      const { id } = await readJSON(request);
      const account = db.accounts.find((item) => item.clientId === id);
      if (!account) throw new HttpError(404, 'Account not found');
      db.activeId = id;
      configEpoch++;
      await save();
      return sendJSON(response, 200, publicStatus());
    }
    if (url.pathname === '/api/chatgpt/signout' && request.method === 'POST') {
      const selected = active();
      if (!selected) throw new HttpError(401, 'No active ChatGPT account');
      signingOut.add(selected.clientId);
      configEpoch++;
      try {
        await refreshPromises.get(selected.clientId)?.catch(() => {});
        const account = db.accounts.find((item) => item.clientId === selected.clientId);
        let remoteRevocationConfirmed = !account.refreshToken;
        if (account.refreshToken) {
          for (let attempt = 0; attempt < 3 && !remoteRevocationConfirmed; attempt++) {
            try {
              const revoked = await fetcher(`${AUTH}/api/accounts/oauth/revoke`, {
                ...tokenForm({
                  token: account.refreshToken,
                  token_type_hint: 'refresh_token',
                  client_id: account.clientId,
                }),
                signal: AbortSignal.timeout(20_000),
              });
              remoteRevocationConfirmed = revoked.ok;
              if (revoked.status < 500) break;
            } catch {
              /* Network failure: retry while the refresh token remains available. */
            }
            if (!remoteRevocationConfirmed && attempt < 2)
              await new Promise((done) => setTimeout(done, 500 * 2 ** attempt));
          }
        }
        delete account.accessToken;
        delete account.refreshToken;
        delete account.idToken;
        delete account.scopes;
        delete account.expiresAt;
        if (db.activeId === account.clientId) db.activeId = null;
        await save();
        return sendJSON(response, 200, { ...publicStatus(), remoteRevocationConfirmed });
      } finally {
        signingOut.delete(selected.clientId);
      }
    }
    if (url.pathname === '/api/chatgpt/infer' && request.method === 'POST') {
      const { prompt } = await readJSON(request);
      const account = active();
      if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 20_000)
        throw new HttpError(400, 'Invalid prompt');
      if (!account?.model) throw new HttpError(400, 'Select a ChatGPT model first');
      const model = account.model;
      const clientId = account.clientId;
      const inferenceEpoch = configEpoch;
      const requestInference = (access) =>
        fetcher(`${RESOURCE}/responses`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${access}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            input: [{ role: 'user', content: prompt }],
            store: false,
            stream: true,
          }),
          signal: AbortSignal.timeout(120_000),
        });
      let upstream = await requestInference(await accessToken(account));
      if (upstream.status === 401)
        upstream = await requestInference(await accessToken(account, true));
      if (!upstream.ok)
        throw new HttpError(
          upstream.status === 401 ? 401 : 502,
          `ChatGPT inference failed (${upstream.status})`
        );
      const text = await readCompletedResponse(upstream.body);
      if (
        configEpoch !== inferenceEpoch ||
        db.activeId !== clientId ||
        signingOut.has(clientId) ||
        db.accounts.find((item) => item.clientId === clientId)?.model !== model
      ) {
        throw new HttpError(409, 'Active ChatGPT account changed');
      }
      return sendJSON(response, 200, { text });
    }
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/'))
      throw new HttpError(404, 'Not found');
    if (request.method !== 'GET' && request.method !== 'HEAD')
      throw new HttpError(405, 'Method not allowed');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      throw new HttpError(400, 'Invalid path');
    }
    const file = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (file !== dist && !file.startsWith(`${dist}${sep}`))
      throw new HttpError(403, 'Invalid path');
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new Error('Not a file');
      const headers = {
        'Content-Type': MIME[extname(file)] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes',
      };
      const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
      const start = range ? Number(range[1]) : 0;
      const end = range ? (range[2] ? Number(range[2]) : info.size - 1) : info.size - 1;
      if (range && (start >= info.size || end < start || end >= info.size)) {
        response.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
        response.end();
        return;
      }
      headers['Content-Length'] = String(end - start + 1);
      if (range) headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
      response.writeHead(range ? 206 : 200, headers);
      if (request.method === 'HEAD' || info.size === 0) response.end();
      else
        createReadStream(file, { start, end })
          .on('error', () => response.destroy())
          .pipe(response);
    } catch {
      throw new HttpError(404, 'Not found');
    }
  }

  const server = createServer((request, response) => {
    Promise.resolve(handle(request, response)).catch((error) => {
      if (response.headersSent) return response.destroy();
      sendJSON(response, error instanceof HttpError ? error.status : 500, {
        error: error instanceof HttpError ? error.message : 'Local companion error',
      });
    });
  });
  return {
    server,
    async start() {
      db = await credentialStore.load();
      if (!db) {
        db = { hostId: `urn:uuid:${randomUUID()}`, accounts: [], activeId: null };
        await save();
      }
      if (!db.hostId || !Array.isArray(db.accounts))
        throw new Error('Invalid protected ChatGPT credential record');
      await new Promise((ok, fail) => server.once('error', fail).listen(port, '127.0.0.1', ok));
      return origin;
    },
    close: () => new Promise((ok, fail) => server.close((error) => (error ? fail(error) : ok()))),
  };
}
