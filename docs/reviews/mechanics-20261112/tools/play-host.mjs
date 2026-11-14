#!/usr/bin/env node
/**
 * Play-test host: serves the built snapshot, launches one headless Chrome on
 * it with a remote-debugging port, and stays alive so play-step.mjs can act
 * on the same page between calls while the game keeps running.
 *
 * It holds the PRIMARY checkout's capture lock for as long as it renders, so
 * it serialises against every other session's captures, and it stops itself
 * after --minutes so the lock is never held past a waiter's patience.
 *
 *   node play-host.mjs [--minutes=13] [--fresh] [--viewport=1366x768]
 *                      [--mobile] [--query="lang=pt-BR"] [--profile=<dir>]
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { appendFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// The checkout this file sits in (docs/reviews/mechanics-20261112/tools).
const WORKTREE = path.resolve(HERE, '../../../..');
// The checkout whose capture lock every session shares: MILLOS_PRIMARY_CHECKOUT
// when this runs from a worktree, otherwise this checkout.
const PRIMARY = process.env.MILLOS_PRIMARY_CHECKOUT ?? WORKTREE;
const PREVIEW_PORT = 4179;
const CDP_PORT = 9339;

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const minutes = Number(arg('minutes', '13'));
const [width, height] = arg('viewport', flag('mobile') ? '390x844' : '1366x768')
  .split('x')
  .map(Number);
const profile = arg('profile', path.join(HERE, 'profile'));
const query = arg('query', '');
const stateFile = path.join(HERE, 'host.json');
const diagnosticsFile = path.join(HERE, 'diagnostics.jsonl');

const require = createRequire(path.join(WORKTREE, 'package.json'));
const { chromium } = require('@playwright/test');
const { acquireCaptureLock } = await import(
  pathToFileURL(path.join(WORKTREE, 'scripts/lib/capture-lock.mjs')).href
);
const { withChromeLeakGuard } = await import(
  pathToFileURL(path.join(WORKTREE, 'scripts/lib/chrome-launch-args.mjs')).href
);

if (flag('fresh') && existsSync(profile)) rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });

const log = (message) => console.log(`[host ${new Date().toISOString().slice(11, 19)}] ${message}`);

log(`load ${os.loadavg().map((value) => value.toFixed(1)).join(' ')} on ${os.cpus().length} cores`);
log('waiting for the capture lock in the primary checkout...');
const lock = await acquireCaptureLock('mechanics-playtest', {
  root: PRIMARY,
  timeoutMs: 25 * 60 * 1000,
  onWait: (info) => log(`lock held by ${info?.holder?.tag ?? 'another process'}; waiting`),
});
log(`lock acquired${lock.reclaimed ? ` (reclaimed: ${lock.reclaimed})` : ''}`);

let preview = null;
let context = null;
let stopping = false;

async function stop(reason) {
  if (stopping) return;
  stopping = true;
  log(`stopping: ${reason}`);
  try {
    await context?.close();
  } catch {
    /* already gone */
  }
  if (preview && !preview.killed) preview.kill('SIGTERM');
  try {
    rmSync(stateFile, { force: true });
  } catch {
    /* nothing to remove */
  }
  await lock.release();
  log('lock released');
  process.exit(0);
}
process.on('SIGTERM', () => void stop('SIGTERM'));
process.on('SIGINT', () => void stop('SIGINT'));

try {
  preview = spawn(
    process.execPath,
    [
      path.join(WORKTREE, 'node_modules/vite/bin/vite.js'),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(PREVIEW_PORT),
      '--strictPort',
    ],
    { cwd: WORKTREE, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('preview did not start in 60 s')), 60_000);
    preview.stdout.on('data', (chunk) => {
      if (String(chunk).includes(String(PREVIEW_PORT))) {
        clearTimeout(timer);
        resolve();
      }
    });
    preview.once('exit', (code) => reject(new Error(`preview exited with ${code}`)));
  });
  log(`preview ready on ${PREVIEW_PORT}`);

  const mobile = flag('mobile');
  context = await chromium.launchPersistentContext(profile, {
    headless: true,
    channel: 'chrome',
    chromiumSandbox: true,
    viewport: mobile ? { width, height } : null,
    hasTouch: mobile,
    isMobile: mobile,
    deviceScaleFactor: mobile ? 2 : undefined,
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    serviceWorkers: 'block',
    args: withChromeLeakGuard([
      '--mute-audio',
      `--remote-debugging-port=${CDP_PORT}`,
      `--window-size=${width},${height}`,
    ]),
  });
  const page = context.pages()[0] ?? (await context.newPage());
  const record = (kind, detail) =>
    appendFileSync(
      diagnosticsFile,
      `${JSON.stringify({ at: new Date().toISOString(), kind, detail })}\n`
    );
  page.on('console', (message) => {
    if (message.type() === 'error') record('console-error', message.text().slice(0, 500));
  });
  page.on('pageerror', (error) => record('page-error', String(error.message).slice(0, 500)));
  page.on('requestfailed', (request) =>
    record('request-failed', `${request.url()} ${request.failure()?.errorText ?? ''}`)
  );

  const url = `http://127.0.0.1:${PREVIEW_PORT}/${query ? `?${query}` : ''}`;
  const startedAt = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  writeFileSync(
    stateFile,
    JSON.stringify({
      pid: process.pid,
      cdp: CDP_PORT,
      url,
      startedAt,
      stopsAt: startedAt + minutes * 60_000,
      viewport: { width, height },
      mobile,
    })
  );
  log(`page open at ${url}; stopping itself in ${minutes} min`);
  setTimeout(() => void stop(`${minutes} minute hold reached`), minutes * 60_000);
  context.on('close', () => void stop('browser closed'));
} catch (error) {
  log(`failed: ${error.message}`);
  await stop('startup failure');
}
