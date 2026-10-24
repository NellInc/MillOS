import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useGraphicsStore } from '../../stores/graphicsStore';
import {
  ExteriorDownlight,
  ExteriorLampPool,
  EXTERIOR_LAMP_LENS_MATERIAL,
} from './ExteriorLighting';

type Point = readonly [number, number, number];
type Site = 'maintenance' | 'substation' | 'barn';
type Style = 'gooseneck' | 'hood';
export interface ServiceEntranceLight {
  id: string;
  site: Site;
  style: Style;
  mount: Point;
  yaw: number;
  intensity: number;
  distance: number;
  pool: Point;
  poolRadius: number;
}

/** Four task faces only. Pools stop before the farm fence and eastern pond.
 * Working if each bracket seats on real joinery, with zero new shadow maps.
 */
export const SERVICE_ENTRANCE_LIGHTS: readonly ServiceEntranceLight[] = [
  {
    id: 'workshop',
    site: 'maintenance',
    style: 'gooseneck',
    mount: [0, 4.4, 4.01],
    yaw: 0,
    intensity: 80,
    distance: 7,
    pool: [0, 0, 5.3],
    poolRadius: 2.3,
  },
  {
    id: 'substation-door',
    site: 'substation',
    style: 'hood',
    mount: [0, 3.87, 2.01],
    yaw: 0,
    intensity: 38,
    distance: 5.4,
    pool: [0, 0, 3.4],
    poolRadius: 1.7,
  },
  {
    id: 'substation-warning',
    site: 'substation',
    style: 'hood',
    mount: [2.51, 3.05, 0],
    yaw: Math.PI / 2,
    intensity: 26,
    distance: 3.8,
    pool: [3.25, 0, 0],
    poolRadius: 1.3,
  },
  {
    id: 'barn',
    site: 'barn',
    style: 'gooseneck',
    mount: [1.65, 3.9, 4.345],
    yaw: 0,
    intensity: 45,
    distance: 5.3,
    pool: [1.65, 0, 5.1],
    poolRadius: 2,
  },
];

// Same scalar registration as the established civic/practical lights. Keeping
// resident sources permits a paired direct-light control without a new shader.
export const SERVICE_ENTRANCE_STRENGTH = { value: 1 };
export const SERVICE_LAMP_SOURCE: Record<Style, Point> = {
  gooseneck: [0, 0.015, 0.6],
  hood: [0, -0.07, 0.55],
};
export function serviceEntranceSource(light: ServiceEntranceLight): THREE.Vector3 {
  return new THREE.Vector3(...SERVICE_LAMP_SOURCE[light.style])
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), light.yaw)
    .add(new THREE.Vector3(...light.mount));
}

function paint(g: THREE.BufferGeometry, hex: string) {
  const c = new THREE.Color(hex),
    values = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < values.length; i += 3) c.toArray(values, i);
  g.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return g;
}
function join(parts: THREE.BufferGeometry[]) {
  const plain = parts.map((g) => (g.index ? g.toNonIndexed() : g)),
    result = mergeGeometries(plain);
  new Set([...parts, ...plain]).forEach((g) => g.dispose());
  if (!result) throw new Error('Incompatible entrance fixture geometry');
  result.computeBoundingBox();
  result.computeBoundingSphere();
  return result;
}
/** Shared fitted hardware, with open undersides below the opaque reflector.
 * Working if downward/source-to-task rays clear every part, including the lip.
 */
export function createServiceLampHardware(style: Style) {
  const parts: THREE.BufferGeometry[] = [];
  const box = (size: Point, at: Point, color: string) =>
    parts.push(paint(new THREE.BoxGeometry(...size).translate(...at), color));
  const enamel = '#294a42',
    steel = '#52625d',
    brass = '#ae8d50';
  if (style === 'gooseneck') {
    box([0.18, 0.36, 0.055], [0, 0, 0.015], enamel);
    const curve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0, 0, 0.04),
      new THREE.Vector3(0, 0.4, 0.08),
      new THREE.Vector3(0, 0.5, 0.6),
      new THREE.Vector3(0, 0.12, 0.6)
    );
    parts.push(paint(new THREE.TubeGeometry(curve, 16, 0.035, 8, false), steel));
    const profile = [
      [0.07, 0.18],
      [0.12, 0.16],
      [0.18, 0.09],
      [0.28, 0],
      [0.3, -0.025],
      [0.3, -0.065],
      [0.26, -0.065],
    ];
    parts.push(
      paint(
        new THREE.LatheGeometry(
          profile.map((p) => new THREE.Vector2(...p)),
          24
        ).translate(0, 0.1, 0.6),
        enamel
      )
    );
    parts.push(
      paint(
        new THREE.TorusGeometry(0.286, 0.012, 6, 24).rotateX(Math.PI / 2).translate(0, 0.045, 0.6),
        brass
      )
    );
    for (const y of [-0.125, 0.125])
      parts.push(
        paint(
          new THREE.CylinderGeometry(0.022, 0.022, 0.025, 8)
            .rotateX(Math.PI / 2)
            .translate(0, y, 0.055),
          brass
        )
      );
  } else {
    box([0.28, 0.18, 0.055], [0, 0, 0.015], enamel);
    const shape = new THREE.Shape(),
      x = 0.24,
      z = 0.3,
      r = 0.055;
    shape.moveTo(-x + r, -z);
    shape.lineTo(x - r, -z);
    shape.quadraticCurveTo(x, -z, x, -z + r);
    shape.lineTo(x, z - r);
    shape.quadraticCurveTo(x, z, x - r, z);
    shape.lineTo(-x + r, z);
    shape.quadraticCurveTo(-x, z, -x, z - r);
    shape.lineTo(-x, -z + r);
    shape.quadraticCurveTo(-x, -z, -x + r, -z);
    parts.push(
      paint(
        new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false, curveSegments: 4 })
          .rotateX(-Math.PI / 2)
          .translate(0, 0, 0.32),
        enamel
      )
    );
    box([0.44, 0.024, 0.56], [0, -0.012, 0.32], brass);
  }
  const result = join(parts);
  result.name = `service-${style}-hardware`;
  return result;
}
function lens(style: Style) {
  const geometry = new THREE.SphereGeometry(style === 'gooseneck' ? 0.262 : 0.19, 16, 8)
    .scale(1, 0.05, 1)
    .translate(0, style === 'gooseneck' ? 0.035 : -0.033, style === 'gooseneck' ? 0.6 : 0.4);
  geometry.computeBoundingBox();
  return geometry;
}
const HARDWARE = {
  gooseneck: createServiceLampHardware('gooseneck'),
  hood: createServiceLampHardware('hood'),
};
export const SERVICE_LAMP_LENSES = { gooseneck: lens('gooseneck'), hood: lens('hood') };
const METAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.56,
  metalness: 0.32,
});
const FITTING_DATA = new Map(
  SERVICE_ENTRANCE_LIGHTS.map((l) => [
    l.id,
    { serviceEntranceId: l.id, serviceEntranceGain: SERVICE_ENTRANCE_STRENGTH },
  ])
);
const DYNAMIC_PART = { noStaticBatch: true };

/** Existing clock, materials, quality gates and shadow-free spots. No frame loop.
 * Working if non-Low gains four bounded spots and Low retains only lens/spill.
 */
export function ServiceEntranceLighting({ site }: { site: Site }) {
  const realLight = useGraphicsStore(
    (s) =>
      s.graphics.quality !== 'low' &&
      !s.graphics.perfDebug.disablePunctualLights &&
      !s.graphics.perfDebug.disableLightingPolish
  );
  return SERVICE_ENTRANCE_LIGHTS.filter((l) => l.site === site).map((l) => (
    <group key={l.id}>
      <group
        name={`service-entry-${l.id}`}
        position={[...l.mount]}
        rotation={[0, l.yaw, 0]}
        userData={FITTING_DATA.get(l.id)}
      >
        <mesh
          geometry={HARDWARE[l.style]}
          material={METAL}
          castShadow
          receiveShadow
          dispose={null}
        />
        <mesh
          name={`service-entry-lens-${l.id}`}
          geometry={SERVICE_LAMP_LENSES[l.style]}
          material={EXTERIOR_LAMP_LENS_MATERIAL}
          userData={DYNAMIC_PART}
          dispose={null}
        />
        {realLight && (
          <ExteriorDownlight
            name={`service-entry-light-${l.id}`}
            gain={SERVICE_ENTRANCE_STRENGTH}
            position={[...SERVICE_LAMP_SOURCE[l.style]]}
            intensity={l.intensity}
            distance={l.distance}
            color="#ffdda8"
          />
        )}
      </group>
      <group name={`service-entry-pool-${l.id}`} position={[...l.pool]} userData={DYNAMIC_PART}>
        <ExteriorLampPool radius={l.poolRadius} />
      </group>
    </group>
  ));
}
