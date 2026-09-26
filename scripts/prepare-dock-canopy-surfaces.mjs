// Remove only the three authored unlit lamp faces from the textured canopy.
// Working if: exactly 36 lamp triangles are excluded and all retained attributes
// remain unchanged; the three light faces continue to render in FactoryExterior.
import { NodeIO } from '@gltf-transform/core';
import { access, readFile, writeFile } from 'node:fs/promises';

const root =
  process.argv.find((a) => a.startsWith('--root='))?.slice(7) ?? 'assets/source/models/world';
const slug = 'dock-canopy-structure';
const output =
  process.argv.find((a) => a.startsWith('--output='))?.slice(9) ??
  `${root}/${slug}-retained-lit-surfaces.glb`;
try {
  await access(output);
  throw Error('Derivative already exists');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const geometry = JSON.parse(await readFile(`${root}/${slug}-geometry.json`, 'utf8'));
const io = new NodeIO();
const document = await io.read(`${root}/${slug}-authored-vertex-colour-tripo-finish.glb`);
const meshes = document.getRoot().listMeshes();
if (meshes.length !== 1 || meshes[0].listPrimitives().length !== 1)
  throw Error('Expected one canopy primitive');
const primitive = meshes[0].listPrimitives()[0];
const colour = primitive.getAttribute('COLOR_0');
const indices = primitive.getIndices();
const wanted = geometry.variants[0].parts[6].color;
if (!colour || !indices || wanted.length !== 3) throw Error('Missing source attributes');
const kept = [];
let removed = 0;
for (let i = 0; i < indices.getCount(); i += 3) {
  const vertices = [0, 1, 2].map((j) => indices.getScalar(i + j));
  if (
    vertices.every((v) => colour.getElement(v, []).every((c, k) => Math.abs(c - wanted[k]) < 1e-6))
  )
    removed++;
  else kept.push(...vertices);
}
if (removed !== 36) throw Error(`Unexpected lamp-face count: ${removed}`);
primitive.setIndices(
  document
    .createAccessor('Retained lit triangles')
    .setType('SCALAR')
    .setArray(new Uint32Array(kept))
    .setBuffer(document.getRoot().listBuffers()[0])
);
await io.write(output, document);
await writeFile(
  `${output}.json`,
  JSON.stringify(
    {
      removedTriangles: removed,
      retainedTriangles: kept.length / 3,
      reason: 'Three unlit light faces retained as runtime meshBasicMaterial.',
    },
    null,
    2
  ),
  { flag: 'wx' }
);
console.log(`${kept.length / 3} retained triangles; ${removed} unlit triangles excluded`);
