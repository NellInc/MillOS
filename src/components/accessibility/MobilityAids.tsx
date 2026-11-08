/**
 * The mobility aids people in the community use (D-058): a manual wheelchair,
 * a long cane, and a vibrating alert pager on the belt. Each is drawn in its
 * person's root group, from the same numbers that pose the body
 * (accessibilityLayout.ts), so the palms meet the push rims and the cane grip.
 *
 * Nothing here decides where anyone goes. CommunityLife steps the routes and
 * calls `advanceMobility` once a frame; these components read that state.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  LONG_CANE,
  WHEELCHAIR,
  WHEELCHAIR_PUSH,
  longCanePoints,
} from '../../constants/accessibilityLayout';
import type { MobilityAid } from '../../simulation/agreedAdjustments';
import type { WorkerMotionState } from '../workers/workerTypes';
import { isAlarmSignalling } from './alarmSignal';

export interface MobilityState {
  aid: MobilityAid;
  /** Wheel turn, radians, from the ground actually covered. */
  wheelAngle: number;
  /** Push cycle, radians: one cycle per WHEELCHAIR_PUSH.metresPerPush. */
  push: number;
  /** 0 hands on the rims, 1 hands at the work surface. */
  reach: number;
  /** Ground covered with the cane, metres, for the sweep. */
  travel: number;
  /** -1..1 across the path. */
  sweep: number;
  lastX: number;
  lastZ: number;
  primed: boolean;
  /** Whether the aid is drawn this frame (a seated cane user folds it away). */
  shown: boolean;
}

export function createMobilityState(aid: MobilityAid | undefined): MobilityState | null {
  if (!aid) return null;
  return {
    aid,
    wheelAngle: 0,
    push: 0,
    reach: 0,
    travel: 0,
    sweep: 0,
    lastX: 0,
    lastZ: 0,
    primed: false,
    shown: true,
  };
}

/**
 * Advance an aid from the root's movement this frame and write the body's
 * cues into `motion`. Ground covered drives the wheels, the pushes and the
 * cane's sweep, so a held clock or a paused game holds them too.
 * Working if a cut (a clock jump or reframe) moves the root without spinning
 * a wheel, and stopping eases the cane back to straight ahead.
 */
export function advanceMobility(
  state: MobilityState,
  motion: WorkerMotionState,
  x: number,
  z: number,
  frame: { delta: number; moving: boolean; working: boolean; seated: boolean; cut: boolean }
): void {
  const covered =
    state.primed && !frame.cut && frame.moving && Number.isFinite(x) && Number.isFinite(z)
      ? Math.min(2, Math.hypot(x - state.lastX, z - state.lastZ))
      : 0;
  state.lastX = Number.isFinite(x) ? x : state.lastX;
  state.lastZ = Number.isFinite(z) ? z : state.lastZ;
  state.primed = true;
  const dt = frame.moving && Number.isFinite(frame.delta) ? Math.min(0.1, frame.delta) : 0;
  motion.mobility = state.aid;
  if (state.aid === 'wheelchair') {
    state.wheelAngle = (state.wheelAngle + covered / WHEELCHAIR.wheelRadius) % (Math.PI * 2);
    state.push =
      (state.push + (covered / WHEELCHAIR_PUSH.metresPerPush) * Math.PI * 2) % (Math.PI * 2);
    const reachTarget = frame.working && covered === 0 ? 1 : 0;
    state.reach = frame.cut ? reachTarget : THREE.MathUtils.damp(state.reach, reachTarget, 4, dt);
    state.shown = true;
    motion.cycling = true;
    motion.cyclePhase = state.push;
    motion.wheelReach = state.reach;
    return;
  }
  state.travel = (state.travel + covered) % (LONG_CANE.metresPerSweep * 1000);
  const sweepTarget =
    covered > 0 ? Math.sin((Math.PI * 2 * state.travel) / LONG_CANE.metresPerSweep) : 0;
  state.sweep =
    covered > 0 || frame.cut ? sweepTarget : THREE.MathUtils.damp(state.sweep, 0, 3, dt);
  state.shown = !frame.seated;
  motion.caneSweep = state.sweep;
}

// ---------------------------------------------------------------------------
// Wheelchair
// ---------------------------------------------------------------------------

const FRAME_METAL = new THREE.MeshStandardMaterial({
  name: 'wheelchair-frame',
  color: '#2f3d52',
  roughness: 0.38,
  metalness: 0.75,
});
const RIM_METAL = new THREE.MeshStandardMaterial({
  name: 'wheelchair-push-rim',
  color: '#c9ccd0',
  roughness: 0.25,
  metalness: 0.9,
});
const TYRE = new THREE.MeshStandardMaterial({
  name: 'wheelchair-tyre',
  color: '#1d1f22',
  roughness: 0.85,
});
const UPHOLSTERY = new THREE.MeshStandardMaterial({
  name: 'wheelchair-upholstery',
  color: '#2b2e33',
  roughness: 0.9,
});

const tube = (from: THREE.Vector3Tuple, to: THREE.Vector3Tuple, radius = 0.012) => {
  const a = new THREE.Vector3(...from),
    b = new THREE.Vector3(...to);
  const length = a.distanceTo(b);
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 8);
  geometry.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      b.clone().sub(a).normalize()
    )
  );
  geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return geometry;
};

/** The rigid frame, footplate and caster forks: one merged geometry. */
function createWheelchairFrame(): THREE.BufferGeometry {
  const W = WHEELCHAIR;
  const parts: THREE.BufferGeometry[] = [];
  const seatY = W.seatHeight - 0.07;
  const front = W.seatBackZ + W.seatDepth;
  for (const side of [-1, 1]) {
    const x = side * (W.seatWidth / 2 + 0.01);
    // Seat rail, back post, front hanger down to the footplate.
    parts.push(tube([x, seatY, W.seatBackZ], [x, seatY, front]));
    parts.push(
      tube([x, seatY, W.seatBackZ], [x, W.seatHeight + W.backrestHeight, W.seatBackZ - 0.04])
    );
    parts.push(tube([x, seatY, front], [x * 0.7, W.footplateY + 0.02, W.footplateZ]));
    // Lower rail to the caster housing, and the axle plate to the wheel hub.
    parts.push(tube([x, W.axleY - 0.02, W.axleZ], [x, W.casterRadius * 2 + 0.06, W.casterZ]));
    parts.push(tube([x, seatY, W.axleZ], [x, W.axleY, W.axleZ], 0.016));
    parts.push(tube([x, W.axleY, W.axleZ], [side * (W.wheelX - 0.02), W.axleY, W.axleZ], 0.01));
    // Caster stem and fork.
    const cx = side * W.casterX;
    parts.push(
      tube([x, W.casterRadius * 2 + 0.06, W.casterZ], [cx, W.casterRadius * 2 + 0.06, W.casterZ])
    );
    parts.push(
      tube(
        [cx, W.casterRadius * 2 + 0.06, W.casterZ],
        [cx, W.casterRadius, W.casterZ + 0.03],
        0.009
      )
    );
    // Push handle stub at the back.
    parts.push(
      tube(
        [x, W.seatHeight + W.backrestHeight, W.seatBackZ - 0.04],
        [x, W.seatHeight + W.backrestHeight + 0.02, W.seatBackZ - 0.13],
        0.014
      )
    );
  }
  // Cross brace under the seat and the footplate.
  parts.push(
    tube(
      [-W.seatWidth / 2, seatY - 0.02, W.axleZ + 0.1],
      [W.seatWidth / 2, seatY - 0.02, W.axleZ + 0.1]
    )
  );
  const plate = new THREE.BoxGeometry(W.seatWidth * 0.62, 0.012, 0.16);
  plate.translate(0, W.footplateY, W.footplateZ);
  parts.push(plate);
  const merged = mergeGeometries(parts.map((part) => part.toNonIndexed()))!;
  parts.forEach((part) => part.dispose());
  return merged;
}

function createWheelchairUpholstery(): THREE.BufferGeometry {
  const W = WHEELCHAIR;
  const cushion = new THREE.BoxGeometry(W.seatWidth, 0.07, W.seatDepth - 0.02);
  cushion.translate(0, W.seatHeight - 0.035, W.seatBackZ + W.seatDepth / 2 + 0.01);
  const back = new THREE.BoxGeometry(W.seatWidth, W.backrestHeight - 0.06, 0.03);
  back.rotateX(-0.08);
  back.translate(0, W.seatHeight + (W.backrestHeight - 0.06) / 2 + 0.02, W.seatBackZ - 0.02);
  const merged = mergeGeometries([cushion.toNonIndexed(), back.toNonIndexed()])!;
  cushion.dispose();
  back.dispose();
  return merged;
}

/** One drive wheel about its own axle (local X), at the origin. */
function createDriveWheel(): { tyre: THREE.BufferGeometry; metal: THREE.BufferGeometry } {
  const W = WHEELCHAIR;
  const tyre = new THREE.TorusGeometry(W.wheelRadius - 0.014, 0.014, 8, 40);
  tyre.rotateY(Math.PI / 2);
  const parts: THREE.BufferGeometry[] = [];
  const rim = new THREE.TorusGeometry(W.wheelRadius - 0.03, 0.006, 6, 40);
  rim.rotateY(Math.PI / 2);
  parts.push(rim);
  const push = new THREE.TorusGeometry(W.rimRadius, 0.009, 6, 40);
  push.rotateY(Math.PI / 2);
  push.translate(W.rimX - W.wheelX, 0, 0);
  parts.push(push);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    // Push-rim stand-offs.
    parts.push(
      tube(
        [0, Math.cos(a) * W.rimRadius, Math.sin(a) * W.rimRadius],
        [W.rimX - W.wheelX, Math.cos(a) * W.rimRadius, Math.sin(a) * W.rimRadius],
        0.004
      )
    );
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = W.wheelRadius - 0.03;
    parts.push(tube([0, 0, 0], [0, Math.cos(a) * r, Math.sin(a) * r], 0.0022));
  }
  const hub = new THREE.CylinderGeometry(0.03, 0.03, 0.05, 12);
  hub.rotateZ(Math.PI / 2);
  parts.push(hub);
  const metal = mergeGeometries(parts.map((part) => part.toNonIndexed()))!;
  parts.forEach((part) => part.dispose());
  return { tyre, metal };
}

function createCaster(): THREE.BufferGeometry {
  const W = WHEELCHAIR;
  const wheel = new THREE.CylinderGeometry(W.casterRadius, W.casterRadius, 0.03, 16);
  wheel.rotateZ(Math.PI / 2);
  return wheel;
}

const WHEELCHAIR_GEOMETRY = (() => {
  const wheel = createDriveWheel();
  return {
    frame: createWheelchairFrame(),
    upholstery: createWheelchairUpholstery(),
    tyre: wheel.tyre,
    wheelMetal: wheel.metal,
    caster: createCaster(),
  };
})();

function Wheelchair({ state }: { state: MobilityState }) {
  const wheels = useRef<Array<THREE.Group | null>>([]);
  useFrame(() => {
    for (const wheel of wheels.current) if (wheel) wheel.rotation.x = state.wheelAngle;
  });
  const W = WHEELCHAIR;
  return (
    <group name="mobility-wheelchair">
      <mesh geometry={WHEELCHAIR_GEOMETRY.frame} material={FRAME_METAL} castShadow />
      <mesh geometry={WHEELCHAIR_GEOMETRY.upholstery} material={UPHOLSTERY} castShadow />
      {[-1, 1].map((side, index) => (
        <group
          key={side}
          position={[side * W.wheelX, W.axleY, W.axleZ]}
          scale={[side, 1, 1]}
          ref={(node) => {
            wheels.current[index] = node;
          }}
        >
          <mesh geometry={WHEELCHAIR_GEOMETRY.tyre} material={TYRE} castShadow />
          <mesh geometry={WHEELCHAIR_GEOMETRY.wheelMetal} material={RIM_METAL} />
        </group>
      ))}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          geometry={WHEELCHAIR_GEOMETRY.caster}
          material={TYRE}
          position={[side * W.casterX, W.casterRadius, W.casterZ + 0.03]}
        />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Long cane
// ---------------------------------------------------------------------------

const CANE_WHITE = new THREE.MeshStandardMaterial({
  name: 'long-cane-white',
  color: '#f2f2ee',
  roughness: 0.45,
});
const CANE_RED = new THREE.MeshStandardMaterial({
  name: 'long-cane-red',
  color: '#b3121b',
  roughness: 0.5,
});
const CANE_GRIP = new THREE.MeshStandardMaterial({
  name: 'long-cane-grip',
  color: '#1b1c1e',
  roughness: 0.8,
});

/** Along local -Y from the grip (origin) to the tip at -LONG_CANE.length. */
const CANE_GEOMETRY = (() => {
  const L = LONG_CANE.length;
  const segment = (from: number, to: number, radius: number) => {
    const g = new THREE.CylinderGeometry(radius, radius, to - from, 10);
    g.translate(0, -(from + to) / 2, 0);
    return g;
  };
  const tipBall = new THREE.SphereGeometry(0.022, 10, 8);
  tipBall.translate(0, -L, 0);
  return {
    grip: segment(-0.04, 0.2, 0.013),
    white: mergeGeometries([
      segment(0.2, L - LONG_CANE.bandTo, 0.0085).toNonIndexed(),
      segment(L - LONG_CANE.bandFrom, L - 0.02, 0.0085).toNonIndexed(),
    ])!,
    red: segment(L - LONG_CANE.bandTo, L - LONG_CANE.bandFrom, 0.0088),
    tip: tipBall,
  };
})();

const _grip = { x: 0, y: 0, z: 0 };
const _tip = { x: 0, y: 0, z: 0 };
const _down = new THREE.Vector3(0, -1, 0);
const _dir = new THREE.Vector3();

function LongCane({ state }: { state: MobilityState }) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    const node = group.current;
    if (!node) return;
    node.visible = state.shown;
    longCanePoints(state.sweep, _grip, _tip);
    node.position.set(_grip.x, _grip.y, _grip.z);
    _dir.set(_tip.x - _grip.x, _tip.y - _grip.y, _tip.z - _grip.z).normalize();
    node.quaternion.setFromUnitVectors(_down, _dir);
  });
  return (
    <group ref={group} name="mobility-long-cane">
      <mesh geometry={CANE_GEOMETRY.grip} material={CANE_GRIP} />
      <mesh geometry={CANE_GEOMETRY.white} material={CANE_WHITE} castShadow />
      <mesh geometry={CANE_GEOMETRY.red} material={CANE_RED} />
      <mesh geometry={CANE_GEOMETRY.tip} material={CANE_WHITE} />
    </group>
  );
}

export function MobilityAidProp({ state }: { state: MobilityState }) {
  return state.aid === 'wheelchair' ? <Wheelchair state={state} /> : <LongCane state={state} />;
}

// ---------------------------------------------------------------------------
// Vibrating alert pager
// ---------------------------------------------------------------------------

const PAGER_CASE = new THREE.MeshStandardMaterial({
  name: 'alert-pager-case',
  color: '#202326',
  roughness: 0.6,
});
/** The pager's indicator is a light source: unlit, so it reads at night. */
const PAGER_LED_IDLE = new THREE.MeshBasicMaterial({ name: 'alert-pager-led', color: '#1f7a3a' });
const PAGER_LED_ALERT = new THREE.MeshBasicMaterial({
  name: 'alert-pager-led-alert',
  color: '#ff3b2f',
});
const _hips = new THREE.Vector3();

/**
 * A pager clipped to the belt on the left hip. It follows the Hips bone of the
 * body it is mounted beside, and its lamp shows red while an alarm is
 * signalling (the vibration itself is what the person feels; the AI confirms
 * it was delivered, aiAccommodation.ts).
 */
export function AlertPager() {
  const group = useRef<THREE.Group>(null);
  const led = useRef<THREE.Mesh>(null);
  const hips = useRef<THREE.Object3D | null>(null);
  const geometry = useMemo(() => {
    const body = new THREE.BoxGeometry(0.06, 0.085, 0.026);
    const lamp = new THREE.BoxGeometry(0.018, 0.01, 0.006);
    lamp.translate(0, 0.03, 0.015);
    return { body, lamp };
  }, []);
  useFrame(({ clock }) => {
    const node = group.current,
      root = node?.parent;
    if (!node || !root) return;
    if (!hips.current || !hips.current.parent) hips.current = root.getObjectByName('Hips') ?? null;
    if (!hips.current) {
      node.visible = false;
      return;
    }
    node.visible = true;
    hips.current.getWorldPosition(_hips);
    root.worldToLocal(_hips);
    node.position.set(_hips.x + 0.17, _hips.y - 0.02, _hips.z + 0.02);
    if (led.current) {
      const alert = isAlarmSignalling();
      led.current.material =
        alert && Math.floor(clock.elapsedTime * 2) % 2 === 0 ? PAGER_LED_ALERT : PAGER_LED_IDLE;
    }
  });
  return (
    <group ref={group} name="alert-pager" rotation={[0, Math.PI / 2, 0]}>
      <mesh geometry={geometry.body} material={PAGER_CASE} />
      <mesh ref={led} geometry={geometry.lamp} material={PAGER_LED_IDLE} />
    </group>
  );
}
