// @vitest-environment node
import { test } from 'vitest';
import process from 'node:process';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { acquireCaptureLock } from './capture-lock.mjs';

test('a freshly truncated heartbeat is not an abandoned capture lock', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'millos-lock-race-'));
  let accidental;
  try {
    await writeFile(path.join(root, '.capture.lock'), '');
    await assert.rejects(async () => {
      accidental = await acquireCaptureLock('contender', { root, timeoutMs: 0 });
    }, /Timed out/);
  } finally {
    await accidental?.release();
    await rm(root, { recursive: true, force: true });
  }
});

test('release removes its own complete record', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'millos-lock-release-'));
  const lock = await acquireCaptureLock('owner', { root });
  try {
    await lock.release();
    await assert.rejects(readFile(path.join(root, '.capture.lock')), { code: 'ENOENT' });
  } finally {
    await lock.release();
    await rm(root, { recursive: true, force: true });
  }
});

test('release preserves a replacement owned by someone else', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'millos-lock-owner-'));
  const lock = await acquireCaptureLock('owner', { root });
  try {
    const replacement = JSON.stringify({ pid: process.pid + 1000000, tag: 'replacement' });
    await writeFile(path.join(root, '.capture.lock'), replacement);
    await lock.release();
    assert.equal(await readFile(path.join(root, '.capture.lock'), 'utf8'), replacement);
  } finally {
    await lock.release();
    await rm(root, { recursive: true, force: true });
  }
});
