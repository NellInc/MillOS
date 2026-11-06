/**
 * How many of this scene's material instances are actually distinct?
 *
 * WHY THIS QUESTION. `mergeGeometries` and `StaticMeshBatch` can only merge
 * meshes that will be drawn with the same material, so a branch holding roughly
 * one material instance per mesh cannot be batched at all, no matter how much
 * batching machinery is pointed at it. The `overview` scene reports ~1200
 * unique materials for ~1670 meshes, and `authored-factory-exterior` alone
 * holds ~550 materials for ~588 meshes.
 *
 * That ratio is only actionable if the instances are REDUNDANT - identical
 * parameters, separately constructed. This tool fingerprints every material by
 * the properties that decide how it draws, and reports how far the count would
 * fall if identical instances were shared. A large collapse is a batching
 * opportunity; a small one means the exterior genuinely needs that many
 * materials and the draw calls are the price of the art.
 *
 * Reads the live scene through r3f's own root on the canvas element, so it
 * measures the real assembly rather than a description of it, and needs no
 * instrumentation compiled into the app.
 *
 * Usage: node scripts/analyze-material-sharing.mjs [--scene=overview] [--top=15]
 */
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { acquireCaptureLock } from './lib/capture-lock.mjs';

const ROOT = process.cwd();
const readArgument = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
};

const options = {
  scene: readArgument('scene', 'overview'),
  quality: readArgument('quality', 'medium'),
  port: Number(readArgument('port', '4173')),
  top: Number(readArgument('top', '15')),
};

let previewProcess = null;
let captureLock = null;

async function startPreview() {
  await access(path.join(ROOT, 'dist', 'index.html')).catch(() => {
    throw new Error('dist/index.html is missing. Run npm run build first.');
  });
  const url = `http://127.0.0.1:${options.port}`;
  previewProcess = spawn(
    process.execPath,
    [
      path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
      'preview',
      '--host',
      '127.0.0.1',
      '--port',
      String(options.port),
      '--strictPort',
    ],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none' } }
  );
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      if ((await fetch(url)).ok) return url;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error(`Preview did not start on ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function stopPreview() {
  if (previewProcess && !previewProcess.killed) previewProcess.kill('SIGTERM');
}

async function main() {
  captureLock = await acquireCaptureLock(`material-audit:${options.scene}`, { root: ROOT });
  const baseUrl = await startPreview();
  const browser = await chromium.launch({
    chromiumSandbox: true,
    headless: true,
    channel: 'chrome',
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(
      `${baseUrl}/?benchmark=${options.scene}&quality=${options.quality}&duration=30`,
      { waitUntil: 'domcontentloaded', timeout: 90000 }
    );
    await page.waitForFunction(() => window.__MILLOS_RUNTIME__?.ready === true, null, {
      timeout: 90000,
    });
    await page.waitForFunction(
      () => document.documentElement.dataset.millosWorldReady === 'true',
      null,
      { timeout: 90000 }
    );
    // Let lazily mounted branches settle, or the audit measures a partial world.
    await page.waitForTimeout(6000);

    const report = await page.evaluate(() => {
      const audit = window.__MILLOS_RUNTIME__?.materialAudit?.();
      if (!audit) {
        return {
          error:
            'window.__MILLOS_RUNTIME__.materialAudit() is unavailable. dist/ predates the audit ' +
            'API - rebuild before running this.',
        };
      }
      return audit;
    });
    if (report.error) throw new Error(report.error);

    // Reconcile against the snapshot's own mesh count. The audit and
    // `sceneGraph.topBranches` derive "a branch" from one shared helper, so a
    // disagreement here means that helper changed under one of them - and every
    // per-branch percentage below would be attributing meshes to the wrong
    // bucket while still looking entirely plausible.
    const snapshot = await page.evaluate(() => window.__MILLOS_RUNTIME__?.snapshot());
    const bucketed = report.branches.reduce((sum, branch) => sum + branch.meshes, 0);
    const snapshotMeshes = snapshot?.sceneGraph?.meshes ?? null;
    const branchNames = new Set(report.branches.map((branch) => branch.name));
    const snapshotNames = (snapshot?.sceneGraph?.topBranches ?? [])
      .filter((branch) => branch.meshes > 0)
      .map((branch) => branch.name);
    const missing = snapshotNames.filter((name) => !branchNames.has(name));

    if (bucketed !== report.totalMeshes) {
      throw new Error(
        `Audit buckets ${bucketed} meshes but traversed ${report.totalMeshes}. Branch attribution is losing meshes.`
      );
    }
    if (snapshotMeshes !== null && snapshotMeshes !== report.totalMeshes) {
      console.warn(
        `NOTE: audit saw ${report.totalMeshes} meshes, snapshot saw ${snapshotMeshes}. ` +
          'The world is still mounting, or the two reads were a frame apart.'
      );
    }
    if (missing.length > 0) {
      throw new Error(
        `Branches present in sceneGraph.topBranches but missing from the audit: ${missing.join(', ')}. ` +
          'The two are meant to share findBranchRoot(); they have diverged.'
      );
    }

    const pct = (a, b) => (b === 0 ? '-' : `${((1 - a / b) * 100).toFixed(0)}%`);
    console.log(
      `\n${options.scene}: ${report.totalMeshes} meshes, ${report.materialInstances} material instances, ` +
        `${report.distinctFingerprints} distinct -> ${pct(report.distinctFingerprints, report.materialInstances)} redundant\n`
    );
    console.log(
      'branch'.padEnd(32),
      'meshes'.padStart(7),
      'instances'.padStart(10),
      'distinct'.padStart(9),
      'redundant'.padStart(10)
    );
    for (const branch of report.branches.slice(0, options.top)) {
      console.log(
        branch.name.slice(0, 32).padEnd(32),
        String(branch.meshes).padStart(7),
        String(branch.materialInstances).padStart(10),
        String(branch.distinctFingerprints).padStart(9),
        pct(branch.distinctFingerprints, branch.materialInstances).padStart(10)
      );
    }
    console.log('\nMost duplicated material fingerprints:');
    for (const duplicate of report.worstDuplicates) {
      console.log(
        `  x${String(duplicate.count).padStart(4)}  ${duplicate.fingerprint.slice(0, 150)}`
      );
    }
    console.log('');
  } finally {
    await browser.close();
    stopPreview();
    await captureLock?.release();
  }
}

main().catch(async (error) => {
  stopPreview();
  await captureLock?.release();
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
