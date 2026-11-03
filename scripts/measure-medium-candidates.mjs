#!/usr/bin/env node
/**
 * One-page, rotated-arm, vsync-off A/B of candidate Medium-tier additions
 * (N8AO, bloom, a 2048 shadow map), per CLAUDE.md "one page load, one variable".
 *
 * Arms are toggled at runtime through `__MILLOS_RUNTIME__.setDisplayDiagnostics`
 * (a plain graphics-store patch) on the built preview, so build first. Frames
 * are timed with vsync off, because every Medium arm holds 60 FPS with it on.
 * The order rotates and reverses each cycle against the machine's monotonic
 * warm-up drift. Holds `.capture.lock`. Read `load/core` beside every number:
 * above 3 the deltas measure contention. See docs/RENDERING_LITERATURE_REVIEW.md.
 *
 * DEPENDENCY: `setDisplayDiagnostics` is documented for display keys only but
 * is an unfiltered store patch, which is what lets it carry quality keys here.
 * If it is ever narrowed to its declared keys, every arm draws the same frame
 * and every delta reads exactly 0 - the repo's tell for an inert term.
 *
 * Usage: npm run build && node scripts/measure-medium-candidates.mjs \
 *          --scenes=overview,interior,water --cycles=4 [--arms=base,bloom,shadow2048]
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { setTimeout, clearTimeout } from 'node:timers';
import { chromium } from '@playwright/test';
import { acquireCaptureLock } from './lib/capture-lock.mjs';

const REPO = process.cwd();

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const scenes = arg('scenes', 'overview,interior,water').split(',');
const cycles = Number(arg('cycles', '4'));
const settleMs = Number(arg('settle', '2500'));
const sampleMs = Number(arg('sample', '5000'));
const quality = arg('quality', 'medium');
const time = arg('time', '12');
const port = Number(arg('port', '4187'));
const out = arg('out', path.join(REPO, 'test-results', 'medium-candidates.json'));

const BASE = {
  enableAmbientOcclusion: false,
  enableBloom: false,
  shadowMapSize: 1024,
  aoQuality: 0,
};
const ARMS = {
  base: {},
  ao: { enableAmbientOcclusion: true },
  bloom: { enableBloom: true },
  shadow2048: { shadowMapSize: 2048 },
  all: { enableAmbientOcclusion: true, enableBloom: true, shadowMapSize: 2048 },
};
const armNames = arg('arms', Object.keys(ARMS).join(','))
  .split(',')
  .filter((name) => name in ARMS);
if (!armNames.includes('base')) armNames.unshift('base');

const load = () => {
  const [one] = os.loadavg();
  return Math.round((one / os.cpus().length) * 100) / 100;
};

const lock = await acquireCaptureLock('medium-ab');
const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {
  cwd: REPO,
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('preview did not start')), 60000);
  preview.stdout.on('data', (chunk) => {
    if (String(chunk).includes(String(port))) {
      clearTimeout(timer);
      resolve();
    }
  });
});

const browser = await chromium.launch({
  channel: 'chrome',
  chromiumSandbox: true,
  headless: true,
  args: ['--disable-gpu-vsync', '--disable-frame-rate-limit', '--force-color-profile=srgb'],
});
const results = { quality, time, cycles, settleMs, sampleMs, scenes: {} };
try {
  for (const scene of scenes) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 2,
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const query = new URLSearchParams({
        benchmark: scene,
        quality,
        time,
        weather: 'clear',
        duration: '300',
      });
      await page.goto(`http://localhost:${port}/?${query}`, {
        waitUntil: 'domcontentloaded',
        timeout: 90000,
      });
      await page.waitForFunction(() => window.__MILLOS_RUNTIME__?.ready === true, null, {
        timeout: 120000,
      });
      await page.waitForFunction(
        () =>
          document.documentElement.dataset.millosStartupReady === 'true' &&
          document.documentElement.dataset.millosWorldReady === 'true',
        null,
        { timeout: 180000 }
      );
      await page.waitForTimeout(4000);
      const adapter = await page.evaluate(() => {
        const gl = document.querySelector('canvas')?.getContext('webgl2');
        const ext = gl?.getExtension('WEBGL_debug_renderer_info');
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
      });
      const samples = Object.fromEntries(armNames.map((name) => [name, []]));
      for (let cycle = 0; cycle < cycles; cycle++) {
        const order = armNames.map((_, i) => armNames[(i + cycle) % armNames.length]);
        if (cycle % 2 === 1) order.reverse();
        for (const name of order) {
          const patch = { ...BASE, ...ARMS[name] };
          await page.evaluate((p) => window.__MILLOS_RUNTIME__.setDisplayDiagnostics(p), patch);
          await page.waitForTimeout(settleMs);
          await page.evaluate(() => window.__MILLOS_RUNTIME__.reset());
          await page.waitForTimeout(sampleMs);
          const snap = await page.evaluate(() => window.__MILLOS_RUNTIME__.framePacingSnapshot());
          samples[name].push({
            avg: snap.averageFrameMs,
            p95: snap.p95FrameMs,
            p50: snap.p50FrameMs,
            n: snap.sampleCount,
            load: load(),
          });
          process.stdout.write(
            `${scene} c${cycle} ${name.padEnd(10)} avg ${snap.averageFrameMs} p95 ${snap.p95FrameMs} load/core ${load()}\n`
          );
        }
      }
      results.scenes[scene] = { adapter, samples, errors };
    } catch (error) {
      // A scene that never reaches a ready world (a contended startup) is
      // recorded and skipped, so the scenes already measured still land.
      results.scenes[scene] = { failed: error instanceof Error ? error.message : String(error) };
      console.warn(`${scene}: ${results.scenes[scene].failed}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  preview.kill('SIGTERM');
  await lock.release();
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
for (const [scene, { samples, adapter, failed }] of Object.entries(results.scenes)) {
  if (failed) {
    console.log(`\n${scene}  FAILED: ${failed}`);
    continue;
  }
  console.log(`\n${scene}  (${adapter})`);
  const base = mean(samples.base.map((s) => s.avg));
  const baseSpread =
    Math.max(...samples.base.map((s) => s.avg)) - Math.min(...samples.base.map((s) => s.avg));
  for (const name of armNames) {
    const avgs = samples[name].map((s) => s.avg);
    const p95s = samples[name].map((s) => s.p95);
    const delta = mean(avgs) - base;
    console.log(
      `  ${name.padEnd(10)} avg ${mean(avgs).toFixed(2)} ms  (delta ${delta >= 0 ? '+' : ''}${delta.toFixed(2)})  p95 mean ${mean(p95s).toFixed(1)}  spread ${(Math.max(...avgs) - Math.min(...avgs)).toFixed(2)}`
    );
  }
  console.log(`  control spread (base) ${baseSpread.toFixed(2)} ms`);
}
writeFileSync(out, JSON.stringify(results, null, 1));
console.log(`\nwrote ${out}`);
