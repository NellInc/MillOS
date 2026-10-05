// Built-assembly UI gate. Only synthetic keys/text and intercepted provider responses.
// Working if desktop/mobile can submit manually, forget credentials, and make no unsolicited calls.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cpus, loadavg, release } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { acquireCaptureLock } from './lib/capture-lock.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'test-results/jev-browser');
const localMetalDist = process.argv
  .find((argument) => argument.startsWith('--local-metal-dist='))
  ?.split('=')
  .slice(1)
  .join('=');
const builtDirectory = localMetalDist ? path.resolve(localMetalDist) : path.join(root, 'dist');
const softwareRenderer = process.argv.includes('--software-renderer');
const metalRenderer = process.argv.includes('--metal-renderer') || !!localMetalDist;
const advisoryStartup = softwareRenderer || metalRenderer;
const startupTimeoutMs = softwareRenderer ? 300_000 : 240_000;
const installedChrome = process.argv.includes('--installed-chrome');
const diagnoseStartup = process.argv.includes('--diagnose-startup');
const runFile = promisify(execFile);
if (
  metalRenderer &&
  (process.platform !== 'darwin' ||
    (!localMetalDist && process.env.GITHUB_ACTIONS !== 'true') ||
    (!!localMetalDist && process.env.GITHUB_ACTIONS === 'true') ||
    softwareRenderer)
) {
  throw new Error('Metal acceptance requires macOS, with local diagnostics kept separate from CI');
}
if (
  installedChrome &&
  (process.env.GITHUB_ACTIONS !== 'true' ||
    !!localMetalDist ||
    (process.platform !== 'linux' && !(process.platform === 'darwin' && metalRenderer)))
) {
  throw new Error(
    'Installed Chrome acceptance is limited to disposable GitHub Linux or Metal runners'
  );
}
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
  softwareRenderer,
  metalRenderer,
  executionEnvironment: localMetalDist
    ? 'local-diagnostic'
    : process.env.GITHUB_ACTIONS === 'true'
      ? 'github-actions'
      : 'local',
  browserChannel: installedChrome ? 'chrome' : metalRenderer ? 'chromium' : 'playwright-chromium',
  requestedChromiumSandbox: true,
  camera: advisoryStartup ? 'sun' : 'overview',
  normalStartupRequired: true,
  startupTimeoutMs,
  diagnoseStartup,
  host: {
    platform: process.platform,
    architecture: process.arch,
    release: release(),
    runnerImage: process.env.ImageOS,
    runnerImageVersion: process.env.ImageVersion,
  },
};
// Persist each boundary before entering browser work. A runner-level timeout
// can interrupt Chromium before the catch/finally diagnostic gets to execute.
const checkpoint = async (phase) => {
  report.phase = phase;
  await writeFile(path.join(output, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Jev acceptance: ${phase}`);
};
const lock = await acquireCaptureLock('jev-browser-acceptance', { root });
let browser, server, page;
let diagnosticTimer;
let nativeSamples;
try {
  await mkdir(output, { recursive: true });
  const html = await readFile(path.join(builtDirectory, 'index.html'), 'utf8');
  if (metalRenderer) {
    report.buildInfo = JSON.parse(
      await readFile(path.join(builtDirectory, 'build-info.json'), 'utf8')
    );
    report.distSha256 = process.env.MILLOS_CI_DIST_SHA256;
    assert.match(
      report.distSha256 ?? '',
      /^[a-f0-9]{64}$/,
      'CI must verify the built assembly checksum'
    );
    const sourceSha = localMetalDist
      ? process.env.MILLOS_ACCEPTANCE_SOURCE_SHA
      : process.env.GITHUB_SHA;
    assert.match(sourceSha ?? '', /^[a-f0-9]{40}$/, 'The assembly source commit must be explicit');
    assert.ok(
      report.buildInfo.buildId.endsWith(`-${sourceSha.slice(0, 12)}`),
      'Downloaded build must match the workflow commit'
    );
  }
  const base = html.match(/src="([^"]*\/)assets\/main-[^"]+\.js"/)?.[1];
  assert.ok(base, 'Built application entry must identify its deployment base');
  server = await preview({
    root,
    base,
    build: { outDir: builtDirectory },
    preview: { host: '127.0.0.1', port: 4398, strictPort: true },
  });
  await checkpoint('browser-launch');
  browser = await chromium.launch({
    ...(installedChrome ? { channel: 'chrome' } : metalRenderer ? { channel: 'chromium' } : {}),
    headless: true,
    chromiumSandbox: true,
    ...(metalRenderer ? { ignoreDefaultArgs: ['--enable-unsafe-swiftshader'] } : {}),
    args: [
      '--mute-audio',
      // Browser-owned tracing survives an unresponsive renderer. Only this
      // fresh synthetic test profile is traced; acceptance remains unchanged.
      // Working if a stalled runner retains GPU/renderer events in its artifact.
      ...(diagnoseStartup
        ? [
            '--trace-startup=gpu,devtools.timeline,v8,disabled-by-default-v8.cpu_profiler',
            '--trace-startup-duration=90',
            '--trace-startup-format=json',
            `--trace-startup-file=${path.join(output, 'startup-trace.json')}`,
          ]
        : []),
      // Keep browser compositing on its software path. SwiftShader supplies
      // WebGL only, rather than emulating a GPU for the whole browser.
      // https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
      ...(softwareRenderer
        ? ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader']
        : []),
      // Headless otherwise defaults to SwiftShader. Force the Metal backend,
      // then check both CDP and the application's own context below.
      ...(metalRenderer ? ['--enable-gpu', '--use-gl=angle', '--use-angle=metal'] : []),
    ],
  });
  report.browserVersion = browser.version();
  await checkpoint('browser-renderer');
  if (installedChrome || metalRenderer) {
    const session = await browser.newBrowserCDPSession();
    try {
      report.browserArguments = (await session.send('Browser.getBrowserCommandLine')).arguments;
      assert.ok(
        !report.browserArguments.some((argument) =>
          ['--no-sandbox', '--disable-setuid-sandbox', '--disable-seccomp-filter-sandbox'].includes(
            argument
          )
        ),
        'CI browser must retain its sandbox layers'
      );
      if (metalRenderer) {
        assert.ok(
          !report.browserArguments.includes('--enable-unsafe-swiftshader'),
          'Metal acceptance must not opt into unsafe SwiftShader fallback'
        );
        report.gpu = (await session.send('SystemInfo.getInfo')).gpu;
        assert.match(report.gpu.auxAttributes?.glRenderer ?? '', /ANGLE Metal Renderer/i);
        assert.equal(report.gpu.featureStatus?.webgl, 'enabled', 'Metal WebGL must be enabled');
        assert.equal(
          report.gpu.auxAttributes?.sandboxed,
          true,
          'Metal GPU process must be sandboxed'
        );
        // Chromium reports a combined WebGL feature status. Prove WebGL2 with
        // the application's actual context, rather than an absent CDP field.
      }
    } finally {
      await session.detach();
    }
  }
  await checkpoint('browser-context');
  if (metalRenderer && process.platform === 'darwin') {
    // Query the browser process, not the possibly blocked page. Sample only
    // this disposable browser's GPU and renderers, never desktop applications.
    diagnosticTimer = setTimeout(() => {
      nativeSamples = (async () => {
        const session = await browser.newBrowserCDPSession();
        try {
          report.hostLoad = { logicalCores: cpus().length, averages: loadavg() };
          report.stallSampleAt = new Date().toISOString();
          await checkpoint(report.phase);
          const { processInfo } = await session.send('SystemInfo.getProcessInfo');
          await writeFile(
            path.join(output, 'browser-processes.json'),
            JSON.stringify({ processInfo, hostLoad: loadavg(), logicalCores: cpus().length })
          );
          await Promise.all(
            processInfo
              .filter(({ type }) => type === 'GPU' || type === 'renderer')
              .map(({ type, id }) =>
                runFile(
                  'sample',
                  [String(id), '5', '-file', path.join(output, `native-${type}-${id}.txt`)],
                  { timeout: 15_000 }
                )
              )
          );
        } finally {
          await session.detach();
        }
      })().catch(async (error) => {
        await writeFile(path.join(output, 'native-sample-error.txt'), error.message);
      });
    }, 60_000);
  }
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
  // Software rendering can block the browser thread beyond 30 seconds even
  // after a click lands. Keep the assertions, with a CI-specific action budget.
  page.setDefaultTimeout(softwareRenderer ? 90_000 : 30_000);
  page.on('pageerror', (error) => report.pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(message.text());
  });
  page.on('requestfailed', (request) => report.failedRequests.push(request.url()));
  report.startupViewport = advisoryStartup
    ? { width: 320, height: 240 }
    : { width: 1440, height: 1000 };
  await page.setViewportSize(report.startupViewport);
  await checkpoint('page-navigation');
  await page.goto(
    `http://127.0.0.1:4398${base}?benchmark=${report.camera}&time=12&quality=low&operations=on&pa=off`,
    {
      waitUntil: 'domcontentloaded',
    }
  );
  await checkpoint('scene-loading');
  if (metalRenderer) {
    await checkpoint('metal-context');
    await page.waitForFunction(() => window.__MILLOS_RUNTIME__?.ready, null, {
      timeout: startupTimeoutMs,
    });
    report.webgl = await page.evaluate(() => {
      // Reuse the mounted R3F context, never create a substitute probe context.
      const canvas = document.querySelector('canvas[data-engine^="three.js"]');
      const gl = canvas?.getContext('webgl2');
      if (!gl) return null;
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
        vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
        version: gl.getParameter(gl.VERSION),
        contextLost: gl.isContextLost(),
      };
    });
    assert.ok(report.webgl, 'The actual mill scene must have a WebGL2 context');
    assert.equal(report.webgl.contextLost, false);
    assert.match(report.webgl.renderer ?? '', /ANGLE Metal Renderer/i);
    assert.doesNotMatch(
      `${report.webgl.renderer} ${report.gpu.auxAttributes?.glRenderer}`,
      /swiftshader|llvmpipe|softpipe|\bwarp\b|software/i,
      'Metal acceptance must not fall back to a software WebGL driver'
    );
    await checkpoint('scene-loading');
  }
  // This gate checks advisory UI. The low-fill sun camera and startup viewport
  // retain the full world, assets and static batches with less raster work.
  // Readiness here applies to this viewport; both real-size UI flows follow.
  // Normal startup is mandatory; no loader bypass or production change exists.
  // Working if software CI exercises both layouts only after actual startup.
  await page.waitForFunction(
    () =>
      window.__MILLOS_RUNTIME__?.ready &&
      document.documentElement.dataset.millosWorldReady === 'true' &&
      document.documentElement.dataset.millosStartupReady === 'true' &&
      !document.querySelector('[aria-label="Loading MillOS"]'),
    null,
    // The software trace was still preparing when a task crossed 240 seconds.
    // Allow one more minute of preparation; retain every readiness condition.
    { polling: 400, timeout: startupTimeoutMs }
  );
  // CompleteWorldMarker fires on mount, before incremental static batching.
  // Read the batcher's readiness counter directly. Runtime snapshot() performs
  // geometry raycasts as well as counting objects, so it is unsuitable for polling.
  report.phase = 'scene-batching';
  await writeFile(path.join(output, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
  const settlingStarted = Date.now();
  await page.waitForFunction(
    () => {
      const now = performance.now();
      if (document.documentElement.dataset.millosStaticBatchesPending !== '0') {
        window.jevSceneStableSince = now;
        return false;
      }
      window.jevSceneStableSince ??= now;
      return now - window.jevSceneStableSince >= 2000;
    },
    null,
    { polling: 400, timeout: 240_000 }
  );
  report.settlingMs = Date.now() - settlingStarted;

  report.phase = 'loader-dismissal';
  await page.getByRole('progressbar', { name: 'Loading MillOS' }).waitFor({ state: 'hidden' });

  for (const width of [1440, 390]) {
    report.phase = `layout-${width}`;
    await writeFile(path.join(output, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    // AI Partner lives in the dock's More menu (Dock.tsx), as in master-refinement.spec.
    await page.getByRole('button', { name: 'More workspaces and view controls' }).click();
    await page.getByRole('menuitem', { name: 'AI Partner I', exact: true }).click();
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
  report.hostLoad = { logicalCores: cpus().length, averages: loadavg() };
  if (page) {
    let diagnosticTimer;
    try {
      report.startupState = await Promise.race([
        page.evaluate(() => ({
          runtimeReady: window.__MILLOS_RUNTIME__?.ready ?? false,
          worldReady: document.documentElement.dataset.millosWorldReady ?? null,
          startupReady: document.documentElement.dataset.millosStartupReady ?? null,
          batchesPending: document.documentElement.dataset.millosStaticBatchesPending ?? null,
          visibility: document.visibilityState,
          framePacing: window.__MILLOS_RUNTIME__?.framePacingSnapshot() ?? null,
          loaderText: document.querySelector('[role="dialog"][aria-label="Loading MillOS"]')
            ?.textContent,
        })),
        new Promise((_, reject) => {
          diagnosticTimer = setTimeout(
            () => reject(new Error('Startup diagnostic timed out')),
            5000
          );
        }),
      ]);
    } catch (diagnosticError) {
      report.startupStateError = diagnosticError.message;
    } finally {
      clearTimeout(diagnosticTimer);
    }
    await page
      .screenshot({ path: path.join(output, 'failure.png'), timeout: 5000 })
      .catch((error) => {
        report.failureScreenshotError = error.message;
      });
  }
  process.exitCode = 1;
} finally {
  clearTimeout(diagnosticTimer);
  report.hostLoad ??= { logicalCores: cpus().length, averages: loadavg() };
  await writeFile(path.join(output, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await nativeSamples;
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
  await lock.release();
}
