// Built-assembly UI gate. Only synthetic keys/text and intercepted provider responses.
// Working if desktop/mobile can submit manually, forget credentials, and make no unsolicited calls.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { acquireCaptureLock } from './lib/capture-lock.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'test-results/jev-browser');
const endpoint = 'https://openrouter.ai/api/alpha/decisions';
const key = `sk-or-v1-${'test-only-'.repeat(5)}`;
const note = 'Synthetic incident: a drive belt has snapped and awaits replacement.';
const report = {
  passed: false,
  requests: 0,
  layouts: [],
  pageErrors: [],
  consoleErrors: [],
  failedRequests: [],
  csp: [],
};
const lock = await acquireCaptureLock('jev-browser-acceptance', { root });
let browser, server, page;
try {
  await mkdir(output, { recursive: true });
  const html = await readFile(path.join(root, 'dist/index.html'), 'utf8');
  const base = html.match(/src="([^"]*\/)assets\/main-[^"]+\.js"/)?.[1];
  assert.ok(base, 'Built application entry must identify its deployment base');
  server = await preview({
    root,
    base,
    preview: { host: '127.0.0.1', port: 4398, strictPort: true },
  });
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    localStorage.setItem(
      'millos-ui',
      JSON.stringify({ state: { hasSeenIntro: true }, version: 1 })
    );
    window.jevCspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.jevCspViolations.push(event.violatedDirective);
    });
  });
  await context.route(endpoint, async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    report.requests++;
    assert.equal(request.headers().authorization, `Bearer ${key}`);
    assert.equal(body.state, note);
    assert.equal(body.model, 'typesafe/jev-1.13');
    assert.deepEqual(Object.keys(body).sort(), ['model', 'provider', 'questions', 'state']);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        model: 'typesafe/jev-1.13',
        answers: {
          decision: {
            type: 'choice',
            choice: 'Equipment maintenance',
            probabilities: {
              'Equipment maintenance': 1,
              'Product quality': 0,
              'Logistics coordination': 0,
              'No current incident': 0,
              'Insufficient evidence': 0,
            },
          },
        },
      }),
    });
  });
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => report.failedRequests.push(request.url()));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(
    `http://127.0.0.1:4398${base}?benchmark=overview&quality=low&operations=on&pa=off`,
    {
      waitUntil: 'domcontentloaded',
    }
  );
  await page.waitForFunction(
    () =>
      window.__MILLOS_RUNTIME__?.ready &&
      document.documentElement.dataset.millosWorldReady === 'true' &&
      !document.querySelector('[aria-label="Loading MillOS"]'),
    null,
    { timeout: 240_000 }
  );
  // CompleteWorldMarker fires on mount, before incremental static batching.
  // Use the same structural-settling criterion as run-performance-benchmark.mjs.
  const settlingStarted = Date.now();
  await page.waitForFunction(
    () => {
      const snapshot = window.__MILLOS_RUNTIME__?.snapshot();
      if (!snapshot) return false;
      const signature = JSON.stringify([
        snapshot.sceneGraph.objects,
        snapshot.sceneGraph.meshes,
        snapshot.sceneGraph.instancedMeshes,
      ]);
      const now = performance.now();
      if (
        Number(document.documentElement.dataset.millosStaticBatchesPending ?? 0) > 0 ||
        window.jevSceneSignature !== signature
      ) {
        window.jevSceneSignature = signature;
        window.jevSceneStableSince = now;
      }
      return now - window.jevSceneStableSince >= 2000;
    },
    null,
    { polling: 400, timeout: 240_000 }
  );
  report.settlingMs = Date.now() - settlingStarted;

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.getByRole('button', { name: 'AI Partner', exact: true }).click();
    await page.getByRole('tab', { name: 'Advisory', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Jev advisory' });
    const credential = panel.getByLabel('Your OpenRouter API key');
    const notes = panel.getByLabel('Incident text');
    const consent = panel.getByRole('checkbox');
    const send = panel.getByRole('button', { name: 'Send to Jev', exact: true });
    const before = report.requests;
    assert.equal(await credential.inputValue(), '');
    assert.equal(await consent.isChecked(), false);
    await credential.fill(key);
    await notes.fill(note);
    assert.equal(await send.isEnabled(), false);
    await consent.check();
    assert.equal(report.requests, before);
    await send.click();
    await panel.getByText('Equipment maintenance', { exact: true }).waitFor();
    assert.equal(report.requests, before + 1);
    assert.equal(
      await panel.getByRole('button', { name: /accept|apply|clear incident/i }).count(),
      0
    );
    assert.equal(
      await page.evaluate(
        (secret) =>
          [...Object.values(localStorage), ...Object.values(sessionStorage)].some((v) =>
            v.includes(secret)
          ),
        key
      ),
      false
    );
    await panel.getByText('Equipment maintenance', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(output, `advisory-${width}.png`) });
    const bounds = await panel.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
      right: element.getBoundingClientRect().right,
    }));
    assert.ok(bounds.scroll <= bounds.client + 1 && bounds.right <= width + 1);
    await panel.getByRole('button', { name: 'Forget key', exact: true }).click();
    assert.equal(await credential.inputValue(), '');
    assert.equal(await consent.isChecked(), false);
    report.layouts.push({ width, passed: true });
  }
  report.csp = await page.evaluate(() => window.jevCspViolations);
  assert.equal(report.csp.length, 0);
  assert.equal(report.pageErrors.length, 0);
  assert.equal(report.consoleErrors.length, 0);
  assert.equal(report.failedRequests.length, 0);
  report.passed = true;
} catch (error) {
  report.error = error.message;
  await page?.screenshot({ path: path.join(output, 'failure.png'), timeout: 5000 }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
  await lock.release();
  await writeFile(path.join(output, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}
