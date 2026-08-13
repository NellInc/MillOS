import { spawn } from 'node:child_process';
import { mkdir, access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const ROOT = process.cwd();
const DEFAULT_OUTPUT = path.join(ROOT, 'test-results', 'runtime-benchmarks');
const DEFAULT_SCENES = ['overview', 'interior', 'shipping', 'receiving', 'water'];
const PERF_SYSTEMS = {
  trucks: 'disableTruckBay',
  workers: 'disableWorkerSystem',
  forklifts: 'disableForkliftSystem',
  conveyors: 'disableConveyorSystem',
  machines: 'disableMachines',
  environment: 'disableEnvironment',
  terrain: 'disableTerrain',
};
const NETWORK_PROFILES = {
  native: null,
  'fast-3g': {
    latencyMs: 150,
    downloadBitsPerSecond: 1_600_000,
    uploadBitsPerSecond: 750_000,
    connectionType: 'cellular3g',
  },
};
const PA_MODES = new Set(['focused', 'characterful', 'off']);

function readArgument(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

if (hasFlag('help') || hasFlag('h')) {
  console.log(`MillOS native runtime benchmark

Usage:
  node scripts/run-performance-benchmark.mjs [options]

Options:
  --base-url=<url>          Reuse an existing preview instead of starting one
  --port=<number>           Local preview port when --base-url is absent; default 4173
  --channel=<name>          Browser channel, defaults to chrome; use an empty value for bundled Chromium
  --quality=<tier>          low, medium, high, or ultra; default medium
  --device-scale-factor=<n> Browser device scale factor, from 1 to 3; default 2
  --scenes=<list>           Comma-separated fixed scene names
  --duration=<seconds>      Sample duration per scene, from 2 to 300; default 10
  --warmup=<seconds>        Warmup duration per scene, from 0 to 60; default 5
  --time=<hour>             Simulation hour, from 0 to 24; default 12
  --weather=<name>          clear, cloudy, rain, or storm; default clear
  --scada=<on|off>          SCADA visibility for the run; default on
  --pa=<mode>               focused, characterful, or off; default focused
  --motion                  Advance the deterministic simulation during capture
  --art                     Art-review fidelity: allow reduced-motion visuals and
                            procedural textures so screenshots match the shipping
                            image. Frame samples are then indicative, not a budget gate.
  --compare-scada           Capture paired SCADA-off and SCADA-on samples
  --disable-systems=<list>  Comma-separated isolation aliases: ${Object.keys(PERF_SYSTEMS).join(', ')}
  --network-profile=<name>  native or fast-3g; default native
  --startup-only            Measure the first useful frame without waiting for
                            the complete authored world to finish streaming
  --output=<directory>      Evidence directory
  --headed                  Show the browser window
  --report-only             Write evidence without failing the process on a missed budget
  --help                    Show this help without launching a browser`);
  process.exit(0);
}

function finiteNumber(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

const options = {
  baseUrl: readArgument('base-url', ''),
  previewPort: finiteNumber(readArgument('port', '4173'), 4173, 1024, 65535),
  durationSeconds: finiteNumber(readArgument('duration', '10'), 10, 2, 300),
  warmupSeconds: finiteNumber(readArgument('warmup', '5'), 5, 0, 60),
  scenes: readArgument('scenes', DEFAULT_SCENES.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  quality: readArgument('quality', 'medium'),
  deviceScaleFactor: finiteNumber(readArgument('device-scale-factor', '2'), 2, 1, 3),
  time: finiteNumber(readArgument('time', '12'), 12, 0, 24),
  weather: readArgument('weather', 'clear'),
  scadaEnabled: readArgument('scada', 'on') !== 'off',
  paMode: readArgument('pa', 'focused'),
  motionEnabled: hasFlag('motion'),
  artMode: hasFlag('art'),
  compareScada: hasFlag('compare-scada'),
  startupOnly: hasFlag('startup-only'),
  output: path.resolve(readArgument('output', DEFAULT_OUTPUT)),
  headed: hasFlag('headed'),
  browserChannel: readArgument('channel', 'chrome'),
  reportOnly: hasFlag('report-only'),
  networkProfile: readArgument('network-profile', 'native'),
  disabledSystems: readArgument('disable-systems', '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
};

if (!(options.networkProfile in NETWORK_PROFILES)) {
  throw new Error(
    `Unknown network profile "${options.networkProfile}". Expected one of: ${Object.keys(NETWORK_PROFILES).join(', ')}.`
  );
}
if (!PA_MODES.has(options.paMode)) {
  throw new Error(
    `Unknown PA mode "${options.paMode}". Expected one of: ${[...PA_MODES].join(', ')}.`
  );
}
if (options.startupOnly && (options.compareScada || options.motionEnabled)) {
  throw new Error('--startup-only cannot be combined with --compare-scada or --motion.');
}
const unknownSystems = options.disabledSystems.filter((system) => !(system in PERF_SYSTEMS));
if (unknownSystems.length > 0) {
  throw new Error(
    `Unknown performance systems: ${unknownSystems.join(', ')}. Expected: ${Object.keys(PERF_SYSTEMS).join(', ')}.`
  );
}

const budgets = {
  firstFrameMs: 8000,
  averageFps: 55,
  p95FrameMs: 25,
  effectiveDpr: 1,
  maximumLongTaskMs: 100,
};

let previewProcess = null;

async function waitForServer(url, timeoutMs = 30000) {
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
    throw new Error('dist/index.html is missing. Run npm run build before the benchmark.');
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

function evaluateBudgets(snapshot) {
  const longestTask = Math.max(0, ...snapshot.longTasks.map((task) => task.duration));
  const enforceWorldIntegrity = options.disabledSystems.length === 0;
  const checks = {
    firstFrame: snapshot.firstFrameAt !== null && snapshot.firstFrameAt <= budgets.firstFrameMs,
    averageFps: snapshot.averageFps >= budgets.averageFps,
    p95Frame: snapshot.p95FrameMs <= budgets.p95FrameMs,
    effectiveDpr: snapshot.canvas.effectiveDpr >= budgets.effectiveDpr,
    longTasks: longestTask <= budgets.maximumLongTaskMs,
    worldIntegrity: !enforceWorldIntegrity || snapshot.worldIntegrity?.passed === true,
  };
  return {
    checks,
    passed: Object.values(checks).every(Boolean),
    longestTask,
  };
}

function evaluateStartupBudget(snapshot) {
  const checks = {
    firstFrame: snapshot.firstFrameAt !== null && snapshot.firstFrameAt <= budgets.firstFrameMs,
    effectiveDpr: snapshot.canvas.effectiveDpr >= budgets.effectiveDpr,
  };
  return {
    checks,
    passed: Object.values(checks).every(Boolean),
    longestTask: Math.max(0, ...snapshot.longTasks.map((task) => task.duration)),
  };
}

async function captureStartup(page) {
  return page.evaluate(() => {
    const compactEntry = (entry) => ({
      name: entry.name,
      entryType: entry.entryType,
      initiatorType: 'initiatorType' in entry ? entry.initiatorType : undefined,
      startTime: Number(entry.startTime.toFixed(2)),
      duration: Number(entry.duration.toFixed(2)),
      responseStart: 'responseStart' in entry ? Number(entry.responseStart.toFixed(2)) : undefined,
      responseEnd: 'responseEnd' in entry ? Number(entry.responseEnd.toFixed(2)) : undefined,
      transferSize: 'transferSize' in entry ? entry.transferSize : undefined,
      encodedBodySize: 'encodedBodySize' in entry ? entry.encodedBodySize : undefined,
      decodedBodySize: 'decodedBodySize' in entry ? entry.decodedBodySize : undefined,
    });
    const marks = Object.fromEntries(
      performance
        .getEntriesByType('mark')
        .filter((entry) => entry.name.startsWith('millos:'))
        .map((entry) => [entry.name, Number(entry.startTime.toFixed(2))])
    );
    return {
      marks,
      navigation: performance.getEntriesByType('navigation').map(compactEntry),
      resources: performance
        .getEntriesByType('resource')
        .map(compactEntry)
        .sort((left, right) => left.startTime - right.startTime),
      paints: performance.getEntriesByType('paint').map(compactEntry),
      runtime: window.__MILLOS_RUNTIME__?.snapshot(),
    };
  });
}

async function waitForRuntimeStage(page, label, predicate, timeoutMs, diagnostics) {
  try {
    await page.waitForFunction(predicate, null, { timeout: timeoutMs });
  } catch (error) {
    const pageState = await page
      .evaluate(() => ({
        url: location.href,
        documentReadyState: document.readyState,
        htmlDataset: { ...document.documentElement.dataset },
        loadingOverlayPresent: document.querySelector('[aria-label="Loading MillOS"]') !== null,
        runtimePresent: typeof window.__MILLOS_RUNTIME__ !== 'undefined',
        runtimeReady: window.__MILLOS_RUNTIME__?.ready ?? null,
        marks: Object.fromEntries(
          performance
            .getEntriesByType('mark')
            .filter((entry) => entry.name.startsWith('millos:'))
            .map((entry) => [entry.name, Number(entry.startTime.toFixed(2))])
        ),
        bodyText: document.body.innerText.slice(0, 500),
      }))
      .catch((stateError) => ({ evaluationError: String(stateError) }));
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${label} did not become ready within ${timeoutMs} ms: ${cause}\n${JSON.stringify(
        { ...diagnostics, pageState },
        null,
        2
      )}`,
      { cause: error }
    );
  }
}

function summarizeMotion(samples) {
  const numericTelemetryKeys = [
    'speed',
    'steeringAngle',
    'wheelRotation',
    'forkHeight',
    'mastTilt',
    'trailerAngle',
    'doorOpenAmount',
    'landingGearAmount',
  ];
  const entities = new Map();
  for (const sample of samples) {
    for (const entity of sample.entities) {
      const current = entities.get(entity.id) ?? {
        id: entity.id,
        type: entity.type,
        distance: 0,
        phases: [],
        cargoStates: [],
        telemetry: {},
        lastPosition: null,
      };
      if (current.lastPosition) {
        current.distance += Math.hypot(
          entity.position[0] - current.lastPosition[0],
          entity.position[1] - current.lastPosition[1],
          entity.position[2] - current.lastPosition[2]
        );
      }
      if (entity.phase && current.phases.at(-1) !== entity.phase) {
        current.phases.push(entity.phase);
      }
      if (entity.cargo && current.cargoStates.at(-1) !== entity.cargo) {
        current.cargoStates.push(entity.cargo);
      }
      for (const key of numericTelemetryKeys) {
        const value = entity[key];
        if (!Number.isFinite(value)) continue;
        const metric = current.telemetry[key] ?? {
          first: value,
          last: value,
          min: value,
          max: value,
        };
        metric.last = value;
        metric.min = Math.min(metric.min, value);
        metric.max = Math.max(metric.max, value);
        current.telemetry[key] = metric;
      }
      current.lastPosition = entity.position;
      entities.set(entity.id, current);
    }
  }
  return [...entities.values()].map((withLastPosition) => {
    const entity = { ...withLastPosition };
    delete entity.lastPosition;
    return {
      ...entity,
      distance: Number(entity.distance.toFixed(2)),
      telemetry: Object.fromEntries(
        Object.entries(entity.telemetry).map(([key, metric]) => [
          key,
          {
            min: Number(metric.min.toFixed(4)),
            max: Number(metric.max.toFixed(4)),
            delta: Number((metric.last - metric.first).toFixed(4)),
          },
        ])
      ),
    };
  });
}

async function waitForRuntimeSettled(
  page,
  { timeoutMs = 30000, requiredStableMs = 2000, pollMs = 400 } = {}
) {
  const startedAt = performance.now();
  let previousSignature = '';
  let stableSince = performance.now();

  while (performance.now() - startedAt < timeoutMs) {
    const state = await page.evaluate(() => {
      const runtime = window.__MILLOS_RUNTIME__;
      const snapshot = runtime?.snapshot();
      if (!snapshot) return { signature: '', pendingStaticBatches: 0 };
      return {
        signature: JSON.stringify({
          objects: snapshot.sceneGraph.objects,
          meshes: snapshot.sceneGraph.meshes,
          instancedMeshes: snapshot.sceneGraph.instancedMeshes,
        }),
        pendingStaticBatches: Number(
          document.documentElement.dataset.millosStaticBatchesPending ?? '0'
        ),
      };
    });

    const now = performance.now();
    if (state.pendingStaticBatches > 0) {
      previousSignature = '';
      stableSince = now;
    } else if (state.signature && state.signature === previousSignature) {
      if (now - stableSince >= requiredStableMs) {
        return {
          waitMs: Math.round(now - startedAt),
          stableMs: Math.round(now - stableSince),
          pendingStaticBatches: state.pendingStaticBatches,
          signature: JSON.parse(state.signature),
        };
      }
    } else {
      previousSignature = state.signature;
      stableSince = now;
    }
    await page.waitForTimeout(pollMs);
  }

  throw new Error(
    `Runtime scene graph did not remain stable for ${requiredStableMs} ms within ${timeoutMs} ms.`
  );
}

async function runScene(context, baseUrl, scene, scadaEnabled = options.scadaEnabled) {
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];
  const networkProfile = NETWORK_PROFILES[options.networkProfile];

  if (networkProfile) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: networkProfile.latencyMs,
      downloadThroughput: networkProfile.downloadBitsPerSecond / 8,
      uploadThroughput: networkProfile.uploadBitsPerSecond / 8,
      connectionType: networkProfile.connectionType,
    });
  }

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    failedRequests.push({
      url: request.url(),
      error: request.failure()?.errorText ?? 'unknown',
    });
  });

  const query = new URLSearchParams({
    benchmark: scene,
    duration: String(options.durationSeconds),
    quality: options.quality,
    time: String(options.time),
    weather: options.weather,
    scada: scadaEnabled ? 'on' : 'off',
    pa: options.paMode,
    motion: options.motionEnabled ? 'on' : 'off',
    art: options.artMode ? 'on' : 'off',
  });
  const startedAt = performance.now();
  await page.goto(`${baseUrl}/?${query}`, {
    waitUntil: 'domcontentloaded',
    timeout: 90000,
  });
  await waitForRuntimeStage(
    page,
    'MillOS runtime',
    () => window.__MILLOS_RUNTIME__?.ready === true,
    90000,
    { consoleErrors, pageErrors, failedRequests }
  );
  // Runtime readiness and the visible useful frame are the same acceptance
  // surface. A stale or racing loading overlay must fail the benchmark rather
  // than silently contaminating screenshots that otherwise report green.
  await page.waitForFunction(
    () => document.querySelector('[aria-label="Loading MillOS"]') === null,
    null,
    { timeout: 12000 }
  );
  if (options.startupOnly) {
    const startup = await captureStartup(page);
    const snapshot = startup.runtime;
    if (!snapshot) throw new Error(`Runtime telemetry was unavailable for scene ${scene}`);
    const screenshotPath = path.join(options.output, `${scene}-startup.png`);
    let screenshotError = null;
    await page
      .screenshot({ path: screenshotPath, fullPage: false, timeout: 30000 })
      .catch((error) => {
        screenshotError = error instanceof Error ? error.message : String(error);
      });
    const result = {
      scene,
      variant: 'startup-only',
      scadaEnabled,
      url: page.url(),
      wallClockMs: Math.round(performance.now() - startedAt),
      snapshot,
      domStacks: null,
      budget: evaluateStartupBudget(snapshot),
      diagnostics: {
        consoleErrors,
        pageErrors,
        failedRequests,
        screenshotError,
      },
      screenshotPath,
      runtimeSettle: null,
      startup,
      motionStart: null,
      motionSamples: [],
      motionSummary: [],
      motionDelta: null,
    };
    await page.close();
    return result;
  }
  // The first useful frame is deliberately lightweight. Steady-state samples
  // must wait for the complete authored factory/world module before judging
  // draw calls or frame pacing, otherwise a fast network can accidentally be
  // compared with the staged preview on a throttled network.
  await waitForRuntimeStage(
    page,
    'Complete authored world',
    () => document.documentElement.dataset.millosWorldReady === 'true',
    90000,
    { consoleErrors, pageErrors, failedRequests }
  );
  if (options.disabledSystems.length > 0) {
    await page.evaluate(
      ({ systems, mapping }) => {
        const patch = Object.fromEntries(systems.map((system) => [mapping[system], true]));
        window.__MILLOS_RUNTIME__?.setPerfDebug(patch);
      },
      { systems: options.disabledSystems, mapping: PERF_SYSTEMS }
    );
    // Give React, lazy boundaries, and static batches a deterministic settling
    // interval before the ordinary warmup window begins.
    await page.waitForTimeout(2000);
  }

  await page.waitForTimeout(options.warmupSeconds * 1000);
  // First-useful-frame latency and steady-state frame pacing are separate
  // contracts. The complete authored site is intentionally staged after the
  // useful core frame, so wait for its object, material, geometry, and program
  // counts to settle before resetting the ten-second pacing sample. Renderer
  // resource and call counters are deliberately excluded because animated
  // materials, text atlases, and visibility can update them after topology is
  // complete.
  const runtimeSettle = await waitForRuntimeSettled(page);
  const motionStart = options.motionEnabled
    ? await page.evaluate(() => window.__MILLOS_RUNTIME__?.motionSnapshot())
    : null;
  if (options.motionEnabled) {
    await page.screenshot({
      path: path.join(options.output, `${scene}-motion-start.png`),
      fullPage: false,
      timeout: 30000,
    });
  }
  const startup = await captureStartup(page);
  // Screenshot capture can synchronously composite the WebGL surface for
  // hundreds of milliseconds. It is evidence collection, not application
  // frame work, so reset telemetry after the capture and before sampling.
  await page.evaluate(() => window.__MILLOS_RUNTIME__?.reset());
  const motionSamples = motionStart ? [{ elapsedMs: 0, ...motionStart }] : [];
  if (options.motionEnabled) {
    const durationMs = options.durationSeconds * 1000;
    const sampleIntervalMs = 2000;
    let elapsedMs = 0;
    while (elapsedMs < durationMs) {
      const waitMs = Math.min(sampleIntervalMs, durationMs - elapsedMs);
      await page.waitForTimeout(waitMs);
      elapsedMs += waitMs;
      const motion = await page.evaluate(() => window.__MILLOS_RUNTIME__?.motionSnapshot());
      if (motion) motionSamples.push({ elapsedMs, ...motion });
    }
  } else {
    await page.waitForTimeout(options.durationSeconds * 1000);
  }
  const snapshot = await page.evaluate(() => window.__MILLOS_RUNTIME__?.snapshot());
  if (!snapshot) throw new Error(`Runtime telemetry was unavailable for scene ${scene}`);
  const domStacks = await page.evaluate(() => {
    const describe = (element) => {
      const html = element;
      return {
        tag: html.tagName.toLowerCase(),
        id: html.id,
        classes: typeof html.className === 'string' ? html.className : '',
        role: html.getAttribute('role') ?? '',
      };
    };
    return {
      top: document
        .elementsFromPoint(innerWidth / 2, 10)
        .slice(0, 8)
        .map(describe),
      centre: document
        .elementsFromPoint(innerWidth / 2, innerHeight / 2)
        .slice(0, 8)
        .map(describe),
    };
  });

  const variant = options.compareScada ? `scada-${scadaEnabled ? 'on' : 'off'}` : 'default';
  const screenshotPath = path.join(
    options.output,
    options.compareScada ? `${scene}-${variant}.png` : `${scene}.png`
  );
  let screenshotError = null;
  await page
    .screenshot({ path: screenshotPath, fullPage: false, timeout: 30000 })
    .catch((error) => {
      screenshotError = error instanceof Error ? error.message : String(error);
    });
  const budget = evaluateBudgets(snapshot);
  const result = {
    scene,
    variant,
    scadaEnabled,
    url: page.url(),
    wallClockMs: Math.round(performance.now() - startedAt),
    snapshot,
    domStacks,
    budget,
    diagnostics: {
      consoleErrors,
      pageErrors,
      failedRequests,
      screenshotError,
    },
    screenshotPath,
    runtimeSettle,
    startup,
    motionStart,
    motionSamples,
    motionSummary: summarizeMotion(motionSamples),
    motionDelta:
      motionStart === null
        ? null
        : {
            start: motionStart,
            end: snapshot.motion,
          },
  };
  await page.close();
  return result;
}

async function main() {
  await mkdir(options.output, { recursive: true });
  const baseUrl = options.baseUrl || (await startPreview());
  const browser = await chromium.launch({
    headless: !options.headed,
    channel: options.browserChannel || undefined,
  });

  const results = [];
  try {
    for (const scene of options.scenes) {
      // A fresh context per fixed scene prevents closed WebGL pages from
      // contaminating later measurements with accumulated renderer and GC
      // pressure. Paired SCADA variants intentionally share their context.
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: options.deviceScaleFactor,
        // Perf runs pin reduced motion so samples stay comparable. That also
        // suppresses dust, ambient detail, and PA motion, which are part of the
        // shipping image — so art review must capture with motion allowed.
        reducedMotion: options.artMode ? 'no-preference' : 'reduce',
        colorScheme: 'dark',
        serviceWorkers: options.networkProfile === 'native' ? 'allow' : 'block',
      });
      try {
        if (options.compareScada) {
          results.push(await runScene(context, baseUrl, scene, false));
          results.push(await runScene(context, baseUrl, scene, true));
        } else {
          results.push(await runScene(context, baseUrl, scene));
        }
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
    await stopPreview();
  }

  const scadaComparisons = options.compareScada
    ? options.scenes
        .map((scene) => {
          const off = results.find((result) => result.scene === scene && !result.scadaEnabled);
          const on = results.find((result) => result.scene === scene && result.scadaEnabled);
          if (!off || !on) return null;
          return {
            scene,
            off: {
              p95FrameMs: off.snapshot.p95FrameMs,
              averageFrameMs: off.snapshot.averageFrameMs,
              calls: off.snapshot.renderer.calls,
            },
            on: {
              p95FrameMs: on.snapshot.p95FrameMs,
              averageFrameMs: on.snapshot.averageFrameMs,
              calls: on.snapshot.renderer.calls,
            },
            delta: {
              p95FrameMs: Number((on.snapshot.p95FrameMs - off.snapshot.p95FrameMs).toFixed(2)),
              averageFrameMs: Number(
                (on.snapshot.averageFrameMs - off.snapshot.averageFrameMs).toFixed(2)
              ),
              calls: on.snapshot.renderer.calls - off.snapshot.renderer.calls,
            },
            withinOneMillisecond: Math.abs(on.snapshot.p95FrameMs - off.snapshot.p95FrameMs) < 1,
          };
        })
        .filter(Boolean)
    : [];
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    browser: options.browserChannel
      ? `Playwright ${options.browserChannel} channel`
      : 'Playwright Chromium',
    options,
    throttle:
      NETWORK_PROFILES[options.networkProfile] === null
        ? { networkProfile: 'native', cacheDisabled: false, serviceWorkers: 'allow' }
        : {
            networkProfile: options.networkProfile,
            ...NETWORK_PROFILES[options.networkProfile],
            cacheDisabled: true,
            serviceWorkers: 'block',
          },
    budgets,
    systemComparisons: {
      scada: scadaComparisons,
    },
    passed: results.every((result) => result.budget.passed),
    results,
  };
  const reportPath = path.join(options.output, 'benchmark.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  for (const result of results) {
    const metric = result.snapshot;
    if (options.startupOnly) {
      console.log(
        `${result.scene} startup: ${metric.firstFrameAt.toFixed(1)} ms first useful frame, DPR ${metric.canvas.effectiveDpr.toFixed(2)}, ${result.budget.passed ? 'PASS' : 'FAIL'}`
      );
    } else {
      console.log(
        `${result.scene}${options.compareScada ? ` (${result.variant})` : ''}: ${metric.averageFps.toFixed(1)} FPS, p95 ${metric.p95FrameMs.toFixed(1)} ms, ${metric.renderer.calls} calls, DPR ${metric.canvas.effectiveDpr.toFixed(2)}, world ${metric.worldIntegrity?.passed ? 'continuous' : options.disabledSystems.length > 0 ? 'isolated' : 'BROKEN'}, ${result.budget.passed ? 'PASS' : 'FAIL'}`
      );
    }
  }
  for (const comparison of scadaComparisons) {
    console.log(
      `${comparison.scene} SCADA delta: p95 ${comparison.delta.p95FrameMs.toFixed(1)} ms, average ${comparison.delta.averageFrameMs.toFixed(1)} ms, calls ${comparison.delta.calls >= 0 ? '+' : ''}${comparison.delta.calls}, ${comparison.withinOneMillisecond ? 'WITHIN 1 MS' : 'OVER 1 MS'}`
    );
  }
  console.log(`Report: ${reportPath}`);

  if (!report.passed && !options.reportOnly) process.exitCode = 1;
}

main().catch(async (error) => {
  await stopPreview();
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
