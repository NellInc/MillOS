/**
 * ACCESS FITTINGS (D-058): what the plant and the village changed so disabled
 * colleagues and residents can use them on the same terms as everyone else.
 *
 * - The hall: a sit-stand quality bench and a table for the seated quality
 *   technician, a glazed quiet room, visual alarm devices (sounder and strobe)
 *   on the walls, and a visual alert lamp at the east roller mill's workpost.
 * - The town hall: a two-flight 1:12 ramp from the front landing down the
 *   east side, with handrails both sides; corduroy hazard paving at the head
 *   and foot of the front steps; an induction-loop sign by the door.
 * - The railway road's zebra: red blister paving on both dropped kerbs.
 * - The station car park: an accessible bay with a transfer zone.
 * - The hall's gables: a level personnel door beside each dock, its protected
 *   walk, exit signs and an assembly point (StepFreeExits.tsx).
 *
 * Positions and shapes are in accessibilityLayout.ts. Paint and solid matter
 * are lit (MeshStandardMaterial); the strobes, lamps and the pod's ceiling
 * light are light sources and stay unlit.
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  ACCESSIBLE_BAYS,
  HALL_VISUAL_ALARMS,
  QC_BENCH,
  QC_BREAK_TABLE,
  QUIET_ROOM,
  TOWN_HALL_FRAME,
  TOWN_HALL_LOOP_SIGN,
  TOWN_HALL_RAMP,
  TOWN_HALL_RAMP_RAILS,
  TOWN_HALL_STEP_TACTILE,
  WORKPOST_ALERT_LAMP,
  townHallRailPosts,
  townHallRampHeight,
} from '../../constants/accessibilityLayout';
import { EXTERIOR_LAYERS, POLYGON_OFFSET } from '../../constants/renderLayers';
import { crossingTactilePads } from './accessGeometry';
import { sampleTerrainGroundHeight } from '../terrain/splatMapGenerator';
import { getTerrainGridSegments } from '../terrain/terrainTypes';
import { useGraphicsStore } from '../../stores/graphicsStore';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { SceneText } from '../shared/SceneText';
import { isAlarmSignalling, strobeOn } from './alarmSignal';
import { StepFreeExits } from './StepFreeExits';

// ---------------------------------------------------------------------------
// Shared materials
// ---------------------------------------------------------------------------

const lit = (name: string, color: string, roughness = 0.7, metalness = 0) =>
  new THREE.MeshStandardMaterial({ name, color, roughness, metalness });

const M = {
  benchTop: lit('qc-bench-top', '#d8d5ce', 0.55),
  steel: lit('qc-bench-frame', '#3b4148', 0.45, 0.6),
  instrument: lit('qc-instrument', '#e9e9e6', 0.4),
  tin: lit('qc-sample-tin', '#b7bcc1', 0.3, 0.8),
  flour: lit('qc-flour', '#efe7d6', 0.95),
  felt: lit('quiet-room-felt', '#3f5d5e', 0.95),
  frame: lit('quiet-room-frame', '#2e3236', 0.5, 0.4),
  upholstery: lit('quiet-room-chair', '#8a6f55', 0.9),
  stone: lit('town-hall-ramp-stone', '#b9b2a6', 0.9),
  rail: lit('town-hall-ramp-rail', '#26292c', 0.45, 0.6),
  tactile: lit('step-hazard-paving', '#d4c9a8', 0.85),
  signBlue: lit('loop-sign-blue', '#1f4f9c', 0.6),
  signWhite: lit('loop-sign-white', '#f4f4f0', 0.6),
  alarmBase: lit('visual-alarm-base', '#b3201e', 0.55),
};
const glass = new THREE.MeshStandardMaterial({
  name: 'quiet-room-glass',
  color: '#cfe3e6',
  roughness: 0.08,
  metalness: 0.1,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
});
/**
 * Ground paint on the car park and the crossings: lit, overlay bias. It writes
 * depth: an opaque decal that does not is overdrawn by the asphalt or path
 * drawn after it (the first capture showed neither the bay nor the pads).
 */
const paint = (name: string, color: string) =>
  new THREE.MeshStandardMaterial({
    name,
    color,
    roughness: 0.85,
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET.exteriorOverlay.factor,
    polygonOffsetUnits: POLYGON_OFFSET.exteriorOverlay.units,
  });
const BAY_YELLOW = paint('accessible-bay-yellow', '#e5b521');
const BAY_WHITE = paint('accessible-bay-white', '#f2f2ee');
const BLISTER_RED = paint('crossing-blister-red', '#9c3b38');
const BLISTER_DOME = lit('crossing-blister-dome', '#a3423e', 0.8);

/** Light sources: the strobe lens lit and dark, its glow, the lamps. */
const LENS_DARK = new THREE.MeshStandardMaterial({
  name: 'visual-alarm-lens',
  color: '#e8e2da',
  roughness: 0.2,
  transparent: true,
  opacity: 0.75,
});
const LENS_FLASH = new THREE.MeshBasicMaterial({ name: 'visual-alarm-flash', color: '#ffffff' });
const LENS_GLOW = new THREE.MeshBasicMaterial({
  name: 'visual-alarm-glow',
  color: '#fff3ea',
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const LAMP_DARK = lit('alert-lamp-lens', '#7a2a1c', 0.3);
const LAMP_FLASH = new THREE.MeshBasicMaterial({ name: 'alert-lamp-flash', color: '#ff5a2a' });
const POD_LIGHT = new THREE.MeshBasicMaterial({ name: 'quiet-room-light', color: '#fff1d6' });
const POD_FREE = new THREE.MeshBasicMaterial({ name: 'quiet-room-free', color: '#2fbf5b' });
const POD_IN_USE = new THREE.MeshBasicMaterial({ name: 'quiet-room-in-use', color: '#e0412f' });

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
const cylinder = (r: number, h: number, x: number, y: number, z: number, segments = 14) =>
  new THREE.CylinderGeometry(r, r, h, segments).translate(x, y, z).toNonIndexed();
const merge = (parts: THREE.BufferGeometry[]) => {
  const merged = mergeGeometries(parts)!;
  parts.forEach((part) => part.dispose());
  return merged;
};
/** A tube between two points. */
const rod = (a: THREE.Vector3Tuple, b: THREE.Vector3Tuple, radius: number) => {
  const from = new THREE.Vector3(...a),
    to = new THREE.Vector3(...b);
  const geometry = new THREE.CylinderGeometry(radius, radius, from.distanceTo(to), 10);
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      to.clone().sub(from).normalize()
    )
  );
  geometry.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return geometry.toNonIndexed();
};

// ---------------------------------------------------------------------------
// The quality bench, its tea table and the quiet room
// ---------------------------------------------------------------------------

function createQcBench() {
  const { width, depth, topHeight } = QC_BENCH;
  const frame: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const x = side * (width / 2 - 0.16);
    // A lifting column: outer and inner stage, a foot and the top bearer.
    frame.push(box(0.09, topHeight - 0.32, 0.07, x, (topHeight - 0.32) / 2 + 0.04, 0.12));
    frame.push(box(0.075, 0.3, 0.058, x, topHeight - 0.2, 0.12));
    frame.push(box(0.07, 0.04, depth - 0.05, x, 0.02, 0));
    frame.push(box(0.05, 0.03, depth - 0.1, x, topHeight - 0.04, 0));
  }
  // The cross-member sits at the back, so the knees and footplate pass under.
  frame.push(box(width - 0.4, 0.06, 0.05, 0, topHeight - 0.2, 0.3));
  // Height control paddle under the front right edge.
  frame.push(box(0.12, 0.03, 0.06, -width / 2 + 0.22, topHeight - 0.045, -depth / 2 + 0.06));
  const top = box(width, 0.035, depth, 0, topHeight - 0.0175, 0);
  const instruments = merge([
    // A balance, a sieve stack and a moisture meter.
    box(0.26, 0.08, 0.3, 0.45, topHeight + 0.04, 0.05),
    cylinder(0.075, 0.012, 0.45, topHeight + 0.086, 0.05, 20),
    box(0.22, 0.13, 0.2, -0.5, topHeight + 0.065, 0.12),
    box(0.16, 0.012, 0.11, -0.5, topHeight + 0.136, 0.05),
  ]);
  const tins = merge([
    cylinder(0.12, 0.05, 0.02, topHeight + 0.025, 0.15, 20),
    cylinder(0.12, 0.045, 0.02, topHeight + 0.0725, 0.15, 20),
    cylinder(0.12, 0.04, 0.02, topHeight + 0.115, 0.15, 20),
    ...[-0.18, -0.08].map((x) => cylinder(0.035, 0.07, x, topHeight + 0.035, -0.2, 12)),
  ]);
  const flour = merge([cylinder(0.11, 0.008, 0.02, topHeight + 0.139, 0.15, 20)]);
  return { frame: merge(frame), top, instruments, tins, flour };
}

function createBreakTable() {
  const { radius, height } = QC_BREAK_TABLE;
  return {
    top: cylinder(radius, 0.03, 0, height - 0.015, 0, 28),
    base: merge([
      cylinder(0.035, height - 0.03, 0, (height - 0.03) / 2, 0),
      cylinder(0.26, 0.02, 0, 0.01, 0, 24),
    ]),
    mug: cylinder(0.04, 0.095, -0.12, height + 0.0475, -0.2, 14),
  };
}

/** The pod's solid felt walls and roof, framed glazing front with an opening for the door. */
function createQuietRoom() {
  const { width, depth, height, doorWidth, seatHeight } = QUIET_ROOM;
  const t = 0.07;
  const hw = width / 2,
    hd = depth / 2;
  const felt = merge([
    box(width, height, t, 0, height / 2, hd - t / 2),
    box(t, height, depth - t, -hw + t / 2, height / 2, -t / 2),
    box(t, height, depth - t, hw - t / 2, height / 2, -t / 2),
    box(width, t, depth, 0, height - t / 2, 0),
  ]);
  const side = (width - doorWidth) / 2;
  const frame = merge([
    box(width, 0.06, 0.06, 0, height - t - 0.03, -hd + 0.03),
    box(width, 0.04, 0.06, 0, 0.02, -hd + 0.03),
    ...[-hw + 0.03, -doorWidth / 2 - 0.03, doorWidth / 2 + 0.03, hw - 0.03].map((x) =>
      box(0.06, height - t, 0.06, x, (height - t) / 2, -hd + 0.03)
    ),
    box(doorWidth + 0.12, 0.06, 0.06, 0, 2.1, -hd + 0.03),
  ]);
  const panes = merge(
    [-1, 1].map((s) =>
      box(
        side - 0.06,
        height - t - 0.1,
        0.012,
        s * (doorWidth / 2 + side / 2),
        (height - t) / 2,
        -hd + 0.03
      )
    )
  );
  const door = box(doorWidth - 0.04, 2.06, 0.03, 0, 1.06, 0);
  const chair = merge([
    box(0.72, 0.18, 0.62, 0, seatHeight - 0.09, 0.02),
    box(0.72, 0.5, 0.16, 0, seatHeight + 0.22, 0.3),
    ...[-1, 1].map((s) => box(0.12, 0.3, 0.62, s * 0.36, seatHeight + 0.05, 0.02)),
    box(0.7, seatHeight - 0.18, 0.56, 0, (seatHeight - 0.18) / 2, 0.03),
  ]);
  const light = box(0.9, 0.02, 0.9, 0, height - t - 0.011, 0.3);
  const signal = box(0.07, 0.07, 0.02, doorWidth / 2 + 0.16, 2.25, -hd - 0.005);
  return { felt, frame, panes, door, chair, light, signal };
}

const _occupant = new THREE.Vector3();

function HallFittings() {
  const bench = useMemo(createQcBench, []);
  const table = useMemo(createBreakTable, []);
  const pod = useMemo(createQuietRoom, []);
  useEffect(
    () => () => {
      for (const geometry of [
        ...Object.values(bench),
        ...Object.values(table),
        ...Object.values(pod),
      ])
        geometry.dispose();
    },
    [bench, table, pod]
  );
  const door = useRef<THREE.Mesh>(null);
  const signal = useRef<THREE.Mesh>(null);
  const occupant = useRef<THREE.Object3D | null>(null);
  const lookup = useRef(0);
  const doorOpen = useRef(0);
  // The door slides aside as its user comes to it and closes behind them; the
  // lamp above it shows the room in use while they are inside.
  useFrame(({ scene }, delta) => {
    // Look the room's user up rarely: a missed lookup walks the whole scene.
    if (!occupant.current?.parent && lookup.current-- <= 0) {
      lookup.current = 120;
      occupant.current = scene.getObjectByName('mill-packing-quiet') ?? null;
    }
    const person = occupant.current;
    let target = 0,
      inside = false;
    if (person?.visible) {
      person.getWorldPosition(_occupant);
      const dx = _occupant.x - QUIET_ROOM.centre[0],
        dz = _occupant.z - QUIET_ROOM.centre[2];
      inside =
        Math.abs(dx) < QUIET_ROOM.width / 2 - 0.1 && Math.abs(dz) < QUIET_ROOM.depth / 2 - 0.1;
      const doorZ = QUIET_ROOM.centre[2] - QUIET_ROOM.depth / 2;
      const nearDoor = Math.abs(dx) < 1.2 && Math.abs(_occupant.z - doorZ) < 1.6;
      const seated = person.userData.seated === true;
      target = nearDoor && !seated ? 1 : 0;
    }
    doorOpen.current = THREE.MathUtils.damp(doorOpen.current, target, 5, Math.min(0.1, delta));
    if (door.current) door.current.position.x = QUIET_ROOM.doorWidth * 0.98 * doorOpen.current;
    if (signal.current) signal.current.material = inside ? POD_IN_USE : POD_FREE;
  });
  const [bx, , bz] = QC_BENCH.centre;
  const [tx, , tz] = QC_BREAK_TABLE.centre;
  const [px, , pz] = QUIET_ROOM.centre;
  return (
    <group name="hall-access-fittings">
      <group name="qc-sit-stand-bench" position={[bx, 0, bz]}>
        <mesh geometry={bench.frame} material={M.steel} castShadow receiveShadow />
        <mesh geometry={bench.top} material={M.benchTop} castShadow receiveShadow />
        <mesh geometry={bench.instruments} material={M.instrument} castShadow />
        <mesh geometry={bench.tins} material={M.tin} castShadow />
        <mesh geometry={bench.flour} material={M.flour} />
      </group>
      <group name="qc-tea-table" position={[tx, 0, tz]}>
        <mesh geometry={table.top} material={M.benchTop} castShadow receiveShadow />
        <mesh geometry={table.base} material={M.steel} castShadow />
        <mesh geometry={table.mug} material={M.instrument} />
      </group>
      <group name="quiet-room" position={[px, 0, pz]}>
        <mesh geometry={pod.felt} material={M.felt} castShadow receiveShadow />
        <mesh geometry={pod.frame} material={M.frame} castShadow />
        <mesh geometry={pod.panes} material={glass} />
        <group position={[0, 0, -QUIET_ROOM.depth / 2 + 0.07]}>
          <mesh ref={door} geometry={pod.door} material={glass} />
        </group>
        <mesh geometry={pod.chair} material={M.upholstery} position={[0, 0, 0.55]} castShadow />
        <mesh geometry={pod.light} material={POD_LIGHT} />
        <mesh ref={signal} geometry={pod.signal} material={POD_FREE} />
        <SceneText
          surface="painted"
          position={[0, 2.32, -QUIET_ROOM.depth / 2 - 0.012]}
          rotation={[0, Math.PI, 0]}
          fontSize={0.13}
          color="#f1efe9"
          anchorX="center"
          anchorY="middle"
        >
          QUIET ROOM
        </SceneText>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Visual alarm devices and the workpost alert lamp
// ---------------------------------------------------------------------------

function createAlarmDevice() {
  const base = new THREE.CylinderGeometry(0.075, 0.085, 0.07, 18)
    .rotateX(Math.PI / 2)
    .translate(0, 0, 0.035);
  const lens = new THREE.SphereGeometry(0.055, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2)
    .rotateX(Math.PI / 2)
    .translate(0, 0, 0.07);
  const glow = new THREE.SphereGeometry(0.16, 12, 8).translate(0, 0, 0.1);
  return { base, lens, glow };
}

function createAlertLamp() {
  const { height } = WORKPOST_ALERT_LAMP;
  return {
    post: merge([
      cylinder(0.03, height - 0.12, 0, (height - 0.12) / 2, 0),
      cylinder(0.14, 0.03, 0, 0.015, 0, 20),
    ]),
    lens: cylinder(0.07, 0.14, 0, height - 0.06, 0, 16),
    glow: new THREE.SphereGeometry(0.22, 12, 8).translate(0, height - 0.06, 0),
  };
}

function VisualAlarms() {
  const reducedMotion = useReducedMotion();
  const device = useMemo(createAlarmDevice, []);
  const lamp = useMemo(createAlertLamp, []);
  useEffect(
    () => () => {
      for (const geometry of [...Object.values(device), ...Object.values(lamp)]) geometry.dispose();
    },
    [device, lamp]
  );
  const lenses = useRef<Array<THREE.Mesh | null>>([]);
  const glows = useRef<Array<THREE.Mesh | null>>([]);
  // All devices flash together, as synchronised strobes must.
  useFrame(({ clock }) => {
    const flash = isAlarmSignalling() && strobeOn(clock.elapsedTime, reducedMotion);
    const lamp = lenses.current.length - 1;
    for (let index = 0; index < lenses.current.length; index++) {
      const lens = lenses.current[index];
      // The workpost lamp is last; it flashes amber-red, the wall devices white.
      if (lens)
        lens.material =
          index === lamp ? (flash ? LAMP_FLASH : LAMP_DARK) : flash ? LENS_FLASH : LENS_DARK;
    }
    for (const glow of glows.current) if (glow) glow.visible = flash;
  });
  const [lx, , lz] = WORKPOST_ALERT_LAMP.position;
  const count = HALL_VISUAL_ALARMS.length;
  return (
    <group name="hall-visual-alarms">
      {HALL_VISUAL_ALARMS.map(({ position, facing }, index) => (
        <group key={index} position={position} rotation={[0, facing, 0]}>
          <mesh geometry={device.base} material={M.alarmBase} />
          <mesh
            ref={(node) => {
              lenses.current[index] = node;
            }}
            geometry={device.lens}
            material={LENS_DARK}
          />
          <mesh
            ref={(node) => {
              glows.current[index] = node;
            }}
            geometry={device.glow}
            material={LENS_GLOW}
            visible={false}
          />
        </group>
      ))}
      <group name="workpost-alert-lamp" position={[lx, 0, lz]}>
        <mesh geometry={lamp.post} material={M.steel} castShadow />
        <mesh
          ref={(node) => {
            lenses.current[count] = node;
          }}
          geometry={lamp.lens}
          material={LAMP_DARK}
        />
        <mesh
          ref={(node) => {
            glows.current[count] = node;
          }}
          geometry={lamp.glow}
          material={LENS_GLOW}
          visible={false}
        />
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// The town hall ramp, step paving and loop sign
// ---------------------------------------------------------------------------

function createTownHallRamp() {
  const r = TOWN_HALL_RAMP;
  const [f1, f2] = r.flights;
  // Side profile in (z, y), extruded across the ramp's width.
  const profile = new THREE.Shape();
  profile.moveTo(f1.fromZ, 0);
  profile.lineTo(f1.fromZ, f1.fromY);
  profile.lineTo(f1.toZ, f1.toY);
  profile.lineTo(f2.fromZ, f2.fromY);
  profile.lineTo(f2.toZ, f2.toY);
  profile.lineTo(f2.toZ, 0);
  profile.closePath();
  const width = r.maxX - r.minX;
  const flight = new THREE.ExtrudeGeometry(profile, { depth: width, bevelEnabled: false });
  // Shape x -> world z, extrusion -> world -x.
  flight.rotateY(-Math.PI / 2).translate(r.maxX, 0, 0);
  // The top landing and the apron in front of the east column, one level.
  const levels = [r.top, r.apron].map((level) =>
    box(
      level.maxX - level.minX,
      r.landingY,
      level.maxZ - level.minZ,
      (level.minX + level.maxX) / 2,
      r.landingY / 2,
      (level.minZ + level.maxZ) / 2
    )
  );
  const surface = merge([flight.toNonIndexed(), ...levels]);
  flight.dispose();

  // Handrails 0.9 m and 0.6 m above the surface along every rail line
  // (TOWN_HALL_RAMP_RAILS, which the walker also stops at): pieces break where
  // the pitch changes, so each piece is straight; posts about every 1.2 m.
  const rails: THREE.BufferGeometry[] = [];
  const breaks = [f1.fromZ, f1.toZ, f2.fromZ, f2.toZ];
  const surfaceAt = (x: number, z: number) => townHallRampHeight(x, z) ?? 0;
  for (const { from, to } of TOWN_HALL_RAMP_RAILS) {
    const cuts = [0, 1];
    if (from[0] === to[0])
      for (const z of breaks) {
        const t = (z - from[1]) / (to[1] - from[1]);
        if (t > 1e-6 && t < 1 - 1e-6) cuts.push(t);
      }
    cuts.sort((a, b) => a - b);
    const at = (t: number): [number, number] => [
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
    ];
    for (let i = 1; i < cuts.length; i++) {
      const [x0, z0] = at(cuts[i - 1]),
        [x1, z1] = at(cuts[i]);
      const y0 = surfaceAt(x0, z0),
        y1 = surfaceAt(x1, z1);
      for (const h of [r.railHeight, 0.6])
        rails.push(rod([x0, y0 + h, z0], [x1, y1 + h, z1], 0.022));
    }
    for (const [x, z] of townHallRailPosts({ from, to })) {
      const y = surfaceAt(x, z);
      rails.push(rod([x, y, z], [x, y + r.railHeight, z], 0.02));
    }
  }
  return { surface, rails: merge(rails) };
}

/** Corduroy: 6 mm bars, 20 mm wide at 50 mm centres, across the direction of travel. */
function createCorduroy() {
  const parts: THREE.BufferGeometry[] = [];
  const bars: THREE.BufferGeometry[] = [];
  for (const pad of TOWN_HALL_STEP_TACTILE) {
    const w = pad.maxX - pad.minX,
      d = pad.maxZ - pad.minZ;
    parts.push(
      box(w, 0.008, d, (pad.minX + pad.maxX) / 2, pad.y + 0.004, (pad.minZ + pad.maxZ) / 2)
    );
    for (let z = pad.minZ + 0.025; z < pad.maxZ; z += 0.05)
      bars.push(box(w - 0.02, 0.006, 0.02, (pad.minX + pad.maxX) / 2, pad.y + 0.011, z));
  }
  return { slab: merge(parts), bars: merge(bars) };
}

function createLoopSign() {
  const s = TOWN_HALL_LOOP_SIGN.size;
  const plate = box(s, s, 0.012, 0, 0, 0);
  // The ear: an open ring and a smaller inner curl, the international loop symbol.
  const ear = new THREE.TorusGeometry(s * 0.2, s * 0.035, 6, 24, Math.PI * 1.45)
    .rotateZ(-Math.PI * 0.2)
    .translate(-s * 0.06, s * 0.06, 0.008);
  const curl = new THREE.TorusGeometry(s * 0.09, s * 0.025, 6, 16, Math.PI * 1.2)
    .rotateZ(-Math.PI * 0.1)
    .translate(-s * 0.05, s * 0.06, 0.008);
  const lobe = new THREE.CylinderGeometry(s * 0.035, s * 0.035, s * 0.22, 8)
    .rotateZ(0.5)
    .translate(-s * 0.16, -s * 0.12, 0.008);
  return { plate, symbol: merge([ear.toNonIndexed(), curl.toNonIndexed(), lobe.toNonIndexed()]) };
}

function TownHallAccess() {
  const ramp = useMemo(createTownHallRamp, []);
  const corduroy = useMemo(createCorduroy, []);
  const sign = useMemo(createLoopSign, []);
  const barsRef = useRef<THREE.Mesh>(null);
  useEffect(
    () => () => {
      for (const geometry of [
        ...Object.values(ramp),
        ...Object.values(corduroy),
        ...Object.values(sign),
      ])
        geometry.dispose();
    },
    [ramp, corduroy, sign]
  );
  // The 20 mm bars only resolve near; further off they would shimmer, and the
  // slab's colour carries the warning.
  useFrame(({ camera }) => {
    if (!barsRef.current) return;
    const dx = camera.position.x - TOWN_HALL_FRAME.x,
      dz = camera.position.z - (TOWN_HALL_FRAME.z - 6.5);
    barsRef.current.visible = dx * dx + dz * dz < 18 * 18;
  });
  const [sx, sy, sz] = TOWN_HALL_LOOP_SIGN.position;
  return (
    <group
      name="town-hall-access"
      position={[TOWN_HALL_FRAME.x, 0, TOWN_HALL_FRAME.z]}
      rotation={[0, TOWN_HALL_FRAME.yaw, 0]}
    >
      <mesh
        name="town-hall-ramp"
        geometry={ramp.surface}
        material={M.stone}
        castShadow
        receiveShadow
      />
      <mesh name="town-hall-ramp-rails" geometry={ramp.rails} material={M.rail} castShadow />
      <mesh
        name="town-hall-step-hazard-paving"
        geometry={corduroy.slab}
        material={M.tactile}
        receiveShadow
      />
      <mesh ref={barsRef} geometry={corduroy.bars} material={M.tactile} />
      <group name="town-hall-loop-sign" position={[sx, sy, sz]}>
        <mesh geometry={sign.plate} material={M.signBlue} />
        <mesh geometry={sign.symbol} material={M.signWhite} />
        <SceneText
          surface="painted"
          position={[TOWN_HALL_LOOP_SIGN.size * 0.24, -TOWN_HALL_LOOP_SIGN.size * 0.2, 0.01]}
          fontSize={TOWN_HALL_LOOP_SIGN.size * 0.32}
          color="#f4f4f0"
          anchorX="center"
          anchorY="middle"
        >
          T
        </SceneText>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Crossing blisters and the accessible bay
// ---------------------------------------------------------------------------

type XZ = readonly [number, number];

const inQuad = (x: number, z: number, quad: readonly XZ[]) => {
  let inside = false;
  for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
    const [xi, zi] = quad[i],
      [xj, zj] = quad[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

function createBlisters(segments: number) {
  const ground = (x: number, z: number) => sampleTerrainGroundHeight(x, z, segments);
  const pads = crossingTactilePads();
  const slab: number[] = [];
  const domes: THREE.Vector3[] = [];
  for (const quad of pads) {
    // Two triangles, draped on the terrain at the overlay datum.
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const [x, z] = quad[index];
      slab.push(x, ground(x, z) + EXTERIOR_LAYERS.groundOverlay, z);
    }
    const xs = quad.map((p) => p[0]),
      zs = quad.map((p) => p[1]);
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.0667)
      for (let z = Math.min(...zs); z <= Math.max(...zs); z += 0.0667)
        if (inQuad(x, z, quad))
          domes.push(new THREE.Vector3(x, ground(x, z) + EXTERIOR_LAYERS.groundOverlay, z));
  }
  const slabGeometry = new THREE.BufferGeometry();
  slabGeometry.setAttribute('position', new THREE.Float32BufferAttribute(slab, 3));
  slabGeometry.computeVertexNormals();
  // Keep the normals up whichever way the quad winds.
  const normal = slabGeometry.getAttribute('normal');
  for (let i = 0; i < normal.count; i++) normal.setXYZ(i, 0, 1, 0);
  const dome = new THREE.SphereGeometry(0.0125, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(
    1,
    0.45,
    1
  );
  return { slab: slabGeometry, dome, domes };
}

function CrossingBlisters() {
  const quality = useGraphicsStore((s) => s.graphics.quality);
  const segments = getTerrainGridSegments(quality);
  const geometry = useMemo(() => createBlisters(segments), [segments]);
  const domesRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    const mesh = domesRef.current;
    if (!mesh) return;
    const matrix = new THREE.Matrix4();
    geometry.domes.forEach((point, index) =>
      mesh.setMatrixAt(index, matrix.makeTranslation(point.x, point.y, point.z))
    );
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [geometry]);
  useEffect(
    () => () => {
      geometry.slab.dispose();
      geometry.dome.dispose();
    },
    [geometry]
  );
  const centre = geometry.domes[0];
  useFrame(({ camera }) => {
    if (!domesRef.current || !centre) return;
    domesRef.current.visible = camera.position.distanceToSquared(centre) < 14 * 14;
  });
  return (
    <group name="zebra-blister-paving">
      <mesh geometry={geometry.slab} material={BLISTER_RED} receiveShadow />
      <instancedMesh
        ref={domesRef}
        args={[geometry.dome, BLISTER_DOME, Math.max(1, geometry.domes.length)]}
        frustumCulled={false}
      />
    </group>
  );
}

/** The International Symbol of Access, flat in the XZ plane, about 1.1 m tall, head toward +Z. */
function createAccessSymbol(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const flat = (geometry: THREE.BufferGeometry) => geometry.rotateX(-Math.PI / 2).toNonIndexed();
  // Wheel, open where the frame meets it.
  parts.push(
    flat(
      new THREE.RingGeometry(0.3, 0.38, 32, 1, Math.PI * 0.62, Math.PI * 1.55).translate(
        0,
        -0.18,
        0
      )
    )
  );
  parts.push(flat(new THREE.CircleGeometry(0.085, 20).translate(-0.05, 0.47, 0)));
  const bar = (x: number, y: number, w: number, h: number, angle = 0) =>
    flat(new THREE.PlaneGeometry(w, h).rotateZ(angle).translate(x, y, 0));
  parts.push(bar(-0.06, 0.15, 0.1, 0.42)); // back
  parts.push(bar(0.08, 0.0, 0.3, 0.09)); // seat
  parts.push(bar(0.24, -0.16, 0.09, 0.36, 0.32)); // shin
  parts.push(bar(0.31, -0.33, 0.16, 0.08)); // foot
  parts.push(bar(0.07, 0.2, 0.22, 0.07)); // arm
  // Turn so the symbol's head points along +Z on the ground.
  return merge(parts.map((part) => part.rotateY(Math.PI)));
}

function AccessibleBays() {
  const geometry = useMemo(() => {
    const yellow: THREE.BufferGeometry[] = [];
    const white: THREE.BufferGeometry[] = [];
    const y = EXTERIOR_LAYERS.groundOverlay;
    const line = (x: number, z: number, w: number, d: number, angle = 0) =>
      new THREE.PlaneGeometry(w, d)
        .rotateX(-Math.PI / 2)
        .rotateY(angle)
        .translate(x, y, z)
        .toNonIndexed();
    for (const bay of ACCESSIBLE_BAYS) {
      const [cx, cz] = bay.centre;
      const inset = 0.12;
      const minX = cx - bay.width / 2 + inset,
        maxX = cx + bay.width / 2 - inset;
      const minZ = cz - bay.depth / 2 + inset,
        maxZ = cz + bay.depth / 2 - inset;
      const zoneEdge = bay.transferSide < 0 ? minX + 1.1 : maxX - 1.1;
      const lineW = 0.1;
      // Outline of the bay and of its transfer zone.
      for (const x of [minX, zoneEdge, maxX]) yellow.push(line(x, cz, lineW, maxZ - minZ));
      for (const z of [minZ, maxZ]) yellow.push(line((minX + maxX) / 2, z, maxX - minX, lineW));
      // Hatching across the transfer zone.
      const zoneMin = Math.min(zoneEdge, bay.transferSide < 0 ? minX : maxX),
        zoneMax = Math.max(zoneEdge, bay.transferSide < 0 ? minX : maxX);
      for (let z = minZ + 0.45; z < maxZ - 0.3; z += 0.6)
        yellow.push(
          line(
            (zoneMin + zoneMax) / 2,
            z,
            Math.hypot(zoneMax - zoneMin, 0.6) * 0.92,
            lineW,
            Math.atan2(0.6, zoneMax - zoneMin)
          )
        );
      const symbolX = (bay.transferSide < 0 ? zoneEdge + maxX : minX + zoneEdge) / 2;
      white.push(createAccessSymbol().translate(symbolX, y, cz + 0.6));
    }
    return { yellow: merge(yellow), white: merge(white) };
  }, []);
  useEffect(
    () => () => {
      geometry.yellow.dispose();
      geometry.white.dispose();
    },
    [geometry]
  );
  return (
    <group name="accessible-parking-bays">
      <mesh geometry={geometry.yellow} material={BAY_YELLOW} receiveShadow />
      <mesh geometry={geometry.white} material={BAY_WHITE} receiveShadow />
    </group>
  );
}

/** Every access fitting, in world coordinates. Mounted once from MillScene. */
export function AccessFittings() {
  return (
    <group name="access-fittings" userData={{ noStaticBatch: true }}>
      <HallFittings />
      <VisualAlarms />
      <StepFreeExits />
      <TownHallAccess />
      <CrossingBlisters />
      <AccessibleBays />
    </group>
  );
}
