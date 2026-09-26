/**
 * Render candidate Open Graph / social share images from the current build.
 *
 * Output: test-results/og-image/<label>/<variant>.png at 2x (2400x1260), for a
 * person to choose from. Publishing one is a separate, deliberate step:
 *
 *   sips -z 630 1200 <variant>.png --out og.png && pngquant --quality=70-90 og.png
 *   then copy the result to public/og-image.png.
 *
 * Usage:
 *   npm run build && node scripts/capture-og-image.mjs --label=<name> [--port=4191] [--headed]
 *
 * It takes .capture.lock like every other renderer and refuses to run without
 * dist/. Variants frame the default overview camera with and without the HUD,
 * at midday and late afternoon; all use the high tier and a cleared UI state.
 */
import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { acquireCaptureLock } from './lib/capture-lock.mjs';

const ROOT = process.cwd();
const argument = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
};
const label = argument('label', null);
const port = Number(argument('port', '4191'));
if (!label || !/^[\w.-]+$/.test(label)) {
  console.error('Usage: node scripts/capture-og-image.mjs --label=<name> [--port=4191]');
  process.exit(2);
}
const outputDirectory = path.join(ROOT, 'test-results', 'og-image', label);

const VARIANTS = [
  { name: 'hud-midday', time: 12, operations: true },
  { name: 'hud-afternoon', time: 16.5, operations: true },
  { name: 'scene-midday', time: 12, operations: false },
  { name: 'scene-afternoon', time: 16.5, operations: false },
];

let previewProcess = null;

async function waitForServer(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Preview did not become ready at ${url}`);
}

async function startPreview() {
  await access(path.join(ROOT, 'dist', 'index.html')).catch(() => {
    throw new Error('dist/index.html is missing. Run npm run build first.');
  });
  const viteEntry = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  previewProcess = spawn(
    process.execPath,
    [viteEntry, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: 'ignore', env: { ...process.env, BROWSER: 'none' } }
  );
  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  return url;
}

async function capture(browser, baseUrl, variant) {
  const context = await browser.newContext({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
    colorScheme: 'dark',
    locale: 'en-GB',
    serviceWorkers: 'block',
  });
  await context.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(
      'millos-ui',
      JSON.stringify({ state: { hasSeenIntro: true }, version: 1 })
    );
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const query = new URLSearchParams({
    benchmark: 'overview',
    quality: 'high',
    time: String(variant.time),
    weather: 'clear',
    scada: 'on',
    pa: 'off',
    motion: 'off',
    art: 'on',
    operations: variant.operations ? 'on' : 'off',
  });
  try {
    await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
    await page.waitForFunction(() => window.__MILLOS_RUNTIME__?.ready === true, null, {
      timeout: 300_000,
    });
    await page.waitForFunction(
      () => document.documentElement.dataset.millosWorldReady === 'true',
      null,
      { timeout: 300_000 }
    );
    await page.waitForFunction(
      () => document.querySelector('[aria-label="Loading MillOS"]') === null,
      null,
      { timeout: 60_000 }
    );
    // Let streamed textures and the first shadow passes land.
    await page.waitForTimeout(12_000);
    const file = path.join(outputDirectory, `${variant.name}.png`);
    await page.screenshot({ path: file, fullPage: false, timeout: 120_000 });
    return { variant: variant.name, file, errors };
  } catch (error) {
    return { variant: variant.name, error: String(error?.message ?? error), errors };
  } finally {
    await context.close();
  }
}

const lock = await acquireCaptureLock(`og-image:${label}`);
try {
  await mkdir(outputDirectory, { recursive: true });
  const baseUrl = await startPreview();
  const browser = await chromium.launch({
    headless: !process.argv.includes('--headed'),
    // Same default as run-performance-benchmark.mjs: the installed Chrome.
    channel: argument('channel', 'chrome') || undefined,
  });
  const results = [];
  for (const variant of VARIANTS) {
    const result = await capture(browser, baseUrl, variant);
    console.log(JSON.stringify(result));
    results.push(result);
  }
  await browser.close();
  await writeFile(
    path.join(outputDirectory, 'manifest.json'),
    `${JSON.stringify({ label, capturedAt: new Date().toISOString(), results }, null, 2)}\n`
  );
} finally {
  previewProcess?.kill('SIGTERM');
  await lock.release();
}
