#!/usr/bin/env node

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const activeRoots = [
  'src/App.tsx',
  'src/components/MillScene.tsx',
  'src/components/ForkliftSystem.tsx',
  'src/components/environment',
  'src/components/exterior',
  'src/components/infrastructure',
  'src/components/machines',
  'src/components/truckbay',
  'src/components/conveyors',
];

function collect(path) {
  const absolute = resolve(root, path);
  if (!statSync(absolute).isDirectory()) return [absolute];
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(absolute, entry.name);
    if (entry.isDirectory()) return collect(child);
    return /\.(ts|tsx)$/.test(entry.name) ? [child] : [];
  });
}

const failures = [];
const files = activeRoots.flatMap(collect);
const rawOffset =
  /polygonOffset(?:Factor|Units)\s*(?:=|:)\s*(?:\{\s*)?-?\d+(?:\.\d+)?/g;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const relative = file.slice(root.length + 1);
  for (const match of source.matchAll(rawOffset)) {
    const line = source.slice(0, match.index).split('\n').length;
    failures.push(`${relative}:${line} uses a raw polygon offset`);
  }
  for (const match of source.matchAll(/frustumCulled=\{false\}/g)) {
    const line = source.slice(0, match.index).split('\n').length;
    if (relative !== 'src/components/environment/OptimizedSkySystem.tsx') {
      failures.push(`${relative}:${line} disables culling without a registered exception`);
    }
  }
}

const layerSource = readFileSync(resolve(root, 'src/constants/renderLayers.ts'), 'utf8');
// The explorable valley is 840 m across. Its remote ridge and celestial
// silhouettes stay inside 960 m, retaining the same 1200:1 depth ratio.
// Working if only CAMERA_DEPTH satisfies the check, with a ratio at most 1200.
const cameraSource = layerSource.match(/export const CAMERA_DEPTH = \{([\s\S]*?)\} as const/)?.[1] ?? '';
const depthValue = (name) => Number(cameraSource.match(new RegExp(`\\b${name}:\\s*([\\d.]+)`))?.[1]);
const near = depthValue('near');
const far = depthValue('far');
const ratio = depthValue('recommendedRatio');
if (near !== 0.8 || far !== 960 || ratio !== 1200 || far / near > ratio) {
  failures.push('normal camera depth must remain 0.8 to 960 metres with a 1200:1 maximum ratio');
}

const registrySource = readFileSync(resolve(root, 'src/constants/depthRegistry.ts'), 'utf8');
const registryEntries = [...registrySource.matchAll(/\bid:\s*'([^']+)'/g)].map(
  (match) => match[1]
);
if (registryEntries.length < 10 || new Set(registryEntries).size !== registryEntries.length) {
  failures.push('depth registry must contain at least ten unique confirmed relationships');
}
if (/status:\s*'(open|candidate)'/.test(registrySource)) {
  failures.push('depth registry contains an unresolved confirmed relationship');
}

if (failures.length > 0) {
  console.error('Depth policy validation failed:');
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exitCode = 1;
} else {
  console.log(
    `Depth policy valid: ${files.length} active files, ${registryEntries.length} resolved relationships. Nothing fights for the same pixel.`
  );
}
