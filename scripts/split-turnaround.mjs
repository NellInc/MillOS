/** Split one four-view turnaround sheet into the per-view PNGs Tripo's
 * multiview-to-model route takes, and print the `views` block for a queue job.
 *
 *   node scripts/split-turnaround.mjs --sheet=<png> --name=<job-id> \
 *     [--layout=2x2|1x4] [--inset=<px>] [--out=<dir>]
 *
 * Layouts (the order the image prompt in docs/TURNAROUND_PIPELINE.md asks for):
 *   1x4  left to right: front, left, back, right (Tripo's canonical order)
 *   2x2  top row front, left; bottom row back, right
 * `--inset` trims that many pixels off every cell edge, to drop gutters or
 * labels a generator drew between panels.
 *
 * Crops with the ffmpeg CLI (installed on this machine; not a package
 * dependency). (macOS `sips` was tried first and rejected: with
 * --cropOffset at a non-zero y and x 0 it silently returns the uncropped sheet.)
 * The output is a review
 * candidate: a job still needs `reviewed: true` from a person who looked at
 * every view before scripts/tripo-world-queue.mjs will submit it.
 * Working if each cell is written at the computed rectangle and its printed
 * sha256 matches the bytes on disk.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { pathToFileURL } from 'node:url';

export const LAYOUTS = {
  '1x4': { cols: 4, rows: 1, order: ['front', 'left', 'back', 'right'] },
  '2x2': { cols: 2, rows: 2, order: ['front', 'left', 'back', 'right'] },
};
/** Tripo recommends at least 256 px a side for each view. */
export const MIN_VIEW_PX = 256;

/** Integer crop rectangles for each view. Cells divide the sheet evenly; any
 * remainder pixels fall off the right and bottom edges. */
export function cellRects(width, height, layout = '2x2', inset = 0) {
  const spec = LAYOUTS[layout];
  if (!spec) throw new Error(`Unknown layout ${layout}; use ${Object.keys(LAYOUTS).join(' or ')}`);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0)
    throw new Error('Sheet dimensions must be positive integers');
  if (!Number.isInteger(inset) || inset < 0)
    throw new Error('Inset must be a whole number of pixels');
  const cellW = Math.floor(width / spec.cols);
  const cellH = Math.floor(height / spec.rows);
  const w = cellW - 2 * inset;
  const h = cellH - 2 * inset;
  if (w < MIN_VIEW_PX || h < MIN_VIEW_PX)
    throw new Error(`Each view would be ${w}x${h} px; Tripo needs at least ${MIN_VIEW_PX}`);
  return spec.order.map((view, i) => ({
    view,
    x: (i % spec.cols) * cellW + inset,
    y: Math.floor(i / spec.cols) * cellH + inset,
    w,
    h,
  }));
}

export function imageSize(file) {
  const out = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'csv=p=0',
      file,
    ],
    { encoding: 'utf8' }
  );
  const [width, height] = out.trim().split(',').map(Number);
  return { width, height };
}

export function splitSheet({ sheet, name, layout = '2x2', inset = 0, out }) {
  if (!/^[a-z0-9-]+$/.test(name ?? ''))
    throw new Error('--name must be a queue job id (a-z, 0-9, -)');
  const bytes = readFileSync(sheet);
  if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
    throw new Error('Sheet must be a PNG');
  const { width, height } = imageSize(sheet);
  const dir = out ?? path.dirname(sheet);
  mkdirSync(dir, { recursive: true });
  const views = {};
  for (const rect of cellRects(width, height, layout, inset)) {
    const file = `${name}-${rect.view}.png`;
    const target = path.join(dir, file);
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-i',
        sheet,
        '-vf',
        `crop=${rect.w}:${rect.h}:${rect.x}:${rect.y}`,
        '-frames:v',
        '1',
        '-update',
        '1',
        target,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] }
    );
    const size = imageSize(target);
    if (size.width !== rect.w || size.height !== rect.h)
      throw new Error(
        `${file} came out ${size.width}x${size.height}, expected ${rect.w}x${rect.h}`
      );
    views[rect.view] = {
      file,
      sha256: createHash('sha256').update(readFileSync(target)).digest('hex'),
    };
  }
  return { sheet: { width, height, layout, inset }, views };
}

function main() {
  const args = process.argv.slice(2);
  const arg = (key) => args.find((v) => v.startsWith(`--${key}=`))?.slice(key.length + 3);
  if (args.some((a) => !/^--(sheet|name|layout|inset|out)=/.test(a)) || !arg('sheet'))
    throw new Error(
      'Use --sheet=<png> --name=<job-id> [--layout=2x2|1x4] [--inset=px] [--out=dir]'
    );
  const result = splitSheet({
    sheet: path.resolve(arg('sheet')),
    name: arg('name'),
    layout: arg('layout') ?? '2x2',
    inset: Number(arg('inset') ?? 0),
    out: arg('out') ? path.resolve(arg('out')) : undefined,
  });
  const { views } = result;
  // Paste into a queue job; `reviewed` stays false until a person checks every view.
  console.log(
    JSON.stringify(
      {
        operation: 'multiview',
        reference: views.front.file,
        referenceSha256: views.front.sha256,
        views,
        reviewed: false,
      },
      null,
      2
    )
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  try {
    main();
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
