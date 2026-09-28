import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PlotGeometry } from '../../utils/authoredPlotGeometry';
import { applyVehicleSurface } from '../../utils/vehicleSurface';
import { SceneText } from '../shared/SceneText';

export interface CommunityBusPose {
  x: number;
  z: number;
  rotation: number;
  doorsOpen: boolean | number;
  visible: boolean;
}
export interface DeliveryHandcartPose {
  visible: boolean;
  position: readonly [number, number, number];
  rotation: number;
  loaded: boolean;
}
export const COMMUNITY_BUS_LAYOUT = Object.freeze({
  width: 2.2,
  length: 8,
  height: 3,
  wheelRadius: 0.42,
  doorway: Object.freeze([-1.1, 0.58, 2.4] as const),
  doorTravel: 0.65,
});
const GREEN = '#34594c';
const CREAM = '#e4d8b3';
const IRON = '#394844';
const OAK = '#98744e';
const PAINT = applyVehicleSurface(
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68 }),
  { grime: 0.12, grimeFloor: 0.1, grimeCeiling: 1.2, ribPitch: 0 }
);
const RUBBER = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
const GLASS = new THREE.MeshStandardMaterial({
  color: '#536d70',
  roughness: 0.22,
  metalness: 0.15,
});
const SIGN = new THREE.MeshStandardMaterial({
  color: '#ffe3a4',
  emissive: '#ffe3a4',
  emissiveIntensity: 0.5,
});

function busBody() {
  const b = new PlotGeometry();
  b.box([2.12, 0.14, 7.86], [0, 0.51, 0], IRON);
  b.box([2.2, 0.2, 7.98], [0, 2.9, 0], CREAM);
  b.box([1.95, 0.1, 7.6], [0, 2.75, 0], GREEN);
  // The nearside wall has a real 1.2m entrance gap. No solid box behind the doors.
  for (const [side, centre, length] of [
    [1, 0, 7.98],
    [-1, -1.1, 5.8],
    [-1, 3.5, 0.98],
  ]) {
    b.box([0.08, 0.8, length], [side * 1.06, 1.02, centre], GREEN);
    b.box([0.08, 0.13, length], [side * 1.06, 1.46, centre], CREAM);
  }
  for (const side of [-1, 1]) {
    for (const z of [-3.9, -2.7, -1.5, -0.3, 0.9, 1.78, 3.02, 3.9])
      b.box([0.09, 1.18, 0.065], [side * 1.055, 2.13, z], CREAM);
    b.box([0.09, 0.09, 7.98], [side * 1.055, 2.69, 0], CREAM);
    for (const z of [-3.99, 3.99]) b.box([0.16, 2.16, 0.02], [side * 1.02, 1.61, z], GREEN);
  }
  for (const z of [-3.96, 3.96]) {
    b.box([2.08, 0.83, 0.08], [0, 1.035, z], GREEN);
    b.box([2.12, 0.14, 0.08], [0, 1.48, z], CREAM);
    b.box([2.1, 0.13, 0.07], [0, 0.59, z], IRON);
  }
  b.box([1.84, 0.37, 0.07], [0, 2.63, 3.955], '#203831');
  b.box([0.07, 0.8, 0.07], [0, 2, 3.965], CREAM);
  // Shallow boarding step under the opening and contrasting threshold.
  b.box([0.34, 0.12, 1.16], [-0.93, 0.26, 2.4], IRON);
  b.box([0.13, 0.04, 1.16], [-1.025, 0.34, 2.4], CREAM);
  for (const side of [-1, 1]) {
    b.box([0.25, 0.11, 0.025], [side * 0.7, 0.97, 4], '#e8d9a7');
    b.box([0.14, 0.2, 0.025], [side * 0.85, 1.07, -4], '#913d32');
  }
  return b.finish();
}
function busWindows() {
  const b = new PlotGeometry();
  for (const side of [-1, 1])
    for (const [centre, length] of [
      [-1.1, 5.64],
      [3.46, 0.75],
    ])
      b.box([0.018, 1.09, length], [side * 1.055, 2.11, centre], '#ffffff');
  b.box([0.018, 1.09, 1.17], [1.055, 2.11, 2.4], '#ffffff');
  b.box([1.87, 0.79, 0.016], [0, 2.02, 3.955], '#ffffff');
  b.box([1.85, 1.04, 0.016], [0, 2.12, -3.955], '#ffffff');
  return b.finish();
}
function door() {
  const b = new PlotGeometry();
  b.box([0.065, 2.13, 0.6], [0, 1.625, 0], GREEN);
  b.box([0.075, 1.13, 0.46], [-0.006, 2.035, 0], '#536d70');
  b.box([0.082, 0.12, 0.6], [0, 1.42, 0], CREAM);
  b.box([0.085, 0.24, 0.022], [-0.015, 1.25, 0.2], CREAM);
  return b.finish();
}
function wheel(radius: number, width: number) {
  const b = new PlotGeometry();
  b.add(new THREE.CylinderGeometry(radius, radius, width, 20).rotateZ(Math.PI / 2), '#262c29');
  b.add(
    new THREE.CylinderGeometry(radius * 0.48, radius * 0.48, width + 0.014, 12).rotateZ(
      Math.PI / 2
    ),
    '#a19b85'
  );
  for (const side of [-1, 1])
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      b.box(
        [0.013, 0.036, 0.036],
        [
          side * (width / 2 + 0.012),
          Math.cos(angle) * radius * 0.3,
          Math.sin(angle) * radius * 0.3,
        ],
        IRON
      );
    }
  return b.finish();
}
function cart() {
  const b = new PlotGeometry();
  for (const x of [-0.32, -0.16, 0, 0.16, 0.32]) b.box([0.145, 0.06, 0.91], [x, 0.44, 0], OAK);
  for (const side of [-1, 1]) {
    for (const y of [0.57, 0.76]) b.box([0.055, 0.12, 0.94], [side * 0.4, y, 0], OAK);
    for (const z of [-0.46, 0.46]) b.box([0.065, 0.55, 0.065], [side * 0.4, 0.56, z], IRON);
    b.beam([side * 0.32, 0.38, -0.35], [side * 0.32, 1.04, -1.22], 0.05, IRON);
    b.box([0.12, 0.07, 0.26], [side * 0.32, 1.05, -1.2], OAK);
  }
  for (const y of [0.58, 0.77]) b.box([0.8, 0.12, 0.055], [0, y, 0.46], OAK);
  b.box([1.08, 0.055, 0.055], [0, 0.27, 0], IRON);
  return b.finish();
}
function flourSacks() {
  const b = new PlotGeometry();
  for (const x of [-0.19, 0.19])
    for (const z of [-0.22, 0.2]) {
      b.round([x, 0.68, z], [0.18, 0.25, 0.19], CREAM);
      b.round([x, 0.91, z], [0.08, 0.07, 0.085], '#c7b68d');
      b.box([0.06, 0.055, 0.018], [x, 0.69, z + 0.174], GREEN);
    }
  return b.finish();
}
export const COMMUNITY_TRANSIT_GEOMETRY = Object.freeze({
  bus: busBody(),
  windows: busWindows(),
  door: door(),
  busWheel: wheel(0.42, 0.19),
  cart: cart(),
  cartWheel: wheel(0.27, 0.11),
  sacks: flourSacks(),
});

/** Physical doorway opens monotonically, even when the schedule jumps.
 * Working if both leaves clear the 1.2m portal at progress1 and close without drift.
 */
export function communityDoorPositions(progress: number) {
  const p = Number.isFinite(progress) ? THREE.MathUtils.clamp(progress, 0, 1) : 0;
  return [
    2.1 - p * COMMUNITY_BUS_LAYOUT.doorTravel,
    2.7 + p * COMMUNITY_BUS_LAYOUT.doorTravel,
  ] as const;
}
const BUS_WHEELS = [
  [-0.995, 0.42, -2.45],
  [0.995, 0.42, -2.45],
  [-0.995, 0.42, 1],
  [0.995, 0.42, 1],
] as const;
const CART_WHEELS = [
  [-0.48, 0.27, 0],
  [0.48, 0.27, 0],
] as const;
const X_AXIS = new THREE.Vector3(1, 0, 0);
const SCALE = new THREE.Vector3(1, 1, 1);

function RollingWheels({
  radius,
  geometry,
  positions,
  movement,
}: {
  radius: number;
  geometry: THREE.BufferGeometry;
  positions: readonly (readonly [number, number, number])[];
  movement: { current: number };
}) {
  const wheels = useRef<THREE.InstancedMesh>(null);
  const scratch = useRef({
    matrix: new THREE.Matrix4(),
    rotation: new THREE.Quaternion(),
    position: new THREE.Vector3(),
  });
  useFrame(() => {
    if (!wheels.current) return;
    const s = scratch.current;
    s.rotation.setFromAxisAngle(X_AXIS, movement.current / radius);
    positions.forEach((p, i) => {
      s.position.set(...p);
      wheels.current!.setMatrixAt(i, s.matrix.compose(s.position, s.rotation, SCALE));
    });
    wheels.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={wheels}
      args={[geometry, RUBBER, positions.length]}
      castShadow
      receiveShadow
      frustumCulled={false}
    />
  );
}

export function CommunityBus({ pose }: { pose: CommunityBusPose }) {
  const root = useRef<THREE.Group>(null);
  const frontDoor = useRef<THREE.Mesh>(null);
  const rearDoor = useRef<THREE.Mesh>(null);
  const state = useRef({ open: 0, x: pose.x, z: pose.z, visible: false });
  const movement = useRef(0);
  useFrame((_, delta) => {
    if (!root.current) return;
    const valid = [pose.x, pose.z, pose.rotation].every(Number.isFinite);
    root.current.visible = pose.visible && valid;
    if (!root.current.visible) {
      state.current.visible = false;
      return;
    }
    if (state.current.visible)
      movement.current += Math.hypot(pose.x - state.current.x, pose.z - state.current.z);
    state.current.x = pose.x;
    state.current.z = pose.z;
    state.current.visible = true;
    root.current.position.set(pose.x, 0, pose.z);
    root.current.rotation.y = pose.rotation;
    const target =
      typeof pose.doorsOpen === 'boolean'
        ? Number(pose.doorsOpen)
        : Number.isFinite(pose.doorsOpen)
          ? THREE.MathUtils.clamp(pose.doorsOpen, 0, 1)
          : 0;
    state.current.open = THREE.MathUtils.damp(state.current.open, target, 9, Math.min(delta, 0.1));
    const [rear, front] = communityDoorPositions(state.current.open);
    if (rearDoor.current) rearDoor.current.position.z = rear;
    if (frontDoor.current) frontDoor.current.position.z = front;
  });
  return (
    <group
      ref={root}
      name="community-autonomous-village-bus"
      visible={false}
      userData={{ noStaticBatch: true }}
      dispose={null}
    >
      <mesh geometry={COMMUNITY_TRANSIT_GEOMETRY.bus} material={PAINT} castShadow receiveShadow />
      <mesh geometry={COMMUNITY_TRANSIT_GEOMETRY.windows} material={GLASS} />
      <RollingWheels
        radius={0.42}
        geometry={COMMUNITY_TRANSIT_GEOMETRY.busWheel}
        positions={BUS_WHEELS}
        movement={movement}
      />
      <mesh
        ref={rearDoor}
        position={[-1.11, 0, 2.1]}
        geometry={COMMUNITY_TRANSIT_GEOMETRY.door}
        material={PAINT}
        castShadow
      />
      <mesh
        ref={frontDoor}
        position={[-1.11, 0, 2.7]}
        geometry={COMMUNITY_TRANSIT_GEOMETRY.door}
        material={PAINT}
        castShadow
      />
      <SceneText
        position={[0, 2.64, 3.997]}
        fontSize={0.145}
        anchorX="center"
        anchorY="middle"
        material={SIGN}
      >
        42 MILL &amp; VILLAGE
      </SceneText>
    </group>
  );
}

export function DeliveryHandcart({ pose }: { pose: DeliveryHandcartPose }) {
  const root = useRef<THREE.Group>(null);
  const load = useRef<THREE.Mesh>(null);
  const movement = useRef(0);
  const previous = useRef({ x: pose.position[0], z: pose.position[2], visible: false });
  useFrame(() => {
    if (!root.current) return;
    root.current.visible =
      pose.visible && pose.position.every(Number.isFinite) && Number.isFinite(pose.rotation);
    if (!root.current.visible) {
      previous.current.visible = false;
      return;
    }
    const [x, y, z] = pose.position;
    if (previous.current.visible)
      movement.current += Math.hypot(x - previous.current.x, z - previous.current.z);
    previous.current.x = x;
    previous.current.z = z;
    previous.current.visible = true;
    root.current.position.set(x, y, z);
    root.current.rotation.y = pose.rotation;
    if (load.current) load.current.visible = pose.loaded;
  });
  return (
    <group
      ref={root}
      name="community-flour-handcart"
      visible={false}
      userData={{ noStaticBatch: true }}
      dispose={null}
    >
      <mesh geometry={COMMUNITY_TRANSIT_GEOMETRY.cart} material={PAINT} castShadow receiveShadow />
      <RollingWheels
        radius={0.27}
        geometry={COMMUNITY_TRANSIT_GEOMETRY.cartWheel}
        positions={CART_WHEELS}
        movement={movement}
      />
      <mesh
        ref={load}
        geometry={COMMUNITY_TRANSIT_GEOMETRY.sacks}
        material={PAINT}
        castShadow
        receiveShadow
      />
    </group>
  );
}

export interface CommunityBicyclePose {
  x: number;
  z: number;
  rotation: number;
  visible: boolean;
  /** Right pedal begins at top dead centre; radians about the local +X axle. */
  pedalPhase: number;
}
export const COMMUNITY_BICYCLE_LAYOUT = Object.freeze({
  wheelRadius: 0.34,
  saddle: Object.freeze([0, 0.86, -0.1] as const),
  pedalAxle: Object.freeze([0, 0.36, 0.04] as const),
  crankRadius: 0.15,
  grips: Object.freeze([
    Object.freeze([-0.23, 1.08, 0.57] as const),
    Object.freeze([0.23, 1.08, 0.57] as const),
  ]),
});

function bicycleFrame() {
  const b = new PlotGeometry();
  const axle = COMMUNITY_BICYCLE_LAYOUT.pedalAxle;
  const seat: readonly [number, number, number] = [0, 0.78, -0.1];
  const head: readonly [number, number, number] = [0, 0.77, 0.48];
  b.beam(axle, seat, 0.034, GREEN);
  b.beam(axle, head, 0.036, GREEN);
  b.beam(seat, head, 0.03, GREEN);
  for (const side of [-1, 1]) {
    const rear: readonly [number, number, number] = [side * 0.065, 0.34, -0.58];
    b.beam(rear, seat, 0.023, GREEN);
    b.beam(rear, axle, 0.025, GREEN);
    b.beam([side * 0.065, 0.34, 0.63], head, 0.026, GREEN);
    b.beam([side * 0.065, 0.34, -0.58], [side * 0.1, 0.76, -0.46], 0.012, IRON);
  }
  b.beam(seat, [0, 0.85, -0.1], 0.024, '#aaa998');
  b.box([0.2, 0.045, 0.28], [0, 0.8375, -0.1], '#714b34');
  b.beam(head, [0, 1.04, 0.54], 0.025, '#aaa998');
  for (const side of [-1, 1]) {
    b.beam([0, 1.04, 0.54], [side * 0.23, 1.08, 0.57], 0.022, '#aaa998');
    b.add(
      new THREE.CylinderGeometry(0.02, 0.02, 0.12, 8)
        .rotateZ(Math.PI / 2)
        .translate(side * 0.23, 1.08, 0.57),
      '#714b34'
    );
  }
  // Practical chain guard, mudguards and rear luggage rack distinguish the town bicycle.
  b.beam([0.09, 0.36, 0.04], [0.09, 0.34, -0.58], 0.11, GREEN);
  b.add(
    new THREE.CylinderGeometry(0.105, 0.105, 0.035, 16)
      .rotateZ(Math.PI / 2)
      .translate(0.1, 0.36, 0.04),
    GREEN
  );
  b.add(
    new THREE.CylinderGeometry(0.025, 0.025, 0.34, 10).rotateZ(Math.PI / 2).translate(...axle),
    IRON
  );
  for (const z of [-0.58, 0.63])
    b.add(
      new THREE.TorusGeometry(0.37, 0.016, 5, 18, Math.PI)
        .rotateY(Math.PI / 2)
        .translate(0, 0.34, z),
      CREAM
    );
  for (const x of [-0.1, 0, 0.1]) b.box([0.016, 0.02, 0.36], [x, 0.765, -0.51], IRON);
  for (const z of [-0.68, -0.34]) b.box([0.22, 0.02, 0.016], [0, 0.765, z], IRON);
  b.box([0.045, 0.07, 0.025], [0, 0.71, -0.94], '#aa4d3a');
  return b.finish();
}
function bicycleWheel() {
  const b = new PlotGeometry();
  b.add(new THREE.TorusGeometry(0.32, 0.02, 7, 28).rotateY(Math.PI / 2), '#262c29');
  b.add(new THREE.TorusGeometry(0.299, 0.01, 5, 28).rotateY(Math.PI / 2), '#b3b5a9');
  b.add(new THREE.CylinderGeometry(0.035, 0.035, 0.09, 10).rotateZ(Math.PI / 2), '#aaa998');
  for (let i = 0; i < 16; i++) {
    const angle = (i * Math.PI) / 8;
    b.beam(
      [i % 2 ? -0.028 : 0.028, 0, 0],
      [0, Math.sin(angle) * 0.3, Math.cos(angle) * 0.3],
      0.006,
      '#bbbdb1'
    );
  }
  return b.finish();
}
const crank = new PlotGeometry();
crank.box([0.022, 0.15, 0.024], [0, 0.075, 0], '#a4a795');
const pedal = new PlotGeometry();
pedal.box([0.12, 0.025, 0.085], [0, 0, 0], '#3b433b');
for (const z of [-0.035, 0.035]) pedal.box([0.105, 0.013, 0.008], [0, 0.018, z], '#8b8971');
export const COMMUNITY_BICYCLE_GEOMETRY = Object.freeze({
  frame: bicycleFrame(),
  wheel: bicycleWheel(),
  crank: crank.finish(),
  pedal: pedal.finish(),
});

/** Same opposed, ground-referenced targets used by the separately posed cyclist. */
export function communityBicyclePedals(phase: number) {
  const finitePhase = Number.isFinite(phase) ? phase : 0;
  const y = 0.15 * Math.cos(finitePhase);
  const z = 0.15 * Math.sin(finitePhase);
  return [
    [0.16, 0.36 + y, 0.04 + z],
    [-0.16, 0.36 - y, 0.04 - z],
  ] as const;
}
const BICYCLE_WHEELS = [
  [0, 0.34, -0.58],
  [0, 0.34, 0.63],
] as const;

export function CommunityBicycle({ pose }: { pose: CommunityBicyclePose }) {
  const root = useRef<THREE.Group>(null);
  const cranks = useRef<THREE.InstancedMesh>(null);
  const pedals = useRef<THREE.InstancedMesh>(null);
  const movement = useRef(0);
  const previous = useRef({ x: pose.x, z: pose.z, visible: false });
  const scratch = useRef({
    matrix: new THREE.Matrix4(),
    rotation: new THREE.Quaternion(),
    position: new THREE.Vector3(),
  });
  useFrame(() => {
    if (!root.current) return;
    root.current.visible =
      pose.visible &&
      Number.isFinite(pose.x) &&
      Number.isFinite(pose.z) &&
      Number.isFinite(pose.rotation);
    if (!root.current.visible) {
      previous.current.visible = false;
      return;
    }
    if (previous.current.visible)
      movement.current += Math.hypot(pose.x - previous.current.x, pose.z - previous.current.z);
    previous.current.x = pose.x;
    previous.current.z = pose.z;
    previous.current.visible = true;
    root.current.position.set(pose.x, 0, pose.z);
    root.current.rotation.y = pose.rotation;
    const phase = Number.isFinite(pose.pedalPhase) ? pose.pedalPhase : 0;
    const targets = communityBicyclePedals(phase);
    const s = scratch.current;
    targets.forEach((target, index) => {
      s.position.set(index === 0 ? 0.16 : -0.16, 0.36, 0.04);
      s.rotation.setFromAxisAngle(X_AXIS, phase + index * Math.PI);
      cranks.current?.setMatrixAt(index, s.matrix.compose(s.position, s.rotation, SCALE));
      s.position.set(target[0], target[1], target[2]);
      s.rotation.identity();
      pedals.current?.setMatrixAt(index, s.matrix.compose(s.position, s.rotation, SCALE));
    });
    if (cranks.current) cranks.current.instanceMatrix.needsUpdate = true;
    if (pedals.current) pedals.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group
      ref={root}
      name="community-upright-bicycle"
      visible={false}
      userData={{ noStaticBatch: true }}
      dispose={null}
    >
      <mesh geometry={COMMUNITY_BICYCLE_GEOMETRY.frame} material={PAINT} castShadow receiveShadow />
      <RollingWheels
        radius={0.34}
        geometry={COMMUNITY_BICYCLE_GEOMETRY.wheel}
        positions={BICYCLE_WHEELS}
        movement={movement}
      />
      <instancedMesh
        ref={cranks}
        args={[COMMUNITY_BICYCLE_GEOMETRY.crank, PAINT, 2]}
        castShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={pedals}
        args={[COMMUNITY_BICYCLE_GEOMETRY.pedal, RUBBER, 2]}
        castShadow
        frustumCulled={false}
      />
    </group>
  );
}
