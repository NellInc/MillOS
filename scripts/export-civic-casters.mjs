#!/usr/bin/env node
/**
 * Step 1 of the civic lamp bake (docs/VISUAL_FIDELITY_LOOP.md, "Fixed-lamp concept
 * realization"): an export-mode build, then the actual runtime's civic occluders
 * exported twice from the `village` benchmark, under the capture lock. Distance LOD is
 * disabled before the export: the bake is static and seen from every distance, so it
 * must not freeze the camera's far LOD choice (trunks would export their far mesh).
 * Writes export.json (the bake input), export-second.json, export-lod-default.json and
 * export-receipt.json. Working if the receipt says `identical: true` with no page errors.
 *
 * usage: node scripts/export-civic-casters.mjs <outDir>
 */
import { spawn, execSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { acquireCaptureLock } from './lib/capture-lock.mjs';
import {
  assertPreviewBuildIdentity,
  assertPreviewPortAvailable,
} from './lib/preview-build-identity.mjs';
import { READINESS_STAGES, previewPlan } from './lib/surface-measure-contract.mjs';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.argv[2]) throw new Error('usage: node scripts/export-civic-casters.mjs <outDir>');
const out = path.resolve(process.argv[2]);
await mkdir(out, { recursive: true });
const port = 4237;
const run = (cmd, args, env, cwd) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd, env: { ...process.env, ...env } });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))
    );
  });
const free = Number(execSync("df -k / | tail -1 | awk '{print $4}'").toString().trim());
if (free < 4 * 1024 * 1024) throw new Error(`Only ${free} KiB free`);
const lock = await acquireCaptureLock('civic-rebake:export', { root: R });
let preview, browser;
try {
  console.log(
    'TREE-FINGERPRINT',
    execSync('git status --porcelain | shasum -a 256; git diff | shasum -a 256', { cwd: R })
      .toString()
      .replace(/\n/g, ' | ')
  );
  await run('npm', ['run', 'build'], { VITE_CIVIC_BAKE_EXPORT: '1' }, R);
  const plan = previewPlan(await readFile(`${R}/dist/index.html`, 'utf8'));
  const env = { ...process.env, BROWSER: 'none' };
  if (plan.version) env.VERSION = plan.version;
  else delete env.VERSION;
  const base = `http://127.0.0.1:${port}${plan.basePath}`;
  await assertPreviewPortAvailable(port);
  preview = spawn(
    process.execPath,
    [
      `${R}/node_modules/vite/bin/vite.js`,
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--strictPort',
    ],
    { cwd: R, stdio: ['ignore', 'pipe', 'pipe'], env }
  );
  for (const deadline = Date.now() + 60000; ; ) {
    try {
      if ((await fetch(`${base}/`)).ok) {
        await assertPreviewBuildIdentity(base, `${R}/dist`);
        break;
      }
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('preview did not start');
    await new Promise((r) => setTimeout(r, 300));
  }
  browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    chromiumSandbox: true,
    ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
    args: ['--mute-audio', '--enable-automation', '--use-gl=angle', '--use-angle=metal'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const diag = { failedRequests: [], pageErrors: [], consoleErrors: [], requests: [] };
  page.on('request', (r) => {
    if (/civic-square-lamp-depth/.test(r.url())) diag.requests.push(r.url());
  });
  page.on('requestfailed', (r) =>
    diag.failedRequests.push(`${r.url()} ${r.failure()?.errorText ?? ''}`)
  );
  page.on('response', (r) => {
    if (r.status() >= 400) diag.failedRequests.push(`${r.url()} HTTP ${r.status()}`);
  });
  page.on('pageerror', (e) => diag.pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') diag.consoleErrors.push(m.text());
  });
  const query = new URLSearchParams({
    benchmark: 'village',
    duration: '300',
    quality: 'medium',
    time: '12',
    weather: 'clear',
  });
  await page.goto(`${base}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  for (const stage of READINESS_STAGES) {
    await page.waitForFunction(stage.predicate, null, { timeout: 300000 });
    console.log('ready:', stage.name);
  }
  await page.waitForTimeout(12000);
  const gpu = await page.evaluate(() => {
    const c = document.createElement('canvas').getContext('webgl2');
    const ext = c?.getExtension('WEBGL_debug_renderer_info');
    return ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
  });
  const status = await page.evaluate(() => window.__MILLOS_CIVIC_LIGHTING__?.status());
  if (!status) throw new Error('civic instrument missing (not benchmark mode?)');
  const exportOnce = () =>
    page.evaluate(() => JSON.stringify(window.__MILLOS_CIVIC_LIGHTING__.exportGeometry()));
  const lodDefault = await exportOnce();
  await writeFile(path.join(out, 'export-lod-default.json'), lodDefault);
  // Full-detail level for every DistanceLod/instance LOD (perfDebug.disableDistanceLod): the bake is
  // static and seen from all distances, so it must not freeze the camera's far LOD choice.
  await page.evaluate(() => window.__MILLOS_RUNTIME__.setPerfDebug({ disableDistanceLod: true }));
  await page.waitForTimeout(4000);
  const first = await exportOnce();
  await page.waitForTimeout(3000);
  const second = await exportOnce();
  const sha = (s) => createHash('sha256').update(s).digest('hex');
  const bodies = await page.evaluate(() =>
    window.__MILLOS_RUNTIME__.inspectObjects('Body', 60).map((o) => ({
      name: o.name,
      path: o.path,
      worldPosition: o.worldPosition,
      visible: o.visible,
      visibleInTree: o.visibleInTree,
      castShadow: o.castShadow,
      instanceCount: o.instanceCount,
      vertices: o.geometry.vertices,
    }))
  );
  await writeFile(path.join(out, 'export.json'), first);
  await writeFile(path.join(out, 'export-second.json'), second);
  await writeFile(
    path.join(out, 'export-receipt.json'),
    JSON.stringify(
      {
        gpu,
        status,
        firstSha: sha(first),
        secondSha: sha(second),
        identical: first === second,
        bodies,
        diag,
        url: `${base}/?${query}`,
      },
      null,
      2
    )
  );
  console.log(
    'EXPORT',
    sha(first),
    'identical:',
    first === second,
    'gpu:',
    gpu,
    'errors:',
    diag.pageErrors.length,
    diag.consoleErrors.length,
    diag.failedRequests.length,
    'civicRequests:',
    diag.requests.length
  );
  await context.close();
} finally {
  await browser?.close();
  if (preview && !preview.killed) preview.kill('SIGTERM');
  await lock.release();
}
