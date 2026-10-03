import { execFileSync, spawn } from 'node:child_process';
import { cpus, loadavg } from 'node:os';
import { mkdir, access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { acquireCaptureLock } from './lib/capture-lock.mjs';
import { classifyDiagnostics } from './lib/diagnostics.mjs';

const ROOT = process.cwd();
const DEFAULT_OUTPUT = path.join(ROOT, 'test-results', 'runtime-benchmarks');
const DEFAULT_SCENES = ['overview', 'interior', 'shipping', 'receiving', 'water'];
const PERF_SYSTEMS = {
  trucks: 'disableTruckBay',
  forklifts: 'disableForkliftSystem',
  conveyors: 'disableConveyorSystem',
  machines: 'disableMachines',
  community: 'disableCommunityLife',
  environment: 'disableEnvironment',
  terrain: 'disableTerrain',
  lights: 'disablePunctualLights',
  'lighting-polish': 'disableLightingPolish',
  surfaces: 'disableSurfaceTreatment',
  ao: 'disableAmbientOcclusion',
  bloom: 'disableBloom',
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
const CELESTIAL_EVIDENCE_TIMES = Object.freeze({ sun: 12, moon: 0 });

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
  --startup-only            Capture startup marks at the complete first reveal,
                            without the subsequent steady-state sample
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
  // Static batching runs on setTimeout(0) chunks, so on a loaded machine the
  // scene graph can take far longer than 30 s to settle. The default is
  // unchanged; the flag exists so a capture under load can wait rather than
  // report a topology that is still being built.
  settleTimeoutSeconds: finiteNumber(readArgument('settle-timeout', '30'), 30, 5, 600),
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
  firstFrameMs: options.networkProfile === 'native' ? 350 : 3200,
  averageFps: 60,
  p95FrameMs: 16.7,
  p99FrameMs: 25,
  onePercentLowFps: 45,
  effectiveDprTolerance: 0.03,
  maximumLongTaskMs: 100,
  maximumFramesOver50Ms: 0,
};

function expectedEffectiveDpr(snapshot) {
  const maximumDpr = snapshot.quality === 'low' ? 1 : 2;
  return Math.max(0.4, Math.min(options.deviceScaleFactor * snapshot.resolutionScale, maximumDpr));
}

function evaluateEffectiveDpr(snapshot) {
  const expected = expectedEffectiveDpr(snapshot);
  const measured = snapshot.canvas.effectiveDpr;
  const delta = Math.abs(measured - expected);
  return {
    passed: delta <= budgets.effectiveDprTolerance,
    expected: Number(expected.toFixed(2)),
    measured: Number(measured.toFixed(2)),
    delta: Number(delta.toFixed(3)),
  };
}

let previewProcess = null;
let captureLock = null;

/**
 * Load per core above which frame timings stop describing the scene.
 *
 * Calibrated against two measured runs of the same commit rather than picked:
 *
 * | load / core | overview | water        |
 * |-------------|----------|--------------|
 * | 6.38        | 63.7 FPS | 48.5 FPS FAIL|
 * | 1.23-1.66   | 99.8 FPS | 74.5 FPS PASS|
 *
 * A developer machine with an editor, browsers and a few agents sits around
 * 1.2-1.7 per core and measures perfectly well, so the obvious threshold of 1.0
 * fires on every healthy run - and a warning that always fires is one nobody
 * reads, which is the same failure this harness's diagnostics gate exists to
 * prevent. 3.0 sits clear of the healthy band with margin and still catches the
 * 6.4 case by a wide margin.
 */
const CONTENDED_LOAD_PER_CORE = 3;

/**
 * What else the machine was doing, recorded next to every frame timing.
 *
 * `.capture.lock` serialises renderers against each other, but it cannot stop a
 * backup, a VM, or another repo's test suite from taking the CPU. A run taken at
 * load average 63 on a 10-core box reported every scene roughly 20 FPS slower
 * than the same commit did on a quiet machine, and one scene failed its budget
 * purely from that. Without this field, the next reader sees only the FAIL and
 * goes looking for a regression that is not there.
 *
 * Reported, never enforced: the honest response to a loaded machine is to re-run
 * later, not to relax a budget.
 */
function machineLoad() {
  const cores = cpus().length || 1;
  const [oneMinute, fiveMinute] = loadavg();
  return {
    cores,
    loadAverage1m: Number(oneMinute.toFixed(2)),
    loadAverage5m: Number(fiveMinute.toFixed(2)),
    loadPerCore: Number((oneMinute / cores).toFixed(2)),
    contendedThreshold: CONTENDED_LOAD_PER_CORE,
    contended: oneMinute / cores > CONTENDED_LOAD_PER_CORE,
  };
}

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
  const indexPath = path.join(ROOT, 'dist', 'index.html');
  await access(indexPath).catch(() => {
    throw new Error('dist/index.html is missing. Run npm run build before the benchmark.');
  });

  const builtIndex = await readFile(indexPath, 'utf8');
  const versionMatch = builtIndex.match(/(?:src|href)=["']\/(v\d+\.\d+)\/assets\//);
  const builtVersion = versionMatch?.[1] ?? '';
  const previewBase = builtVersion ? `/${builtVersion}` : '';
  const rootUrl = `http://127.0.0.1:${options.previewPort}`;
  const url = `${rootUrl}${previewBase}`;
  const viteEntry = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  let previewStdout = '';
  let previewStderr = '';
  const previewEnvironment = { ...process.env, BROWSER: 'none' };
  if (builtVersion) previewEnvironment.VERSION = builtVersion;
  else delete previewEnvironment.VERSION;
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
      env: previewEnvironment,
    }
  );
  previewProcess.stderr.on('data', (chunk) => {
    previewStderr += chunk;
  });
  previewProcess.stdout.on('data', (chunk) => {
    previewStdout += chunk;
  });
  try {
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
  } catch (error) {
    await stopPreview();
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${cause}\nPreview stdout: ${previewStdout.trim() || 'none'}\n` +
        `Preview stderr: ${previewStderr.trim() || 'none'}`
    );
  }
  return url;
}

async function stopPreview() {
  if (!previewProcess || previewProcess.killed || previewProcess.exitCode !== null) return;
  previewProcess.kill('SIGTERM');
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 3000);
    previewProcess.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function evaluateBudgets(snapshot, diagnostics) {
  const longestTask = Math.max(0, ...snapshot.longTasks.map((task) => task.duration));
  const enforceWorldIntegrity = options.disabledSystems.length === 0;
  const effectiveDpr = evaluateEffectiveDpr(snapshot);
  const checkpoints = snapshot.checkpoints ?? [];
  const checkpointIds = new Set(checkpoints.map((checkpoint) => checkpoint.id));
  const checkpointsValid =
    checkpointIds.has('receiving-checkpoint') &&
    checkpointIds.has('shipping-checkpoint') &&
    checkpoints.every(
      (checkpoint) =>
        typeof checkpoint.gateOpen === 'boolean' &&
        ['closed', 'opening', 'open', 'closing'].includes(checkpoint.phase) &&
        Number.isFinite(checkpoint.clearanceSecondsRemaining) &&
        checkpoint.clearanceSecondsRemaining >= 0 &&
        Number.isFinite(checkpoint.armAngle) &&
        checkpoint.armAngle >= -0.02 &&
        checkpoint.armAngle <= Math.PI / 2 + 0.02 &&
        (checkpoint.phase !== 'closed' || checkpoint.armAngle <= 0.12) &&
        (checkpoint.phase !== 'open' || checkpoint.armAngle >= Math.PI / 2 - 0.12)
    );
  const triage = classifyDiagnostics(diagnostics);
  const checks = {
    firstFrame: snapshot.firstFrameAt !== null && snapshot.firstFrameAt <= budgets.firstFrameMs,
    averageFps: snapshot.averageFps >= budgets.averageFps,
    p95Frame: snapshot.p95FrameMs <= budgets.p95FrameMs,
    p99Frame: snapshot.p99FrameMs <= budgets.p99FrameMs,
    onePercentLow: snapshot.onePercentLowFps >= budgets.onePercentLowFps,
    effectiveDpr: effectiveDpr.passed,
    longTasks: longestTask <= budgets.maximumLongTaskMs,
    framesOver50Ms: snapshot.framesOver50Ms <= budgets.maximumFramesOver50Ms,
    worldIntegrity: !enforceWorldIntegrity || snapshot.worldIntegrity?.passed === true,
    // A subsystem that threw during construction can leave frame pacing looking
    // healthy precisely because the work it should have been doing never ran.
    pageClean: triage.actionable.length === 0,
    communityPresence: snapshot.humanPresence?.passed === true,
    checkpoints: checkpointsValid,
  };
  return {
    checks,
    passed: Object.values(checks).every(Boolean),
    longestTask,
    diagnosticTriage: triage,
    effectiveDpr,
  };
}

function evaluateStartupBudget(snapshot, diagnostics) {
  const triage = classifyDiagnostics(diagnostics);
  const effectiveDpr = evaluateEffectiveDpr(snapshot);
  const checks = {
    firstFrame: snapshot.firstFrameAt !== null && snapshot.firstFrameAt <= budgets.firstFrameMs,
    effectiveDpr: effectiveDpr.passed,
    pageClean: triage.actionable.length === 0,
  };
  return {
    checks,
    passed: Object.values(checks).every(Boolean),
    longestTask: Math.max(0, ...snapshot.longTasks.map((task) => task.duration)),
    diagnosticTriage: triage,
    effectiveDpr,
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
      )}`
    );
  }
}

function summarizeMotion(samples) {
  const numericTelemetryKeys = [
    'speed',
    'acceleration',
    'steeringAngle',
    'innerSteeringAngle',
    'outerSteeringAngle',
    'wheelRotation',
    'wheelTravel',
    'routeDistance',
    'forkHeight',
    'mastTilt',
    'trailerAngle',
    'articulation',
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
        stopReasons: [],
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
      if (entity.stopReason && current.stopReasons.at(-1) !== entity.stopReason) {
        current.stopReasons.push(entity.stopReason);
      }
      for (const key of numericTelemetryKeys) {
        const value = entity[key];
        if (!Number.isFinite(value)) continue;
        const metric = current.telemetry[key] ?? {
          first: value,
          last: value,
          min: value,
          max: value,
          travel: 0,
        };
        metric.travel += Math.abs(value - metric.last);
        metric.last = value;
        metric.min = Math.min(metric.min, value);
        metric.max = Math.max(metric.max, value);
        current.telemetry[key] = metric;
      }
      current.lastPosition = entity.position;
      entities.set(entity.id, current);
    }
  }
  return [...entities.values()].map(({ lastPosition: _lastPosition, ...entity }) => ({
    ...entity,
    distance: Number(entity.distance.toFixed(2)),
    telemetry: Object.fromEntries(
      Object.entries(entity.telemetry).map(([key, metric]) => [
        key,
        {
          min: Number(metric.min.toFixed(4)),
          max: Number(metric.max.toFixed(4)),
          delta: Number((metric.last - metric.first).toFixed(4)),
          travel: Number(metric.travel.toFixed(4)),
        },
      ])
    ),
  }));
}

function summarizeMotionPacing(samples) {
  const timelines = new Map();
  for (const sample of samples) {
    for (const entity of sample.entities) {
      const timeline = timelines.get(entity.id) ?? [];
      timeline.push({ elapsedMs: sample.elapsedMs, ...entity });
      timelines.set(entity.id, timeline);
    }
  }

  return [...timelines.entries()].map(([id, timeline]) => {
    let movingSamples = 0;
    let currentPlateau = 0;
    let maxMovingPlateauSamples = 0;
    let maxSingleStepDistance = 0;
    let maxInferredSpeed = 0;
    let maxJerk = 0;
    let previousAcceleration = null;

    for (let index = 1; index < timeline.length; index += 1) {
      const previous = timeline[index - 1];
      const current = timeline[index];
      const deltaSeconds = Math.max(0.001, (current.elapsedMs - previous.elapsedMs) / 1000);
      const distance = Math.hypot(
        current.position[0] - previous.position[0],
        current.position[1] - previous.position[1],
        current.position[2] - previous.position[2]
      );
      maxSingleStepDistance = Math.max(maxSingleStepDistance, distance);
      maxInferredSpeed = Math.max(maxInferredSpeed, distance / deltaSeconds);

      const moving =
        Math.abs(current.speed ?? 0) > 0.25 &&
        current.active !== false &&
        current.stopped !== true &&
        (current.stopReason === undefined || current.stopReason === 'none');
      if (moving) {
        movingSamples += 1;
        // Compare the same 2 mm / 60 Hz floor at any display cadence. Working
        // if smooth 120/240 Hz crawl passes while genuine stationary runs fail.
        // The separate 1.5 m single-frame bound still uses actual displacement.
        const nominalFrameDistance = distance * (1 / 60 / deltaSeconds);
        if (nominalFrameDistance < 0.002) {
          currentPlateau += 1;
          maxMovingPlateauSamples = Math.max(maxMovingPlateauSamples, currentPlateau);
        } else {
          currentPlateau = 0;
        }
      } else {
        currentPlateau = 0;
      }

      if (Number.isFinite(current.acceleration)) {
        if (previousAcceleration !== null) {
          maxJerk = Math.max(
            maxJerk,
            Math.abs(current.acceleration - previousAcceleration) / deltaSeconds
          );
        }
        previousAcceleration = current.acceleration;
      }
    }

    return {
      id,
      sampleCount: timeline.length,
      movingSamples,
      maxMovingPlateauSamples,
      maxSingleStepDistance: Number(maxSingleStepDistance.toFixed(3)),
      maxInferredSpeed: Number(maxInferredSpeed.toFixed(2)),
      maxJerk: Number(maxJerk.toFixed(2)),
    };
  });
}

function evaluateMotionAcceptance(samples, summary, pacing) {
  if (!options.motionEnabled) return { passed: true, checks: [] };
  const expectedIds = ['forklift-1', 'forklift-2', 'receiving-truck', 'shipping-truck'];
  const observedIds = new Set(summary.map((entity) => entity.id));
  const completeFleet = expectedIds.every((id) => observedIds.has(id));
  const finiteTelemetry = samples.every((sample) =>
    sample.entities.every(
      (entity) =>
        Number.isFinite(entity.speed) &&
        Number.isFinite(entity.steeringAngle) &&
        Number.isFinite(entity.wheelTravel) &&
        Number.isFinite(entity.routeDistance)
    )
  );
  const boundedSteering = samples.every((sample) =>
    sample.entities.every((entity) => Math.abs(entity.steeringAngle ?? 0) <= 0.61)
  );
  const boundedArticulation = samples.every((sample) =>
    sample.entities
      .filter((entity) => entity.type === 'truck')
      .every((entity) => Math.abs(entity.articulation ?? 0) <= 0.701)
  );
  const movingEntities = summary.filter((entity) => entity.distance > 0.25);
  const stationaryEntities = summary.filter((entity) => entity.distance <= 0.25);
  const stationaryStatesExplained = stationaryEntities.every((entity) =>
    entity.stopReasons.some((reason) => reason !== 'none')
  );
  // Truck wheel travel is signed: driving forwards then backing can have a
  // zero net delta while both the truck and its wheels genuinely moved.
  const wheelTravelFollowsMotion = movingEntities.every(
    (entity) => (entity.telemetry.wheelTravel?.travel ?? 0) > 0.1
  );
  const pacedMovingEntities = pacing.filter((entity) => entity.movingSamples > 0);
  const continuousMotion = pacedMovingEntities.every(
    (entity) => entity.maxMovingPlateauSamples <= 2
  );
  const boundedFrameDisplacement = pacing.every((entity) => entity.maxSingleStepDistance <= 1.5);
  const checks = [
    { id: 'complete-fleet', passed: completeFleet, observed: [...observedIds].sort() },
    { id: 'finite-telemetry', passed: finiteTelemetry },
    { id: 'bounded-steering', passed: boundedSteering },
    { id: 'bounded-articulation', passed: boundedArticulation },
    { id: 'vehicle-motion-observed', passed: movingEntities.length > 0 },
    {
      id: 'stationary-vehicles-have-interlock-reason',
      passed: stationaryStatesExplained,
      observed: stationaryEntities.map((entity) => ({
        id: entity.id,
        stopReasons: entity.stopReasons,
      })),
    },
    { id: 'wheel-travel-follows-motion', passed: wheelTravelFollowsMotion },
    {
      id: 'display-cadence-motion-observed',
      passed: pacedMovingEntities.length > 0,
      observed: pacedMovingEntities.map((entity) => entity.id),
    },
    {
      id: 'moving-vehicles-have-no-staccato-plateau',
      passed: continuousMotion,
      observed: pacing.map((entity) => ({
        id: entity.id,
        maxMovingPlateauSamples: entity.maxMovingPlateauSamples,
      })),
    },
    {
      id: 'single-frame-displacement-is-bounded',
      passed: boundedFrameDisplacement,
      observed: pacing.map((entity) => ({
        id: entity.id,
        maxSingleStepDistance: entity.maxSingleStepDistance,
      })),
    },
  ];
  return { passed: checks.every((check) => check.passed), checks };
}

async function collectDisplayCadenceMotion(page, durationMs) {
  return page.evaluate(
    ({ sampleDurationMs }) =>
      new Promise((resolve, reject) => {
        const startedAt = performance.now();
        const samples = [];

        // Observe every displayed frame. A 50 ms interval conflated several
        // frames and incorrectly tested their summed movement as one step.
        // Working if each RAF contributes one sample, including reverse travel.
        const sample = (now) => {
          const motion = window.__MILLOS_RUNTIME__?.motionSnapshot();
          if (motion) samples.push({ elapsedMs: Math.max(0, now - startedAt), ...motion });
          if (now - startedAt >= sampleDurationMs) {
            // Yield the completed RAF task so its long-task observation is
            // included. Latch only cheap timing, before transporting the motion
            // array or running the full scene inspection. Working if the report
            // retains separate in-window and post-export timing, without losing
            // genuine slow frames from the sampled interval.
            setTimeout(() => {
              const framePacing = window.__MILLOS_RUNTIME__?.framePacingSnapshot?.();
              if (!framePacing) {
                reject(new Error('Runtime frame-window telemetry was unavailable'));
                return;
              }
              resolve({ samples, framePacing });
            }, 0);
            return;
          }
          requestAnimationFrame(sample);
        };

        requestAnimationFrame(sample);
      }),
    { sampleDurationMs: durationMs }
  );
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

  // Named celestial views are evidence cameras, so they must show the body
  // named by the scene. A global daytime capture previously aimed the moon
  // camera below the horizon and produced a convincing screenshot of the
  // ground. Ordinary scenes still honour the requested simulation hour.
  const sceneTime = CELESTIAL_EVIDENCE_TIMES[scene] ?? options.time;
  const query = new URLSearchParams({
    benchmark: scene,
    duration: String(options.durationSeconds),
    quality: options.quality,
    time: String(sceneTime),
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
  // The telemetry probe becomes ready on the first rendered frame; the loader
  // now waits for assets, static batches and settled animation. Working if the
  // benchmark observes that real signal and never samples through the overlay.
  // This is only an observation timeout, not a relaxed frame or startup budget.
  await waitForRuntimeStage(
    page,
    'Complete, animation-ready first reveal',
    () =>
      document.documentElement.dataset.millosStartupReady === 'true' &&
      document.querySelector('[aria-label="Loading MillOS"]') === null,
    120000,
    { consoleErrors, pageErrors, failedRequests }
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
      budget: evaluateStartupBudget(snapshot, { consoleErrors, pageErrors, failedRequests }),
      // Recorded on both paths: first-frame latency is if anything more
      // load-sensitive than steady-state pacing, since it is dominated by
      // single-threaded parse, compile and bake work.
      load: machineLoad(),
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
  // Retain the explicit assembly check alongside the first-reveal contract:
  // steady-state evidence must never sample the staged preview world.
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
  const runtimeSettle = await waitForRuntimeSettled(page, {
    timeoutMs: options.settleTimeoutSeconds * 1000,
  });
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
  let motionSamples = motionStart ? [{ elapsedMs: 0, ...motionStart }] : [];
  let framePacing;
  if (options.motionEnabled) {
    const collection = await collectDisplayCadenceMotion(page, options.durationSeconds * 1000);
    motionSamples = collection.samples;
    framePacing = collection.framePacing;
  } else {
    framePacing = await page.evaluate(
      (durationMs) =>
        new Promise((resolve) => {
          setTimeout(() => resolve(window.__MILLOS_RUNTIME__?.framePacingSnapshot?.()), durationMs);
        }),
      options.durationSeconds * 1000
    );
  }
  if (!framePacing)
    throw new Error(`Runtime frame-window telemetry was unavailable for scene ${scene}`);
  const postExportSnapshot = await page.evaluate(() => window.__MILLOS_RUNTIME__?.snapshot());
  if (!postExportSnapshot) throw new Error(`Runtime telemetry was unavailable for scene ${scene}`);
  // World, renderer and readiness diagnostics keep their full-inspection time.
  // Only the explicitly latched timing fields feed the frame-pacing budgets.
  const { capturedAt: frameWindowCapturedAt, ...frameMetrics } = framePacing;
  const snapshot = { ...postExportSnapshot, ...frameMetrics };
  const postExportFramePacing = Object.fromEntries(
    Object.keys(framePacing).map((key) => [key, postExportSnapshot[key]])
  );
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
  const budget = evaluateBudgets(snapshot, { consoleErrors, pageErrors, failedRequests });
  const load = machineLoad();
  const motionSummary = summarizeMotion(motionSamples);
  const motionPacing = summarizeMotionPacing(motionSamples);
  const motionAcceptance = evaluateMotionAcceptance(motionSamples, motionSummary, motionPacing);
  const result = {
    scene,
    sceneTime,
    variant,
    scadaEnabled,
    url: page.url(),
    wallClockMs: Math.round(performance.now() - startedAt),
    snapshot,
    timingWindow: { capturedAt: frameWindowCapturedAt, ...frameMetrics },
    postExportFramePacing,
    domStacks,
    budget,
    load,
    motionAcceptance,
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
    motionSummary,
    motionPacing,
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
  // Serialise against every other renderer on this machine. Concurrent GPU work
  // does not fail the run, it halves the frame rate, and the report then
  // measures the other process rather than the scene.
  captureLock = await acquireCaptureLock(`benchmark:${options.scenes.join('+')}`, { root: ROOT });
  const baseUrl = options.baseUrl || (await startPreview());
  const browser = await chromium.launch({
    headless: !options.headed,
    args: ['--mute-audio'],
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
    await captureLock?.release();
    captureLock = null;
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
    sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim(),
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
    passed: results.every(
      (result) =>
        result.budget.passed && (options.startupOnly || result.motionAcceptance?.passed === true)
    ),
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
      const passed = result.budget.passed && result.motionAcceptance.passed;
      console.log(
        `${result.scene}${options.compareScada ? ` (${result.variant})` : ''}: ${metric.averageFps.toFixed(1)} FPS, 1% low ${metric.onePercentLowFps.toFixed(1)} FPS, p95 ${metric.p95FrameMs.toFixed(1)} ms, p99 ${metric.p99FrameMs.toFixed(1)} ms, ${metric.renderer.calls} calls, DPR ${metric.canvas.effectiveDpr.toFixed(2)}, world ${metric.worldIntegrity?.passed ? 'continuous' : options.disabledSystems.length > 0 ? 'isolated' : 'BROKEN'}, ${options.motionEnabled ? `motion ${result.motionAcceptance.passed ? 'valid' : 'INVALID'}, ` : ''}${passed ? 'PASS' : 'FAIL'}`
      );
    }
    // Print the page's own complaints. A `pageClean` failure with no visible
    // reason sends the next reader to the frame timings, which is the wrong
    // half of the report.
    if (result.load?.contended) {
      console.warn(
        `  ${result.scene}: machine load ${result.load.loadAverage1m} across ${result.load.cores} cores ` +
          `(${result.load.loadPerCore} per core). Frame timings from this run measure contention as ` +
          'much as the scene; re-run on a quiet machine before treating them as a verdict.'
      );
    }
    const actionable = result.budget.diagnosticTriage?.actionable ?? [];
    for (const entry of actionable.slice(0, 5)) {
      console.log(`  ${result.scene} diagnostic: ${entry}`);
    }
    if (actionable.length > 5) {
      console.log(
        `  ${result.scene} diagnostic: +${actionable.length - 5} more, see benchmark.json`
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
  await captureLock?.release();
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
