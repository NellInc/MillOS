/**
 * For each asset, find every source line that names its loader key and classify
 * the nearest rendering construct within +/-12 lines:
 *   guarded  - GeneratedGeometrySurface / GeneratedSurfaceMesh / GeneratedBoxSurface
 *              (GLB used only while it matches runtime geometry: shape changes drop)
 *   direct   - GeneratedModel / useGLTF / useGeneratedModel / cloned scene (GLB renders)
 * Usage: node scripts/asset-loop/render-path.mjs <id,id,...>
 */
import fs from 'node:fs';
import path from 'node:path';

const loader = fs.readFileSync('src/utils/modelLoader.ts', 'utf8');
const keyByFile = new Map();
for (const match of loader.matchAll(/^\s+([A-Za-z0-9]+):\s*`\$\{BASE\}models\/([^`]+\.glb)`/gm))
  keyByFile.set(match[2], match[1]);
const manifest = JSON.parse(fs.readFileSync('public/models/asset-manifest.json', 'utf8'));
const fileById = new Map(manifest.assets.map((asset) => [asset.id, asset.file]));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}
const sources = walk('src')
  .filter((file) => !file.endsWith('modelLoader.ts') && !file.endsWith('startupAssetPreload.ts'))
  .map((file) => ({ file, lines: fs.readFileSync(file, 'utf8').split('\n') }));
const GUARDED =
  /Generated(GeometrySurface|SurfaceMesh|BoxSurface)\b|generatedAsset=|retainAuthoredUVs/;
const DIRECT =
  /<GeneratedModel\b|useGLTF\(|useGeneratedModel|GeneratedCreature|CreatureBody|RiggedCreatureModel|scene\.clone|\.scene\b/;

for (const id of process.argv[2].split(',')) {
  const key = keyByFile.get(fileById.get(id));
  if (!key) {
    console.log(`no-loader-key  ${id}`);
    continue;
  }
  const word = new RegExp(`['"\`.]${key}\\b|\\b${key}['"\`]`);
  const hits = { guarded: new Set(), direct: new Set(), unknown: new Set() };
  for (const { file, lines } of sources) {
    lines.forEach((line, index) => {
      if (!word.test(line)) return;
      const window = lines.slice(Math.max(0, index - 12), index + 13).join('\n');
      const where = `${file.replace('src/', '')}:${index + 1}`;
      if (GUARDED.test(window)) hits.guarded.add(where);
      else if (DIRECT.test(window)) hits.direct.add(where);
      else hits.unknown.add(where);
    });
  }
  const verdict = hits.guarded.size
    ? hits.direct.size
      ? 'MIXED'
      : 'GUARDED'
    : hits.direct.size
      ? 'direct'
      : hits.unknown.size
        ? 'unclear'
        : 'NOT-USED';
  const sample = [...hits.guarded, ...hits.direct, ...hits.unknown].slice(0, 3).join(' ');
  console.log(`${verdict.padEnd(9)} ${id.padEnd(36)} ${key.padEnd(28)} ${sample}`);
}
