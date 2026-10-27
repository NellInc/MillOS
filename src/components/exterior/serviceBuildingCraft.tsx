import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SceneText } from '../shared/SceneText';
import { BusinessBrandMark } from '../scenery/HeritageSignage';

type Kind = 'maintenance' | 'substation' | 'security';
type Point = readonly [number, number, number];
const C = {
  roof: '#425458',
  edge: '#283d40',
  wood: '#85674f',
  trim: '#c3b79e',
  door: '#3e6461',
  dark: '#203537',
  steel: '#758683',
  brass: '#b49a64',
  concrete: '#8e9187',
};
export const SERVICE_BUILDING_ENVELOPES = {
  security: {
    position: [-25, 0, 115] as Point,
    min: [-3.25, 0, -2.75] as Point,
    max: [3.25, 4.55, 2.75] as Point,
  },
  maintenance: {
    position: [101.5, 0, -66] as Point,
    min: [-5.5, 0, -4.5] as Point,
    max: [5.5, 6, 4.5] as Point,
  },
  substation: {
    position: [-70, 0, -60] as Point,
    min: [-2.75, 0, -2.25] as Point,
    max: [2.75, 5.3, 2.25] as Point,
  },
} as const;
function paint(g: THREE.BufferGeometry, hex: string) {
  const color = new THREE.Color(hex),
    a = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < a.length; i += 3) color.toArray(a, i);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function box(parts: THREE.BufferGeometry[], size: Point, at: Point, hex: string) {
  parts.push(paint(new THREE.BoxGeometry(...size).translate(...at), hex));
}
function bar(
  parts: THREE.BufferGeometry[],
  a: Point,
  b: Point,
  width: number,
  hex: string,
  round = false
) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b),
    d = end.clone().sub(start);
  const g = round
    ? new THREE.CylinderGeometry(width, width, d.length(), 8)
    : new THREE.BoxGeometry(width, d.length(), width);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
  );
  g.translate(...start.add(end).multiplyScalar(0.5).toArray());
  parts.push(paint(g, hex));
}
function join(parts: THREE.BufferGeometry[], name: string) {
  const plain = parts.map((p) => (p.index ? p.toNonIndexed() : p)),
    g = mergeGeometries(plain);
  new Set([...parts, ...plain]).forEach((p) => p.dispose());
  if (!g) throw new Error('Incompatible service-building craft');
  g.name = name;
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
/** Closed roof section, extruded along the existing building depth.
 * Working if both bottom/top faces exist and the ridge stays inside y6.
 */
export function createMaintenanceRoof() {
  const shape = new THREE.Shape();
  shape.moveTo(-5.5, 5);
  shape.lineTo(0, 5.86);
  shape.lineTo(5.5, 5);
  shape.lineTo(5.5, 5.14);
  shape.lineTo(0, 6);
  shape.lineTo(-5.5, 5.14);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 9, steps: 1, bevelEnabled: false }).translate(
    0,
    0,
    -4.5
  );
  g.name = 'maintenance-closed-pitched-roof';
  g.computeBoundingBox();
  return g;
}
function gable(z: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-5, 4.98);
  shape.lineTo(5, 4.98);
  shape.lineTo(5, 5.09);
  shape.lineTo(0, 5.87);
  shape.lineTo(-5, 5.09);
  shape.closePath();
  return paint(
    new THREE.ExtrudeGeometry(shape, { depth: 0.08, steps: 1, bevelEnabled: false }).translate(
      0,
      0,
      z
    ),
    C.wood
  );
}

function louvre(
  parts: THREE.BufferGeometry[],
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  side = false
) {
  const set: THREE.BufferGeometry[] = [];
  box(set, [width, height, 0.035], [0, 0, 0], C.dark);
  for (const dx of [-width / 2, width / 2])
    box(set, [0.045, height + 0.06, 0.09], [dx, 0, 0.035], C.steel);
  const n = Math.floor(height / 0.1);
  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(width, 0.055, 0.09)
      .rotateX(-0.35)
      .translate(0, -height / 2 + ((i + 0.5) * height) / n, 0.046);
    set.push(paint(g, C.steel));
  }
  for (const g of set) {
    if (side) g.rotateY(Math.PI / 2);
    g.translate(x, y, z);
    parts.push(g);
  }
}
export function createMaintenanceJoinery() {
  const p: THREE.BufferGeometry[] = [gable(-4.02), gable(3.94)];
  // Gables lap onto the retained wall box; front doors overlap its plane by 2cm.
  for (const x of [-4.94, 4.94])
    // Trims stop under the gable (y 4.98): above it their outer face shared x +/-5 with its ends.
    for (const z of [-3.98, 3.98]) box(p, [0.12, 4.98, 0.09], [x, 2.49, z], C.trim);
  // Strips end 2 cm inside the corner trims, not in the plane of their outer face.
  for (const z of [-4.02, 4.02]) box(p, [9.96, 0.22, 0.09], [0, 0.11, z], C.concrete);
  for (const x of [-5.02, 5.02]) box(p, [0.09, 0.22, 8], [x, 0.11, 0], C.concrete);
  for (const x of [-3.08, 3.08]) box(p, [0.14, 3.14, 0.16], [x, 1.57, 4.04], C.trim);
  box(p, [6.3, 0.14, 0.16], [0, 3.12, 4.04], C.trim);
  for (const x of [-1.5, 1.5]) {
    box(p, [2.96, 2.98, 0.075], [x, 1.5, 4.035], C.door);
    for (let i = 0; i < 8; i++)
      box(p, [0.018, 2.9, 0.012], [x - 1.3 + i * 0.37, 1.5, 4.078], C.dark);
    for (const y of [0.3, 2.7]) box(p, [2.8, 0.09, 0.045], [x, y, 4.095], C.trim);
    bar(p, [x - 1.36, 0.35, 4.095], [x + 1.36, 2.65, 4.095], 0.07, C.trim);
    for (const y of [0.55, 2.45])
      box(p, [0.28, 0.07, 0.05], [x + Math.sign(x) * 1.33, y, 4.11], C.steel);
  }
  for (const x of [-0.12, 0.12]) bar(p, [x, 1.35, 4.16], [x, 1.65, 4.16], 0.022, C.brass, true);
  // Seams track both real roof slopes, below the prior overhang envelope.
  for (let z = -4.25; z < 4.4; z += 0.62)
    for (const sign of [-1, 1])
      bar(p, [sign * 0.16, 5.962, z], [sign * 5.35, 5.16, z], 0.026, C.edge);
  box(p, [0.28, 0.055, 8.9], [0, 5.97, 0], C.edge);
  for (const z of [-4.43, 4.43])
    for (const sign of [-1, 1]) bar(p, [0, 5.94, z], [sign * 5.45, 5.085, z], 0.1, C.trim);
  for (const x of [-5.36, 5.36]) {
    // Open gutter trough: back and floor, with its front lip facing out.
    box(p, [0.19, 0.04, 8.75], [x, 5.03, 0], C.edge);
    for (const dx of [-0.085, 0.085]) box(p, [0.025, 0.1, 8.75], [x + dx, 5.07, 0], C.edge);
    const z = -4.28;
    bar(p, [x, 5.04, z], [x, 4.72, z], 0.045, C.steel, true);
    bar(p, [x, 4.72, z], [Math.sign(x) * 5.14, 4.5, z], 0.045, C.steel, true);
    bar(p, [Math.sign(x) * 5.14, 4.5, z], [Math.sign(x) * 5.14, 0.12, z], 0.045, C.steel, true);
  }
  louvre(p, 0, 5.38, 4.03, 1.12, 0.36);
  box(p, [3.5, 0.86, 0.09], [0, 3.75, 4.035], C.door);
  return join(p, 'maintenance-fitted-joinery');
}
export function createSubstationCraft() {
  const p: THREE.BufferGeometry[] = [];
  // Stepped roof flashing replaces the old slab without expanding its footprint.
  box(p, [5.5, 0.14, 4.5], [0, 4.16, 0], C.edge);
  box(p, [5.32, 0.18, 4.32], [0, 4.32, 0], C.roof);
  for (const z of [-2.19, 2.19]) box(p, [5.43, 0.075, 0.06], [0, 4.36, z], C.steel);
  for (const x of [-2.69, 2.69]) box(p, [0.06, 0.075, 4.43], [x, 4.36, 0], C.steel);
  for (const z of [-2.015, 2.015]) box(p, [5, 0.2, 0.06], [0, 0.1, z], C.concrete);
  for (const x of [-2.515, 2.515]) box(p, [0.06, 0.2, 4], [x, 0.1, 0], C.concrete);
  for (const x of [-1.03, 1.03]) {
    box(p, [1.98, 2.95, 0.08], [x, 1.5, 2.025], C.door);
    for (const y of [0.5, 2.5])
      box(p, [0.23, 0.07, 0.045], [x + Math.sign(x) * 0.89, y, 2.08], C.steel);
    bar(
      p,
      [x - Math.sign(x) * 0.86, 1.35, 2.115],
      [x - Math.sign(x) * 0.86, 1.62, 2.115],
      0.02,
      C.brass,
      true
    );
    louvre(p, x, 2.37, 2.075, 1.46, 0.54);
  }
  for (const x of [-2.09, 0, 2.09]) box(p, [0.06, 3.08, 0.1], [x, 1.54, 2.045], C.steel);
  box(p, [4.25, 0.09, 0.1], [0, 3.06, 2.045], C.steel);
  louvre(p, -2.55, 2.5, 0, 2.7, 0.75, true);
  box(p, [2.8, 0.66, 0.09], [0, 3.47, 2.035], C.edge);
  // Capped vertical fitting, seated on the roof, same previous y5.3 ceiling.
  bar(p, [0, 4.41, 0], [0, 5.18, 0], 0.12, C.dark, true);
  for (let y = 4.62; y < 5.17; y += 0.13)
    p.push(paint(new THREE.CylinderGeometry(0.27, 0.22, 0.07, 20).translate(0, y, 0), C.steel));
  p.push(paint(new THREE.CylinderGeometry(0.3, 0.3, 0.075, 24).translate(0, 5.25, 0), C.edge));
  // Existing warning face becomes a bordered geometric plate on the same wall.
  box(p, [0.06, 1.04, 1.04], [2.54, 2, 0], C.dark);
  box(p, [0.025, 0.96, 0.96], [2.578, 2, 0], '#d5b94e');
  const shape = new THREE.Shape();
  shape.moveTo(-0.32, -0.2);
  shape.lineTo(0.32, -0.2);
  shape.lineTo(0, 0.34);
  shape.closePath();
  const tri = new THREE.ExtrudeGeometry(shape, { depth: 0.012, steps: 1, bevelEnabled: false })
    .rotateY(Math.PI / 2)
    .translate(2.6, 2.06, 0);
  p.push(paint(tri, C.dark));
  const bolt = new THREE.Shape();
  bolt.moveTo(0.025, 0.2);
  bolt.lineTo(-0.08, 0.015);
  bolt.lineTo(-0.005, 0.025);
  bolt.lineTo(-0.025, -0.12);
  bolt.lineTo(0.1, 0.09);
  bolt.lineTo(0.02, 0.07);
  bolt.closePath();
  p.push(
    paint(
      new THREE.ExtrudeGeometry(bolt, { depth: 0.008, bevelEnabled: false })
        .rotateY(Math.PI / 2)
        .translate(2.618, 2.07, 0),
      '#e0c45c'
    )
  );
  return join(p, 'substation-fitted-service-craft');
}
/** Joinery sits on the retained visitor-office shell, beneath its old roof.
 * Working if the side entrance meets the ground and wall, and the front sign
 * and pane remain readable inside the unchanged overhang envelope.
 */
export function createSecurityOfficeCraft() {
  const p: THREE.BufferGeometry[] = [];
  const trim = '#d1c8ad',
    wallEdge = '#35515b';
  // A continuous damp course, with corners meeting rather than sharing faces.
  for (const z of [-2.515, 2.515]) box(p, [6.06, 0.18, 0.07], [0, 0.09, z], C.concrete);
  box(p, [0.07, 0.18, 4.96], [-3.015, 0.09, 0], C.concrete);
  // The damp course stops at the entrance jambs, never across the door leaf.
  for (const [low, high] of [
    [-2.48, -0.06],
    [1.26, 2.48],
  ])
    box(p, [0.07, 0.18, high - low], [3.015, 0.09, (low + high) / 2], C.concrete);
  for (const x of [-2.975, 2.975])
    for (const z of [-2.475, 2.475]) box(p, [0.12, 3.75, 0.12], [x, 2.055, z], trim);
  // Eaves stop at y4.05, the underside of the old slab, never on its face.
  for (const z of [-2.62, 2.62]) box(p, [6.14, 0.14, 0.1], [0, 3.98, z], wallEdge);
  for (const x of [-3.12, 3.12]) box(p, [0.1, 0.14, 5.34], [x, 3.98, 0], wallEdge);
  // Existing blue front pane is at z2.55. Profiles overlap its edges; their
  // fronts are distinct from it, and glazing openings remain unfilled.
  for (const x of [-2.04, 2.04]) box(p, [0.1, 2.16, 0.12], [x, 2.2, 2.55], trim);
  for (const y of [1.16, 3.24]) box(p, [3.98, 0.1, 0.12], [0, y, 2.55], trim);
  for (const x of [-0.67, 0.67]) box(p, [0.055, 1.98, 0.085], [x, 2.2, 2.585], wallEdge);
  box(p, [4.28, 0.09, 0.24], [0, 1.065, 2.61], C.concrete);
  // East-side entrance, accessible from the existing office apron. Closed
  // representation only: this adds no collision, opening animation or room.
  box(p, [0.065, 2.4, 1.12], [3.015, 1.25, 0.6], C.door);
  for (const z of [-0.01, 1.21]) box(p, [0.13, 2.51, 0.1], [3.045, 1.305, z], trim);
  box(p, [0.13, 0.11, 1.32], [3.045, 2.56, 0.6], trim);
  box(p, [0.24, 0.05, 1.32], [3.1, 0.025, 0.6], C.concrete);
  // A shallow weather head makes a real shadow over the door.
  box(p, [0.245, 0.065, 1.48], [3.115, 2.655, 0.6], wallEdge);
  // Opaque blue-grey vision panel and rebated frame, lit like the front glass.
  box(p, [0.018, 0.77, 0.72], [3.056, 1.835, 0.6], '#66858b');
  for (const z of [0.215, 0.985]) box(p, [0.04, 0.87, 0.05], [3.065, 1.835, z], wallEdge);
  for (const y of [1.425, 2.245]) box(p, [0.04, 0.05, 0.72], [3.065, y, 0.6], wallEdge);
  box(p, [0.018, 0.6, 0.87], [3.056, 0.55, 0.6], wallEdge);
  for (const y of [0.49, 1.97]) box(p, [0.06, 0.12, 0.065], [3.055, y, 1.13], C.steel);
  // Pull returns land on the door, with a grip joined to both returns.
  for (const y of [1.04, 1.3]) bar(p, [3.045, y, 0.17], [3.14, y, 0.17], 0.014, C.brass, true);
  bar(p, [3.14, 1.04, 0.17], [3.14, 1.3, 0.17], 0.014, C.brass, true);
  return join(p, 'security-office-fitted-joinery');
}
const JOINERY_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  vertexColors: true,
  roughness: 0.73,
  metalness: 0.08,
});
const ROOF_MATERIAL = new THREE.MeshStandardMaterial({
  color: C.roof,
  roughness: 0.71,
  metalness: 0.12,
});
/** Owned geometry goes through the existing opaque static batcher.
 * Working if fitted parts keep the old envelopes and no frame driver/light is added.
 */
export function ServiceBuildingCraft({ kind }: { kind: Kind }) {
  const craft = useMemo(
    () =>
      kind === 'maintenance'
        ? createMaintenanceJoinery()
        : kind === 'substation'
          ? createSubstationCraft()
          : createSecurityOfficeCraft(),
    [kind]
  );
  const roof = useMemo(() => (kind === 'maintenance' ? createMaintenanceRoof() : null), [kind]);
  useEffect(
    () => () => {
      craft.dispose();
      roof?.dispose();
    },
    [craft, roof]
  );
  return (
    <>
      {roof && <mesh geometry={roof} material={ROOF_MATERIAL} castShadow receiveShadow />}
      <mesh geometry={craft} material={JOINERY_MATERIAL} castShadow receiveShadow />
      {kind === 'maintenance' ? (
        <BusinessBrandMark
          brand="workshop"
          width={3.36}
          height={0.8}
          position={[0, 3.75, 4.088]}
          backlit={false}
        />
      ) : kind === 'substation' ? (
        <>
          <BusinessBrandMark
            brand="electrical"
            width={2.68}
            height={0.625}
            position={[0, 3.47, 2.087]}
            backlit={false}
          />
          <SceneText
            position={[2.62, 1.7, 0]}
            rotation={[0, Math.PI / 2, 0]}
            fontSize={0.12}
            color="#203537"
            anchorX="center"
            anchorY="middle"
            surface="painted"
          >
            DANGER
          </SceneText>
        </>
      ) : null}
    </>
  );
}
