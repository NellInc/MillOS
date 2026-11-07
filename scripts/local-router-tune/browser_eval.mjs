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
import { withChromeLeakGuard } from '../lib/chrome-launch-args.mjs';
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
// Write the strategy prompts (per arm) to this file and stop: no model is loaded.
const PROMPTS_OUT = arg('prompts-only', '');
// Strategy temperatures to compare in one page load (e.g. 0.7,0.3), arms alternating per
// repeat. Only requests carrying the app's strategy temperature (0.7) are overridden.
// Prompt arms to compare in one page load: 'base' and 'severity' (the line below added
// after the priorities line). Arms alternate per repeat, like TEMPERATURES.
const PROMPT_ARMS = arg('prompt-arms', '').split(',').filter(Boolean);
const SEVERITY_LINE =
  'When more than one machine is in warning, focus on the one with the worst readings: highest wear, then vibration, then temperature.';
const TEMPERATURES = arg('temperatures', '').split(',').filter(Boolean).map(Number);
// Headless Chrome (WebGPU on Metal works there), so a check never brings a window forward.
const HEADLESS = process.argv.includes('--headless');
// LFM3-1.7B through ONNX Runtime Web instead of web-llm (lfm3_shim.js). Transformers.js
// 4.3.2 is installed outside the repo; LFM3_TJS_DIR is the node_modules holding it.
const LFM3 = MODEL.startsWith('LFM3-');
const LFM3_TJS_DIR = process.env.LFM3_TJS_DIR ?? '';
if (LFM3 && !LFM3_TJS_DIR) throw new Error('LFM3_TJS_DIR is required for an LFM3 model');
const LFM3_SMOKE = process.argv.includes('--lfm3-smoke');
const PROFILE = process.env.PROFILE_DIR ?? path.join(os.tmpdir(), 'millos-router-eval-profile');
const RESULT = path.join(
  HERE,
  'runs',
  `browser-${MODEL}${FAST_LANE ? '-lane' : ''}${HEALTHY_BASE ? '-healthy' : ''}${arg('tag', '') ? `-${arg('tag', '')}` : ''}.json`
);
const PORT = Number(arg('port', '3437'));
// test3 (Brazilian Portuguese, 2026-11-04) is reported as its own group, outside the 257.
const SETS = ['cases', 'heldout', 'production', 'test2', 'test3'];
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
  headless: HEADLESS,
  viewport: { width: 1280, height: 800 },
  args: withChromeLeakGuard(),
});
if (LFM3) {
  const files = {
    'lfm3_shim.js': path.join(HERE, 'lfm3_shim.js'),
    'transformers.min.js': path.join(
      LFM3_TJS_DIR,
      '@huggingface/transformers/dist/transformers.min.js'
    ),
  };
  const ortDist = path.join(LFM3_TJS_DIR, 'onnxruntime-web/dist');
  await context.route(`http://127.0.0.1:${PORT}/__lfm3/**`, async (route) => {
    const name = new URL(route.request().url()).pathname.slice('/__lfm3/'.length);
    const file =
      files[name] ?? (/^ort-[\w.-]+\.(mjs|wasm)$/.test(name) ? path.join(ortDist, name) : null);
    if (!file || !fs.existsSync(file)) return route.fulfill({ status: 404, body: `no ${name}` });
    const type = name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript';
    return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(file) });
  });
}
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
    if (/WebGPU|web-llm|webllm|Advisory|integrity|Error|LFM3|onnx|ort/i.test(m.text()))
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
  const loaded = PROMPTS_OUT
    ? true
    : LFM3
      ? await page.evaluate(async (modelId) => {
          const { webgpuClient } = await import('/src/utils/webgpuClient.ts');
          const { LOCAL_QUEUE_TOKENS } = await import('/src/utils/jevClient.ts');
          const { useAIConfigStore } = await import('/src/stores/aiConfigStore.ts');
          useAIConfigStore.setState({ lightsOut: false });
          const { createLfm3Engine } = await import('/__lfm3/lfm3_shim.js');
          // The Qwen ids the rubric asks for; the shim maps each to LFM3's first piece.
          const queueTokens = LOCAL_QUEUE_TOKENS['Qwen3.5-4B-q4f16_1-MLC'];
          let last = 0;
          const engine = await createLfm3Engine({
            queueTokens,
            onProgress: (p) => {
              if (p.status === 'progress' && p.progress - last >= 10) {
                last = p.progress;
                console.log(`LFM3 download ${p.file} ${Math.round(p.progress)}%`);
              }
            },
          });
          LOCAL_QUEUE_TOKENS[modelId] = queueTokens;
          // A model id with no web-llm profile sends generateContent down the chat path.
          Object.assign(webgpuClient, { engine, modelId, fastLaneId: null });
          globalThis.__lfm3 = engine;
          console.log(
            'LFM3 inputs',
            JSON.stringify(engine.inputNames.slice(0, 8)),
            JSON.stringify(engine.pastMeta)
          );
          console.log('LFM3 queue pieces', JSON.stringify(engine.queueMap));
          return webgpuClient.isConnected() && webgpuClient.getModelId() === modelId;
        }, MODEL)
      : await page.evaluate(
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

  if (LFM3_SMOKE) {
    // The new path end to end before any full run: a short answer, chunked against one-shot
    // prefill on the real strategic prompt, one strategic answer, and one routing call.
    const smoke = await page.evaluate(async (routingCase) => {
      const { webgpuClient } = await import('/src/utils/webgpuClient.ts');
      const { strategicPrompt } = await import('/src/utils/aiEngine.ts');
      const { useProductionStore } = await import('/src/stores/productionStore.ts');
      const { requestJevAdvice } = await import('/src/utils/jevClient.ts');
      const engine = globalThis.__lfm3;
      const timed = async (fn) => {
        const t0 = performance.now();
        const value = await fn();
        return { value, seconds: Math.round((performance.now() - t0) / 100) / 10 };
      };
      const out = {};
      out.short = await timed(() =>
        webgpuClient.generateContent('Reply with exactly: MillOS local core online')
      );
      const machines = useProductionStore.getState().machines;
      const target = machines.find((m) => m.id === 'rm-102') ?? machines[0];
      const faulted = machines.map((m) =>
        m.id === target.id
          ? {
              ...m,
              status: 'warning',
              metrics: { ...m.metrics, wear: 93, vibration: 9, temperature: 70 },
            }
          : { ...m, status: 'running', metrics: { ...m.metrics, wear: 20 } }
      );
      const prompt = strategicPrompt(faulted);
      const { ids } = engine.promptIds({
        messages: [{ role: 'user', content: prompt }],
        extra_body: { enable_thinking: false },
      });
      const top5 = (logits) =>
        [...logits.keys()]
          .sort((a, b) => logits[b] - logits[a])
          .slice(0, 5)
          .map((i) => [engine.tokenizer.decode([i]), Math.round(logits[i] * 100) / 100]);
      const chunked = await timed(() => engine.feed(ids, 256));
      let oneShot;
      try {
        oneShot = await timed(() => engine.feed(ids, 1e9));
      } catch (error) {
        oneShot = { error: String(error).slice(0, 300) };
      }
      let maxDiff = null;
      if (oneShot.value) {
        maxDiff = 0;
        for (let i = 0; i < chunked.value.length; i++)
          maxDiff = Math.max(maxDiff, Math.abs(chunked.value[i] - oneShot.value[i]) || 0);
      }
      out.prefill = {
        promptChars: prompt.length,
        promptTokens: ids.length,
        chunked: {
          seconds: chunked.seconds,
          top5: top5(chunked.value),
          nan: chunked.value.some(Number.isNaN),
        },
        oneShot: oneShot.value
          ? {
              seconds: oneShot.seconds,
              top5: top5(oneShot.value),
              nan: oneShot.value.some(Number.isNaN),
            }
          : oneShot,
        maxAbsLogitDiff: maxDiff,
      };
      const answer = await timed(() => webgpuClient.generateContent(prompt));
      const match = (answer.value ?? '').match(/\{[\s\S]*\}/);
      let focus = null;
      try {
        focus = match ? (JSON.parse(match[0]).focusMachine ?? null) : null;
      } catch {
        focus = 'unparsed';
      }
      out.strategy = {
        want: target.id,
        focus,
        seconds: answer.seconds,
        text: (answer.value ?? '(null)').slice(0, 1500),
      };
      let lastScores = null;
      const score = webgpuClient.scoreNextToken.bind(webgpuClient);
      webgpuClient.scoreNextToken = async (request) => (lastScores = await score(request));
      const routed = await timed(() =>
        requestJevAdvice({
          text: routingCase.text,
          apiKey: '',
          consent: false,
          signal: new AbortController().signal,
          provider: 'local',
        }).then(
          (r) => r.queue,
          (e) => `error: ${String(e).slice(0, 200)}`
        )
      );
      out.routing = {
        label: routingCase.label,
        got: routed.value,
        seconds: routed.seconds,
        scores: lastScores,
      };
      out.queuePieces = engine.queueMap;
      out.inputNames = engine.inputNames;
      out.pastMeta = engine.pastMeta;
      return out;
    }, cases.cases[0]);
    const file = path.join(HERE, 'runs', `smoke-${MODEL}.json`);
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          model: MODEL,
          at: new Date().toISOString(),
          loadSeconds,
          load: os.loadavg(),
          fetchedRepos: [...fetchedRepos],
          smoke,
          console: consoleLines.slice(-40),
        },
        null,
        1
      )
    );
    log('wrote', file);
    console.log(JSON.stringify(smoke, null, 1).slice(0, 6000));
    process.exitCode = 0;
  }

  const result = LFM3_SMOKE
    ? { routing: {}, strategic: [] }
    : await page.evaluate(
        async ({
          cases,
          repeats,
          skipStrategy,
          skipRouting,
          healthyBase,
          temperatures,
          promptArms,
          severityLine,
          promptsOnly,
        }) => {
          const { webgpuClient } = await import('/src/utils/webgpuClient.ts');
          const STRATEGY_TEMPERATURE = 0.7;
          let armTemperature = null;
          const applied = [];
          if (temperatures.length) {
            const engine = webgpuClient.engine;
            for (const api of [engine.completions, engine.chat.completions]) {
              const create = api.create.bind(api);
              api.create = (request, ...rest) => {
                if (armTemperature !== null && request?.temperature === STRATEGY_TEMPERATURE) {
                  applied.push(armTemperature);
                  return create({ ...request, temperature: armTemperature }, ...rest);
                }
                return create(request, ...rest);
              };
            }
          }
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
              ? live.map((m) => ({
                  ...m,
                  status: 'running',
                  metrics: { ...m.metrics, ...healthy },
                }))
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
                machines: fault(
                  fault(machines, pick('packer-1'), { severe: false }),
                  pick('rm-103')
                ),
              },
              {
                kind: 'two-anomalies',
                want: pick('sifter-c'),
                machines: fault(
                  fault(machines, pick('rm-104'), { severe: false }),
                  pick('sifter-c')
                ),
              },
              // Four more pairs for the severity-line test (runs/prereg-severity-line.json).
              ...(promptArms.length
                ? [
                    ['rm-101', 'sifter-b'],
                    ['packer-2', 'rm-102'],
                    ['sifter-a', 'packer-0'],
                    ['rm-104', 'silo-2'],
                  ].map(([worse, milder]) => ({
                    kind: 'two-anomalies',
                    want: pick(worse),
                    machines: fault(fault(machines, pick(milder), { severe: false }), pick(worse)),
                  }))
                : []),
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
            const arms = promptArms.length
              ? promptArms
              : temperatures.length
                ? temperatures
                : [null];
            const anchor = 'Prioritize safety interlocks';
            const withArm = (prompt, arm) => {
              if (arm !== 'severity') return prompt;
              const lines = prompt.split('\n');
              const at = lines.findIndex((l) => l.startsWith(anchor));
              if (at < 0) throw new Error('strategic prompt changed: anchor line not found');
              lines.splice(at + 1, 0, severityLine);
              return lines.join('\n');
            };
            for (let r = 0; r < repeats; r++) {
              for (const temperature of r % 2 ? [...arms].reverse() : arms) {
                armTemperature = promptArms.length ? null : temperature;
                for (const c of strategicCases) {
                  const before = applied.length;
                  const t0 = performance.now();
                  const prompt = withArm(strategicPrompt(c.machines), temperature);
                  if (promptsOnly) {
                    strategic.push({ arm: temperature, kind: c.kind, want: c.want, prompt });
                    continue;
                  }
                  const text = await webgpuClient.generateContent(prompt);
                  const parsed = parse(text);
                  strategic.push({
                    ...(promptArms.length
                      ? { arm: temperature, lineIn: prompt.includes(severityLine) }
                      : { temperature }),
                    overridden: applied.slice(before),
                    kind: c.kind,
                    want: c.want,
                    parsed: Boolean(parsed),
                    hit: parsed?.focusMachine === c.want,
                    focus: parsed?.focusMachine ?? null,
                    seconds: Math.round((performance.now() - t0) / 100) / 10,
                    raw: parsed ? undefined : (text ?? '(null)').slice(0, 300),
                    answer:
                      temperatures.length || promptArms.length ? (parsed ?? undefined) : undefined,
                  });
                }
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
          temperatures: TEMPERATURES,
          promptArms: PROMPT_ARMS,
          severityLine: SEVERITY_LINE,
          promptsOnly: Boolean(PROMPTS_OUT),
        }
      );

  if (PROMPTS_OUT) {
    fs.writeFileSync(PROMPTS_OUT, JSON.stringify(result.strategic, null, 1));
    log('wrote', result.strategic.length, 'prompts to', PROMPTS_OUT);
  }
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
  if (PROMPT_ARMS.length) {
    const stats = (rows) => ({
      hits: rows.filter((s) => s.hit).length,
      parsed: rows.filter((s) => s.parsed).length,
      n: rows.length,
    });
    summary.strategyByArm = Object.fromEntries(
      PROMPT_ARMS.map((arm) => {
        const rows = result.strategic.filter((s) => s.arm === arm);
        const seconds = rows.map((s) => s.seconds).sort((a, b) => a - b);
        return [
          arm,
          {
            ...stats(rows),
            twoAnomalies: stats(rows.filter((s) => s.kind === 'two-anomalies')),
            other: stats(rows.filter((s) => s.kind !== 'two-anomalies')),
            medianSeconds: seconds[Math.floor(seconds.length / 2)],
            lineAsAssigned: rows.every((s) => s.lineIn === (arm === 'severity')),
          },
        ];
      })
    );
  }
  if (TEMPERATURES.length) {
    summary.strategyByTemperature = Object.fromEntries(
      TEMPERATURES.map((t) => {
        const rows = result.strategic.filter((s) => s.temperature === t);
        const seconds = rows.map((s) => s.seconds).sort((a, b) => a - b);
        return [
          t,
          {
            hits: rows.filter((s) => s.hit).length,
            parsed: rows.filter((s) => s.parsed).length,
            n: rows.length,
            medianSeconds: seconds[Math.floor(seconds.length / 2)],
            overriddenAll: rows.every(
              (s) => s.overridden.length > 0 && s.overridden.every((v) => v === t)
            ),
          },
        ];
      })
    );
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
  if (!LFM3_SMOKE) {
    fs.mkdirSync(path.dirname(RESULT), { recursive: true });
    fs.writeFileSync(RESULT, JSON.stringify(record, null, 1));
    log('wrote', RESULT);
    console.log(JSON.stringify(summary, null, 1));
  }
} finally {
  await context.close();
  await server.close();
  releaseGpu();
  await lock.release();
}
