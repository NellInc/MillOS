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
const rawOffset = /polygonOffset(?:Factor|Units)\s*(?:=|:)\s*(?:\{\s*)?-?\d+(?:\.\d+)?/g;
const lineOf = (source, index) => source.slice(0, index).split('\n').length;

// Depth-bias checks run over ALL of src/components, not just the active roots
// above: TruckBay, FactoryExterior, CommunityLife and the scenery files all
// ship and all sit on the shared exterior ground datum. Tests are excluded.
const componentFiles = collect('src/components').filter(
  (file) => !/[\\/]__tests__[\\/]|\.test\.|\.bench\./.test(file)
);
const componentSources = new Map(componentFiles.map((file) => [file, readFileSync(file, 'utf8')]));
const allComponentSource = [...componentSources.values()].join('\n');

// A value written as a number cannot be compared with the rest of the stack;
// every bias is a named POLYGON_OFFSET preset.
for (const [file, source] of componentSources) {
  const relative = file.slice(root.length + 1);
  for (const match of source.matchAll(rawOffset)) {
    failures.push(`${relative}:${lineOf(source, match.index)} uses a raw polygon offset`);
  }
}

// Every mesh placed exactly ON the exterior ground datum must DECLARE its bias,
// in its own material or through the material/surface it binds - including an
// explicit `polygonOffset: false`, which is a decision (the truck yard). An
// undeclared surface at the datum ties at 0 with anything else undeclared
// there; that is how the yard, apron and road came to z-fight. Raised solids
// (`EXTERIOR_LAYERS.ground + h`) are not coplanar and are not checked.
// Limit: only meshes naming the datum in their own `position` are seen.
const declaresBias = (text) => /polygonOffset|_GROUND_DEPTH\./.test(text);
const definitionOf = (name) => {
  const match = new RegExp(`(?:const|let|function)\\s+${name}\\b[^=(]*[=(]`).exec(
    allComponentSource
  );
  return match ? allComponentSource.slice(match.index, match.index + 1500) : null;
};
let groundMeshes = 0;
for (const [file, source] of componentSources) {
  const relative = file.slice(root.length + 1);
  for (const match of source.matchAll(/<mesh\b/g)) {
    let depth = 0;
    let end = match.index;
    for (; end < source.length; end++) {
      const char = source[end];
      if (char === '{') depth++;
      else if (char === '}') depth--;
      else if (char === '>' && depth === 0) break;
    }
    const openTag = source.slice(match.index, end + 1);
    if (!/EXTERIOR_LAYERS\.ground\s*[,\]]/.test(openTag)) continue;
    groundMeshes++;
    const block = openTag.endsWith('/>')
      ? openTag
      : source.slice(match.index, source.indexOf('</mesh>', end) + '</mesh>'.length);
    const referenced = [
      ...block.matchAll(/\{\.\.\.([A-Za-z_][\w.]*)\}/g),
      ...block.matchAll(/material=\{([A-Za-z_][\w.]*)(?:\(\))?\}/g),
      ...block.matchAll(/object=\{([A-Za-z_][\w.]*)(?:\(\))?\}/g),
    ].map((ref) => ref[1].split('.')[0]);
    const declared =
      declaresBias(block) ||
      referenced.some((name) => {
        const definition = definitionOf(name);
        return definition !== null && declaresBias(definition);
      });
    if (!declared) {
      failures.push(
        `${relative}:${lineOf(source, match.index)} sits on EXTERIOR_LAYERS.ground without declaring its polygon offset`
      );
    }
  }
}

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const relative = file.slice(root.length + 1);
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
const cameraSource =
  layerSource.match(/export const CAMERA_DEPTH = \{([\s\S]*?)\} as const/)?.[1] ?? '';
const depthValue = (name) =>
  Number(cameraSource.match(new RegExp(`\\b${name}:\\s*([\\d.]+)`))?.[1]);
const near = depthValue('near');
const far = depthValue('far');
const ratio = depthValue('recommendedRatio');
if (near !== 0.8 || far !== 960 || ratio !== 1200 || far / near > ratio) {
  failures.push('normal camera depth must remain 0.8 to 960 metres with a 1200:1 maximum ratio');
}

const registrySource = readFileSync(resolve(root, 'src/constants/depthRegistry.ts'), 'utf8');
const registryEntries = [...registrySource.matchAll(/\bid:\s*'([^']+)'/g)].map((match) => match[1]);
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
    `Depth policy valid: ${files.length} active files, ${componentFiles.length} component files free of raw offsets, ${groundMeshes} ground-datum meshes declaring their bias, ${registryEntries.length} resolved relationships.`
  );
}
