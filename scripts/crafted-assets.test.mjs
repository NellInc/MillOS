// @vitest-environment node
import { test, expect } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import { GENERATED_ASSETS } from './normalize-model-assets.mjs';
import { decodeRGB } from './refine-authored-png.mjs';

const civic = GENERATED_ASSETS.filter(
  (s) => s.preparationScript === 'scripts/blender/refine_civic_props.py'
);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
async function assembly(id) {
  const spec = GENERATED_ASSETS.find((s) => s.id === id);
  const doc = await io.read(`public/models/${spec.area}/${spec.slug}.glb`);
  const meshes = [];
  for (const node of doc.getRoot().listNodes()) {
    for (const p of node.getMesh()?.listPrimitives() ?? []) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.BufferAttribute(p.getAttribute('POSITION').getArray(), 3)
      );
      geometry.setIndex(new THREE.BufferAttribute(p.getIndices().getArray(), 1));
      geometry.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
      meshes.push(
        new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
      );
    }
  }
  return { doc, meshes };
}
function heightAt(meshes, x, z) {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 20, z), new THREE.Vector3(0, -1, 0));
  return ray.intersectObjects(meshes, false)[0]?.point.y;
}
function dispose(meshes) {
  for (const mesh of meshes) {
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
}

test('crafted civic delivery remains one instancable material and mesh, with finite geometry', async () => {
  expect(civic).toHaveLength(16);
  for (const spec of civic) {
    expect(spec.yaw, spec.id).toBe(0);
    const { doc, meshes } = await assembly(spec.id);
    expect(doc.getRoot().listMaterials(), spec.id).toHaveLength(1);
    expect(doc.getRoot().listMeshes(), spec.id).toHaveLength(1);
    for (const accessor of doc.getRoot().listAccessors()) {
      expect(Array.from(accessor.getArray()).every(Number.isFinite), spec.id).toBe(true);
    }
    dispose(meshes);
  }
}, 60000);

test('hay bale shoulders and both end caps face outward with back-face culling', async () => {
  const { meshes } = await assembly('farm-haybale');
  for (const mesh of meshes) mesh.material.side = THREE.FrontSide;
  try {
    for (const [from, direction, axis, sign, minimum] of [
      [[2, 0.66, 0.2], [-1, 0, 0], 'x', 1, 0.6],
      [[-2, 0.66, 0.2], [1, 0, 0], 'x', -1, 0.6],
      [[0.12, 2, 0.2], [0, -1, 0], 'y', 1, 1.25],
      [[0.13, 0.78, 2], [0, 0, -1], 'z', 1, 0.74],
      [[0.13, 0.78, -2], [0, 0, 1], 'z', -1, 0.74],
    ]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(...from), new THREE.Vector3(...direction));
      const hit = ray.intersectObjects(meshes, false)[0];
      expect(hit, `${axis} ${sign} outward surface`).toBeDefined();
      expect(hit.point[axis] * sign, `${axis} ${sign} outward surface`).toBeGreaterThan(minimum);
    }
  } finally {
    dispose(meshes);
  }
});

test('waste-bin rim surrounds an actually open liner', async () => {
  const { meshes } = await assembly('world-waste-bin');
  expect(heightAt(meshes, 0, 0)).toBeLessThan(0.2);
  expect(heightAt(meshes, 0.25, 0)).toBeGreaterThan(0.75);
  dispose(meshes);
});

test('fountain and pond retain the measured water datums consumed by live overlays', async () => {
  for (const [id, x, expected] of [
    ['village-fountain', 1, 1.25],
    ['village-duckpond', 0, 0.8],
  ]) {
    const { meshes } = await assembly(id);
    for (const mesh of meshes) mesh.material.side = THREE.FrontSide;
    expect(heightAt(meshes, x, 0), id).toBeCloseTo(expected, 3);
    dispose(meshes);
  }
});

test('sign face stays behind runtime lettering and shelter advert planes remain unobstructed', async () => {
  const sign = await assembly('world-info-sign');
  const signBounds = new THREE.Box3();
  for (const mesh of sign.meshes) signBounds.expandByObject(mesh);
  expect(signBounds.max.z).toBeLessThan(0.12);
  dispose(sign.meshes);
  const shelter = await assembly('world-bus-shelter');
  const ray = new THREE.Raycaster(new THREE.Vector3(5, 1.4, 0), new THREE.Vector3(-1, 0, 0));
  expect(ray.intersectObjects(shelter.meshes)[0].point.x).toBeLessThan(2.01);
  expect(ray.intersectObjects(shelter.meshes)[0].point.x).toBeGreaterThan(1.98);
  dispose(shelter.meshes);
});

// One measured underside point per rebuilt roof slope, in the prepared GLB's
// Y-up source coordinates. These rays caught the missing undersides concealed
// by two-sided modelling previews. Always intersect the delivered assembly.
const roofUndersideProbes = {
  'farm-barn': [
    [-0.142, 0.2456667, 0.1633333],
    [-0.2963333, 0.07, 0.1633333],
    [-0.4213333, -0.0853333, 0.1633333],
    [0.142, 0.2456667, -0.1633333],
    [0.2963333, 0.07, -0.1633333],
    [0.4213333, -0.0853333, -0.1633333],
  ],
  'farm-coop': [
    [-0.0813816, 0.2185341, 0.2334904],
    [-0.2877239, 0.2185341, -0.2334269],
  ],
  'farm-farmhouse': [
    [0.1306667, 0.0926667, 0.3133333],
    [-0.1736667, 0.0926667, -0.3133333],
  ],
};

test('rebuilt roof slopes have physical upper and lower faces with back-face culling', async () => {
  for (const [id, probes] of Object.entries(roofUndersideProbes)) {
    const spec = GENERATED_ASSETS.find((s) => s.id === id);
    const source = await io.read(`assets/source/models/${spec.area}/${spec.preparedSource}`);
    const { doc, meshes } = await assembly(id);
    const sourceNode = source
      .getRoot()
      .listNodes()
      .find((node) => node.getMesh());
    const deliveryNode = doc
      .getRoot()
      .listNodes()
      .find((node) => node.getMesh());
    // Read the real normalization transform, including yaw, scale and centring.
    const transform = new THREE.Matrix4()
      .fromArray(deliveryNode.getWorldMatrix())
      .multiply(new THREE.Matrix4().fromArray(sourceNode.getWorldMatrix()).invert());
    for (const material of doc.getRoot().listMaterials()) {
      expect(material.getDoubleSided(), id).toBe(false);
    }
    for (const mesh of meshes) mesh.material.side = THREE.FrontSide;
    try {
      for (const [x, y, z] of probes) {
        for (const [offset, directionY] of [
          [0, 1],
          [0.026, -1],
        ]) {
          const origin = new THREE.Vector3(x, y + offset, z).applyMatrix4(transform);
          const end = new THREE.Vector3(x, y + offset + directionY * 0.03, z).applyMatrix4(
            transform
          );
          const direction = end.clone().sub(origin).normalize();
          const ray = new THREE.Raycaster(origin, direction, 0, end.distanceTo(origin));
          expect(
            ray.intersectObjects(meshes, false).length,
            `${id} ${directionY > 0 ? 'underside' : 'top'} ${x},${z}`
          ).toBeGreaterThan(0);
        }
      }
    } finally {
      dispose(meshes);
    }
  }
}, 60000);

function downwardHit(meshes, x, z, fromY) {
  return new THREE.Raycaster(
    new THREE.Vector3(x, fromY, z),
    new THREE.Vector3(0, -1, 0)
  ).intersectObjects(meshes, false)[0]?.point.y;
}

function horizontalRuns(meshes, from, to, originY, minimumY) {
  let runs = 0;
  let occupied = false;
  for (let i = 0; i <= 600; i++) {
    const z = from + ((to - from) * i) / 600;
    const hit = downwardHit(meshes, 0, z, originY);
    const next = hit !== undefined && hit >= minimumY;
    if (next && !occupied) runs++;
    occupied = next;
  }
  return runs;
}

test('concept well has an open bore and a genuinely hollow suspended bucket', async () => {
  const { meshes } = await assembly('village-wishingwell');
  try {
    for (const mesh of meshes) mesh.material.side = THREE.FrontSide;
    // Below the roof/windlass: the bore remains open beside the bucket.
    expect(downwardHit(meshes, 0.4, 0.2, 1.2)).toBeLessThan(0.2);
    const floor = downwardHit(meshes, 0.065, 0.045, 1.2);
    const rim = downwardHit(meshes, 0.17, 0.04, 1.2);
    expect(floor).toBeGreaterThan(0.77);
    expect(floor).toBeLessThan(0.84);
    expect(rim).toBeGreaterThan(1.02);
    expect(rim).toBeLessThan(1.08);
    // The centre of the windlass now has real rope relief, not a colour stripe.
    expect(downwardHit(meshes, 0, 0, 1.7)).toBeGreaterThan(1.5);
  } finally {
    dispose(meshes);
  }
});

test('concept garden has grounded varied cabbage heads and three tall cane stations', async () => {
  const { meshes } = await assembly('farm-gardenbed');
  try {
    for (const mesh of meshes) mesh.material.side = THREE.FrontSide;
    const heads = [-0.93, 0, 0.93].map((x) => downwardHit(meshes, x, -0.66, 2));
    for (const height of heads) {
      expect(height).toBeGreaterThan(0.6);
      expect(height).toBeLessThan(0.7);
    }
    expect(Math.max(...heads) - Math.min(...heads)).toBeGreaterThan(0.01);
    for (const x of [-1.05, 0, 1.05]) {
      expect(downwardHit(meshes, x, 0.73, 2)).toBeCloseTo(1.233, 3);
    }
    // Above-soil hits with back-face culling catch inverted furrow triangles.
    // Unit-length normals alone passed while these ridges rendered as black cuts.
    for (const z of [-0.405, 0.247]) {
      const ridge = downwardHit(meshes, -1.23, z, 0.5);
      expect(ridge).toBeGreaterThan(0.408);
      expect(ridge).toBeLessThan(0.43);
    }
    // The root zone retains visible soil and open space between crop stations.
    expect(downwardHit(meshes, 0.525, -0.66, 2)).toBeLessThan(0.41);
    expect(downwardHit(meshes, 0.525, 0.73, 2)).toBeLessThan(0.41);
  } finally {
    dispose(meshes);
  }
});

test('refined furniture retains separate open slats rather than a solid cover', async () => {
  for (const [id, from, to, originY, minimumY, count] of [
    ['world-park-bench', -0.3, 0.3, 0.55, 0.44, 4],
    ['world-picnic-table', -0.4, 0.4, 1, 0.75, 5],
  ]) {
    const { meshes } = await assembly(id);
    try {
      expect(horizontalRuns(meshes, from, to, originY, minimumY), id).toBe(count);
    } finally {
      dispose(meshes);
    }
  }
});

test('concept asset normals are finite unit vectors and source envelopes survive delivery', async () => {
  for (const id of [
    'village-wishingwell',
    'farm-gardenbed',
    'world-park-bench',
    'world-picnic-table',
  ]) {
    const spec = GENERATED_ASSETS.find((s) => s.id === id);
    const { doc, meshes } = await assembly(id);
    try {
      const source = await io.read(`assets/source/models/${spec.area}/${spec.preparedSource}`);
      const bounds = (document) => {
        const box = new THREE.Box3();
        for (const node of document.getRoot().listNodes()) {
          const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
          for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
            const positions = primitive.getAttribute('POSITION').getArray();
            for (let i = 0; i < positions.length; i += 3) {
              box.expandByPoint(new THREE.Vector3().fromArray(positions, i).applyMatrix4(matrix));
            }
          }
        }
        return box;
      };
      const sourceSize = bounds(source).getSize(new THREE.Vector3());
      const deliveryBounds = bounds(doc);
      expect(deliveryBounds.getSize(new THREE.Vector3()).distanceTo(sourceSize), id).toBeLessThan(
        1e-5
      );
      expect(Math.abs(deliveryBounds.min.y), id).toBeLessThan(1e-5);
      for (const mesh of doc.getRoot().listMeshes()) {
        for (const primitive of mesh.listPrimitives()) {
          const normals = primitive.getAttribute('NORMAL').getArray();
          for (let i = 0; i < normals.length; i += 3) {
            expect(
              Math.abs(Math.hypot(normals[i], normals[i + 1], normals[i + 2]) - 1),
              id
            ).toBeLessThan(1e-5);
          }
        }
      }
    } finally {
      dispose(meshes);
    }
  }
});

test('picnic stretcher pegs project through the timber faces rather than hiding inside', async () => {
  const { meshes } = await assembly('world-picnic-table');
  try {
    for (const x of [-0.58, 0.58]) {
      for (const side of [-1, 1]) {
        const hits = new THREE.Raycaster(
          new THREE.Vector3(x, 0.3453, side * 0.15),
          new THREE.Vector3(0, 0, -side)
        ).intersectObjects(meshes, false);
        expect(hits.length).toBeGreaterThan(0);
        // Timber half-depth is 0.04182 m; peg ends must visibly clear it.
        expect(Math.abs(hits[0].point.z)).toBeGreaterThan(0.048);
        expect(Math.abs(hits[0].point.z)).toBeLessThan(0.06);
      }
    }
  } finally {
    dispose(meshes);
  }
});

test('shelter seating is beside the rear glass and leaves the front approach open', async () => {
  const { meshes } = await assembly('world-bus-shelter');
  try {
    for (const x of [-1, 0.4, 1]) {
      expect(downwardHit(meshes, x, -0.55, 1.2)).toBeCloseTo(0.522, 2);
      expect(downwardHit(meshes, x, 0.55, 1.2)).toBeLessThan(0.12);
      expect(downwardHit(meshes, x, -0.8, 1.2)).toBeGreaterThan(0.97);
    }
  } finally {
    dispose(meshes);
  }
});

test('postbox letter aperture has real recess depth beneath the rain hood', async () => {
  const { meshes } = await assembly('village-postbox');
  try {
    const front = (height) =>
      new THREE.Raycaster(
        new THREE.Vector3(0, height, 1),
        new THREE.Vector3(0, 0, -1)
      ).intersectObjects(meshes, false)[0].point.z;
    expect(front(1.23)).toBeGreaterThan(0.2);
    expect(front(1.23)).toBeLessThan(0.27);
    expect(front(1.16) - front(1.23)).toBeGreaterThan(0.06);
    expect(front(1.277)).toBeGreaterThan(0.32);
  } finally {
    dispose(meshes);
  }
});

test('four fountain scuppers have open channels between their floors and hoods', async () => {
  const { meshes } = await assembly('village-fountain');
  try {
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const direction = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a));
      const start = new THREE.Vector3(Math.cos(a) * 2, 2.531, Math.sin(a) * 2);
      const hit = new THREE.Raycaster(start, direction).intersectObjects(meshes, false)[0];
      expect(Math.hypot(hit.point.x, hit.point.z)).toBeLessThan(0.2);
      const x = Math.cos(a) * 0.75;
      const z = Math.sin(a) * 0.75 * (3.18 / 3.145);
      expect(downwardHit(meshes, x, z, 2.53)).toBeCloseTo(2.509, 3);
      expect(downwardHit(meshes, x, z, 2.7)).toBeCloseTo(2.5975, 3);
    }
  } finally {
    dispose(meshes);
  }
});

// The earlier Neuchatel draft was superseded by Nell's Neuschwanstein correction.
// Pin the actual delivered architecture, its silhouette and traversable openings.
test('Neuschwanstein castle preserves the landmark envelope with matte stone and slate', async () => {
  const { doc, meshes } = await assembly('village-castle');
  try {
    const bounds = new THREE.Box3();
    for (const mesh of meshes) bounds.expandByObject(mesh);
    const size = bounds.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(38.7, 2);
    expect(size.z).toBeCloseTo(38.3479, 2);
    expect(size.y).toBeCloseTo(41.9, 2);
    const material = doc.getRoot().listMaterials()[0];
    expect(doc.getRoot().listMaterials()).toHaveLength(1);
    expect(material.getMetallicFactor()).toBe(0);
    expect(material.getRoughnessFactor()).toBeGreaterThanOrEqual(0.85);
    expect(material.getEmissiveFactor()).toEqual([0, 0, 0]);
    expect(doc.getRoot().getAsset().copyright).toContain('Neuschwanstein');
  } finally {
    dispose(meshes);
  }
});

test('Neuschwanstein castle has an open court, through gateway and supported arcade', async () => {
  const { meshes } = await assembly('village-castle');
  try {
    const down = (x, z) =>
      new THREE.Raycaster(
        new THREE.Vector3(x, 50, z),
        new THREE.Vector3(0, -1, 0)
      ).intersectObjects(meshes)[0]?.point.y;
    for (const z of [4.5, -5.5]) expect(down(6, z), `court ${z}`).toBeCloseTo(3.2, 2);
    for (const y of [4.1, 5.2, 6.8]) {
      const passage = new THREE.Raycaster(
        new THREE.Vector3(7.2, y, 16),
        new THREE.Vector3(0, 0, -1)
      ).intersectObjects(meshes)[0];
      expect(passage?.point.z ?? -Infinity, `gateway height ${y}`).toBeLessThan(5);
    }
    const lintel = new THREE.Raycaster(
      new THREE.Vector3(7.2, 8.5, 20),
      new THREE.Vector3(0, 0, -1)
    ).intersectObjects(meshes)[0];
    expect(lintel.point.z).toBeGreaterThan(15.4);
    const arcade = new THREE.Raycaster(
      new THREE.Vector3(6, 10, 2),
      new THREE.Vector3(1, 0, 0)
    ).intersectObjects(meshes)[0];
    expect(arcade.point.x).toBeGreaterThan(10.5);
  } finally {
    dispose(meshes);
  }
});

test('Neuschwanstein castle has a steep palas roof and one dominant round tower', async () => {
  const { meshes } = await assembly('village-castle');
  try {
    const top = (x, z) =>
      new THREE.Raycaster(
        new THREE.Vector3(x, 50, z),
        new THREE.Vector3(0, -1, 0)
      ).intersectObjects(meshes)[0].point.y;
    expect(top(-5, -4)).toBeGreaterThan(34.7);
    expect(top(-11, -4)).toBeLessThan(27);
    expect(top(2.05, -14)).toBeCloseTo(41.9, 2);
    expect(top(12.65, -10.6)).toBeCloseTo(29.6, 2);
    expect(top(-11.5, 8)).toBeCloseTo(33.8, 2);
    expect(top(1.5, 8)).toBeCloseTo(32.8, 2);
  } finally {
    dispose(meshes);
  }
});

test('Neuschwanstein geometry is finite, front-facing and seated on the original datum', async () => {
  const { meshes } = await assembly('village-castle');
  try {
    for (const mesh of meshes) {
      expect(Array.from(mesh.geometry.attributes.position.array).every(Number.isFinite)).toBe(true);
      mesh.material.side = THREE.FrontSide;
    }
    const gable = new THREE.Raycaster(
      new THREE.Vector3(-5, 30.7, 20),
      new THREE.Vector3(0, 0, -1)
    ).intersectObjects(meshes)[0];
    expect(gable.point.z).toBeGreaterThan(9.39);
    expect(gable.point.z).toBeLessThan(9.55);
    const underside = new THREE.Raycaster(
      new THREE.Vector3(-11.7, 24.9, -4),
      new THREE.Vector3(0, 1, 0)
    ).intersectObjects(meshes)[0];
    expect(underside.point.y).toBeCloseTo(25, 2);
    const { createCastleStepsGeometry } = await import('../src/components/scenery/CastleSteps');
    const { CASTLE_STEPS } = await import('../src/constants/castleAccess');
    const steps = new THREE.Mesh(createCastleStepsGeometry(), new THREE.MeshBasicMaterial());
    meshes.push(steps);
    steps.updateMatrixWorld();
    for (const step of CASTLE_STEPS) {
      const z = (step.minZ + step.maxZ) / 2;
      const hit = new THREE.Raycaster(
        new THREE.Vector3(7.2, 5, z),
        new THREE.Vector3(0, -1, 0)
      ).intersectObjects(meshes)[0];
      expect(hit?.point.y, `actual assembly tread at ${z}`).toBeCloseTo(step.height, 4);
    }
  } finally {
    dispose(meshes);
  }
});

test('castle blue spires have flared curved profiles rather than straight cones', async () => {
  const { meshes } = await assembly('village-castle');
  try {
    const hit = new THREE.Raycaster(
      new THREE.Vector3(8, 35.5 + (41.9 - 35.5) * 0.15, -14),
      new THREE.Vector3(-1, 0, 0)
    ).intersectObjects(meshes)[0];
    expect(hit.point.x - 2.05).toBeCloseTo((1.85 + 0.29) * 0.74, 2);
    expect(hit.point.x - 2.05).toBeLessThan((1.85 + 0.29) * 0.85);
    const shoulder = new THREE.Raycaster(
      new THREE.Vector3(-5 + (13.8 / 2) * 0.74, 40, -4),
      new THREE.Vector3(0, -1, 0)
    ).intersectObjects(meshes)[0];
    expect(shoulder.point.y).toBeCloseTo(25 + 9.8 * 0.15, 2);
  } finally {
    dispose(meshes);
  }
});

test('white portal turrets are circular and retain the open gateway', async () => {
  const { meshes } = await assembly('village-castle');
  try {
    for (const x of [-0.5, 14.9]) {
      const front = (dx) =>
        new THREE.Raycaster(
          new THREE.Vector3(x + dx, 12.4, 20),
          new THREE.Vector3(0, 0, -1)
        ).intersectObjects(meshes)[0]?.point.z;
      expect(front(0)).toBeCloseTo(14.1 + 1.18, 2);
      expect(front(0.9)).toBeLessThan(front(0) - 0.35);
      expect(
        new THREE.Raycaster(
          new THREE.Vector3(x, 30, 14.1),
          new THREE.Vector3(0, -1, 0)
        ).intersectObjects(meshes)[0].point.y
      ).toBeCloseTo(17.2, 2);
    }
  } finally {
    dispose(meshes);
  }
});

test('the prepared castle atlas restores white stone and blue slate without emissive colour', async () => {
  const doc = await io.read('assets/source/models/village/castle-neuschwanstein-authored.glb');
  const material = doc.getRoot().listMaterials()[0];
  const texture = material.getBaseColorTexture();
  expect(texture.getMimeType()).toBe('image/png');
  const { raw, width, height } = decodeRGB(texture.getImage());
  const slotMean = (slot) => {
    const x = (((slot % 4) + 0.5) * width) / 4;
    const y = ((3 - Math.floor(slot / 4) + 0.5) * height) / 4;
    const sum = [0, 0, 0];
    for (let dy = -16; dy < 16; dy++)
      for (let dx = -16; dx < 16; dx++) {
        const offset = ((y + dy) * width + x + dx) * 3;
        for (let c = 0; c < 3; c++) sum[c] += raw[offset + c] / 1024;
      }
    return sum;
  };
  for (const slot of [0, 13]) expect(Math.min(...slotMean(slot))).toBeGreaterThan(225);
  for (const slot of [2, 8]) {
    const [r, g, b] = slotMean(slot);
    expect(b).toBeGreaterThan(r * 2);
    expect(g).toBeGreaterThan(r * 1.5);
  }
  expect(material.getMetallicFactor()).toBe(0);
  expect(material.getEmissiveFactor()).toEqual([0, 0, 0]);
});

// These village deliveries are completely new planar assemblies; farm probes
// above still address their retained source-coordinate roof replacements.
const villageRoofProbes = {
  cottage: [0.72, -0.6],
  shop: [0.8, -0.7],
  church: [-2, 1],
  townhall: [4.2, 2],
  pub: [-1.1, 0.6],
  school: [1.25, 1.1],
  forge: [1, -2],
};
test('all seven authored village deliveries have closed roof skins and planar wall normals', async () => {
  for (const [slug, [x, z]] of Object.entries(villageRoofProbes)) {
    const { doc, meshes } = await assembly('village-' + slug);
    try {
      expect(doc.getRoot().listMeshes(), slug).toHaveLength(1);
      expect(doc.getRoot().listMaterials(), slug).toHaveLength(1);
      expect(doc.getRoot().listMaterials()[0].getDoubleSided(), slug).toBe(false);
      const authored = doc
        .getRoot()
        .listNodes()
        .find((n) => n.getMesh());
      expect(authored.getExtras().construction, slug).toBe('authored-planar-village-v1');
      expect(authored.getExtras().providerVerticesRetained, slug).toBe(0);
      const normal = authored.getMesh().listPrimitives()[0].getAttribute('NORMAL').getArray();
      let planar = 0;
      for (let i = 0; i < normal.length; i += 3) {
        if (
          Math.max(Math.abs(normal[i]), Math.abs(normal[i + 2])) > 0.9999 &&
          Math.abs(normal[i + 1]) < 0.0001
        )
          planar++;
      }
      expect(planar / (normal.length / 3), slug + ' upright surfaces').toBeGreaterThan(0.28);
      for (const m of meshes) m.material.side = THREE.FrontSide;
      const roof = new THREE.Raycaster(
        new THREE.Vector3(x, 20, z),
        new THREE.Vector3(0, -1, 0)
      ).intersectObjects(meshes)[0];
      expect(roof, slug + ' upper roof face').toBeDefined();
      const below = new THREE.Raycaster(
        new THREE.Vector3(x, roof.point.y - 0.22, z),
        new THREE.Vector3(0, 1, 0),
        0,
        0.22
      ).intersectObjects(meshes)[0];
      expect(below, slug + ' physical roof underside').toBeDefined();
      expect(roof.point.y - below.point.y, slug + ' roof thickness').toBeGreaterThan(0.02);
      expect(roof.point.y - below.point.y, slug + ' roof thickness').toBeLessThan(0.15);
      const bounds = new THREE.Box3().setFromObject(meshes[0]);
      expect(bounds.min.y, slug + ' ground').toBeCloseTo(0, 4);
    } finally {
      dispose(meshes);
    }
  }
});

// Read the delivered geometry, not the Blender component inventory. These
// silhouettes and access datums are the features restored from the v0.30 source.
test('v0.30 village landmarks recover their distinct silhouettes and clear entrances', async () => {
  for (const slug of ['church', 'townhall', 'pub', 'school']) {
    const { meshes } = await assembly('village-' + slug);
    try {
      const bounds = new THREE.Box3().setFromObject(meshes[0]);
      const size = bounds.getSize(new THREE.Vector3());
      const ray = (p, d) =>
        new THREE.Raycaster(new THREE.Vector3(...p), new THREE.Vector3(...d)).intersectObjects(
          meshes
        )[0];
      if (slug === 'church') {
        expect(size.y / size.x).toBeGreaterThan(1.7);
        expect(size.z).toBeGreaterThan(size.x);
        // Spire remains at the rear; the approach and rose face the village.
        expect(heightAt(meshes, 0, -4.6)).toBeGreaterThan(18);
        expect(heightAt(meshes, 3, 0)).toBeLessThan(12);
        expect(ray([0, 6.14, 20], [0, 0, -1]).point.z).toBeGreaterThan(6);
      } else if (slug === 'townhall') {
        expect(size.x).toBeGreaterThan(13.8);
        expect(size.y).toBeGreaterThan(18);
        for (const side of [-1, 1]) {
          // Hands now belong to the live game clock. Only the enamel dial remains here.
          const dial = ray([side * 0.44, 12.34, side * 20], [0, 0, -side]);
          expect(Math.abs(dial.point.z)).toBeGreaterThan(2.1);
          expect(Math.abs(dial.point.z)).toBeLessThan(2.18);
        }
        expect(ray([2.6, 2, 20], [0, 0, -1]).point.z).toBeGreaterThan(5.8);
        // Door leaf stays in front of the wall, with no stringcourse across it.
        expect(ray([0, 1.15, 20], [0, 0, -1]).point.z).toBeLessThan(5.1);
        const stairHeights = [6.98, 6.5, 6.12, 5.76, 5.44].map(
          (z) => ray([0, 1, z], [0, -1, 0]).point.y
        );
        expect(stairHeights[0]).toBeCloseTo(0.16, 2);
        expect(stairHeights.slice(0, 4).every((y, i) => i === 0 || y > stairHeights[i - 1])).toBe(
          true
        );
      } else if (slug === 'pub') {
        expect(size.y).toBeGreaterThan(8);
        expect(size.z).toBeGreaterThan(8);
        expect(ray([0, 0.49, 20], [0, 0, -1]).point.z).toBeLessThan(3.14);
      } else {
        expect(size.y).toBeGreaterThan(12.7);
        // The bell is in a real open belfry, not painted on a solid tower.
        expect(ray([0.65, 9.9, 20], [0, 0, -1])).toBeUndefined();
        expect(ray([0, 9.8, 20], [0, 0, -1])).toBeDefined();
        expect(ray([0, 1.74, 20], [0, 0, -1]).point.z).toBeLessThan(3.62);
      }
    } finally {
      dispose(meshes);
    }
  }
});

test('authored narrowboat has a tapered closed hull, cambered roof and eight seated glazing discs', async () => {
  const { doc, meshes } = await assembly('world-canal-boat');
  try {
    expect(doc.getRoot().listMeshes()).toHaveLength(1);
    expect(doc.getRoot().listMaterials()).toHaveLength(1);
    const body = doc
      .getRoot()
      .listNodes()
      .find((n) => n.getMesh());
    expect(body.getExtras().providerVerticesRetained).toBe(0);
    const ray = (p, d) =>
      new THREE.Raycaster(new THREE.Vector3(...p), new THREE.Vector3(...d)).intersectObjects(
        meshes
      )[0];
    const middle = ray([5, 0.6, 0], [-1, 0, 0]).point.x;
    const bow = ray([5, 0.6, 6], [-1, 0, 0]).point.x;
    expect(middle).toBeGreaterThan(1.1);
    expect(bow).toBeLessThan(0.5);
    expect(ray([0, -1, 0], [0, 1, 0]).point.y).toBeCloseTo(0, 4);
    expect(heightAt(meshes, 0, 1.4)).toBeGreaterThan(heightAt(meshes, 0.8, 1.4));
    for (const side of [-1, 1]) {
      for (const z of [-2.8, -1.2, 0.4, 2]) {
        const pane = ray([side * 3, 2.03, z], [-side, 0, 0]);
        expect(Math.abs(pane.point.x)).toBeGreaterThan(1.18);
        expect(Math.abs(pane.point.x)).toBeLessThan(1.2);
      }
    }
  } finally {
    dispose(meshes);
  }
});

// Source dimensions are consumed at a fixed 0.45 m runtime sink.
test('duck pond has level, jointed coping and a flat navigable water basin', async () => {
  const { meshes } = await assembly('village-duckpond');
  for (const mesh of meshes) mesh.material.side = THREE.FrontSide;
  try {
    for (let i = 0; i < 32; i += 1) {
      const a = ((i + 0.27) * Math.PI * 2) / 32;
      expect(heightAt(meshes, 4.85 * Math.cos(a), (4.85 * Math.sin(a) * 10.956) / 11)).toBeCloseTo(
        1.12,
        3
      );
      expect(heightAt(meshes, 3.8 * Math.cos(a), 3.8 * Math.sin(a))).toBeCloseTo(0.8, 3);
    }
    const inner = new THREE.Raycaster(new THREE.Vector3(0, 0.93, 0), new THREE.Vector3(1, 0, 0));
    expect(inner.intersectObjects(meshes)[0]?.point.x).toBeCloseTo(4.635, 2);
  } finally {
    dispose(meshes);
  }
});

test('delivered town hall glazing UVs exclude timber, and clock dials contain no fixed hands', async () => {
  const { doc, meshes } = await assembly('village-townhall');
  const primitives = doc
    .getRoot()
    .listNodes()
    .flatMap((node) => node.getMesh()?.listPrimitives() ?? []);
  meshes.forEach((mesh, index) =>
    mesh.geometry.setAttribute(
      'uv',
      new THREE.BufferAttribute(primitives[index].getAttribute('TEXCOORD_0').getArray(), 2)
    )
  );
  const ray = (x, y, z = 9) =>
    new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(0, 0, -1)).intersectObjects(
      meshes,
      false
    )[0];
  const glazing = (hit) => hit.uv.x >= 0.5 && hit.uv.x < 0.75 && hit.uv.y >= 0.25 && hit.uv.y < 0.5;
  expect(glazing(ray(4.65, 3.8))).toBe(true);
  expect(glazing(ray(0.35, 2))).toBe(false);
  expect(ray(0.4, 12.32).point.z).toBeLessThan(2.18);
  dispose(meshes);
});
