import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatGPTLocalServer, readCompletedResponse } from './chatgpt-local-server.mjs';

test('OAuth registration, refresh, model selection, completed inference, and sign-out', async () => {
  const calls = [];
  let saved = null;
  const credentialStore = {
    load: async () => saved,
    save: async (value) => {
      saved = structuredClone(value);
    },
  };
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/oauth/token')) {
      const grant = new URLSearchParams(init.body).get('grant_type');
      return Response.json({
        access_token: grant === 'authorization_code' ? 'access-1' : 'access-2',
        refresh_token: grant === 'authorization_code' ? 'refresh-1' : 'refresh-2',
        id_token: 'signed-id-token',
        token_type: 'Bearer',
        scope: 'openid chatgpt.tokens.use.direct offline_access resource.invoke',
        expires_in: grant === 'authorization_code' ? 0 : 3600,
      });
    }
    if (url.endsWith('/models'))
      return Response.json({
        models: [
          { slug: 'gpt-test', display_name: 'Test model', visibility: 'list' },
          { slug: 'hidden', visibility: 'hidden' },
        ],
      });
    if (url.endsWith('/responses')) {
      const event =
        'data: {"type":"response.output_text.delta","delta":"partial"}\n\n' +
        'data: {"type":"response.completed","response":{"output":[{"content":[{"type":"output_text","text":"complete"}]}]}}\n\n';
      return new Response(event, { headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (url.endsWith('/oauth/revoke')) return new Response(null, { status: 200 });
    throw new Error(`Unexpected upstream ${url}`);
  };
  const port = 41000 + Math.floor(Math.random() * 10000);
  const app = createChatGPTLocalServer({
    port,
    credentialStore,
    fetcher,
    verifyIdToken: async (_token, _clientId, nonce) => {
      assert.ok(nonce);
      return { sub: 'account-1', email: 'user@example.test' };
    },
  });
  const origin = await app.start();
  const post = (path, body) =>
    fetch(`${origin}/api/chatgpt/${path}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    assert.match(saved.hostId, /^urn:uuid:/);
    const denied = await fetch(`${origin}/api/chatgpt/start`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(denied.status, 403);
    const rejectedAttempt = await (await post('start', {})).json();
    const rejected = await fetch(
      `${origin}/auth/callback?code=forged&state=wrong&client_id=oaiapp_test`
    );
    assert.equal(rejected.status, 200);
    assert.match(await rejected.text(), /Invalid or expired sign-in state/);
    assert.equal(calls.filter((call) => call.url.endsWith('/oauth/token')).length, 0);
    assert.equal((await post('start', {})).status, 409);
    const started = rejectedAttempt;
    const authorize = new URL(started.url);
    assert.equal(authorize.searchParams.get('client_id'), 'dynamic_agent_client');
    assert.equal(authorize.searchParams.get('agent_name_hint'), 'MillOS');
    assert.equal(authorize.searchParams.get('redirect_uri'), `${origin}/auth/callback`);
    assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
    assert.ok(authorize.searchParams.get('nonce'));
    const state = authorize.searchParams.get('state');
    const callback = await fetch(
      `${origin}/auth/callback?code=code-1&state=${state}&client_id=oaiapp_test`,
      { redirect: 'manual' }
    );
    assert.equal(callback.status, 303);
    assert.equal(saved.activeId, 'oaiapp_test');
    assert.equal(saved.accounts[0].subject, 'account-1');
    const catalog = await (await fetch(`${origin}/api/chatgpt/models`)).json();
    assert.deepEqual(catalog.models, [{ slug: 'gpt-test', name: 'Test model' }]);
    assert.equal(saved.accounts[0].refreshToken, 'refresh-2');
    assert.equal((await post('model', { slug: 'hidden' })).status, 400);
    assert.equal((await post('model', { slug: 'gpt-test' })).status, 200);
    const inference = await (await post('infer', { prompt: 'Say complete' })).json();
    assert.equal(inference.text, 'complete');
    const body = JSON.parse(calls.find((call) => call.url.endsWith('/responses')).init.body);
    assert.equal(body.store, false);
    assert.equal(body.stream, true);
    assert.deepEqual(body.input, [{ role: 'user', content: 'Say complete' }]);
    assert.equal((await (await post('signout', {})).json()).remoteRevocationConfirmed, true);
    assert.equal(saved.accounts[0].refreshToken, undefined);
    assert.equal(saved.accounts[0].clientId, 'oaiapp_test');
    const returning = new URL((await (await post('start', { id: 'oaiapp_test' })).json()).url);
    assert.equal(returning.searchParams.get('client_id'), 'oaiapp_test');
    const mismatched = await fetch(
      `${origin}/auth/callback?code=code-2&state=${returning.searchParams.get('state')}&client_id=oaiapp_other`
    );
    assert.match(await mismatched.text(), /Incomplete client registration/);
    assert.equal(saved.activeId, null);
  } finally {
    await app.close();
  }
});

test('partial Responses streams are rejected', async () => {
  await assert.rejects(
    readCompletedResponse(
      new Response('data: {"type":"response.output_text.delta","delta":"partial"}\n\n').body
    ),
    /before completion/
  );
  await assert.rejects(
    readCompletedResponse(
      new Response(
        'data: {"type":"response.failed","response":{"error":{"code":"usage_limit"}}}\n\n'
      ).body
    ),
    /usage_limit/
  );
});

test('an account switch discards an in-flight answer from the prior account', async () => {
  let releaseResponse;
  const gate = new Promise((resolve) => {
    releaseResponse = resolve;
  });
  let signalStarted;
  const started = new Promise((resolve) => {
    signalStarted = resolve;
  });
  const port = 41000 + Math.floor(Math.random() * 10000);
  const account = (id, model) => ({
    clientId: id,
    subject: id,
    email: `${id}@example.test`,
    model,
    accessToken: `token-${id}`,
    refreshToken: `refresh-${id}`,
    scopes: ['chatgpt.tokens.use.direct'],
    expiresAt: Date.now() + 3_600_000,
  });
  const db = {
    hostId: 'urn:uuid:00000000-0000-4000-8000-000000000001',
    activeId: 'a',
    accounts: [account('a', 'model-a'), account('b', 'model-b')],
  };
  const app = createChatGPTLocalServer({
    port,
    credentialStore: { load: async () => db, save: async () => {} },
    fetcher: async (url, init) => {
      if (!url.endsWith('/responses')) throw new Error(`Unexpected upstream ${url}`);
      assert.equal(init.headers.Authorization, 'Bearer token-a');
      signalStarted();
      await gate;
      return new Response(
        'data: {"type":"response.completed","response":{"output":[{"content":[{"type":"output_text","text":"old account answer"}]}]}}\n\n'
      );
    },
  });
  const origin = await app.start();
  const post = (path, body) =>
    fetch(`${origin}/api/chatgpt/${path}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    const inference = post('infer', { prompt: 'Assess the mill' });
    await started;
    assert.equal((await post('select', { id: 'b' })).status, 200);
    releaseResponse();
    assert.equal((await inference).status, 409);
  } finally {
    releaseResponse();
    await app.close();
  }
});

test('a model switch discards an in-flight answer from the prior model', async () => {
  let releaseResponse;
  const gate = new Promise((resolve) => {
    releaseResponse = resolve;
  });
  let signalStarted;
  const started = new Promise((resolve) => {
    signalStarted = resolve;
  });
  const port = 41000 + Math.floor(Math.random() * 10000);
  const db = {
    hostId: 'urn:uuid:00000000-0000-4000-8000-000000000001',
    activeId: 'a',
    accounts: [{
      clientId: 'a',
      subject: 'a',
      email: 'a@example.test',
      model: 'old-model',
      accessToken: 'token-a',
      refreshToken: 'refresh-a',
      scopes: ['chatgpt.tokens.use.direct'],
      expiresAt: Date.now() + 3_600_000,
    }],
  };
  const app = createChatGPTLocalServer({
    port,
    credentialStore: { load: async () => db, save: async () => {} },
    fetcher: async (url, init) => {
      if (url.endsWith('/models')) {
        return Response.json({ models: [
          { slug: 'old-model', visibility: 'list' },
          { slug: 'new-model', visibility: 'list' },
        ] });
      }
      if (!url.endsWith('/responses')) throw new Error(`Unexpected upstream ${url}`);
      assert.equal(JSON.parse(init.body).model, 'old-model');
      signalStarted();
      await gate;
      return new Response(
        'data: {"type":"response.completed","response":{"output":[{"content":[{"type":"output_text","text":"old model answer"}]}]}}\n\n'
      );
    },
  });
  const origin = await app.start();
  const post = (path, body) =>
    fetch(`${origin}/api/chatgpt/${path}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    const inference = post('infer', { prompt: 'Assess the mill' });
    await started;
    assert.equal((await post('model', { slug: 'new-model' })).status, 200);
    releaseResponse();
    assert.equal((await inference).status, 409);
  } finally {
    releaseResponse();
    await app.close();
  }
});

test('an abandoned sign-in attempt expires so the user can retry', async () => {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  const port = 41000 + Math.floor(Math.random() * 10000);
  const app = createChatGPTLocalServer({
    port,
    credentialStore: { load: async () => null, save: async () => {} },
  });
  try {
    const origin = await app.start();
    const start = () =>
      fetch(`${origin}/api/chatgpt/start`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: '{}',
      });
    assert.equal((await start()).status, 200);
    assert.equal((await start()).status, 409);
    now += 300_001;
    assert.equal((await start()).status, 200);
  } finally {
    Date.now = realNow;
    await app.close();
  }
});
