// @vitest-environment node
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, test } from 'vitest';
import {
  assertPreviewBuildIdentity,
  assertPreviewPortAvailable,
} from './preview-build-identity.mjs';

const cleanup = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()();
});

async function fixture({ base = '', staleIndex = false, staleEntry = false } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'millos-preview-identity-'));
  cleanup.push(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'assets'));
  const index = `<script type="module" src="${base}/assets/main-exact.js"></script>`;
  const entry = 'export const candidate = "current";';
  await writeFile(path.join(dir, 'index.html'), index);
  await writeFile(path.join(dir, 'assets/main-exact.js'), entry);
  const server = createServer((req, res) => {
    if (req.url === `${base}/`) res.end(staleIndex ? index.replace('exact', 'stale') : index);
    else if (req.url === `${base}/assets/main-exact.js`) res.end(staleEntry ? 'old bundle' : entry);
    else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;
  return { dir, port, url: `http://127.0.0.1:${port}${base}` };
}

test.each(['', '/v0.40'])('verifies exact compiled bytes at base %s', async (base) => {
  const f = await fixture({ base });
  const proof = await assertPreviewBuildIdentity(f.url, f.dir);
  expect(proof.index.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(proof.entries).toHaveLength(1);
  expect(proof.entries[0].url).toBe(`${f.url}/assets/main-exact.js`);
});

test.each([{ staleIndex: true }, { staleEntry: true }])(
  'rejects stale served bytes: %j',
  async (state) => {
    const f = await fixture(state);
    await expect(assertPreviewBuildIdentity(f.url, f.dir)).rejects.toThrow(
      'Preview build identity mismatch'
    );
  }
);

test('rejects an occupied port and leaves its existing owner running', async () => {
  const f = await fixture();
  await expect(assertPreviewPortAvailable(f.port)).rejects.toThrow(
    `Preview port ${f.port} unavailable: EADDRINUSE`
  );
  expect((await fetch(`${f.url}/`)).status).toBe(200);
});

test('releases its available-port probe normally', async () => {
  await expect(assertPreviewPortAvailable(0)).resolves.toBeUndefined();
});

test.each(['--browser-executable=/tmp/unused-browser', '--motion=on'])(
  'rejects an unsupported benchmark switch before launch: %s',
  (argument) => {
    const cli = fileURLToPath(new URL('../run-performance-benchmark.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [cli, argument], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Unsupported benchmark argument: ${argument}`);
  }
);

test('accepts the documented explicit browser and motion switches', () => {
  const cli = fileURLToPath(new URL('../run-performance-benchmark.mjs', import.meta.url));
  const result = spawnSync(
    process.execPath,
    [cli, '--executable-path=/tmp/unused-browser', '--motion', '--help'],
    { encoding: 'utf8' }
  );
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('MillOS native runtime benchmark');
});
