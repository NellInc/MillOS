import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

type Point = readonly [number, number, number];
type Ring = readonly [number, number, number]; // y, X radius, Z radius
const C = {
  shirt: '#923b36',
  plaid: '#ba8b68',
  denim: '#456780',
  seam: '#b2a58b',
  straw: '#c7aa65',
  strawShade: '#9d8148',
  twine: '#8c6843',
  scarf: '#a84036',
  pumpkin: '#d87b30',
  face: '#3e2723',
  button: '#c9b48a',
};
function color(g: THREE.BufferGeometry, hex: string, plaid = false) {
  const p = g.attributes.position,
    base = new THREE.Color(hex),
    light = new THREE.Color(C.plaid),
    values = new Float32Array(p.count * 3),
    c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i);
    const band = (v: number, period: number) => Math.abs(v / period - Math.round(v / period));
    const weave = plaid ? Math.max(0, 1 - Math.min(band(x, 0.17), band(y, 0.19)) / 0.13) * 0.7 : 0;
    c.copy(base)
      .lerp(light, weave)
      .toArray(values, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return g;
}
function join(parts: THREE.BufferGeometry[], name: string) {
  for (const g of parts)
    for (const key of Object.keys(g.attributes))
      if (!['position', 'normal', 'color'].includes(key)) g.deleteAttribute(key);
  const plain = parts.map((g) => (g.index ? g.toNonIndexed() : g)),
    result = mergeGeometries(plain);
  new Set([...parts, ...plain]).forEach((g) => g.dispose());
  if (!result) throw new Error('Scarecrow craft geometry attributes differ');
  result.name = name;
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}
/** Closed stuffed-cloth rings, with separate centre vertices for real end caps.
 * Working if sleeves enclose the timber and no zero-radius strip collapses.
 */
function stuffed(profile: readonly Ring[], segments = 24) {
  const rings: Ring[] = [],
    p: number[] = [],
    index: number[] = [];
  for (let row = 0; row < profile.length - 1; row++) {
    const a = profile[row],
      b = profile[row + 1],
      steps = Math.ceil((b[0] - a[0]) / 0.04);
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      rings.push([
        THREE.MathUtils.lerp(a[0], b[0], t),
        THREE.MathUtils.lerp(a[1], b[1], t),
        THREE.MathUtils.lerp(a[2], b[2], t),
      ]);
    }
  }
  rings.push(profile[profile.length - 1]);
  for (const [y, rx, rz] of rings)
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      p.push(Math.cos(a) * rx, y, Math.sin(a) * rz);
    }
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j,
        next = i * segments + ((j + 1) % segments),
        b = a + segments;
      index.push(a, b, next + segments, a, next + segments, next);
    }
  const bottom = p.length / 3,
    top = bottom + 1,
    last = (rings.length - 1) * segments;
  p.push(0, rings[0][0], 0, 0, rings[rings.length - 1][0], 0);
  for (let j = 0; j < segments; j++)
    index.push(bottom, j, (j + 1) % segments, top, last + ((j + 1) % segments), last + j);
  const g = new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.Float32BufferAttribute(p, 3)
  );
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}
export function createScarecrowShirtGeometry() {
  return stuffed(
    [
      [1.35, 0.23, 0.125],
      [1.4, 0.27, 0.15],
      [1.66, 0.285, 0.17],
      [1.92, 0.28, 0.16],
      [2.07, 0.25, 0.145],
      [2.19, 0.14, 0.105],
      [2.25, 0.13, 0.1],
    ],
    28
  );
}
export function createScarecrowPumpkinGeometry() {
  const g = new THREE.SphereGeometry(0.35, 40, 20),
    p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      a = Math.atan2(z, x),
      lobe = 0.96 + 0.04 * Math.cos(a * 10);
    p.setXYZ(i, x * lobe, p.getY(i) + 2.5, z * lobe);
  }
  g.computeVertexNormals();
  return g;
}
const RAY_MATERIAL = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
function surface(geometry: THREE.BufferGeometry) {
  const mesh = new THREE.Mesh(geometry, RAY_MATERIAL);
  mesh.updateMatrixWorld();
  return (x: number, y: number, lift = 0.002) => {
    const hit = new THREE.Raycaster(
      new THREE.Vector3(x, y, 1),
      new THREE.Vector3(0, 0, -1)
    ).intersectObject(mesh)[0];
    if (!hit) throw new Error('Scarecrow detail misses its cloth or pumpkin');
    return hit.point.add(new THREE.Vector3(0, 0, lift));
  };
}
function patch(project: ReturnType<typeof surface>, points: readonly Point[], depth = 3) {
  const positions: number[] = [];
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, n: number) {
    if (n) {
      const ab = a.clone().add(b).multiplyScalar(0.5),
        bc = b.clone().add(c).multiplyScalar(0.5),
        ca = c.clone().add(a).multiplyScalar(0.5);
      triangle(a, ab, ca, n - 1);
      triangle(ab, b, bc, n - 1);
      triangle(ca, bc, c, n - 1);
      triangle(ab, bc, ca, n - 1);
    } else for (const p of [a, b, c]) positions.push(...project(p.x, p.y).toArray());
  }
  for (let i = 1; i < points.length - 1; i++) {
    const a = new THREE.Vector3(...points[0]);
    let b = new THREE.Vector3(...points[i]),
      c = new THREE.Vector3(...points[i + 1]);
    if ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x) < 0) [b, c] = [c, b];
    triangle(a, b, c, depth);
  }
  const g = new THREE.BufferGeometry().setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  g.computeVertexNormals();
  return g;
}
function cord(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
  const d = b.clone().sub(a),
    g = new THREE.CylinderGeometry(radius, radius, d.length(), 5);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
  );
  return g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
}
export function createScarecrowFaceGeometry(head: THREE.BufferGeometry) {
  const project = surface(head),
    parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.115, 0.115])
    parts.push(
      color(
        patch(project, [
          [x, 2.6, 0],
          [x - 0.0433, 2.525, 0],
          [x + 0.0433, 2.525, 0],
        ]),
        C.face
      )
    );
  const smile: THREE.Vector3[] = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI;
    smile.push(project(Math.cos(a) * 0.08, 2.44 - Math.sin(a) * 0.08));
  }
  for (let i = 0; i < smile.length - 1; i++)
    parts.push(color(cord(smile[i], smile[i + 1], 0.008), C.face));
  return join(parts, 'scarecrow-seated-face');
}
/** Rounded stuffed clothing and tied straw, inside the retained 2.1m hand span.
 * Working if the existing hat, bird and timber can remain completely unchanged.
 */
export function createScarecrowCraftGeometry() {
  const parts: THREE.BufferGeometry[] = [],
    shirt = createScarecrowShirtGeometry(),
    front = surface(shirt);
  // Front/back plaid follows the rounded cloth through vertex colours, not
  // raised rigid rails. The standard batch finish adds the existing fine grain.
  parts.push(color(shirt, C.shirt, true));
  for (const side of [-1, 1]) {
    const sleeve = stuffed(
      [
        [0.24, 0.13, 0.13],
        [0.36, 0.16, 0.15],
        [0.58, 0.14, 0.13],
        [0.77, 0.108, 0.108],
      ],
      20
    )
      .rotateZ((-side * Math.PI) / 2)
      .translate(0, 1.8, 0);
    parts.push(color(sleeve, C.shirt, true));
    // Rolled cloth cuff and its two turns of twine enclose the crossbar.
    parts.push(
      color(
        new THREE.TorusGeometry(0.108, 0.014, 6, 20)
          .rotateY(Math.PI / 2)
          .translate(side * 0.765, 1.8, 0),
        C.seam
      )
    );
    for (const x of [0.786, 0.804])
      parts.push(
        color(
          new THREE.TorusGeometry(0.083, 0.007, 5, 16)
            .rotateY(Math.PI / 2)
            .translate(side * x, 1.8, 0),
          C.twine
        )
      );
    for (let i = 0; i < 17; i++) {
      const a = i * 2.39996,
        r = 0.065 * Math.sqrt((i + 0.5) / 17),
        start = new THREE.Vector3(side * 0.755, 1.8 + Math.cos(a) * r, Math.sin(a) * r),
        length = 0.18 + 0.065 * (((i * 7) % 17) / 16);
      const end = new THREE.Vector3(
        side * (0.755 + length),
        start.y + Math.cos(a) * 0.035 - 0.012,
        start.z + Math.sin(a) * 0.038
      );
      parts.push(color(cord(start, end, 0.0055), i % 3 ? C.straw : C.strawShade));
    }
    const leg = stuffed(
      [
        [0.56, 0.072, 0.08],
        [0.61, 0.085, 0.1],
        [0.89, 0.09, 0.112],
        [1.2, 0.101, 0.113],
        [1.43, 0.107, 0.105],
      ],
      20
    ).translate(side * 0.15, 0, 0);
    const legFront = surface(leg);
    parts.push(color(leg, C.denim));
    parts.push(
      color(
        new THREE.TorusGeometry(0.077, 0.012, 5, 16)
          .rotateX(Math.PI / 2)
          .scale(1, 1, 1.12)
          .translate(side * 0.15, 0.58, 0),
        C.denim
      )
    );
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4,
        x = side * 0.15 + Math.cos(a) * 0.045,
        z = Math.sin(a) * 0.055;
      parts.push(
        color(
          cord(
            new THREE.Vector3(x, 0.61, z),
            new THREE.Vector3(
              x + Math.cos(a) * 0.013,
              0.49 + (i % 3) * 0.018,
              z + Math.sin(a) * 0.012
            ),
            0.004
          ),
          C.straw
        )
      );
    }
    // Side seam is sewn along the actual leg surface.
    for (let y = 0.66; y < 1.25; y += 0.055)
      parts.push(
        color(cord(legFront(side * 0.185, y), legFront(side * 0.185, y + 0.025), 0.003), C.seam)
      );
    if (side === -1) {
      parts.push(
        color(
          patch(legFront, [
            [-0.211, 0.79, 0],
            [-0.09, 0.8, 0],
            [-0.085, 0.97, 0],
            [-0.205, 0.98, 0],
          ]),
          C.shirt
        )
      );
      for (const y of [0.82, 0.86, 0.9, 0.94])
        for (const x of [-0.2, -0.097])
          parts.push(
            color(
              cord(legFront(x - 0.006, y, 0.004), legFront(x + 0.006, y + 0.006, 0.004), 0.0025),
              C.seam
            )
          );
    }
  }
  parts.push(
    color(new RoundedBoxGeometry(0.43, 0.16, 0.22, 2, 0.035).translate(0, 1.36, 0), C.denim)
  );
  // A real placket, small buttons and two seated collar leaves.
  for (let y = 1.43; y < 2.09; y += 0.035)
    parts.push(color(cord(front(0, y), front(0, y + 0.035), 0.012), C.shirt));
  for (const y of [1.5, 1.68, 1.86, 2.04]) {
    const p = front(0, y, 0.009);
    parts.push(
      color(
        new THREE.CylinderGeometry(0.018, 0.018, 0.008, 10)
          .rotateX(Math.PI / 2)
          .translate(...p.toArray()),
        C.button
      )
    );
  }
  for (const side of [-1, 1])
    parts.push(
      color(
        patch(front, [
          [side * 0.04, 2.18, 0],
          [side * 0.19, 2.08, 0],
          [side * 0.08, 2.03, 0],
        ]),
        C.seam
      )
    );
  parts.push(
    color(
      new THREE.TorusGeometry(0.178, 0.052, 8, 24).rotateX(Math.PI / 2).translate(0, 2.23, 0),
      C.scarf
    )
  );
  parts.push(
    color(
      new RoundedBoxGeometry(0.09, 0.11, 0.08, 2, 0.025).rotateZ(-0.2).translate(0.15, 2.2, 0.16),
      C.scarf
    )
  );
  parts.push(
    color(
      new RoundedBoxGeometry(0.075, 0.25, 0.035, 2, 0.012)
        .rotateZ(0.22)
        .translate(0.19, 2.075, 0.178),
      C.scarf
    )
  );
  const head = createScarecrowPumpkinGeometry();
  parts.push(color(head, C.pumpkin), createScarecrowFaceGeometry(head));
  return join(parts, 'scarecrow-hand-sewn-craft');
}
const GEOMETRY = createScarecrowCraftGeometry();
const MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93 });
export function ScarecrowCraft() {
  return (
    <mesh
      name="scarecrow-handmade-craft"
      geometry={GEOMETRY}
      material={MATERIAL}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}
