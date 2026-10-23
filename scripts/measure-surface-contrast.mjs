/**
 * The discriminator for surface-treatment work.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS AT ALL
 * ---------------------------------------------------------------------------
 * `audit-scene-models.mjs` classifies a mesh as finished when it has a texture
 * slot OR an injected shader:
 *
 *     if (mesh.material.shaderInjected) entry.shaded += 1;
 *     else if (slots.size === 0)        entry.flat  += 1;
 *
 * and its flat work list skips the same meshes outright. So attaching ANY
 * `onBeforeCompile` to a material removes it from the work list whether or not
 * one pixel changed. A treatment that compiles and contributes nothing scores
 * exactly as well as one that works — the audit cannot tell them apart, and it
 * is the instrument this repo has been ordering surfacing work by.
 *
 * That is CLAUDE.md's "an absent term reads as exactly 1.000" in its identity
 * form. This script is the paired control that rule demands.
 *
 * ---------------------------------------------------------------------------
 * HOW IT DISCRIMINATES
 * ---------------------------------------------------------------------------
 * ONE page load, ONE variable. Every injected surface material in the app reads
 * a single shared `uSurfStrength` uniform object, so the treatment can be
 * switched off between two frames of the SAME render — same driver, same shader
 * cache, same clock, same warm GPU, same camera.
 *
 * THREE SHOTS, NOT TWO: on, off, on. The middle one is the treatment arm; the
 * two outer ones bracket it in time and measure how much of the frame moves
 * ON ITS OWN. Benchmark mode pauses the GAME clock (`setGameSpeed(0)`) but not
 * the render clock, so conveyors, water, workers and vehicles keep animating,
 * and a plain two-shot diff credits all of that to the treatment. Measured: the
 * `interior` scene reported 3.12% of pixels changed at a mean delta of 23.8,
 * and the whole reading was four flour sacks travelling along a conveyor between
 * the two exposures. Every pixel that also differs between the two same-arm
 * shots is therefore struck out of the mask before anything is computed — the
 * same intra-run-instability discriminator this repo used to separate "the
 * surface moved" from "the surface is now z-fighting".
 *
 *   changedFraction   fraction of pixels attributable to the treatment
 *   motionFraction    fraction excluded as self-animating, reported not hidden
 *   meanAbsDelta      mean 0-255 luma change over the attributable pixels
 *   contrastOn/Off    mean |Laplacian| (local contrast) restricted to that mask
 *
 * `changedFraction === 0` is the tell, and it is exact: the term is inert. Not
 * "subtle", not "cheap" — absent. Any non-zero reading localises itself, since
 * the mask IS the set of surfaces the treatment reaches, with no hand-authored
 * region rectangles to go stale.
 *
 * Contrast is measured ONLY inside that mask. A whole-frame average is
 * dominated by sky, terrain and machines that the treatment never touches, and
 * would dilute a real effect into the noise of two neighbouring frames.
 *
 * ---------------------------------------------------------------------------
 * WHAT IT CANNOT TELL YOU
 * ---------------------------------------------------------------------------
 * That the change is an IMPROVEMENT. It measures presence and magnitude. A
 * treatment that adds 40% local contrast may well have made the surface look
 * like sandpaper. Look at the frames — they are written next to the JSON for
 * exactly that reason.
 *
 * Usage:
 *   node scripts/measure-surface-contrast.mjs --label=<name> [options]
 *
 *   --label=<name>      Required. Output under test-results/surface-contrast/<name>.
 *   --scenes=<list>     Comma-separated benchmark scenes. Default: the surface set.
 *   --quality=<tier>    low | medium | high | ultra. Default medium.
 *   --port=<number>     Preview port. Default 4198.
 *   --settle=<seconds>  Seconds after the startup reveal before the first shot. Default 9.
 *   --ready-timeout=<s> Per readiness stage. Default 180, because the reveal
 *                       waits on shader compiles and static batching and this
 *                       machine runs at high load from other software.
 *   --crop=x,y,w,h      Restrict every measurement to this pixel rectangle of
 *                       the 1280x720 frame. See CROPS below.
 *   --no-toggle         Baseline mode: one shot per scene, no A/B. Used before
 *                       the treatment exists, to record the "before" frames.
 *   --control           Null control: the treatment is switched OFF for all
 *                       three shots, so the "on" and "off" arms are the same
 *                       arm and the only variable left is the instrument.
 *                       Every scene must read exactly 0 and INERT; anything
 *                       else is noise the instrument would credit to a real
 *                       treatment.
 *
 * Serving and readiness follow run-performance-benchmark.mjs, which is the
 * harness that has kept working: the preview gets the build's own VERSION and
 * the browser goes to its base, the page waits for the startup reveal rather
 * than the earlier world marker, and a stage that times out reports the
 * failed requests and page errors that explain it instead of a bare timeout.
 *
 * ---------------------------------------------------------------------------
 * CROPS: A SCENE AGGREGATE ANSWERS THE WRONG QUESTION
 * ---------------------------------------------------------------------------
 * `changedFraction` over the whole frame answers "did this SCENE change". It
 * cannot answer "did the thing I changed change", and the difference is not
 * academic: a dock-threshold treatment moved `interior`'s contrast ratio from
 * x1.031 to x1.031 because the dock is a few hundred pixels of a frame
 * dominated by conveyors, while the same treatment measured inside a crop of
 * the hazard band moved 321 of 655 pixels at mean delta 7.88.
 *
 * The crop is applied to the LUMA PLANE before any mask is built, so the
 * self-motion exclusion, the change mask, the dilation and the Laplacian all
 * operate on the cropped raster and every reported fraction is a fraction OF
 * THE CROP. Cropping after the fact - masking a full-frame result - would leave
 * the dilation reaching across the crop boundary and the denominator wrong.
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { acquireCaptureLock } from './lib/capture-lock.mjs';
import { changeMask } from './lib/surface-change-mask.mjs';
import {
  assertPreviewBuildIdentity,
  assertPreviewPortAvailable,
} from './lib/preview-build-identity.mjs';
import {
  DEFAULT_SURFACE_SCENES,
  READINESS_STAGES,
  parseBenchmarkScenes,
  previewPlan,
} from './lib/surface-measure-contract.mjs';

const ROOT = process.cwd();
const OUTPUT_ROOT = path.join(ROOT, 'test-results', 'surface-contrast');

const arg = (name, fallback) => {
  const match = process.argv.find((value) => value.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

// The default scene set, the preview plan and the readiness stages are claims
// about the app, so they live in lib/surface-measure-contract.mjs where a test
// can hold them against the real source.
const DEFAULT_SCENES = DEFAULT_SURFACE_SCENES;

/** `x,y,w,h` in frame pixels, or null for the whole frame. */
function parseCrop(value) {
  if (!value) return null;
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    throw new Error(`--crop= expects four non-negative numbers x,y,w,h; got "${value}"`);
  }
  const [left, top, width, height] = parts;
  if (width < 3 || height < 3) {
    throw new Error('--crop= needs at least 3x3 pixels: the Laplacian skips a one-pixel border.');
  }
  return { left, top, width, height };
}

const options = {
  label: arg('label', ''),
  scenes: arg('scenes', '') ? arg('scenes', '').split(',') : DEFAULT_SCENES,
  quality: arg('quality', 'medium'),
  port: Number(arg('port', '4198')),
  settle: Number(arg('settle', '9')),
  readyTimeoutMs: Number(arg('ready-timeout', '180')) * 1000,
  crop: parseCrop(arg('crop', '')),
  toggle: !flag('no-toggle'),
  control: flag('control'),
};

if (!options.label) {
  console.error('--label=<name> is required so a reading can be tied to a tree.');
  process.exitCode = 1;
  process.exit();
}

let preview = null;
let lock = null;

async function startPreview() {
  const indexHtml = await readFile(path.join(ROOT, 'dist', 'index.html'), 'utf8').catch(() => {
    throw new Error('dist/index.html is missing. Run npm run build first.');
  });
  const plan = previewPlan(indexHtml);
  // The build decides the base, not the caller's shell: a stray VERSION in the
  // environment would otherwise re-base the preview away from the bundle.
  const env = { ...process.env, BROWSER: 'none' };
  if (plan.version) env.VERSION = plan.version;
  else delete env.VERSION;
  const url = `http://127.0.0.1:${options.port}${plan.basePath}`;
  await assertPreviewPortAvailable(options.port);
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
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], env }
  );
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      if ((await fetch(`${url}/`)).ok) {
        // A stale or foreign dist/ would measure a different tree than the
        // label claims; the benchmark refuses that, and so does this.
        await assertPreviewBuildIdentity(url, path.join(ROOT, 'dist'));
        return url;
      }
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

/**
 * Rec. 709 luma, 0-255, one plane per frame.
 *
 * The crop is taken HERE, before anything is measured, so every mask and every
 * denominator downstream belongs to the crop rather than to the frame.
 */
async function lumaPlane(buffer) {
  let pipeline = sharp(buffer);
  if (options.crop) pipeline = pipeline.extract(options.crop);
  const { data, info } = await pipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const luma = new Float32Array(width * height);
  for (let index = 0, pixel = 0; index < data.length; index += channels, pixel += 1) {
    luma[pixel] = 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
  }
  return { luma, width, height };
}

/**
 * Mean |Laplacian| over a mask, which is local contrast: a flat-painted surface
 * scores near zero however bright it is, and surface detail raises it. The
 * 4-neighbour kernel is deliberate — it responds to one-pixel structure, which
 * is what "does this read as a surface or as paint" comes down to at these
 * camera distances.
 *
 * `mask` is null for the whole frame. Border pixels are skipped rather than
 * clamped, because a clamped border invents a zero-contrast ring whose size
 * depends on resolution.
 */
function maskedLaplacian(plane, mask) {
  const { luma, width, height } = plane;
  let total = 0;
  let counted = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (mask && !mask[index]) continue;
      const value =
        4 * luma[index] -
        luma[index - 1] -
        luma[index + 1] -
        luma[index - width] -
        luma[index + width];
      total += Math.abs(value);
      counted += 1;
    }
  }
  return { mean: counted ? total / counted : 0, counted };
}

async function main() {
  const outputDir = path.join(OUTPUT_ROOT, options.label);
  await mkdir(outputDir, { recursive: true });
  if (options.crop) {
    const { left, top, width, height } = options.crop;
    console.log(`Measuring inside crop ${width}x${height} at (${left}, ${top}) of 1280x720.`);
  }

  // The runtime coerces an unknown scene to `overview` without a word, so a
  // stale name would be measured, and reported, as a scene it is not.
  const validScenes = parseBenchmarkScenes(
    await readFile(path.join(ROOT, 'src', 'runtime', 'runtimeMode.ts'), 'utf8')
  );
  const unknownScenes = options.scenes.filter((scene) => !validScenes.includes(scene));
  if (unknownScenes.length > 0) {
    throw new Error(
      `Unknown benchmark scene(s): ${unknownScenes.join(', ')}. The runtime would silently ` +
        `measure "overview" under that name.\nValid scenes: ${validScenes.join(', ')}`
    );
  }

  lock = await acquireCaptureLock('measure-surface-contrast', { root: ROOT });
  const baseUrl = await startPreview();
  // Launched the way run-performance-benchmark.mjs launches: Metal through
  // ANGLE with the GPU sandbox intact, rather than whatever headless picks.
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    chromiumSandbox: true,
    ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
    args: [
      '--mute-audio',
      '--enable-automation',
      ...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : []),
    ],
  });
  const results = [];

  try {
    for (const scene of options.scenes) {
      // A fresh context per scene, with service workers blocked so a cached
      // bundle from an earlier build can never answer for this one.
      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        serviceWorkers: 'block',
      });
      const page = await context.newPage();
      const failedRequests = [];
      const pageErrors = [];
      const consoleErrors = [];
      page.on('requestfailed', (request) =>
        failedRequests.push(`${request.url()} ${request.failure()?.errorText ?? ''}`)
      );
      page.on('response', (response) => {
        if (response.status() >= 400)
          failedRequests.push(`${response.url()} HTTP ${response.status()}`);
      });
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      try {
        await page.goto(
          `${baseUrl}/?benchmark=${scene}&quality=${options.quality}&duration=300&art=1`,
          { waitUntil: 'domcontentloaded', timeout: 90000 }
        );
        for (const stage of READINESS_STAGES) {
          const startedAt = Date.now();
          try {
            await page.waitForFunction(stage.predicate, null, { timeout: options.readyTimeoutMs });
          } catch (error) {
            // A bundle that 404s is visible in the first second. Say so,
            // rather than letting it surface as a bare timeout minutes later.
            const evidence = [
              ...failedRequests.slice(0, 8).map((line) => `  failed request: ${line}`),
              ...pageErrors.slice(0, 5).map((line) => `  page error: ${line}`),
              ...consoleErrors.slice(0, 5).map((line) => `  console error: ${line}`),
            ];
            throw new Error(
              `${scene}: "${stage.name}" not reached in ${Math.round(
                (Date.now() - startedAt) / 1000
              )} s (${stage.emitter} never emitted it).\n` +
                (evidence.length ? evidence.join('\n') : '  no failed requests or page errors'),
              { cause: error }
            );
          }
        }
        // Lazily mounted branches land seconds after the reveal; the settle
        // keeps the first shot clear of them.
        if (options.control) {
          await page.evaluate(() =>
            window.__MILLOS_RUNTIME__?.setPerfDebug({ disableSurfaceTreatment: true })
          );
        }
        await page.waitForTimeout(options.settle * 1000);

        const onPath = path.join(outputDir, `${scene}-on.png`);
        await page.screenshot({ path: onPath, timeout: 30000 });

        if (!options.toggle) {
          const plane = await lumaPlane(await sharp(onPath).toBuffer());
          const whole = maskedLaplacian(plane, null);
          results.push({ scene, mode: 'baseline', wholeFrameContrast: whole.mean });
          console.log(`${scene.padEnd(18)} whole-frame contrast ${whole.mean.toFixed(4)}`);
          continue;
        }

        const supported = await page.evaluate(() =>
          Boolean(window.__MILLOS_RUNTIME__?.setPerfDebug)
        );
        if (!supported) throw new Error('runtime hook has no setPerfDebug');

        await page.evaluate(() =>
          window.__MILLOS_RUNTIME__.setPerfDebug({ disableSurfaceTreatment: true })
        );
        // The uniform is shared and needs no recompile, but the store write and
        // the next render still have to happen. Three frames is generous.
        await page.waitForTimeout(400);
        const offPath = path.join(outputDir, `${scene}-off.png`);
        await page.screenshot({ path: offPath, timeout: 30000 });
        // In --control the "on" arm stays off, so every shot is the same arm.
        await page.evaluate(
          (disabled) =>
            window.__MILLOS_RUNTIME__.setPerfDebug({ disableSurfaceTreatment: disabled }),
          options.control
        );
        // The third shot brackets the off arm at the same 400 ms spacing, so the
        // self-motion it measures is the motion the on-off pair also contains.
        await page.waitForTimeout(400);
        const latePath = path.join(outputDir, `${scene}-on-late.png`);
        await page.screenshot({ path: latePath, timeout: 30000 });

        const [onPlane, offPlane, latePlane] = await Promise.all([
          lumaPlane(await sharp(onPath).toBuffer()),
          lumaPlane(await sharp(offPath).toBuffer()),
          lumaPlane(await sharp(latePath).toBuffer()),
        ]);
        const change = changeMask(onPlane, offPlane, latePlane);
        const contrastOn = maskedLaplacian(onPlane, change.mask);
        const contrastOff = maskedLaplacian(offPlane, change.mask);
        const ratio = contrastOff.mean > 0 ? contrastOn.mean / contrastOff.mean : 0;

        results.push({
          scene,
          mode: 'toggle',
          changedFraction: change.changedFraction,
          motionFraction: change.motionFraction,
          changedPixels: change.changedPixels,
          meanAbsDelta: change.meanAbsDelta,
          maxAbsDelta: change.maxAbsDelta,
          contrastOn: contrastOn.mean,
          contrastOff: contrastOff.mean,
          contrastRatio: ratio,
          inert: change.changedPixels === 0,
        });
        console.log(
          `${scene.padEnd(18)} changed ${(change.changedFraction * 100).toFixed(2)}%` +
            `  (self-motion ${(change.motionFraction * 100).toFixed(2)}% excluded)` +
            `  meanΔ ${change.meanAbsDelta.toFixed(2)}` +
            `  maxΔ ${change.maxAbsDelta.toFixed(0)}` +
            `  contrast ${contrastOff.mean.toFixed(3)} -> ${contrastOn.mean.toFixed(3)}` +
            `  (x${ratio.toFixed(3)})${change.changedPixels === 0 ? '   *** INERT ***' : ''}`
        );
      } finally {
        await context.close();
      }
    }

    const inert = results.filter((row) => row.inert);
    await writeFile(
      path.join(outputDir, 'surface-contrast.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          label: options.label,
          quality: options.quality,
          settleSeconds: options.settle,
          crop: options.crop,
          toggle: options.toggle,
          control: options.control,
          baseUrl,
          // Pixel fractions do not depend on load, but readiness timing does.
          loadPerCore: Number((os.loadavg()[0] / os.cpus().length).toFixed(2)),
          results,
        },
        null,
        2
      )
    );
    if (options.toggle) {
      console.log(
        `\n${results.length - inert.length}/${results.length} scenes moved. ` +
          (inert.length
            ? `INERT in: ${inert.map((row) => row.scene).join(', ')}`
            : 'No exactly-zero readings.')
      );
    }
    console.log(`Frames and JSON: ${outputDir}`);
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
