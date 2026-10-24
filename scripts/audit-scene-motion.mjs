/**
 * What in this world actually moves?
 *
 * WHY. The single largest finding of the farm pass was that seven of nine
 * rigged creatures were never driven: the components existed, the handles
 * existed, the solved per-species numbers existed, and nothing called them. The
 * code read like a working animation and every gate was green. That defect
 * class is not farm-specific - anything animated by an imperative ref can lose
 * its driver the same way, and nothing in the repo watches for it.
 *
 * So this samples EVERY named object's world transform over time and reports,
 * per branch of the scene, what fraction of it moved. A branch that should be
 * alive and reads 0% is the same defect in a different subsystem.
 *
 * FOUR CHANNELS, because each one is blind to things the others see:
 *
 *   moved      world position. Misses anything rotated about its own pivot -
 *              the sitting cat's head yaw read STATIC on a position-only probe.
 *   turned     world orientation. Misses anything that slides without turning.
 *   instAlive  `InstancedMesh` matrices. `setMatrixAt` never touches the
 *              container's transform, so roller mills at 1,000 rpm read 0%
 *              alive in both channels above.
 *   matAlive   material colour, emissive and opacity. Nothing that animates by
 *              SHADING appears in any transform channel: the ceiling fixture
 *              lenses tracking exposure, every machine status beacon, and the
 *              dock status lamps switching from green to red as a truck berths.
 *
 * Each of those was a confidently wrong reading before its channel existed.
 *
 * WHAT A ZERO STILL DOES NOT MEAN. Some branches are static because they are
 * meant to be: a building shell should not move, and `authored-factory-exterior`
 * at 10% and `world-factory-infrastructure` at 0% in the transform channels are
 * both correct. Read a zero as a question, not a verdict.
 *
 * Usage: node scripts/audit-scene-motion.mjs [--scene=interior] [--seconds=12]
 */
import { spawn } from 'node:child_process';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import { acquireCaptureLock } from './lib/capture-lock.mjs';

const ROOT = process.cwd();
const arg = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
};
const options = {
  scenes: arg('scenes', 'interior,overview,shipping,yard,forklift').split(','),
  quality: arg('quality', 'medium'),
  port: Number(arg('port', '4203')),
  seconds: Number(arg('seconds', '12')),
  json: arg('json', path.join(ROOT, 'test-results', 'motion-audit.json')),
};

/** Movement below this is numerical noise, not animation. */
const POSITION_EPSILON = 0.0015;
/** Radians. Same idea for the rotation channel. */
const ANGLE_EPSILON = 0.002;

let preview = null;
let lock = null;

async function startPreview() {
  await access(path.join(ROOT, 'dist', 'index.html')).catch(() => {
    throw new Error('dist/index.html is missing. Run npm run build first.');
  });
  const url = `http://127.0.0.1:${options.port}`;
  preview = spawn(
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
const stopPreview = () => {
  if (preview && !preview.killed) preview.kill('SIGTERM');
};

async function main() {
  lock = await acquireCaptureLock('audit-scene-motion', { root: ROOT });
  const baseUrl = await startPreview();
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const report = [];
  try {
    for (const scene of options.scenes) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      try {
        await page.goto(
          `${baseUrl}/?benchmark=${scene}&motion=on&quality=${options.quality}&duration=${options.seconds + 60}`,
          {
            waitUntil: 'domcontentloaded',
            timeout: 90000,
          }
        );
        await page.waitForFunction(() => window.__MILLOS_RUNTIME__?.ready === true, null, {
          timeout: 90000,
        });
        await page.waitForFunction(
          () => document.documentElement.dataset.millosWorldReady === 'true',
          null,
          { timeout: 90000 }
        );
        await page.waitForTimeout(7000);

        const step = 400;
        const count = Math.max(6, Math.round((options.seconds * 1000) / step));
        const frames = [];
        for (let i = 0; i < count; i += 1) {
          frames.push(
            await page.evaluate(() =>
              window.__MILLOS_RUNTIME__
                .sampleObjects('', 40000)
                .map((s) => [
                  s.uuid,
                  s.path,
                  s.worldPosition,
                  s.worldQuaternion,
                  s.instanceMatrixChecksum,
                  s.materialChecksum,
                ])
            )
          );
          if (i < count - 1) await page.waitForTimeout(step);
        }

        // Keyed by `Object3D.uuid`.
        //
        // Neither of the obvious substitutes works. Path is not an identity:
        // most of this graph is unnamed, so thousands of objects serialise to
        // `.../<Group>/<Mesh>` and keying on that collapses them into one
        // bucket. Traversal index is not one either: once the game clock is
        // running the graph mounts and unmounts constantly, and index N is a
        // different object from one sample to the next. Both substitutes
        // manufacture motion by comparing two static objects in different
        // places, which is worse than measuring nothing.
        //
        // An object present in fewer than every sample is reported as
        // TRANSIENT rather than judged: it appeared or disappeared, which says
        // the branch is alive but says nothing about that object's motion.
        const seen = new Map();
        for (const frame of frames) {
          for (const [uuid, p, pos, quat, checksum, material] of frame) {
            const entry = seen.get(uuid) ?? {
              path: p,
              frames: 0,
              pos: [],
              quat: [],
              checksums: [],
              materials: [],
            };
            entry.frames += 1;
            entry.pos.push(pos);
            entry.quat.push(quat);
            if (checksum !== null) entry.checksums.push(checksum);
            if (material !== null) entry.materials.push(material);
            seen.set(uuid, entry);
          }
        }
        const churned = [...seen.values()].filter((e) => e.frames < frames.length).length;
        if (churned) {
          console.log(
            `  NOTE: ${churned} of ${seen.size} objects were not present in all ${frames.length} samples ` +
              '(mounted or unmounted mid-run). Reported as transient, not as static.'
          );
        }

        const branches = new Map();
        for (const entry of seen.values()) {
          const parts = entry.path.split('/');
          const branch = parts[2] || parts[1] || '(root)';
          const b = branches.get(branch) ?? {
            name: branch,
            objects: 0,
            moved: 0,
            turned: 0,
            transient: 0,
            instanced: 0,
            instancedAlive: 0,
            shaded: 0,
            shadedAlive: 0,
          };
          b.objects += 1;
          if (entry.frames < frames.length) {
            // Mounted or unmounted mid-run. That is motion at the branch level
            // but not a statement about this object, so it is counted in its
            // own column rather than folded into either of the others.
            b.transient += 1;
            branches.set(branch, b);
            continue;
          }
          let dp = 0;
          let dq = 0;
          for (let a = 0; a < 3; a += 1) {
            const vals = entry.pos.map((v) => v[a]);
            dp = Math.max(dp, Math.max(...vals) - Math.min(...vals));
          }
          for (let i = 1; i < entry.quat.length; i += 1) {
            const x = entry.quat[0];
            const y = entry.quat[i];
            const dot = Math.abs(x[0] * y[0] + x[1] * y[1] + x[2] * y[2] + x[3] * y[3]);
            dq = Math.max(dq, 2 * Math.acos(Math.min(1, dot)));
          }
          if (dp > POSITION_EPSILON) b.moved += 1;
          if (dq > ANGLE_EPSILON) b.turned += 1;
          // Instanced animation never touches the container's transform, so
          // without this an instanced mill spinning at 1000 rpm reads static.
          if (entry.checksums.length > 1) {
            b.instanced += 1;
            const first = entry.checksums[0];
            if (entry.checksums.some((c) => Math.abs(c - first) > 1e-6)) b.instancedAlive += 1;
          }
          // The fourth channel. A ceiling fixture lens tracking the day/night
          // exposure, a machine beacon changing status colour and a dock lamp
          // swapping green for red are all animation that never touches a
          // transform, so the three channels above report every one of them as
          // dead. That is the same false zero as the instanced mills, in a
          // different medium.
          if (entry.materials.length > 1) {
            b.shaded += 1;
            const firstMaterial = entry.materials[0];
            if (entry.materials.some((c) => Math.abs(c - firstMaterial) > 1e-6)) b.shadedAlive += 1;
          }
          branches.set(branch, b);
        }

        const rows = [...branches.values()].sort((a, b) => b.objects - a.objects);
        console.log(
          `\n=== ${scene}: ${seen.size} named objects, ${frames.length} samples over ${((frames.length * step) / 1000).toFixed(1)} s`
        );
        console.log(
          'branch'.padEnd(34) +
            'objects'.padStart(8) +
            'moved'.padStart(8) +
            'turned'.padStart(8) +
            'transient'.padStart(10) +
            'instAlive'.padStart(10) +
            'matAlive'.padStart(10) +
            '  alive (of judged)'
        );
        for (const row of rows.slice(0, 18)) {
          const alive = Math.max(row.moved, row.turned);
          const judged = row.objects - row.transient;
          console.log(
            row.name.slice(0, 32).padEnd(34) +
              String(row.objects).padStart(8) +
              String(row.moved).padStart(8) +
              String(row.turned).padStart(8) +
              String(row.transient).padStart(10) +
              `${row.instancedAlive}/${row.instanced}`.padStart(10) +
              `${row.shadedAlive}/${row.shaded}`.padStart(10) +
              `  ${judged ? `${Math.round((Math.max(alive, row.instancedAlive, row.shadedAlive) / judged) * 100)}% of ${judged}` : 'all transient'}`
          );
        }
        report.push({ scene, objects: seen.size, branches: rows });
      } finally {
        await page.close();
      }
    }
    await writeFile(
      options.json,
      JSON.stringify({ generatedAt: new Date().toISOString(), report }, null, 2)
    );
    console.log(`\nReport: ${options.json}`);
  } finally {
    await browser.close();
    stopPreview();
    await lock?.release();
  }
}

main().catch(async (error) => {
  stopPreview();
  await lock?.release();
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
