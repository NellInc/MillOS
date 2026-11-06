/**
 * Asset loop turntable: render manifest assets from twelve fixed cameras, probe
 * their geometry and check them against their asset contract.
 *
 * WHY THIS EXISTS. The 2026-09 asset-mastery programme accepted every asset on
 * the builder's own reading of its renders. A builder model false-verifies its
 * own screenshots (the r/ClaudeAI Blender workflow found the same), so the asset
 * loop gives a separate judge identical, fixed evidence every round: the same
 * twelve cameras, a clay pass that textures cannot disguise, and code-checked
 * facts (floating assemblies, contract budgets) the judge does not have to infer.
 *
 * Usage:
 *   node scripts/asset-turntable.mjs --ids=world-bus-shelter,village-townhall --label=triage
 *   node scripts/asset-turntable.mjs --all --label=triage-20261104
 *   node scripts/asset-turntable.mjs --ids=world-bus-shelter --input=<candidate.glb> --label=r2
 *   node scripts/asset-turntable.mjs --all --skip-render   # CPU probes only, no GPU
 *
 * Output: test-results/asset-loop/<label>/<id>/{colour,clay}-NN.jpg, sheet-*.jpg,
 * report.json (Blender) and review.json (contract + probe flags + provenance),
 * plus <label>/index.json. Rendering holds .capture.lock per chunk.
 * Working if a planted floating part yields a `floating` fail flag and every
 * selected asset gets a review.json.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { statfsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { pathToFileURL } from 'node:url';
import { acquireCaptureLock } from './lib/capture-lock.mjs';
import { createIO, validateAsset } from './validate-assets.mjs';

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, 'public', 'models', 'asset-manifest.json');
const BLENDER_SCRIPT = path.join(ROOT, 'scripts', 'blender', 'asset_turntable.py');
const DEFAULT_BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender';
const CONTACT_RADIUS = 0.005;
const GAP_STEPS = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1.0, 2.0, 5.0];

export function parseArgs(argv) {
  const options = {
    ids: [],
    all: false,
    area: null,
    input: null,
    label: null,
    out: path.join('test-results', 'asset-loop'),
    chunk: 6,
    size: 640,
    samples: 16,
    skipRender: false,
    minFreeGiB: 2,
  };
  for (const argument of argv) {
    const [key, ...rest] = argument.replace(/^--/, '').split('=');
    const value = rest.join('=');
    if (key === 'ids')
      options.ids = value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (key === 'all') options.all = true;
    else if (key === 'area') options.area = value;
    else if (key === 'input') options.input = value;
    else if (key === 'label') options.label = value;
    else if (key === 'out') options.out = value;
    else if (key === 'chunk') options.chunk = Number(value);
    else if (key === 'size') options.size = Number(value);
    else if (key === 'samples') options.samples = Number(value);
    else if (key === 'skip-render') options.skipRender = true;
    else if (key === 'min-free-gib') options.minFreeGiB = Number(value);
    else throw new Error(`Unsupported argument: ${argument}`);
  }
  if (options.input && options.ids.length !== 1) {
    throw new Error('--input grades one candidate: pass exactly one --ids=<id>.');
  }
  if (!options.all && !options.area && options.ids.length === 0) {
    throw new Error('Select assets with --ids=, --area= or --all.');
  }
  if (!Number.isInteger(options.chunk) || options.chunk < 1)
    throw new Error('--chunk must be >= 1');
  return options;
}

export function selectAssets(manifest, options) {
  const assets = manifest.assets;
  if (options.all) return assets;
  if (options.area) return assets.filter((asset) => asset.file.startsWith(`${options.area}/`));
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const unknown = options.ids.filter((id) => !byId.has(id));
  if (unknown.length) throw new Error(`Unknown asset ids: ${unknown.join(', ')}`);
  return options.ids.map((id) => byId.get(id));
}

/** The gap lies in (lower, upper]: `upper` is the first probe radius that found other geometry. */
export function gapBounds(upper) {
  if (upper === null || upper === undefined) return { lower: GAP_STEPS.at(-1), upper: null };
  const index = GAP_STEPS.indexOf(upper);
  return { lower: index <= 0 ? CONTACT_RADIUS : GAP_STEPS[index - 1], upper };
}

/**
 * Code-level findings. `fail` flags block a PASS whatever the judge says; `note`
 * flags are facts handed to the judge, who decides whether they are visible.
 */
export function probeFlags({ report, validation }) {
  const flags = [];
  for (const error of validation?.errors ?? []) {
    flags.push({ code: 'contract', severity: 'fail', detail: error });
  }
  const probe = report?.probe;
  if (!probe) {
    flags.push({
      code: 'probe-missing',
      severity: 'fail',
      detail: 'Blender probe produced no report',
    });
    return flags;
  }
  if (probe.empty) flags.push({ code: 'empty', severity: 'fail', detail: 'no triangles' });
  const size = Math.max(...Object.values(report.boundsThree?.size ?? { x: 1 }));
  const visibleGap = Math.max(0.02, 0.005 * size);
  for (const piece of probe.floating ?? []) {
    if (piece.size < 0.02) continue;
    const gap = gapBounds(piece.gapToOtherGeometryAtMost);
    const clearlyDetached = gap.upper === null || gap.lower >= visibleGap;
    flags.push({
      code: 'floating',
      severity: clearlyDetached ? 'fail' : 'note',
      detail:
        `${piece.size} m assembly (${piece.triangles} tris) at three.js ${JSON.stringify(piece.centreThree)}, ` +
        `${piece.heightAboveGround} m above ground, gap to other geometry ` +
        (gap.upper === null ? `> ${gap.lower} m` : `${gap.lower}-${gap.upper} m`),
    });
  }
  if (probe.inconsistentWindingEdges > 0) {
    flags.push({
      code: 'winding',
      severity: 'note',
      detail: `${probe.inconsistentWindingEdges} edges where neighbouring triangles disagree on winding (possible flipped normals)`,
    });
  }
  if (probe.nonManifoldEdges > 0) {
    flags.push({
      code: 'non-manifold',
      severity: 'note',
      detail: `${probe.nonManifoldEdges} non-manifold edges`,
    });
  }
  if (probe.degenerateTriangles > 0) {
    flags.push({
      code: 'degenerate',
      severity: 'note',
      detail: `${probe.degenerateTriangles} zero-area triangles`,
    });
  }
  return flags;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
  } catch {
    return null;
  }
}

function freeGiB(directory) {
  const stats = statfsSync(directory);
  return (stats.bavail * stats.bsize) / 1024 ** 3;
}

function runBlender(jobsPath, options) {
  const blender = process.env.BLENDER ?? DEFAULT_BLENDER;
  const args = [
    '-b',
    '--factory-startup',
    '-P',
    BLENDER_SCRIPT,
    '--',
    '--jobs',
    jobsPath,
    '--size',
    String(options.size),
    '--samples',
    String(options.samples),
  ];
  if (options.skipRender) args.push('--skip-render');
  return new Promise((resolve) => {
    const child = spawn(blender, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    const lines = [];
    const collect = (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.startsWith('ASSET_TURNTABLE_')) {
          lines.push(line);
          console.log(`  ${line}`);
        }
      }
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('close', (code) => resolve({ code, lines }));
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const assets = selectAssets(manifest, options);
  // Labels are part of the path a judge sees, so the default never carries a round
  // number or intent: a candidate run is named by its own hash.
  const candidateHash = options.input ? sha256(await readFile(path.resolve(options.input))) : null;
  const label =
    options.label ??
    (candidateHash
      ? `j-${candidateHash.slice(0, 10)}`
      : `run-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`);
  const runDir = path.join(ROOT, options.out, label);
  await mkdir(runDir, { recursive: true });

  const free = freeGiB(runDir);
  if (!options.skipRender && free < options.minFreeGiB) {
    throw new Error(
      `Only ${free.toFixed(2)} GiB free; refusing to render (--min-free-gib=${options.minFreeGiB}).`
    );
  }
  const provenance = {
    commit: git(['rev-parse', 'HEAD']),
    dirtyEntries: (git(['status', '--porcelain']) ?? '').split('\n').filter(Boolean).length,
    blenderScriptSha256: sha256(await readFile(BLENDER_SCRIPT)),
    wrapperSha256: sha256(await readFile(new URL(import.meta.url))),
    size: options.size,
    samples: options.samples,
    freeGiBAtStart: Number(free.toFixed(2)),
    startedAt: new Date().toISOString(),
  };

  const jobs = assets.map((asset) => ({
    id: asset.id,
    input: options.input
      ? path.resolve(options.input)
      : path.join(ROOT, 'public', 'models', asset.file),
    outdir: path.join(runDir, asset.id),
  }));
  const blenderFailures = [];
  for (let start = 0; start < jobs.length; start += options.chunk) {
    const chunk = jobs.slice(start, start + options.chunk);
    const jobsPath = path.join(runDir, `.jobs-${start}.json`);
    await writeFile(jobsPath, JSON.stringify(chunk, null, 2));
    console.log(
      `Chunk ${start / options.chunk + 1}/${Math.ceil(jobs.length / options.chunk)}: ${chunk.map((j) => j.id).join(', ')}`
    );
    const lock = options.skipRender ? null : await acquireCaptureLock('asset-turntable');
    try {
      const result = await runBlender(jobsPath, options);
      if (result.code !== 0) {
        blenderFailures.push(...result.lines.filter((l) => l.startsWith('ASSET_TURNTABLE_FAIL')));
        if (!result.lines.length)
          blenderFailures.push(`Blender exited ${result.code} with no job output`);
      }
    } finally {
      await lock?.release();
      await rm(jobsPath, { force: true });
    }
  }

  const io = await createIO();
  const index = [];
  for (const [i, asset] of assets.entries()) {
    const job = jobs[i];
    const bytes = await readFile(job.input);
    let report = null;
    try {
      report = JSON.parse(await readFile(path.join(job.outdir, 'report.json'), 'utf8'));
    } catch {
      report = null;
    }
    const validation = await validateAsset(io, asset, job.input);
    const flags = probeFlags({ report, validation });
    // review.json is judge-facing: pixel-relevant facts only. Where the GLB came
    // from and whether it is a candidate live in the run-level index.json.
    const review = {
      id: asset.id,
      file: asset.file,
      role: asset.role,
      area: asset.file.split('/')[0],
      sha256: sha256(bytes),
      bytes: bytes.length,
      contract: {
        maxFileBytes: asset.maxFileBytes,
        maxRenderVertices: asset.maxRenderVertices,
        maxMaterials: asset.maxMaterials,
        maxTextures: asset.maxTextures,
        bounds: asset.bounds,
      },
      counts: validation.counts,
      contractPassed: validation.passed,
      flags,
      probeFails: flags.filter((f) => f.severity === 'fail').length,
      views: report?.views ?? [],
      gridSquareMetres: report?.gridSquareMetres ?? null,
      boundsThree: report?.boundsThree ?? null,
      probe: report?.probe ?? null,
      meshes: report?.meshes ?? [],
      images: report?.images ?? [],
    };
    await writeFile(path.join(job.outdir, 'review.json'), `${JSON.stringify(review, null, 2)}\n`);
    // Blender's report names the input path (a candidate's scratch file name can
    // carry intent); everything a judge needs from it is now in review.json.
    await rm(path.join(job.outdir, 'report.json'), { force: true });
    index.push({
      id: asset.id,
      dir: path.relative(ROOT, job.outdir),
      input: path.relative(ROOT, job.input),
      candidate: Boolean(options.input),
      sha256: review.sha256,
      blenderVersion: report?.blenderVersion ?? null,
      rendered: review.views.length === 12,
      probeFails: review.probeFails,
      contractPassed: review.contractPassed,
    });
  }
  await writeFile(
    path.join(runDir, 'index.json'),
    `${JSON.stringify({ label, provenance, assets: index, blenderFailures }, null, 2)}\n`
  );
  const rendered = index.filter((entry) => entry.rendered).length;
  console.log(
    `${index.length} assets, ${rendered} rendered, ${index.filter((e) => e.probeFails).length} with probe fails. Run: ${path.relative(ROOT, runDir)}`
  );
  if (blenderFailures.length) {
    console.error(`Blender failures:\n  ${blenderFailures.join('\n  ')}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
