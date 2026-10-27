import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';

type Point = readonly [number, number, number];
export const CANAL_FINDS_LAYOUT = {
  bicycle: { position: [-147.5, 0.05, 54], rotation: [0.25, 0.7, 0.1] },
  trolley: { position: [-143, 0.1, 36.5], rotation: [Math.PI * 0.85, 0.35, 0.2] },
  wheels: [
    [-0.45, 0.35, 0],
    [0.45, 0.35, 0],
  ],
  casters: [
    [-0.18, -0.28, 0.4],
    [0.18, -0.28, 0.4],
    [-0.18, -0.28, -0.4],
    [0.18, -0.28, -0.4],
  ],
} as const;

const MATERIALS = {
  paint: new THREE.MeshStandardMaterial({
    name: 'canal-find-enamel',
    vertexColors: true,
    roughness: 0.7,
    metalness: 0.15,
  }),
  metal: new THREE.MeshStandardMaterial({
    name: 'canal-find-oxidised-steel',
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.48,
  }),
  rubber: new THREE.MeshStandardMaterial({
    name: 'canal-find-rubber',
    vertexColors: true,
    roughness: 0.94,
  }),
};
const BLUE = '#375c78',
  STEEL = '#727e7e',
  RUBBER = '#303936';

function tube(b: PlotGeometry, a: Point, c: Point, radius: number, colour: string, sides = 4) {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...c),
    delta = end.clone().sub(start);
  const g = new THREE.CylinderGeometry(radius, radius, delta.length(), sides);
  g.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
  );
  b.add(g.translate(...start.add(end).multiplyScalar(0.5).toArray()), colour);
}

/** Closed rounded rim, no doubled endpoints or unseated square corner bars. */
function rim(b: PlotGeometry, y: number, colour: string) {
  const path = new THREE.CurvePath<THREE.Vector3>(),
    x = 0.24,
    z = 0.5,
    r = 0.035;
  const p = (a: number, c: number) => new THREE.Vector3(a, y, c);
  const line = (a: THREE.Vector3, c: THREE.Vector3) => path.add(new THREE.LineCurve3(a, c));
  const bend = (a: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) =>
    path.add(new THREE.QuadraticBezierCurve3(a, c, d));
  line(p(-x + r, -z), p(x - r, -z));
  bend(p(x - r, -z), p(x, -z), p(x, -z + r));
  line(p(x, -z + r), p(x, z - r));
  bend(p(x, z - r), p(x, z), p(x - r, z));
  line(p(x - r, z), p(-x + r, z));
  bend(p(-x + r, z), p(-x, z), p(-x, z - r));
  line(p(-x, z - r), p(-x, -z + r));
  bend(p(-x, -z + r), p(-x, -z), p(-x + r, -z));
  b.add(new THREE.TubeGeometry(path, 28, 0.012, 4, true), colour);
}

/** Age belongs to the surface, rather than separate transparent rust balls.
 * Working if retained opaque roles carry quiet oxide/silt variation at joints.
 */
function aged(b: PlotGeometry, role: keyof typeof MATERIALS) {
  const g = b.finish(),
    p = g.getAttribute('position'),
    colours = g.getAttribute('color');
  const oxide = new THREE.Color('#80654d'),
    algae = new THREE.Color('#596a4f'),
    c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const patch = Math.max(0, Math.sin(x * 19 + y * 11) * Math.cos(z * 17 - y * 9));
    c.fromBufferAttribute(colours, i);
    if (role !== 'rubber') c.lerp(oxide, patch * 0.3);
    c.lerp(algae, (0.06 + Math.max(0, 0.3 - y) * 0.12) * (0.5 + patch * 0.5));
    colours.setXYZ(i, c.r, c.g, c.b);
  }
  return g;
}

export const CANAL_BICYCLE_GEOMETRY = (() => {
  const paint = new PlotGeometry(),
    metal = new PlotGeometry(),
    rubber = new PlotGeometry();
  for (const [x, y, z] of CANAL_FINDS_LAYOUT.wheels) {
    // Torus default plane is XY. Axles and hubs run Z, like the diamond frame.
    rubber.add(new THREE.TorusGeometry(0.35, 0.025, 6, 24).translate(x, y, z), RUBBER);
    metal.add(new THREE.TorusGeometry(0.325, 0.008, 4, 20).translate(x, y, z), STEEL);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 6;
      tube(
        metal,
        [x - Math.cos(a) * 0.325, y - Math.sin(a) * 0.325, 0],
        [x + Math.cos(a) * 0.325, y + Math.sin(a) * 0.325, 0],
        0.0035,
        STEEL
      );
    }
    tube(metal, [x, y, -0.06], [x, y, 0.06], 0.025, STEEL, 6);
  }
  const crank: Point = [-0.05, 0.29, 0],
    seat: Point = [-0.2, 0.59, 0],
    head: Point = [0.31, 0.58, 0];
  tube(paint, seat, head, 0.018, BLUE, 6);
  tube(paint, head, crank, 0.021, BLUE, 6);
  tube(paint, crank, seat, 0.019, BLUE, 6);
  for (const side of [-1, 1]) {
    tube(paint, [-0.45, 0.35, side * 0.045], [-0.2, 0.59, side * 0.02], 0.012, BLUE, 6);
    tube(paint, [-0.45, 0.35, side * 0.045], [-0.05, 0.29, side * 0.025], 0.013, BLUE, 6);
    tube(metal, [0.31, 0.58, side * 0.02], [0.45, 0.35, side * 0.045], 0.013, STEEL, 6);
  }
  tube(metal, seat, [-0.24, 0.69, 0], 0.012, STEEL, 6);
  rubber.add(new RoundedBoxGeometry(0.21, 0.045, 0.12, 1, 0.015).translate(-0.245, 0.7, 0), RUBBER);
  tube(paint, [0.31, 0.58, 0], [0.3, 0.65, 0], 0.021, BLUE, 6);
  tube(metal, [0.3, 0.65, 0], [0.37, 0.695, 0], 0.012, STEEL, 6);
  tube(metal, [0.37, 0.695, -0.2], [0.37, 0.695, 0.2], 0.012, STEEL, 6);
  for (const side of [-1, 1])
    tube(rubber, [0.37, 0.695, side * 0.17], [0.37, 0.695, side * 0.25], 0.017, RUBBER, 6);
  metal.add(new THREE.TorusGeometry(0.065, 0.007, 4, 12).translate(-0.05, 0.29, 0.045), STEEL);
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI * 2) / 3;
    tube(
      metal,
      [-0.05, 0.29, 0.045],
      [-0.05 + Math.cos(angle) * 0.065, 0.29 + Math.sin(angle) * 0.065, 0.045],
      0.004,
      STEEL
    );
  }
  tube(metal, [-0.05, 0.29, -0.07], [-0.05, 0.29, 0.07], 0.014, STEEL, 6);
  for (const side of [-1, 1]) {
    tube(
      metal,
      [-0.05, 0.29, side * 0.065],
      [-0.05 + side * 0.085, 0.29 + side * 0.045, side * 0.065],
      0.01,
      STEEL
    );
    rubber.box(
      [0.085, 0.026, 0.075],
      [-0.05 + side * 0.085, 0.29 + side * 0.045, side * 0.09],
      RUBBER
    );
  }
  return {
    paint: aged(paint, 'paint'),
    metal: aged(metal, 'metal'),
    rubber: aged(rubber, 'rubber'),
  };
})();

export const CANAL_TROLLEY_GEOMETRY = (() => {
  const metal = new PlotGeometry(),
    rubber = new PlotGeometry();
  rim(metal, 0.24, STEEL);
  rim(metal, -0.24, STEEL);
  for (const x of [-0.24, 0.24]) {
    for (const z of [-0.49125, 0.49125])
      tube(
        metal,
        [Math.sign(x) * 0.23125, -0.24, z],
        [Math.sign(x) * 0.23125, 0.24, z],
        0.012,
        STEEL,
        6
      );
    for (const y of [-0.15, 0, 0.15]) tube(metal, [x, y, -0.495], [x, y, 0.495], 0.0045, STEEL);
    for (const z of [-0.35, -0.17, 0, 0.17, 0.35])
      tube(metal, [x, -0.24, z], [x, 0.24, z], 0.0045, STEEL);
  }
  for (const z of [-0.5, 0.5]) {
    for (const y of [-0.15, 0, 0.15]) tube(metal, [-0.23, y, z], [0.23, y, z], 0.0045, STEEL);
    for (const x of [-0.15, 0, 0.15]) tube(metal, [x, -0.24, z], [x, 0.24, z], 0.0045, STEEL);
  }
  for (const z of [-0.3, -0.1, 0.1, 0.3])
    tube(metal, [-0.24, -0.24, z], [0.24, -0.24, z], 0.005, STEEL);
  for (const x of [-0.12, 0, 0.12]) tube(metal, [x, -0.24, -0.5], [x, -0.24, 0.5], 0.005, STEEL);
  for (const side of [-1, 1])
    tube(metal, [side * 0.24, 0.24, -0.465], [side * 0.15, 0.35, -0.55], 0.012, STEEL, 6);
  tube(rubber, [-0.2, 0.35, -0.55], [0.2, 0.35, -0.55], 0.015, RUBBER, 6);
  // Seat panel retains its original tilt and wire construction; its perimeter
  // now joins the basket instead of six isolated bars floating at its end.
  const child = (x: number, y: number): Point => [
    x,
    0.1 + Math.cos(0.3) * y,
    0.52 + Math.sin(0.3) * y,
  ];
  for (const y of [-0.11, -0.1, 0, 0.1, 0.11])
    tube(metal, child(-0.16, y), child(0.16, y), 0.0045, STEEL);
  for (const x of [-0.16, -0.12, 0, 0.12, 0.16])
    tube(metal, child(x, -0.11), child(x, 0.11), 0.0045, STEEL);
  for (const side of [-1, 1])
    tube(metal, [side * 0.16, 0, 0.5], child(side * 0.16, -0.11), 0.006, STEEL);
  for (const [x, y, z] of CANAL_FINDS_LAYOUT.casters) {
    rubber.add(
      new THREE.CylinderGeometry(0.06, 0.06, 0.03, 8).rotateX(Math.PI / 2).translate(x, y, z),
      RUBBER
    );
    tube(metal, [x, y, z - 0.035], [x, y, z + 0.035], 0.01, STEEL, 6);
    for (const side of [-1, 1])
      tube(metal, [x, y, z + side * 0.027], [x, -0.2, z + side * 0.027], 0.009, STEEL);
    tube(metal, [x, -0.2, z - 0.027], [x, -0.2, z + 0.027], 0.009, STEEL);
    for (const side of [-1, 1])
      tube(
        metal,
        [x, -0.2, z + side * 0.027],
        [Math.sign(x) * 0.24, -0.24, z + side * 0.027],
        0.009,
        STEEL
      );
  }
  return { metal: aged(metal, 'metal'), rubber: aged(rubber, 'rubber') };
})();

export function Bicycle() {
  const layout = CANAL_FINDS_LAYOUT.bicycle;
  return (
    <group
      dispose={null}
      name="canal-find-bicycle"
      position={[...layout.position]}
      rotation={[...layout.rotation]}
    >
      {Object.entries(CANAL_BICYCLE_GEOMETRY).map(([role, geometry]) => (
        <mesh
          key={role}
          name={`canal-bicycle-${role}`}
          geometry={geometry}
          material={MATERIALS[role as keyof typeof MATERIALS]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}
export function Trolley() {
  const layout = CANAL_FINDS_LAYOUT.trolley;
  return (
    <group
      dispose={null}
      name="canal-find-trolley"
      position={[...layout.position]}
      rotation={[...layout.rotation]}
    >
      {Object.entries(CANAL_TROLLEY_GEOMETRY).map(([role, geometry]) => (
        <mesh
          key={role}
          name={`canal-trolley-${role}`}
          geometry={geometry}
          material={MATERIALS[role as keyof typeof MATERIALS]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}
