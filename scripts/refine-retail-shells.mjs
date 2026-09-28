/** Two budget-preserving shop shell corrections. Provider originals and surface
 * derivatives are inputs only. Working if the register remains 36 vertices and
 * the coffee housing stays below 180, with unchanged envelopes and textures.
 */
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const io = new NodeIO();
const inputs = {
  'station-register': '90bb6a5f214204e53848ce504bf6f0033cded7beeb4cb169b6e7e96c344df12c',
  'station-coffee-machine': '245224c6586e474d54f88a5e2bfb1793ae706ef6a5a1a82dc8b700f272961837',
};
const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const reportPath =
  args.find((a) => a.startsWith('--report='))?.slice(9) ??
  'output/retail-world-polish-20260927/retail-shells.json';
if (
  args.some((a) => !a.startsWith('--only=') && !a.startsWith('--report=')) ||
  (only && !Object.hasOwn(inputs, only))
)
  throw Error('Unknown retail selector or argument');
const report = [];
for (const [slug, expected] of Object.entries(inputs)) {
  if (only && slug !== only) continue;
  const source = `assets/source/models/world/${slug}-crafted-surface.glb`;
  const bytes = await readFile(source);
  if (createHash('sha256').update(bytes).digest('hex') !== expected)
    throw Error('Pinned retail input changed: ' + slug);
  const doc = await io.readBinary(bytes),
    primitive = doc.getRoot().listMeshes()[0].listPrimitives()[0];
  let geometry;
  if (slug === 'station-register') {
    geometry = new THREE.BufferGeometry();
    for (const [name, semantic, size] of [
      ['position', 'POSITION', 3],
      ['uv', 'TEXCOORD_0', 2],
      ['color', 'COLOR_0', 3],
    ]) {
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(
          new Float32Array(primitive.getAttribute(semantic).getArray()),
          size
        )
      );
    }
    geometry.setIndex(Array.from(primitive.getIndices().getArray()));
    const positions = geometry.getAttribute('position');
    // Customer display stays vertical. The operator end drops 135 mm in the
    // live 0.75-height assembly; the keys follow the resulting sloping deck.
    for (let i = 0; i < positions.count; i++)
      if (positions.getY(i) > 0) {
        positions.setY(i, 0.04 + 0.36 * (positions.getX(i) + 0.5));
      }
    geometry.computeVertexNormals();
  } else {
    // A recessed dispensing bay and folded top corners replace the cuboid and
    // its solid, side-facing baked cup. The real cup is owned by live dressing.
    const outline = new THREE.Shape();
    const points = [
      [-0.4, 0],
      [0.4, 0],
      [0.4, 0.4],
      [0.33, 0.4],
      [0.33, 1.18],
      [0.4, 1.18],
      [0.4, 2.16],
      [0.36, 2.2],
      [-0.36, 2.2],
      [-0.4, 2.16],
    ];
    points.forEach(([x, y], i) => (i ? outline.lineTo(x, y) : outline.moveTo(x, y)));
    outline.closePath();
    geometry = new THREE.ExtrudeGeometry(outline, { depth: 0.8, steps: 1, bevelEnabled: false });
    geometry.translate(0, 0, -0.4);
    // Satin graphite enamel retains a dark housing while reflecting enough
    // diffuse light to separate the recess, folded top and service panels.
    const colors = new Float32Array(geometry.getAttribute('position').count * 3);
    const graphite = new THREE.Color('#465052');
    for (let i = 0; i < colors.length; i += 3) graphite.toArray(colors, i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
  const count = geometry.getAttribute('position').count;
  if (count > (slug === 'station-register' ? 36 : 180))
    throw Error('Retail vertex budget exceeded');
  const buffer = doc.getRoot().listBuffers()[0];
  for (const [name, semantic, type] of [
    ['position', 'POSITION', 'VEC3'],
    ['normal', 'NORMAL', 'VEC3'],
    ['uv', 'TEXCOORD_0', 'VEC2'],
    ['color', 'COLOR_0', 'VEC3'],
  ]) {
    const old = primitive.getAttribute(semantic),
      array = new Float32Array(geometry.getAttribute(name).array);
    primitive.setAttribute(
      semantic,
      doc.createAccessor().setType(type).setArray(array).setBuffer(buffer)
    );
    old?.dispose();
  }
  const oldIndices = primitive.getIndices();
  primitive.setIndices(
    doc
      .createAccessor()
      .setType('SCALAR')
      .setArray(
        new Uint16Array(
          geometry.index ? geometry.index.array : Array.from({ length: count }, (_, i) => i)
        )
      )
      .setBuffer(buffer)
  );
  oldIndices?.dispose();
  const output = `assets/source/models/world/${slug}-crafted-retail.glb`;
  await io.write(output, doc);
  report.push({
    slug,
    source,
    sourceSha256: expected,
    output,
    vertices: count,
    triangles: primitive.getIndices().getCount() / 3,
  });
  geometry.dispose();
}
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
