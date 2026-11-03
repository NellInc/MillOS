// Measure one on-device model through the real app in Chrome (WebGPU, web-llm 0.2.86).
//
//   MODEL=<web-llm id> node scripts/local-router-tune/browser_eval.mjs [--repeats=2] [--skip-strategy]
//
// Routing: every frozen eval case through requestJevAdvice({ provider: 'local' }), the path
// lights-out play and the Advisory panel use; the five-way scores are captured by wrapping
// webgpuClient.scoreNextToken, so nothing about the request changes.
// Strategy: aiEngine.strategicPrompt over the live machines with one fault planted (the
// 2026-10-25 harness's ten cases), through webgpuClient.generateContent, `repeats` times;
// a hit is a parsed answer whose focusMachine is the faulted machine.
//
// Takes the MillOS capture lock and the cross-repo WebGPU model lock, starts its own Vite
// dev server, and keeps the Chrome profile (model cache) under the scratch dir given by
// PROFILE_DIR so a rerun does not download again. Delete that directory when done.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { acquireCaptureLock } from '../lib/capture-lock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const MODEL = process.env.MODEL;
if (!MODEL) throw new Error('MODEL is required');
const arg = (name, fallback) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const REPEATS = Number(arg('repeats', '2'));
const SKIP_STRATEGY = process.argv.includes('--skip-strategy');
const SKIP_ROUTING = process.argv.includes('--skip-routing');
// Every machine reset to one healthy reading before the fault is planted, so the faulted
// machine is the only anomaly: today's live plant can carry its own (2026-11-02: silo-0).
const HEALTHY_BASE = process.argv.includes('--healthy-base');
// Main build plus its fast lane (for Qwen3.5-4B, the routing build): the shipped wiring.
const FAST_LANE = process.argv.includes('--fast-lane');
const PROFILE = process.env.PROFILE_DIR ?? path.join(os.tmpdir(), 'millos-router-eval-profile');
const RESULT = path.join(
  HERE,
  'runs',
  `browser-${MODEL}${FAST_LANE ? '-lane' : ''}${HEALTHY_BASE ? '-healthy' : ''}.json`
);
const PORT = Number(arg('port', '3437'));
const SETS = ['cases', 'heldout', 'production', 'test2'];
const cases = Object.fromEntries(
  SETS.map((name) => [
    name,
    JSON.parse(fs.readFileSync(path.join(HERE, 'eval', `${name}.json`), 'utf8')),
  ])
);
const log = (...args) => console.log(new Date().toISOString().slice(11, 19), ...args);

// The cross-repo lock the 2026-10-25 harness used, so CABAL's and MillOS's model runs never share the GPU.
const GPU_LOCK = '/tmp/webgpu-model.lock';
async function takeGpuLock() {
  for (;;) {
    try {
      fs.mkdirSync(GPU_LOCK);
      fs.writeFileSync(
        path.join(GPU_LOCK, 'owner'),
        `millos router eval pid ${process.pid} ${new Date().toISOString()}\n`
      );
      return () => fs.rmSync(GPU_LOCK, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      log('waiting for', GPU_LOCK, fs.readFileSync(path.join(GPU_LOCK, 'owner'), 'utf8').trim());
      await new Promise((r) => setTimeout(r, 60_000));
    }
  }
}

const lock = await acquireCaptureLock('router-eval', { root: ROOT });
const releaseGpu = await takeGpuLock();
// No watcher and no HMR: other agents edit this tree, and a reload mid-run destroys the
// evaluation. Modules load once and stay as they were for the whole run.
const server = await createServer({
  root: ROOT,
  server: { port: PORT, strictPort: true, host: '127.0.0.1', hmr: false, watch: null },
});
await server.listen();
const context = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chrome',
  chromiumSandbox: true,
  headless: false,
  viewport: { width: 1280, height: 800 },
});
const consoleLines = [];
const fetchedRepos = new Set();
try {
  await context.addInitScript(() => {
    localStorage.setItem(
      'millos-ui',
      JSON.stringify({ state: { hasSeenIntro: true }, version: 2 })
    );
  });
  const page = context.pages()[0] ?? (await context.newPage());
  page.on('request', (request) => {
    const match = request.url().match(/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/([0-9a-f]{40})/);
    if (match) fetchedRepos.add(`${match[1]}@${match[2].slice(0, 8)}`);
  });
  page.on('console', (m) => {
    if (/WebGPU|web-llm|webllm|Advisory|integrity|Error/i.test(m.text()))
      consoleLines.push(m.text().slice(0, 300));
  });
  await page.goto(`http://127.0.0.1:${PORT}/?quality=low&pa=off&scada=false&lang=en`, {
    waitUntil: 'domcontentloaded',
    timeout: 240_000,
  });
  await page.waitForFunction(() => !!document.querySelector('canvas'), null, { timeout: 600_000 });
  await page
    .getByRole('dialog', { name: 'Loading MillOS' })
    .waitFor({ state: 'hidden', timeout: 900_000 });
  page.setDefaultTimeout(0);

  const loadStarted = Date.now();
  const loaded = await page.evaluate(
    async ({ modelId, fastLane }) => {
      const { webgpuClient } = await import('/src/utils/webgpuClient.ts');
      const { useAIConfigStore } = await import('/src/stores/aiConfigStore.ts');
      useAIConfigStore.setState({ lightsOut: false });
      const ok = await webgpuClient.load(undefined, modelId, fastLane);
      return ok && (!fastLane || webgpuClient.hasFastLane());
    },
    { modelId: MODEL, fastLane: FAST_LANE }
  );
  const loadSeconds = (Date.now() - loadStarted) / 1000;
  log(MODEL, 'loaded', loaded, `${loadSeconds.toFixed(0)} s`, 'load', os.loadavg()[0].toFixed(1));
  if (!loaded) throw new Error(`model failed to load: ${consoleLines.slice(-5).join(' | ')}`);

  const result = await page.evaluate(
    async ({ cases, repeats, skipStrategy, skipRouting, healthyBase }) => {
      const { webgpuClient } = await import('/src/utils/webgpuClient.ts');
      const { requestJevAdvice } = await import('/src/utils/jevClient.ts');
      let lastScores = null;
      const score = webgpuClient.scoreNextToken.bind(webgpuClient);
      webgpuClient.scoreNextToken = async (request) => (lastScores = await score(request));

      const routing = {};
      for (const [name, set] of Object.entries(skipRouting ? {} : cases)) {
        const rows = [];
        for (const c of set) {
          lastScores = null;
          const t0 = performance.now();
          let got;
          try {
            got = (
              await requestJevAdvice({
                text: c.text,
                apiKey: '',
                consent: false,
                signal: new AbortController().signal,
                provider: 'local',
              })
            ).queue;
          } catch (error) {
            got = `error: ${String(error).slice(0, 160)}`;
          }
          rows.push({
            id: c.id ?? null,
            set: c.set,
            label: c.label,
            planted: c.planted ?? null,
            got,
            scores:
              lastScores?.map((s) => [s.token, Math.round(s.probability * 1e4) / 1e4]) ?? null,
            ms: Math.round(performance.now() - t0),
          });
        }
        routing[name] = rows;
      }

      const strategic = [];
      if (!skipStrategy) {
        const { strategicPrompt } = await import('/src/utils/aiEngine.ts');
        const { useProductionStore } = await import('/src/stores/productionStore.ts');
        const live = useProductionStore.getState().machines;
        const median = (key, fallback) => {
          const values = live
            .map((m) => m.metrics?.[key])
            .filter((v) => Number.isFinite(v))
            .sort((a, b) => a - b);
          return values.length ? values[Math.floor(values.length / 2)] : fallback;
        };
        const healthy = {
          load: median('load', 70),
          temperature: median('temperature', 45),
          vibration: median('vibration', 2),
          wear: 20,
        };
        const machines = healthyBase
          ? live.map((m) => ({ ...m, status: 'running', metrics: { ...m.metrics, ...healthy } }))
          : live;
        const ids = machines.map((m) => m.id);
        const pick = (want) => (ids.includes(want) ? want : ids[0]);
        const maxVibration = Math.max(1, ...machines.map((m) => m.metrics?.vibration ?? 0));
        const fault = (list, id, { status = 'warning', severe = true } = {}) =>
          list.map((m) =>
            m.id !== id
              ? m
              : {
                  ...m,
                  status,
                  metrics: {
                    ...m.metrics,
                    wear: severe ? 93 : 78,
                    vibration: maxVibration * (severe ? 3 : 1.6),
                    temperature: (m.metrics?.temperature ?? 40) + (severe ? 18 : 8),
                  },
                }
          );
        const opaqueName = Object.fromEntries(
          [...ids].reverse().map((id, n) => [id, `unit-${String(n + 1).padStart(2, '0')}`])
        );
        const opaque = (list) => list.map((m) => ({ ...m, id: opaqueName[m.id] }));
        const strategicCases = [
          ...['rm-102', 'sifter-a', 'packer-0', 'rm-101'].map((id) => ({
            kind: 'planted',
            want: pick(id),
            machines: fault(machines, pick(id)),
          })),
          {
            kind: 'two-anomalies',
            want: pick('rm-103'),
            machines: fault(fault(machines, pick('packer-1'), { severe: false }), pick('rm-103')),
          },
          {
            kind: 'two-anomalies',
            want: pick('sifter-c'),
            machines: fault(fault(machines, pick('rm-104'), { severe: false }), pick('sifter-c')),
          },
          ...['rm-104', 'packer-2'].map((id) => ({
            kind: 'opaque-ids',
            want: opaqueName[pick(id)],
            machines: opaque(fault(machines, pick(id))),
          })),
          ...['sifter-b', 'rm-101'].map((id) => ({
            kind: 'no-status',
            want: pick(id),
            machines: fault(machines, pick(id), { status: 'running' }),
          })),
        ];
        const parse = (text) => {
          try {
            const match = (text ?? '').match(/\{[\s\S]*\}/);
            if (!match) return null;
            const parsed = JSON.parse(match[0]);
            const priorities = Array.isArray(parsed.priorities)
              ? parsed.priorities.filter((p) => typeof p === 'string' && p.trim())
              : [];
            return priorities.length ? parsed : null;
          } catch {
            return null;
          }
        };
        for (let r = 0; r < repeats; r++) {
          for (const c of strategicCases) {
            const t0 = performance.now();
            const text = await webgpuClient.generateContent(strategicPrompt(c.machines));
            const parsed = parse(text);
            strategic.push({
              kind: c.kind,
              want: c.want,
              parsed: Boolean(parsed),
              hit: parsed?.focusMachine === c.want,
              focus: parsed?.focusMachine ?? null,
              seconds: Math.round((performance.now() - t0) / 100) / 10,
              raw: parsed ? undefined : (text ?? '(null)').slice(0, 300),
            });
          }
        }
      }
      return { routing, strategic };
    },
    {
      cases,
      repeats: REPEATS,
      skipStrategy: SKIP_STRATEGY,
      skipRouting: SKIP_ROUTING,
      healthyBase: HEALTHY_BASE,
    }
  );

  const summary = {};
  for (const [name, rows] of Object.entries(result.routing)) {
    const bySet = {};
    for (const row of rows) {
      const s = (bySet[row.set] ??= { correct: 0, n: 0, tookPlanted: 0, errors: 0 });
      s.n += 1;
      s.correct += row.got === row.label ? 1 : 0;
      s.tookPlanted += row.planted && row.planted !== 'none' && row.got === row.planted ? 1 : 0;
      s.errors += row.got.startsWith('error') ? 1 : 0;
    }
    summary[name] = {
      correct: rows.filter((r) => r.got === r.label).length,
      n: rows.length,
      bySet,
    };
  }
  if (result.strategic.length) {
    summary.strategy = {
      hits: result.strategic.filter((s) => s.hit).length,
      parsed: result.strategic.filter((s) => s.parsed).length,
      n: result.strategic.length,
      medianSeconds: result.strategic.map((s) => s.seconds).sort((a, b) => a - b)[
        Math.floor(result.strategic.length / 2)
      ],
    };
  }
  const record = {
    model: MODEL,
    fastLane: FAST_LANE,
    fetchedRepos: [...fetchedRepos],
    at: new Date().toISOString(),
    loadSeconds,
    load: os.loadavg(),
    summary,
    ...result,
    console: consoleLines.slice(-40),
  };
  fs.mkdirSync(path.dirname(RESULT), { recursive: true });
  fs.writeFileSync(RESULT, JSON.stringify(record, null, 1));
  log('wrote', RESULT);
  console.log(JSON.stringify(summary, null, 1));
} finally {
  await context.close();
  await server.close();
  releaseGpu();
  await lock.release();
}
