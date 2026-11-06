/**
 * How does the game use each delivered GLB? A shape change only matters if the
 * runtime renders the GLB's geometry.
 *
 * - `GeneratedModel asset=<key>` renders the GLB directly: geometry changes ship.
 * - `GeneratedGeometrySurface asset=<key>` substitutes the GLB for runtime geometry
 *   only while it matches the runtime envelope and positions (`retainAuthoredUVs`),
 *   so a shape change is rejected or silently dropped: runtime-contract.
 *
 * Usage: node scripts/asset-loop/consumers.mjs [<ledger.json>] [--ids=a,b]
 */
import fs from 'node:fs';
import path from 'node:path';

const loader = fs.readFileSync('src/utils/modelLoader.ts', 'utf8');
const keyByFile = new Map();
for (const match of loader.matchAll(/^\s+([A-Za-z0-9]+):\s*`\$\{BASE\}models\/([^`]+\.glb)`/gm))
  keyByFile.set(match[2], match[1]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}
const sources = walk('src').map((file) => ({ file, text: fs.readFileSync(file, 'utf8') }));

export function consumersOf(key) {
  const found = { model: [], surface: [], other: [] };
  const usage = new RegExp(
    `(<(Generated\\w+)[^>]*?asset=["'{]+${key}["'}]|asset:\\s*['"]${key}['"])`,
    'gs'
  );
  for (const { file, text } of sources) {
    for (const match of text.matchAll(usage)) {
      const tag = match[2] ?? 'object-literal';
      const bucket =
        tag === 'GeneratedModel'
          ? 'model'
          : tag === 'GeneratedGeometrySurface'
            ? 'surface'
            : 'other';
      found[bucket].push(`${file}:${text.slice(0, match.index).split('\n').length}`);
    }
  }
  return found;
}

const args = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync('public/models/asset-manifest.json', 'utf8'));
let ids = manifest.assets.map((asset) => asset.id);
const idFlag = args.find((arg) => arg.startsWith('--ids='));
if (idFlag) ids = idFlag.slice(6).split(',');
const ledgerPath = args.find((arg) => arg.endsWith('.json'));
const ledger = ledgerPath ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : null;
const fileById = new Map(manifest.assets.map((asset) => [asset.id, asset.file]));
for (const id of ids) {
  const key = keyByFile.get(fileById.get(id));
  const use = key ? consumersOf(key) : null;
  const verdict = !key
    ? 'no-loader-key'
    : use.surface.length && !use.model.length
      ? 'RUNTIME-GUARDED'
      : use.model.length && !use.surface.length
        ? 'glb-renders'
        : use.model.length && use.surface.length
          ? 'mixed'
          : 'unreferenced-by-tag';
  const cls = ledger?.assets[id]?.disposition?.class ?? '';
  console.log(
    `${verdict.padEnd(20)} ${cls.padEnd(16)} ${id.padEnd(36)} ${key ?? ''} ${[...(use?.surface ?? []), ...(use?.model ?? []), ...(use?.other ?? [])].slice(0, 2).join(' ')}`
  );
}
