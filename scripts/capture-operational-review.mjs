/**
 * Capture deterministic MillOS operational UI states over a fixed scene.
 *
 * The script drives the shipping controls rather than writing directly to
 * Zustand stores. Each state receives a fresh browser context, persisted UI
 * state is cleared, onboarding is marked complete, and reduced motion is used
 * so animated safety surfaces are stable enough for blind comparison.
 */
import { spawn } from 'node:child_process';
import { access, mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const ROOT = process.cwd();
const OUTPUT_ROOT = path.join(ROOT, 'test-results', 'operational-review');

const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function triggerFacilityStop(page) {
  await page.getByRole('button', { name: 'TRIGGER EMERGENCY STOP', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Trigger facility emergency stop?' });
  await dialog.getByRole('button', { name: 'Trigger emergency stop', exact: true }).click();
  await page.getByRole('alert', { name: 'Facility emergency stop', exact: true }).waitFor();
}

const SCENARIOS = {
  overview: {
    title: 'Mill overview',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Mill Overview',
    surfaceRole: 'complementary',
    surfaceName: 'Mill Overview sidebar panel',
  },
  'scada-overview': {
    title: 'SCADA overview',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Simulated SCADA',
    surfaceRole: 'complementary',
    surfaceName: 'Simulated SCADA sidebar panel',
    afterOpen: async (page) => {
      await page.getByRole('button', { name: 'Open full SCADA workspace', exact: true }).click();
      const workspace = page.getByRole('dialog', { name: 'Full simulated SCADA workspace' });
      await workspace.getByRole('tab', { name: 'Process', exact: true }).click();
      await workspace.getByText('Live material ledger', { exact: true }).waitFor();
    },
  },
  'ai-partner': {
    title: 'AI partner',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'AI Partner',
    surfaceRole: 'complementary',
    surfaceName: 'AI Partner sidebar panel',
    afterOpen: async (page) => {
      await page.getByTestId('ai-command-center').waitFor();
    },
  },
  workforce: {
    title: 'Workforce',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Workforce',
    surfaceRole: 'complementary',
    surfaceName: 'Workforce sidebar panel',
  },
  'bilateral-autonomy': {
    title: 'Bilateral autonomy',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Bilateral Autonomy System (BAS)',
    surfaceRole: 'complementary',
    surfaceName: 'Bilateral Autonomy sidebar panel',
  },
  'safety-controls': {
    title: 'Safety controls',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Safety & Emergency',
    surfaceRole: 'complementary',
    surfaceName: 'Safety & Emergency sidebar panel',
    afterOpen: async (page) => {
      await page.getByText('Fire Drill', { exact: true }).waitFor();
    },
  },
  'fire-drill': {
    title: 'Active fire drill',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Safety & Emergency',
    surfaceRole: 'complementary',
    surfaceName: 'Safety & Emergency sidebar panel',
    afterOpen: async (page) => {
      await page.getByRole('button', { name: 'START DRILL', exact: true }).click();
      await page.getByRole('alert', { name: 'Simulated fire drill', exact: true }).waitFor();
    },
  },
  'facility-stop': {
    title: 'Facility emergency stop',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Safety & Emergency',
    surfaceRole: 'complementary',
    surfaceName: 'Safety & Emergency sidebar panel',
    afterOpen: async (page) => {
      await triggerFacilityStop(page);
    },
  },
  'facility-recovery': {
    title: 'Facility recovery confirmation',
    viewport: DESKTOP_VIEWPORT,
    dockLabel: 'Safety & Emergency',
    surfaceRole: 'complementary',
    surfaceName: 'Safety & Emergency sidebar panel',
    afterOpen: async (page) => {
      await triggerFacilityStop(page);
      await page.getByRole('button', { name: 'CLEAR EMERGENCY', exact: true }).click();
      await page.getByRole('status', { name: 'Safety state recovered', exact: true }).waitFor();
    },
  },
  'mobile-fire-drill': {
    title: 'Mobile active fire drill',
    viewport: MOBILE_VIEWPORT,
    dockLabel: 'Safety & Emergency',
    surfaceRole: 'dialog',
    surfaceName: 'Safety & Emergency mobile panel',
    afterOpen: async (page) => {
      const panel = page.getByRole('dialog', { name: 'Safety & Emergency mobile panel' });
      await panel.getByRole('button', { name: 'START DRILL', exact: true }).click();
      // GameInterface becomes aria-hidden while the modal mobile panel owns
      // focus, but the emergency overlay remains deliberately visible above it.
      await page
        .locator('[role="alert"][aria-label="Simulated fire drill"]')
        .waitFor({ state: 'visible' });
      await panel.getByText('Evacuated', { exact: true }).waitFor();
    },
  },
};

const SCENARIO_SETS = {
  quick: ['overview', 'scada-overview', 'fire-drill', 'mobile-fire-drill'],
  desktop: Object.keys(SCENARIOS).filter((name) => name !== 'mobile-fire-drill'),
  safety: [
    'safety-controls',
    'fire-drill',
    'facility-stop',
    'facility-recovery',
    'mobile-fire-drill',
  ],
  full: Object.keys(SCENARIOS),
};

function readArgument(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function finiteNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

if (hasFlag('help') || hasFlag('h')) {
  console.log(`MillOS operational-review capture

Usage:
  npm run capture:operations -- --label=<name> [options]

Options:
  --label=<name>        Required. Output under test-results/operational-review
  --set=<name>          quick, desktop, safety, or full; default full
  --states=<list>       Explicit comma-separated state names, overrides --set
  --quality=<tier>      low, medium, high, or ultra; default medium
  --port=<number>       Local preview port; default 4174
  --time=<hour>         Fixed simulation hour, from 0 to 24; default 12
  --weather=<name>      clear, cloudy, rain, or storm; default clear
  --settle=<seconds>    UI settle time after interaction; default 1
  --channel=<name>      Browser channel; default chrome, empty uses bundled Chromium
  --skip-build          Reuse dist and record that risk in the manifest
  --headed              Use a visible browser and real GPU
  --help                Show this help without launching a browser

States:
  ${Object.keys(SCENARIOS).join(', ')}`);
  process.exit(0);
}

const label = readArgument('label', '');
if (!label) throw new Error('--label=<name> is required so the evidence can be referenced later.');
if (!/^[\w.-]+$/.test(label)) {
  throw new Error('--label must contain only letters, digits, dot, dash, or underscore.');
}

const setName = readArgument('set', 'full');
if (!(setName in SCENARIO_SETS)) {
  throw new Error(`Unknown set "${setName}". Expected: ${Object.keys(SCENARIO_SETS).join(', ')}.`);
}
const explicitStates = readArgument('states', '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const stateNames = explicitStates.length > 0 ? explicitStates : SCENARIO_SETS[setName];
const unknownStates = stateNames.filter((state) => !(state in SCENARIOS));
if (unknownStates.length > 0) {
  throw new Error(
    `Unknown operational state(s): ${unknownStates.join(', ')}. Expected: ${Object.keys(SCENARIOS).join(', ')}.`
  );
}

const quality = readArgument('quality', 'medium');
if (!new Set(['low', 'medium', 'high', 'ultra']).has(quality)) {
  throw new Error(`Unknown quality "${quality}". Expected low, medium, high, or ultra.`);
}
const weather = readArgument('weather', 'clear');
if (!new Set(['clear', 'cloudy', 'rain', 'storm']).has(weather)) {
  throw new Error(`Unknown weather "${weather}". Expected clear, cloudy, rain, or storm.`);
}

const options = {
  label,
  scenarioSet: explicitStates.length > 0 ? 'explicit' : setName,
  states: stateNames,
  quality,
  weather,
  time: finiteNumber(readArgument('time', '12'), 12, 0, 24),
  settleSeconds: finiteNumber(readArgument('settle', '1'), 1, 0, 10),
  previewPort: finiteNumber(readArgument('port', '4174'), 4174, 1024, 65535),
  browserChannel: readArgument('channel', 'chrome'),
  skipBuild: hasFlag('skip-build'),
  headed: hasFlag('headed'),
};

const outputDirectory = path.join(OUTPUT_ROOT, label);
let previewProcess = null;

function run(command, args, description) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${description} exited with code ${String(code)}`));
    });
  });
}

function capture(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.once('exit', (code) => resolve({ code, stdout }));
  });
}

async function gitProvenance() {
  const [commit, branch, status] = await Promise.all([
    capture('git', ['rev-parse', 'HEAD']),
    capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
    capture('git', ['status', '--porcelain']),
  ]);
  const dirtyFiles = status.stdout.split('\n').filter((line) => line.trim().length > 0);
  return {
    commit: commit.stdout.trim() || 'unknown',
    branch: branch.stdout.trim() || 'unknown',
    dirty: dirtyFiles.length > 0,
    dirtyFileCount: dirtyFiles.length,
    dirtyFiles: dirtyFiles.map((line) => line.slice(3)),
  };
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Preview did not become ready at ${url}: ${String(lastError ?? 'timeout')}`);
}

async function startPreview() {
  await access(path.join(ROOT, 'dist', 'index.html')).catch(() => {
    throw new Error('dist/index.html is missing. Run npm run build before capture.');
  });
  const url = `http://127.0.0.1:${options.previewPort}`;
  const viteEntry = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  let previewStderr = '';
  previewProcess = spawn(
    process.execPath,
    [
      viteEntry,
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(options.previewPort),
      '--strictPort',
    ],
    {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
    }
  );
  previewProcess.stderr.on('data', (chunk) => {
    previewStderr += chunk;
  });
  await Promise.race([
    waitForServer(url),
    new Promise((_, reject) => {
      previewProcess.once('exit', (code) => {
        reject(
          new Error(
            `Preview exited before becoming ready on port ${options.previewPort} ` +
              `(code ${String(code)}): ${previewStderr.trim() || 'no stderr'}`
          )
        );
      });
    }),
  ]);
  return url;
}

async function stopPreview() {
  if (!previewProcess || previewProcess.killed) return;
  previewProcess.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    previewProcess.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function waitForApp(page) {
  await page.waitForFunction(() => window.__MILLOS_RUNTIME__?.ready === true, null, {
    timeout: 90_000,
  });
  await page.waitForFunction(
    () => document.documentElement.dataset.millosWorldReady === 'true',
    null,
    { timeout: 90_000 }
  );
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Loading MillOS"]') === null,
    null,
    { timeout: 15_000 }
  );
  await page.getByTestId('game-interface').waitFor({ state: 'visible', timeout: 30_000 });
  const operationalCapture = await page.evaluate(
    () => window.__MILLOS_RUNTIME__?.mode.operationalCapture === true
  );
  if (!operationalCapture) {
    throw new Error(
      'Runtime did not acknowledge operations=on; refusing to capture a stale bundle.'
    );
  }
}

async function runScenario(browser, baseUrl, stateName) {
  const scenario = SCENARIOS[stateName];
  const context = await browser.newContext({
    viewport: scenario.viewport,
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    colorScheme: 'dark',
    locale: 'en-GB',
    timezoneId: 'Europe/London',
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
  const diagnostics = { consoleErrors: [], pageErrors: [], failedRequests: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    diagnostics.failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText ?? 'unknown',
    });
  });

  const query = new URLSearchParams({
    benchmark: 'overview',
    quality: options.quality,
    time: String(options.time),
    weather: options.weather,
    scada: 'on',
    pa: 'off',
    motion: 'off',
    art: 'on',
    operations: 'on',
  });
  const imagePath = path.join(outputDirectory, `${stateName}.png`);
  const failureImagePath = path.join(outputDirectory, `${stateName}-failure.png`);

  try {
    await page.goto(`${baseUrl}/?${query}`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await waitForApp(page);
    await page.getByRole('button', { name: scenario.dockLabel, exact: true }).click();
    const surface = page.getByRole(scenario.surfaceRole, { name: scenario.surfaceName });
    await surface.waitFor({ state: 'visible', timeout: 30_000 });
    if (scenario.afterOpen) await scenario.afterOpen(page);
    await page.waitForTimeout(options.settleSeconds * 1000);
    await page.screenshot({ path: imagePath, fullPage: false, timeout: 30_000 });

    const runtime = await page.evaluate(() => {
      const snapshot = window.__MILLOS_RUNTIME__?.snapshot();
      return snapshot
        ? {
            quality: snapshot.quality,
            camera: snapshot.camera,
            worldIntegrityPassed: snapshot.worldIntegrity.passed,
            sceneObjects: snapshot.sceneGraph.objects,
          }
        : null;
    });
    const capturedDiagnostics = {
      consoleErrors: [...diagnostics.consoleErrors],
      pageErrors: [...diagnostics.pageErrors],
      failedRequests: [...diagnostics.failedRequests],
    };
    const passed =
      runtime?.worldIntegrityPassed === true &&
      capturedDiagnostics.consoleErrors.length === 0 &&
      capturedDiagnostics.pageErrors.length === 0 &&
      capturedDiagnostics.failedRequests.length === 0;
    return {
      state: stateName,
      title: scenario.title,
      viewport: scenario.viewport,
      image: path.basename(imagePath),
      expectedSurface: { role: scenario.surfaceRole, name: scenario.surfaceName },
      runtime,
      diagnostics: capturedDiagnostics,
      passed,
    };
  } catch (error) {
    await page
      .screenshot({ path: failureImagePath, fullPage: false, timeout: 10_000 })
      .catch(() => {});
    return {
      state: stateName,
      title: scenario.title,
      viewport: scenario.viewport,
      image: null,
      failureImage: path.basename(failureImagePath),
      expectedSurface: { role: scenario.surfaceRole, name: scenario.surfaceName },
      runtime: null,
      diagnostics,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await context.close();
  }
}

async function buildContactSheet(browser, results) {
  const captured = results.filter((result) => result.image);
  if (captured.length === 0) return null;
  const cells = captured
    .map(
      (result) => `<figure>
        <div class="frame"><img src="${encodeURIComponent(result.image)}" alt="${result.title}" /></div>
        <figcaption>${result.state}</figcaption>
      </figure>`
    )
    .join('');
  const html = `<!doctype html>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; background: #080b11; }
      main { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; padding: 10px; }
      figure { margin: 0; overflow: hidden; border: 1px solid #263244; background: #111827; }
      .frame { display: grid; place-items: center; height: 340px; overflow: hidden; background: #05080d; }
      img { display: block; width: 100%; height: 100%; min-height: 0; object-fit: contain; }
      figcaption { padding: 6px 10px; font: 600 18px/1.4 ui-monospace, monospace; color: #e5edf7; }
    </style>
    <main>${cells}</main>`;
  const htmlPath = path.join(outputDirectory, 'contact-sheet.html');
  const imagePath = path.join(outputDirectory, 'contact-sheet.png');
  await writeFile(htmlPath, html);
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  try {
    await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
    await page.waitForFunction(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0)
    );
    await page.screenshot({ path: imagePath, fullPage: true });
  } finally {
    await page.close();
  }
  return path.basename(imagePath);
}

async function main() {
  await mkdir(outputDirectory, { recursive: true });
  const existingFiles = await readdir(outputDirectory);
  if (existingFiles.length > 0) {
    throw new Error(
      `Output directory ${path.relative(ROOT, outputDirectory)} is not empty. Use a fresh label.`
    );
  }

  if (!options.skipBuild) {
    console.log('Building the exact tree under review...');
    await run('npm', ['run', 'build'], 'npm run build');
  } else {
    console.warn('WARNING: --skip-build. Frames may show a bundle older than the working tree.');
  }

  const baseUrl = await startPreview();
  const browser = await chromium.launch({
    headless: !options.headed,
    channel: options.browserChannel || undefined,
  });
  const results = [];
  let contactSheet = null;
  try {
    for (const stateName of options.states) {
      console.log(`Capturing ${stateName}...`);
      const result = await runScenario(browser, baseUrl, stateName);
      results.push(result);
      console.log(`${stateName}: ${result.passed ? 'PASS' : 'FAIL'}`);
    }
    contactSheet = await buildContactSheet(browser, results);
  } finally {
    await browser.close();
    await stopPreview();
  }

  const git = await gitProvenance();
  const caveats = [
    'Operational frames use the reduced-motion accessibility setting for deterministic safety overlays.',
    'This capture does not establish a performance budget. Run benchmark:runtime on the same candidate.',
    ...(!options.headed
      ? [
          'Headless capture may use software rendering. Treat pixels as smoke evidence, not final art evidence.',
        ]
      : []),
    ...(options.skipBuild
      ? ['Captured with --skip-build; dist may predate the working tree.']
      : []),
    ...(git.dirty
      ? [
          `Working tree was dirty (${git.dirtyFileCount} files). Frames include uncommitted work and cannot serve as a clean baseline.`,
        ]
      : []),
  ];
  const manifest = {
    label: options.label,
    capturedAt: new Date().toISOString(),
    git,
    browser: options.browserChannel
      ? `Playwright ${options.browserChannel} channel`
      : 'Playwright bundled Chromium',
    options,
    deterministicContract: {
      benchmarkScene: 'overview',
      persistedState: 'cleared per frame; onboarding complete',
      reducedMotion: 'reduce',
      serviceWorkers: 'blocked',
      freshBrowserContextPerFrame: true,
      statePreparation: 'shipping UI controls',
    },
    passed: results.every((result) => result.passed),
    results,
    contactSheet,
    caveats,
  };
  const manifestPath = path.join(outputDirectory, 'review-manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\nFrames:        ${path.relative(ROOT, outputDirectory)}`);
  if (contactSheet)
    console.log(`Contact sheet: ${path.relative(ROOT, path.join(outputDirectory, contactSheet))}`);
  console.log(`Manifest:      ${path.relative(ROOT, manifestPath)}`);
  caveats.forEach((caveat) => console.warn(`CAVEAT: ${caveat}`));
  if (!manifest.passed) process.exitCode = 1;
}

main().catch(async (error) => {
  await stopPreview();
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
