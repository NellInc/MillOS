const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');
const WebSocket = require('ws');

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

function waitForOutput(child, expected) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${expected}\n${output}`)),
      10000
    );
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes(expected)) {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Proxy exited early with ${code}\n${output}`));
    });
  });
}

function waitForExit(child) {
  return new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
}

function expectWebSocketUpgradeRejection(url, options, expectedStatus) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, options);
    ws.once('unexpected-response', (_request, response) => {
      response.resume();
      try {
        assert.equal(response.statusCode, expectedStatus);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    ws.once('open', () => {
      ws.close();
      reject(new Error(`WebSocket unexpectedly opened; expected HTTP ${expectedStatus}`));
    });
    ws.once('error', () => {
      // `unexpected-response` is the authoritative event for an HTTP rejection.
    });
  });
}

test('production rejects the removed API_KEY environment alias', { timeout: 10000 }, async () => {
  const port = await reservePort();
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    API_KEY: 'obsolete-secret',
  };
  delete env.SCADA_API_KEY;
  const child = spawn(process.execPath, ['dist/index.js'], {
    cwd: path.resolve(__dirname, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const exit = await waitForExit(child);
  assert.equal(exit.code, 1);
  assert.match(stderr, /SCADA_API_KEY environment variable is required/);
});

test(
  'production probes, REST authentication, WebSocket authentication, and SIGTERM work together',
  { timeout: 20000 },
  async () => {
    const port = await reservePort();
    const child = spawn(process.execPath, ['dist/index.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        SCADA_API_KEY: 'shared-secret',
        ALLOWED_ORIGINS: 'https://allowed.test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stderr = [];
    child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));

    try {
      await waitForOutput(child, `[Server] Listening on http://localhost:${port}`);

      const health = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(health.status, 200);
      assert.equal(health.headers.get('x-powered-by'), null);
      assert.equal(health.headers.get('cache-control'), 'no-store');
      assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(health.headers.get('x-frame-options'), 'DENY');
      assert.equal(health.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(
        health.headers.get('permissions-policy'),
        'camera=(), microphone=(), geolocation=()'
      );
      const ready = await fetch(`http://127.0.0.1:${port}/ready`);
      assert.equal(ready.status, 200);

      const unauthorized = await fetch(`http://127.0.0.1:${port}/tags`, {
        headers: { Origin: 'https://allowed.test' },
      });
      assert.equal(unauthorized.status, 401);

      const localhostOrigin = await fetch(`http://127.0.0.1:${port}/tags`, {
        headers: {
          Origin: 'http://localhost:3000',
          Authorization: 'Bearer shared-secret',
        },
      });
      assert.equal(localhostOrigin.status, 403);
      assert.equal(localhostOrigin.headers.get('access-control-allow-origin'), null);

      const authorized = await fetch(`http://127.0.0.1:${port}/tags`, {
        headers: {
          Origin: 'https://allowed.test',
          Authorization: 'Bearer shared-secret',
        },
      });
      assert.equal(authorized.status, 200);

      await expectWebSocketUpgradeRejection(
        `ws://127.0.0.1:${port}/ws?apiKey=shared-secret`,
        { origin: 'https://allowed.test' },
        401
      );

      const disabledWrite = await fetch(`http://127.0.0.1:${port}/tags/RM101.ST001.PV`, {
        method: 'PUT',
        headers: {
          Origin: 'https://allowed.test',
          Authorization: 'Bearer shared-secret',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: 1 }),
      });
      assert.equal(disabledWrite.status, 403);

      const encodedKey = Buffer.from('shared-secret', 'utf8').toString('base64url');
      const snapshot = await new Promise((resolve, reject) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${port}/ws`,
          ['millos-scada', `millos-scada-key.${encodedKey}`],
          { origin: 'https://allowed.test' }
        );
        ws.once('open', () => {
          ws.send(JSON.stringify({ type: 'subscribe', tagIds: ['RM101.ST001.PV'] }));
        });
        ws.once('message', (message) => {
          resolve(JSON.parse(message.toString()));
          ws.close();
        });
        ws.once('error', reject);
      });
      assert.equal(snapshot.type, 'snapshot');
      assert.deepEqual(
        snapshot.tags.map((tag) => tag.tagId),
        ['RM101.ST001.PV']
      );
    } finally {
      const exitPromise = waitForExit(child);
      child.kill('SIGTERM');
      const exit = await exitPromise;
      assert.equal(exit.code, 0, stderr.join(''));
    }
  }
);

test(
  'production write capability requires its distinct credential for REST and WebSocket',
  { timeout: 20000 },
  async () => {
    const port = await reservePort();
    const child = spawn(process.execPath, ['dist/index.js'], {
      cwd: path.resolve(__dirname, '..'),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        PORT: String(port),
        SCADA_API_KEY: 'read-secret',
        SCADA_ENABLE_WRITES: 'true',
        SCADA_WRITE_API_KEY: 'write-secret',
        ALLOWED_ORIGINS: 'https://allowed.test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stderr = [];
    child.stderr.on('data', (chunk) => stderr.push(chunk.toString()));

    try {
      await waitForOutput(child, `[Server] Listening on http://localhost:${port}`);

      const readCredential = await fetch(`http://127.0.0.1:${port}/tags/RM101.ST001.PV`, {
        method: 'PUT',
        headers: {
          Origin: 'https://allowed.test',
          Authorization: 'Bearer read-secret',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: 1 }),
      });
      assert.equal(readCredential.status, 403);

      const writeCredential = await fetch(`http://127.0.0.1:${port}/tags/RM101.ST001.PV`, {
        method: 'PUT',
        headers: {
          Origin: 'https://allowed.test',
          Authorization: 'Bearer write-secret',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: 1 }),
      });
      // The separate key clears authorization. The canonical tag is read-only,
      // so domain validation still rejects the attempted write.
      assert.equal(writeCredential.status, 400);

      const encodedReadKey = Buffer.from('read-secret', 'utf8').toString('base64url');
      const wsError = await new Promise((resolve, reject) => {
        const ws = new WebSocket(
          `ws://127.0.0.1:${port}/ws`,
          ['millos-scada', `millos-scada-key.${encodedReadKey}`],
          { origin: 'https://allowed.test' }
        );
        ws.on('message', (message) => {
          const parsed = JSON.parse(message.toString());
          if (parsed.type === 'snapshot') {
            ws.send(JSON.stringify({ type: 'write', tagId: 'RM101.ST001.PV', value: 1 }));
          } else {
            resolve(parsed);
            ws.close();
          }
        });
        ws.once('open', () => {
          ws.send(JSON.stringify({ type: 'subscribe', tagIds: ['RM101.ST001.PV'] }));
        });
        ws.once('error', reject);
      });
      assert.equal(wsError.message, 'Write authorization required');
      assert.equal(wsError.error, 'Write authorization required');
    } finally {
      const exitPromise = waitForExit(child);
      child.kill('SIGTERM');
      const exit = await exitPromise;
      assert.equal(exit.code, 0, stderr.join(''));
    }
  }
);
