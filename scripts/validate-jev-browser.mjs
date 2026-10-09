// Built-assembly UI gate. Only synthetic keys/text and intercepted provider responses.
// Working if desktop/mobile can submit manually, forget credentials, and make no unsolicited calls.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { cpus, loadavg } from 'node:os';
import { performance } from 'node:perf_hooks';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { acquireCaptureLock } from './lib/capture-lock.mjs';
import {
  assertHostedMetalCompositor,
  assertMetalBrowserAdmission,
} from './lib/metal-browser-admission.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const installedChrome = process.argv.includes('--installed-chrome');
const output = path.join(
  root,
  installedChrome ? 'test-results/jev-browser-installed' : 'test-results/jev-browser'
);
const localMetalDist = process.argv
  .find((argument) => argument.startsWith('--local-metal-dist='))
  ?.split('=')
  .slice(1)
  .join('=');
const builtDirectory = localMetalDist ? path.resolve(localMetalDist) : path.join(root, 'dist');
const softwareRenderer = process.argv.includes('--software-renderer');
const metalRenderer = process.argv.includes('--metal-renderer') || !!localMetalDist;
const softwareCompositor = process.argv.includes('--software-compositor');
const advisoryStartup = softwareRenderer || metalRenderer;
const startupTimeoutMs = softwareRenderer ? 300_000 : 240_000;
const hostedMetalChrome =
  installedChrome &&
  metalRenderer &&
  !localMetalDist &&
  !softwareRenderer &&
  process.platform === 'darwin' &&
  process.env.GITHUB_ACTIONS === 'true';
if (softwareCompositor) {
  assertHostedMetalCompositor({
    metalRenderer,
    softwareRenderer,
    localMetalDist,
    platform: process.platform,
    githubActions: process.env.GITHUB_ACTIONS,
  });
}
if (
  metalRenderer &&
  (process.platform !== 'darwin' ||
    (!localMetalDist && process.env.GITHUB_ACTIONS !== 'true') ||
    (!!localMetalDist && process.env.GITHUB_ACTIONS === 'true') ||
    softwareRenderer ||
    (installedChrome && !hostedMetalChrome))
) {
  throw new Error(
    'Metal acceptance requires macOS Chromium or the explicit hosted Chrome contrast, with local diagnostics separate from CI'
  );
}
if (
  installedChrome &&
  !hostedMetalChrome &&
  (process.platform !== 'linux' || process.env.GITHUB_ACTIONS !== 'true')
) {
  throw new Error('Installed Chrome acceptance requires a disposable GitHub runner');
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
  softwareCompositor,
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
  host: { logicalCores: cpus().length, averages: loadavg() },
  runnerImage: {
    os: process.env.ImageOS ?? null,
    version: process.env.ImageVersion ?? null,
  },
  installedChromePreflightVersion: process.env.MILLOS_CHROME_PREFLIGHT_VERSION ?? null,
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
      // Keep browser compositing on its software path. SwiftShader supplies
      // WebGL only, rather than emulating a GPU for the whole browser.
      // https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md
      ...(softwareRenderer
        ? ['--use-gl=angle', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader']
        : []),
      // Headless otherwise defaults to SwiftShader. Force the Metal backend,
      // then check both CDP and the application's own context below.
      ...(metalRenderer ? ['--enable-gpu', '--use-gl=angle', '--use-angle=metal'] : []),
      ...(softwareCompositor ? ['--disable-gpu-compositing'] : []),
    ],
  });
  report.browserVersion = browser.version();
  await checkpoint('browser-renderer');
  if (installedChrome || metalRenderer) {
    const session = await browser.newBrowserCDPSession();
    try {
      report.browserArguments = (await session.send('Browser.getBrowserCommandLine')).arguments;
      if (hostedMetalChrome) {
        assert.equal(
          report.browserVersion,
          report.installedChromePreflightVersion,
          'Hosted Chrome contrast must retain the preflighted browser version'
        );
        assert.equal(
          report.browserArguments[0],
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          'Hosted Chrome contrast must launch the preflighted installed browser'
        );
      }
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
        assertMetalBrowserAdmission(report.gpu, report.browserArguments, softwareCompositor);
        // Chromium reports a combined WebGL feature status. Prove WebGL2 with
        // the application's actual context, rather than an absent CDP field.
      }
    } finally {
      await session.detach();
    }
  }
  await checkpoint('browser-context');
  const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' });
  // Persist actual work barriers while waiting. A runner timeout can otherwise
  // leave only "scene-loading", hiding resource, context and frame stalls.
  // Working if a timed-out run retains its last observed barriers and cadence.
  report.startupObservationVersion = 2;
  report.startupObservations = [];
  await context.exposeBinding('recordJevStartup', async (_source, value) => {
    report.startupObservations.push({
      ...value,
      host: { at: Date.now(), logicalCores: cpus().length, averages: loadavg() },
    });
    await checkpoint(report.phase);
  });
  await context.addInitScript(() => {
    const intervals = [];
    let previous;
    let rafCallbacks = 0;
    const events = [];
    const recordEvent = (event) => {
      events.push({
        at: performance.now(),
        type: event.type,
        visibility: document.visibilityState,
      });
      if (events.length > 16) events.shift();
    };
    document.addEventListener('visibilitychange', recordEvent);
    document.addEventListener('webglcontextlost', recordEvent, true);
    document.addEventListener('webglcontextrestored', recordEvent, true);
    function observe(now) {
      rafCallbacks++;
      if (previous !== undefined) {
        intervals.push(now - previous);
        if (intervals.length > 45) intervals.shift();
      }
      previous = now;
      requestAnimationFrame(observe);
    }
    requestAnimationFrame(observe);
    setInterval(() => {
      const data = document.documentElement.dataset;
      // Existing timing-only export: no world raycasts, resets or forced frames.
      // Working if timer progress can be compared with independent RAF/R3F
      // counts and events without altering any acceptance condition.
      const pacing = window.__MILLOS_RUNTIME__?.framePacingSnapshot?.();
      window.recordJevStartup({
        at: performance.now(),
        worldReady: data.millosWorldReady,
        batchesPending: data.millosStaticBatchesPending,
        startupReady: data.millosStartupReady,
        visibility: document.visibilityState,
        progress: document
          .querySelector('[aria-label="Loading MillOS"] [role="progressbar"]')
          ?.getAttribute('aria-valuetext'),
        runtimeReady: window.__MILLOS_RUNTIME__?.ready,
        intervals: [...intervals],
        rafCallbacks,
        lastRafAt: previous ?? null,
        framePacing: pacing
          ? {
              capturedAt: pacing.capturedAt,
              firstFrameAt: pacing.firstFrameAt,
              sampleCount: pacing.sampleCount,
              longTasks: pacing.longTasks.slice(-8),
            }
          : null,
        events: [...events],
      });
    }, 5000);
  });

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
  const navigationStartedAt = performance.now();
  const startupDeadline = navigationStartedAt + startupTimeoutMs;
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
  // The sun framing keeps startup/UI admission low-fill. Also present the real
  // assembled factory, using the current authored pose rather than a copied table.
  // Working if the overview image and integrity report retain all world groups.
  const layoutSource = await readFile(path.join(root, 'src/constants/siteLayout.ts'), 'utf8');
  const overview = layoutSource.match(
    /overview:\s*\{\s*position:\s*(\[[^\]]+\])\s*,\s*target:\s*(\[[^\]]+\])/
  );
  assert.ok(overview, 'The authored overview pose must be readable');
  const pose = { position: JSON.parse(overview[1]), target: JSON.parse(overview[2]) };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.keyboard.press('Escape');
  await checkpoint('world-presentation');
  // A newly visible overview can trigger cold rendering work absent from sun framing.
  // Spend only the remainder of the existing startup budget, never an extra window.
  // Working if frames, integrity and the image finish within the navigation deadline.
  const remainingStartupBudget = () => {
    const remaining = Math.ceil(startupDeadline - performance.now());
    assert.ok(remaining > 0, 'Overview must fit the original startup budget');
    return remaining;
  };
  const withinStartupBudget = async (operation) => {
    const remaining = remainingStartupBudget();
    let timer;
    try {
      return await Promise.race([
        operation(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Overview exceeded the original startup budget')),
            remaining
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  report.worldPresentationBudgetMs = remainingStartupBudget();
  await withinStartupBudget(() =>
    page.evaluate(({ position, target }) => {
      window.__MILLOS_RUNTIME__.setCameraPose(position, target);
      window.__MILLOS_RUNTIME__.reset();
    }, pose)
  );
  await page.waitForFunction(
    () => window.__MILLOS_RUNTIME__.framePacingSnapshot().sampleCount >= 3,
    null,
    { polling: 400, timeout: remainingStartupBudget() }
  );
  report.worldPresentation = await withinStartupBudget(() =>
    page.evaluate(() => window.__MILLOS_RUNTIME__.snapshot())
  );
  assert.equal(report.worldPresentation.worldIntegrity.passed, true);
  await page.screenshot({
    path: path.join(output, 'world-overview.png'),
    timeout: remainingStartupBudget(),
  });
  report.worldPresentationElapsedMs = performance.now() - navigationStartedAt;
  assert.ok(
    report.worldPresentationElapsedMs <= startupTimeoutMs,
    'Overview must finish within the original startup budget'
  );
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
  await writeFile(path.join(output, 'result.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  await browser?.close();
  if (server) await new Promise((resolve) => server.httpServer.close(resolve));
  await lock.release();
}
