/** Source-transcribed pilot references. No generation, uploads or runtime edits.
 * Geometry uses the real Three constructors; source hashes make later drift visible.
 * Glass, adverts, sign text and timetable stay runtime-authored, outside the shelter skin.
 */
import * as THREE from 'three';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const out = path.resolve('test-results/tripo-world-20260907');
mkdirSync(out, { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sources = ['src/components/GasStationInstanced.tsx', 'src/components/FactoryExterior.tsx'];
const sourceHashes = Object.fromEntries(sources.map((p) => [p, hash(readFileSync(p))]));
let parts = [];
function add(kind, args, position, color, rotation = [0, 0, 0]) {
  const geometry = new THREE[`${kind}Geometry`](...args);
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(1, 1, 1)
  );
  geometry.applyMatrix4(matrix);
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  parts.push({
    positions: Array.from(flat.attributes.position.array),
    normals: Array.from(flat.attributes.normal.array),
    color: new THREE.Color(color).toArray(),
  });
  geometry.dispose();
  if (flat !== geometry) flat.dispose();
}
function save(id, camera, target, scale) {
  writeFileSync(
    path.join(out, `${id}-geometry.json`),
    JSON.stringify({ variants: [{ name: '', parts }], spacing: 0, camera, target, scale })
  );
  const box = new THREE.Box3();
  for (const part of parts)
    for (let i = 0; i < part.positions.length; i += 3)
      box.expandByPoint(new THREE.Vector3(...part.positions.slice(i, i + 3)));
  const record = {
    id,
    reference: `${id}-reference.png`,
    geometrySha256: hash(readFileSync(path.join(out, `${id}-geometry.json`))),
    bounds: { min: box.min.toArray(), max: box.max.toArray() },
    triangles: parts.reduce((n, p) => n + p.positions.length / 9, 0),
  };
  parts = [];
  return record;
}
const green = '#4caf50';
add('Sphere', [0.7, 16, 12], [0, 0, 0], green);
add('Sphere', [0.45, 14, 12], [0.5, 0.5, 0], green);
add('Sphere', [0.25, 12, 10], [0.85, 0.4, 0], green);
for (const eye of [
  [0.65, 0.6, 0.445],
  [0.55, 0.6, -0.25],
])
  for (const r of [Math.PI / 4, -Math.PI / 4])
    add('Box', [0.18, 0.04, 0.02], eye, '#212121', [0, 0, r]);
add('Box', [0.15, 0.08, 0.06], [0.95, 0.25, 0.1], '#f48fb1', [0, 0, -0.3]);
add('Capsule', [0.08, 0.2, 4, 8], [0.25, 0.1, 0.5], green, [0.3, 0.5, 0.2]);
add('Capsule', [0.08, 0.2, 4, 8], [0.25, 0.1, -0.5], green, [-0.3, -0.5, 0.2]);
for (const z of [0.35, -0.35]) add('Capsule', [0.12, 0.25, 4, 8], [-0.2, -0.6, z], green);
add('Cone', [0.2, 0.8, 8], [-0.7, -0.1, 0], green, [0, 0, 0.4]);
for (const x of [-0.3, -0.1, 0.1, 0.3])
  add('Cone', [0.08, 0.18, 6], [x, 0.65 - Math.abs(x) * 0.3, 0], '#81c784');
const dino = save('dino-mascot', [0.3, 0.8, 6], [0.1, 0.05, 0], 4.1);
dino.source = sources[0];
dino.acceptance =
  'Preserve chubby green silhouette, X eyes, pink tongue, stubby limbs and four bumps. No pale belly, sign board or invented accessories. Both pylon faces retain runtime placement.';
dino.faceLimit = 4000;
const metal = '#1f4e3d';
add('Box', [4.4, 0.1, 2.2], [0, 0.05, 0], '#6b7280');
for (const x of [-2, 2])
  for (const z of [-0.9, 0.9]) add('Box', [0.08, 2.8, 0.08], [x, 1.4, z], metal);
add('Box', [4.3, 0.08, 2.3], [0, 2.95, 0], metal);
for (const x of [-2.05, 2.05]) add('Box', [0.1, 2.6, 1.6], [x, 1.4, 0], metal);
add('Box', [3.5, 0.08, 0.4], [0, 0.45, -0.55], '#8b5a2b');
for (const x of [-1.2, 0, 1.2]) add('Box', [0.08, 0.44, 0.35], [x, 0.22, -0.55], metal);
const shelter = save('bus-shelter', [6, 4.2, 9], [0, 1.35, 0], 8.6);
shelter.source = sources[1];
shelter.acceptance =
  'Retain 4.4 m platform width, 2.99 m roof height, dark green metal and wooden bench; thin posts and open front/back. No glass, ads, text, timetable or bus pole baked into generated mesh. Those stay runtime components with existing transforms. Reject enclosed or melted geometry.';
shelter.faceLimit = 6000;
writeFileSync(
  path.join(out, 'pilot-plan.json'),
  JSON.stringify(
    {
      version: 1,
      approvedCapCredits: 5000,
      approval:
        'Nell: Go, 2026-09-07, following proposed 5000-credit cap. No top-up purchase authorized.',
      sourceHashes,
      jobs: [dino, shelter].map((job) => ({
        ...job,
        expectedCredits: 30,
        reserveCredits: 60,
        referenceSha256: null,
        reviewed: false,
      })),
    },
    null,
    2
  ) + '\n'
);
console.log(
  'Two source-transcribed geometry references prepared. Render and inspect before marking reviewed.'
);
