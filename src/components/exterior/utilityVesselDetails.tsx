import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useSCADATag } from '../../scada/useSCADA';
import { UTILITY_ASSET_TAG_IDS } from '../../scada/tagDatabase';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { SceneText } from '../shared/SceneText';

type Point = readonly [number, number, number];
const STEEL = '#859395',
  BRASS = '#aa8e50',
  SAFETY = '#d9ac35',
  INK = '#243d40';
const vertex = (p: Point) => new THREE.Vector3(...p);
function colour(g: THREE.BufferGeometry, hex: string) {
  const a = new Float32Array(g.attributes.position.count * 3),
    c = new THREE.Color(hex);
  for (let i = 0; i < a.length; i += 3) c.toArray(a, i);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
function join(parts: THREE.BufferGeometry[], name: string) {
  const plain = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const g = mergeGeometries(plain);
  new Set([...parts, ...plain]).forEach((p) => p.dispose());
  if (!g) throw new Error('Incompatible vessel hardware');
  g.name = name;
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
function pipe(a: Point, b: Point, r: number, hex = STEEL) {
  const start = vertex(a),
    end = vertex(b),
    d = end.clone().sub(start);
  const g = new THREE.CylinderGeometry(r, r, d.length(), 10);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())
  );
  g.translate(...start.add(end).multiplyScalar(0.5).toArray());
  return colour(g, hex);
}

/** Pad-to-crown path in vessel metres. Working if both sizes meet the pad,
 * every rung interval is at most .3m, and radial mounts terminate on the shell.
 * This is visual service access, not a player navigation or safety certificate.
 */
export function utilityLadderLayout(radius: number) {
  const centre = radius + 1.5,
    offset = radius + 0.25,
    base = 0.05;
  const straight = centre - base,
    arc = (offset * Math.PI) / 2,
    length = straight + arc;
  const sample = (s: number): Point =>
    s <= straight
      ? [0, base + s, -offset]
      : [
          0,
          centre + offset * Math.sin((s - straight) / offset),
          -offset * Math.cos((s - straight) / offset),
        ];
  const count = Math.ceil(length / 0.3),
    spacing = length / count;
  const rungs = Array.from({ length: count }, (_, i) => sample((i + 1) * spacing));
  const mounts = [-0.6, 0, 0.6].map((t) => {
    const y = centre + radius * t,
      z = -radius * Math.sqrt(1 - t * t);
    return {
      shell: [0, y, z] as Point,
      rail: sample(t <= 0 ? y - base : straight + offset * Math.asin(t)),
    };
  });
  return {
    base,
    centre,
    radius,
    offset,
    length,
    spacing,
    rungs,
    mounts,
    rail: [
      sample(0),
      sample(straight * 0.5),
      sample(straight),
      ...Array.from({ length: 12 }, (_, i) => sample(straight + (arc * (i + 1)) / 12)),
    ],
  };
}

function flange(parts: THREE.BufferGeometry[], x: number, y: number, z: number, radius: number) {
  parts.push(pipe([x, y - 0.045, z], [x, y + 0.045, z], radius));
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    parts.push(
      pipe(
        [x + Math.cos(a) * radius * 0.76, y + 0.04, z + Math.sin(a) * radius * 0.76],
        [x + Math.cos(a) * radius * 0.76, y + 0.085, z + Math.sin(a) * radius * 0.76],
        0.027,
        BRASS
      )
    );
  }
}
function wheel(parts: THREE.BufferGeometry[], x: number, y: number, z: number, r: number) {
  parts.push(
    colour(
      new THREE.TorusGeometry(r, 0.025, 6, 24).rotateX(Math.PI / 2).translate(x, y, z),
      '#8f4035'
    )
  );
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    parts.push(pipe([x, y, z], [x + Math.cos(a) * r, y, z + Math.sin(a) * r], 0.018, '#8f4035'));
  }
}
/**
 * The fittings on a storage tank's crown, along its axis (tank-local x) with
 * their flange radius: the manway and the valve stack. The shell maps lay the
 * run-off streaks under these (`textures/vesselShell.ts`).
 */
export function utilityTankNozzles(length: number) {
  return [
    { id: 'manway', x: -1, radius: 0.39 },
    { id: 'valve', x: length / 4, radius: 0.23 },
  ] as const;
}

/**
 * A storage tank's saddle, tank-local metres about its own station: a 120
 * degree cradle (the wear plate under the shell), the web plate that carries
 * it, five stiffener ribs and the base plate on the pad. It replaces two box
 * legs, a box brace and an open half-pipe, which read as a plain dark box
 * under every tank (final3 tank-farm).
 */
export const VESSEL_SADDLE = {
  /** Half the contact angle, radians (a 120 degree saddle). */
  contactHalfAngle: Math.PI / 3,
  /** Wear plate: its inner face off the shell, thickness, extra arc past the web, axial width. */
  wearPlate: { clearance: 0.004, thickness: 0.026, overArc: 0.1, width: 0.62 },
  web: 0.03,
  base: { thickness: 0.03, width: 0.5, overhang: 0.1 },
  rib: { thickness: 0.025, halfWidth: 0.24 },
  /** Half-width of the web at the pad, as a fraction of the radius. */
  footHalfWidth: 0.8,
} as const;

/** Where the tank's axis stands above the pad (`StorageTank`). */
export const storageTankAxisHeight = (radius: number) => radius + 1.5;

export function createVesselSaddleGeometry(radius: number): THREE.BufferGeometry {
  const s = VESSEL_SADDLE;
  const centreY = storageTankAxisHeight(radius);
  const inner = radius + s.wearPlate.clearance;
  const outer = inner + s.wearPlate.thickness;
  const down = -Math.PI / 2;
  const foot = s.footHalfWidth * radius;
  const baseTop = s.base.thickness;
  // Shapes are drawn in (z, y) and extruded along tank-local x.
  const alongAxis = (geometry: THREE.BufferGeometry, depth: number) =>
    geometry.rotateY(Math.PI / 2).translate(-depth / 2, 0, 0);
  const wearArc = s.contactHalfAngle + s.wearPlate.overArc;
  const wear = new THREE.Shape();
  wear.absarc(0, centreY, outer, down - wearArc, down + wearArc, false);
  wear.absarc(0, centreY, inner, down + wearArc, down - wearArc, true);
  wear.closePath();
  const web = new THREE.Shape();
  web.moveTo(-foot, baseTop);
  // Its top edge runs 5 mm into the wear plate, so no face meets another flush.
  web.absarc(
    0,
    centreY,
    outer - 0.005,
    down - s.contactHalfAngle,
    down + s.contactHalfAngle,
    false
  );
  web.lineTo(foot, baseTop);
  web.closePath();
  const extrude = (shape: THREE.Shape, depth: number) =>
    alongAxis(
      new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 }),
      depth
    );
  const parts: THREE.BufferGeometry[] = [
    extrude(wear, s.wearPlate.width),
    extrude(web, s.web),
    new THREE.BoxGeometry(s.base.width, s.base.thickness, 2 * (foot + s.base.overhang)).translate(
      0,
      s.base.thickness / 2,
      0
    ),
  ];
  // Ribs either side of the web, from the base plate to 5 mm into the cradle.
  for (const t of [-0.92, -0.46, 0, 0.46, 0.92]) {
    const z = t * foot;
    const topY = centreY - Math.sqrt(outer * outer - z * z) + 0.005;
    const rise = topY - baseTop + 0.005;
    parts.push(
      new THREE.BoxGeometry(2 * s.rib.halfWidth, rise, s.rib.thickness).translate(
        0,
        baseTop - 0.005 + rise / 2,
        z
      )
    );
  }
  const plain = parts.map((part) => {
    const flat = part.index ? part.toNonIndexed() : part;
    for (const name of Object.keys(flat.attributes))
      if (!['position', 'normal', 'uv'].includes(name)) flat.deleteAttribute(name);
    return flat;
  });
  const merged = mergeGeometries(plain);
  new Set([...parts, ...plain]).forEach((part) => part.dispose());
  if (!merged) throw new Error('Incompatible saddle parts');
  merged.name = 'utility-tank-saddle';
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function createUtilityTankHardware(radius: number, length: number) {
  const layout = utilityLadderLayout(radius),
    parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.24, 0.24]) {
    const points = layout.rail.map((p) => new THREE.Vector3(x, p[1], p[2]));
    const top = points.at(-1)!;
    points.push(new THREE.Vector3(x, top.y + 0.8, top.z));
    parts.push(
      colour(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(points, false, 'centripetal'),
          64,
          0.035,
          6,
          false
        ),
        SAFETY
      )
    );
    parts.push(
      colour(new THREE.BoxGeometry(0.19, 0.05, 0.25).translate(x, 0.025, -layout.offset), STEEL)
    );
    for (const m of layout.mounts)
      parts.push(pipe([x, m.shell[1], m.shell[2] + 0.025], [x, m.rail[1], m.rail[2]], 0.026));
  }
  for (const p of layout.rungs)
    parts.push(pipe([-0.24, p[1], p[2]], [0.24, p[1], p[2]], 0.025, SAFETY));
  const top = radius * 2 + 1.5;
  const [manway, valve] = utilityTankNozzles(length);
  parts.push(pipe([manway.x, top - 0.04, 0], [manway.x, top + 0.34, 0], 0.27));
  flange(parts, manway.x, top + 0.16, 0, manway.radius);
  parts.push(pipe([manway.x, top + 0.3, 0], [manway.x, top + 0.39, 0], 0.34));
  const x = valve.x;
  parts.push(pipe([x, top - 0.04, 0], [x, top + 0.45, 0], 0.12, BRASS));
  flange(parts, x, top + 0.12, 0, valve.radius);
  parts.push(pipe([x, top + 0.45, 0], [x, top + 0.65, 0], 0.055, BRASS));
  wheel(parts, x, top + 0.65, 0, 0.22);
  return join(parts, 'utility-tank-connected-hardware');
}
export function createLpgHardware(radius: number, height: number) {
  const parts: THREE.BufferGeometry[] = [],
    top = height + radius + 0.5;
  parts.push(pipe([0, top - 0.04, 0], [0, top + 0.48, 0], 0.14, BRASS));
  flange(parts, 0, top + 0.12, 0, 0.25);
  parts.push(pipe([0, top + 0.38, 0], [0.35, top + 0.38, 0], 0.07, BRASS));
  parts.push(pipe([0, top + 0.45, 0], [0, top + 0.68, 0], 0.05, BRASS));
  wheel(parts, 0, top + 0.68, 0, 0.24);
  return join(parts, 'lpg-connected-valve-manifold');
}

export function resolveUtilityPressure(scada: unknown, campaign: unknown) {
  for (const [source, value] of [
    ['scada', scada],
    ['campaign', campaign],
  ] as const)
    if (typeof value === 'number' && Number.isFinite(value)) return { pressureBar: value, source };
  return null;
}
export function utilityPressureAngle(bar: number) {
  return Math.PI * 0.75 - Math.min(1, Math.max(0, bar / 16)) * Math.PI * 1.5;
}
export function createUtilityPressureFace() {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(colour(new THREE.CylinderGeometry(0.19, 0.19, 0.1, 32).rotateX(Math.PI / 2), STEEL));
  parts.push(colour(new THREE.CircleGeometry(0.166, 32).translate(0, 0, 0.052), '#f0e9d5'));
  parts.push(colour(new THREE.TorusGeometry(0.176, 0.017, 6, 32).translate(0, 0, 0.06), BRASS));
  for (let i = 0; i <= 32; i++) {
    const theta = Math.PI * 1.25 - (i / 32) * Math.PI * 1.5,
      r = 0.146;
    const g = new THREE.BoxGeometry(
      i % 4 === 0 ? 0.008 : 0.004,
      i % 4 === 0 ? 0.027 : 0.014,
      0.003
    );
    g.rotateZ(theta - Math.PI / 2).translate(Math.cos(theta) * r, Math.sin(theta) * r, 0.057);
    parts.push(colour(g, INK));
  }
  parts.push(pipe([0, -0.19, -0.02], [0, -0.28, -0.02], 0.045, BRASS));
  return join(parts, 'utility-pressure-formed-face');
}

const HARDWARE_MATERIAL = new THREE.MeshStandardMaterial({
  color: '#ffffff',
  vertexColors: true,
  roughness: 0.57,
  metalness: 0.18,
});
function Hardware({
  kind,
  radius,
  length = 8,
  height = 4,
}: {
  kind: 'tank' | 'lpg';
  radius: number;
  length?: number;
  height?: number;
}) {
  const g = useMemo(
    () =>
      kind === 'tank'
        ? createUtilityTankHardware(radius, length)
        : createLpgHardware(radius, height),
    [kind, radius, length, height]
  );
  useEffect(() => () => g.dispose(), [g]);
  return (
    <mesh
      name={kind === 'tank' ? 'utility-tank-hardware' : 'lpg-valve-hardware'}
      geometry={g}
      material={HARDWARE_MATERIAL}
      castShadow
      receiveShadow
    />
  );
}
export const UtilityTankHardware = ({ radius, length }: { radius: number; length: number }) => (
  <Hardware kind="tank" radius={radius} length={length} />
);
export const LpgValveHardware = ({ radius, height }: { radius: number; height: number }) => (
  <Hardware kind="lpg" radius={radius} height={height} />
);

/** Reads the same finite SCADA-first pressure as the existing panel. There is
 * no status colour, simulation write or history subscription. Working if zero
 * remains zero and missing data has no visible needle rather than a false zero.
 */
export function UtilityPressureGauge({
  assetId,
  radius,
  height,
}: {
  assetId?: string;
  radius: number;
  height: number;
}) {
  const tagId = assetId ? (UTILITY_ASSET_TAG_IDS[assetId]?.pressure ?? '') : '';
  const { value } = useSCADATag(tagId);
  const campaign = useOperationsCampaignStore(
    (s) => s.utilityAssets.find((a) => a.id === assetId)?.pressureBar
  );
  const reading = resolveUtilityPressure(value?.value, campaign);
  const face = useMemo(createUtilityPressureFace, []);
  const needle = useMemo(
    () => new THREE.BoxGeometry(0.008, 0.12, 0.004).translate(0, 0.045, 0),
    []
  );
  useEffect(
    () => () => {
      face.dispose();
      needle.dispose();
    },
    [face, needle]
  );
  const angle = reading ? utilityPressureAngle(reading.pressureBar) : 0;
  return (
    <group
      position={[radius + 0.12, height * 0.7, 0]}
      rotation={[0, Math.PI / 2, 0]}
      name="utility-pressure-instrument"
    >
      <mesh geometry={face} material={HARDWARE_MATERIAL} castShadow receiveShadow />
      <mesh position={[0, 0, -0.09]} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.055, 0.055, 0.14, 12]} />
        <meshStandardMaterial color={BRASS} roughness={0.57} metalness={0.18} />
      </mesh>
      <mesh
        name="utility-pressure-needle"
        geometry={needle}
        position={[0, 0, 0.061]}
        rotation={[0, 0, angle]}
        visible={reading !== null}
        userData={{
          pressureBar: reading?.pressureBar ?? null,
          readingSource: reading?.source ?? 'missing',
          tagId,
          angle,
          noStaticBatch: true,
        }}
      >
        <meshStandardMaterial color="#9a4035" roughness={0.62} />
      </mesh>
      <mesh position={[0, 0, 0.066]}>
        <circleGeometry args={[0.016, 12]} />
        <meshStandardMaterial color={INK} roughness={0.6} />
      </mesh>
      {[
        { text: '0', position: [-0.088, -0.087, 0.058] as Point },
        { text: '8', position: [0, 0.105, 0.058] as Point },
        { text: '16', position: [0.088, -0.087, 0.058] as Point },
        { text: 'bar', position: [0, -0.064, 0.058] as Point },
      ].map(({ text, position }) => (
        <SceneText
          key={text}
          position={[...position]}
          fontSize={0.031}
          color={INK}
          anchorX="center"
          anchorY="middle"
          surface="painted"
        >
          {text}
        </SceneText>
      ))}
    </group>
  );
}
