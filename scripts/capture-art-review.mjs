/**
 * Capture a judge-ready art-review sheet.
 *
 * This is a thin, provenance-recording wrapper around run-performance-benchmark.mjs
 * --art --motion. It exists because an art-review capture that is *not* reproducible
 * is worthless a week later: prior review rounds in this repo left behind directories
 * of PNGs under test-results/ with no record of which commit, scene set, quality tier,
 * or time of day produced them, so none of them can be used as a baseline.
 *
 * What it adds over calling the benchmark directly:
 *
 *   1. Scene-name validation. runtimeMode.ts falls back to 'overview' for any
 *      unrecognised benchmark scene, so a typo does not fail — it silently captures
 *      the wrong camera and the reviewer grades a frame they did not ask for. The
 *      valid set is parsed out of the TypeScript source so it cannot drift.
 *   2. A fresh build by default. dist/ can be arbitrarily old; reviewing a stale
 *      bundle grades code that is no longer in the tree.
 *   3. Provenance. review-manifest.json records commit, dirty-tree state, scene set,
 *      and every capture option, so a verdict can be tied to an exact image set.
 *   4. A contact sheet. One montage lets a reviewer judge cross-scene consistency
 *      and trim which full-resolution frames are worth opening.
 *   5. An optional conjoined performance gate. --art restores full visual fidelity
 *      and unpins reduced motion, which the benchmark's own help notes makes frame
 *      samples "indicative, not a budget gate". A visual PASS carries no weight
 *      unless a non-art run on the same commit still meets budget, so this records
 *      that result alongside the frames rather than leaving it to memory.
 *
 * Usage:
 *   node scripts/capture-art-review.mjs --label=<name> [options]
 *
 *   --label=<name>        Required. Output goes to test-results/art-review/<name>.
 *   --set=<name>          Scene set: art (default), full, quick, exterior, interior.
 *   --scenes=<list>       Explicit comma-separated scene names; overrides --set.
 *   --quality=<tier>      low | medium | high | ultra. Default medium (the shipping default).
 *   --port=<number>       Local preview port. Default 4173.
 *   --time=<hour>         Simulation hour 0-24. Default 12.
 *   --weather=<name>      clear | cloudy | rain | storm. Default clear.
 *   --pa=<mode>           off | focused | characterful. Default off for silent review.
 *   --duration=<seconds>  Sample seconds per scene. Default 6.
 *   --warmup=<seconds>    Warmup seconds per scene. Default 4.
 *   --perf-gate           Also run a non-art budget run on the same scenes.
 *   --skip-build          Reuse the existing dist/ (records the risk in the manifest).
 *   --headed              Show the browser (real GPU; headless falls back to SwiftShader).
 *   --help
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const ROOT = process.cwd();
const RUNTIME_MODE_SOURCE = path.join(ROOT, 'src', 'runtime', 'runtimeMode.ts');
const BENCHMARK_SCRIPT = path.join(ROOT, 'scripts', 'run-performance-benchmark.mjs');
const OUTPUT_ROOT = path.join(ROOT, 'test-results', 'art-review');

/**
 * Named scene sets. `art` is the coverage the earlier ad-hoc review rounds
 * converged on (recovered from the aaa-* capture directories) plus `yard`: every
 * distinct material family, lighting condition, and viewing distance the mill
 * presents, at 13 scenes rather than all 19, because review cost scales with
 * frame count and the omitted scenes duplicate a covered look.
 */
const SCENE_SETS = {
  art: [
    'overview',
    'interior',
    'silos',
    'milling',
    'packing',
    'shipping',
    'logistics-close',
    'yard',
    'water',
    'village',
    'farm',
    'forklift',
    'tank-farm',
  ],
  quick: ['overview', 'interior', 'milling', 'village'],
  exterior: ['overview', 'silos', 'yard', 'shipping', 'water', 'village', 'farm', 'sun', 'moon'],
  interior: ['interior', 'milling', 'sifting', 'packing', 'process-floor', 'garage'],
  full: null, // resolved to every valid scene after parsing the source
};

function readArgument(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.find((argument) => argument.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

if (hasFlag('help') || hasFlag('h')) {
  console.log(
    [
      'MillOS art-review capture',
      '',
      'Usage: node scripts/capture-art-review.mjs --label=<name> [options]',
      '',
      `  --label=<name>        Required. Output: test-results/art-review/<name>`,
      `  --set=<name>          ${Object.keys(SCENE_SETS).join(' | ')} (default art)`,
      '  --scenes=<list>       Explicit scene names, overrides --set',
      '  --quality=<tier>      low | medium | high | ultra (default medium)',
      '  --port=<number>       Local preview port (default 4173)',
      '  --time=<hour>         0-24 (default 12)',
      '  --weather=<name>      clear | cloudy | rain | storm (default clear)',
      '  --pa=<mode>           off | focused | characterful (default off)',
      '  --duration=<seconds>  Sample seconds per scene (default 6)',
      '  --warmup=<seconds>    Warmup seconds per scene (default 4)',
      '  --perf-gate           Also run the non-art budget gate on the same scenes',
      '  --skip-build          Reuse existing dist/',
      '  --headed              Show the browser window',
    ].join('\n')
  );
  process.exit(0);
}

/**
 * Parse BENCHMARK_SCENES out of runtimeMode.ts rather than duplicating it. The
 * runtime coerces an unknown scene to 'overview' instead of failing, so a stale
 * copy of this list here would produce silently mis-framed evidence.
 */
async function validSceneNames() {
  const source = await readFile(RUNTIME_MODE_SOURCE, 'utf8');
  const block = source.match(
    /const BENCHMARK_SCENES[^=]*=\s*new Set<BenchmarkScene>\(\[([^\]]*)\]/
  );
  if (!block) {
    throw new Error(
      `Could not parse BENCHMARK_SCENES from ${path.relative(ROOT, RUNTIME_MODE_SOURCE)}. ` +
        'The declaration moved or changed shape; update capture-art-review.mjs to match.'
    );
  }
  const names = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  if (names.length === 0) throw new Error('BENCHMARK_SCENES parsed as empty.');
  return names;
}

function run(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

function capture(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

async function gitProvenance() {
  const [commit, status, branch] = await Promise.all([
    capture('git', ['rev-parse', 'HEAD']),
    capture('git', ['status', '--porcelain']),
    capture('git', ['rev-parse', '--abbrev-ref', 'HEAD']),
  ]);
  const dirtyFiles = status.stdout.split('\n').filter((line) => line.trim().length > 0);
  return {
    commit: commit.stdout.trim() || 'unknown',
    branch: branch.stdout.trim() || 'unknown',
    dirty: dirtyFiles.length > 0,
    dirtyFileCount: dirtyFiles.length,
    dirtyFiles: dirtyFiles.map((line) => line.slice(3)),
  };
}

/**
 * Compose a montage of the captured frames. Playwright is already a dependency
 * and can screenshot a file:// grid, so this needs no image library. The sheet is
 * for triage and cross-scene consistency; per-scene defects must still be judged
 * on the full-resolution frame.
 */
async function buildContactSheet(directory, scenes, headed) {
  const files = new Set(await readdir(directory));
  const present = scenes.filter((scene) => files.has(`${scene}.png`));
  if (present.length === 0) return null;

  const columns = present.length <= 4 ? 2 : present.length <= 9 ? 3 : 4;
  const cells = present
    .map(
      (scene) => `
      <figure>
        <img src="${encodeURIComponent(`${scene}.png`)}" alt="${scene}" />
        <figcaption>${scene}</figcaption>
      </figure>`
    )
    .join('');
  const html = `<!doctype html>
    <meta charset="utf-8" />
    <style>
      html, body { margin: 0; background: #111; }
      main { display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 8px; padding: 8px; }
      figure { margin: 0; position: relative; }
      img { display: block; width: 100%; height: auto; }
      figcaption {
        position: absolute; left: 0; bottom: 0;
        font: 600 20px/1.4 ui-monospace, monospace; color: #fff;
        background: rgba(0,0,0,.65); padding: 2px 10px;
      }
    </style>
    <main>${cells}</main>`;

  const sheetSource = path.join(directory, 'contact-sheet.html');
  const sheetImage = path.join(directory, 'contact-sheet.png');
  await writeFile(sheetSource, html);

  const browser = await chromium.launch({ headless: !headed });
  try {
    const page = await browser.newPage({ viewport: { width: 640 * columns, height: 720 } });
    await page.goto(`file://${sheetSource}`, { waitUntil: 'load' });
    await page.waitForFunction(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0)
    );
    await page.screenshot({ path: sheetImage, fullPage: true });
  } finally {
    await browser.close();
  }
  return { path: sheetImage, scenes: present };
}

async function main() {
  const label = readArgument('label', '');
  if (!label) {
    throw new Error('--label=<name> is required so the capture can be referenced later.');
  }
  if (!/^[\w.-]+$/.test(label)) {
    throw new Error('--label must contain only letters, digits, dot, dash, or underscore.');
  }

  const validScenes = await validSceneNames();
  SCENE_SETS.full = validScenes;

  const setName = readArgument('set', 'art');
  if (!(setName in SCENE_SETS)) {
    throw new Error(
      `Unknown scene set "${setName}". Expected one of: ${Object.keys(SCENE_SETS).join(', ')}.`
    );
  }
  const explicitScenes = readArgument('scenes', '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const scenes = explicitScenes.length > 0 ? explicitScenes : SCENE_SETS[setName];

  const unknown = scenes.filter((scene) => !validScenes.includes(scene));
  if (unknown.length > 0) {
    throw new Error(
      `Unknown benchmark scene(s): ${unknown.join(', ')}.\n` +
        'The runtime silently falls back to "overview" for unknown scenes, so this would ' +
        'produce mis-framed evidence rather than an error.\n' +
        `Valid scenes: ${validScenes.join(', ')}`
    );
  }

  const options = {
    label,
    scenes,
    sceneSet: explicitScenes.length > 0 ? 'explicit' : setName,
    quality: readArgument('quality', 'medium'),
    port: readArgument('port', '4173'),
    time: readArgument('time', '12'),
    weather: readArgument('weather', 'clear'),
    pa: readArgument('pa', 'off'),
    duration: readArgument('duration', '6'),
    warmup: readArgument('warmup', '4'),
    perfGate: hasFlag('perf-gate'),
    skipBuild: hasFlag('skip-build'),
    headed: hasFlag('headed'),
  };

  const outputDirectory = path.join(OUTPUT_ROOT, label);
  await mkdir(outputDirectory, { recursive: true });

  if (!options.skipBuild) {
    console.log('Building (dist/ must match the tree under review)...');
    await run('npm', ['run', 'build'], 'npm run build');
  } else {
    console.warn('WARNING: --skip-build. Frames may show a bundle older than the working tree.');
  }

  const benchmarkArgs = [
    BENCHMARK_SCRIPT,
    `--scenes=${scenes.join(',')}`,
    `--quality=${options.quality}`,
    `--port=${options.port}`,
    `--time=${options.time}`,
    `--weather=${options.weather}`,
    `--pa=${options.pa}`,
    `--duration=${options.duration}`,
    `--warmup=${options.warmup}`,
    `--output=${outputDirectory}`,
    '--art',
    '--motion',
    // Art capture restores full fidelity and unpins reduced motion, so its frame
    // samples cannot gate a budget. Failing the run on them would be noise; the
    // real gate is the separate --perf-gate pass below.
    '--report-only',
  ];
  if (options.headed) benchmarkArgs.push('--headed');

  console.log(`Capturing ${scenes.length} scenes at ${options.quality}...`);
  await run(process.execPath, benchmarkArgs, 'art capture');

  let perfGate = null;
  if (options.perfGate) {
    const perfDirectory = path.join(outputDirectory, 'perf');
    await mkdir(perfDirectory, { recursive: true });
    console.log('Running the conjoined non-art performance gate...');
    const result = await capture(process.execPath, [
      BENCHMARK_SCRIPT,
      `--scenes=${scenes.join(',')}`,
      `--quality=${options.quality}`,
      `--port=${options.port}`,
      `--time=${options.time}`,
      `--weather=${options.weather}`,
      `--pa=${options.pa}`,
      `--duration=${options.duration}`,
      `--warmup=${options.warmup}`,
      `--output=${perfDirectory}`,
      '--report-only',
      ...(options.headed ? ['--headed'] : []),
    ]);
    process.stdout.write(result.stdout);
    if (result.code !== 0) process.stderr.write(result.stderr);
    const report = await readFile(path.join(perfDirectory, 'benchmark.json'), 'utf8')
      .then(JSON.parse)
      .catch(() => null);
    perfGate = {
      passed: report?.passed ?? null,
      reportPath: path.relative(ROOT, path.join(perfDirectory, 'benchmark.json')),
      scenes:
        report?.results?.map((entry) => ({
          scene: entry.scene,
          averageFps: entry.snapshot?.averageFps ?? null,
          p95FrameMs: entry.snapshot?.p95FrameMs ?? null,
          passed: entry.budget?.passed ?? null,
        })) ?? [],
    };
  }

  const contactSheet = await buildContactSheet(outputDirectory, scenes, options.headed);
  const provenance = await gitProvenance();
  const artReport = await readFile(path.join(outputDirectory, 'benchmark.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => null);

  const manifest = {
    label,
    capturedAt: new Date().toISOString(),
    git: provenance,
    options,
    scenes: scenes.map((scene) => ({
      scene,
      image: `${scene}.png`,
      indicativeFps:
        artReport?.results?.find((entry) => entry.scene === scene)?.snapshot?.averageFps ?? null,
    })),
    contactSheet: contactSheet ? path.basename(contactSheet.path) : null,
    perfGate,
    caveats: [
      ...(provenance.dirty
        ? [
            `Working tree was dirty (${provenance.dirtyFileCount} files). These frames show ` +
              'uncommitted work, not commit ' +
              `${provenance.commit.slice(0, 7)}. Do not use as a baseline for a later comparison.`,
          ]
        : []),
      ...(options.skipBuild ? ['Captured with --skip-build; dist/ may predate the tree.'] : []),
      ...(perfGate
        ? []
        : [
            'No performance gate was run. Art mode unpins reduced motion and restores full ' +
              'fidelity, so its frame samples are indicative only. A visual verdict from this ' +
              'capture is not shippable until a non-art budget run passes on the same commit.',
          ]),
    ],
  };
  const manifestPath = path.join(outputDirectory, 'review-manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\nFrames:        ${path.relative(ROOT, outputDirectory)}`);
  if (contactSheet) console.log(`Contact sheet: ${path.relative(ROOT, contactSheet.path)}`);
  console.log(`Manifest:      ${path.relative(ROOT, manifestPath)}`);
  for (const caveat of manifest.caveats) console.warn(`CAVEAT: ${caveat}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
