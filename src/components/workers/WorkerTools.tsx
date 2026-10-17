/**
 * Worker tool accessory components
 */

import React from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHARED_WORKER_MATERIALS } from './SharedWorkerMaterials';
import type { ToolType } from './workerTypes';

/** Only the three reproduced floating supports. Other tools keep their mounts. */
export const isWorkerHandheldTool = (tool: ToolType) =>
  tool === 'clipboard' || tool === 'tablet' || tool === 'sample-kit';

/** Palm bases do not move under the distal-finger overlay. Measure once per rig.
 * Working if both actual bodies keep the same support through every wrist pose.
 */
export function workerPalmInWrist(model: THREE.Object3D): THREE.Vector3 | null {
  const wrist = model.getObjectByName('WristL'),
    first = model.getObjectByName('Middle1L'),
    second = model.getObjectByName('Middle2L');
  if (!wrist || !first || !second) return null;
  model.updateWorldMatrix(true, true);
  const palm = first
    .getWorldPosition(new THREE.Vector3())
    .lerp(second.getWorldPosition(new THREE.Vector3()), 0.5);
  return wrist.worldToLocal(palm);
}

/** Authored, cached tool silhouettes. Working if the jaw is physically open,
 * the spade tapers to its old tip, and loaves sit on the existing tray surface.
 * No new draw, texture, material family or per-frame work is introduced.
 */
export function createWorkerWrenchHead() {
  const s = new THREE.Shape();
  s.moveTo(-0.02, -0.015);
  s.quadraticCurveTo(-0.025, -0.015, -0.025, -0.01);
  s.lineTo(-0.025, 0.015);
  s.lineTo(-0.014, 0.015);
  s.lineTo(-0.012, -0.003);
  s.lineTo(0.012, -0.003);
  s.lineTo(0.014, 0.015);
  s.lineTo(0.025, 0.015);
  s.lineTo(0.025, -0.01);
  s.quadraticCurveTo(0.025, -0.015, 0.02, -0.015);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, {
    depth: 0.012,
    bevelEnabled: false,
    curveSegments: 3,
  }).translate(0, 0, -0.006);
}
export function createWorkerTrowelBlade() {
  const s = new THREE.Shape();
  s.moveTo(-0.008, 0.0575);
  s.quadraticCurveTo(-0.025, 0.07, -0.023, 0.09);
  s.quadraticCurveTo(-0.017, 0.119, 0, 0.1325);
  s.quadraticCurveTo(0.017, 0.119, 0.023, 0.09);
  s.quadraticCurveTo(0.025, 0.07, 0.008, 0.0575);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, {
    depth: 0.0072,
    bevelEnabled: false,
    curveSegments: 4,
  }).translate(0, 0, -0.0036);
}
export function createWorkerLoafGeometry() {
  const base = Math.cos(Math.PI * 0.7);
  const dome = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.7)
    .translate(0, -base, 0)
    .scale(0.024, 0.04 / (1 - base), 0.065);
  const bottom = new THREE.CircleGeometry(Math.sqrt(1 - base * base), 24)
    .rotateX(Math.PI / 2)
    .scale(0.024, 1, 0.065);
  const g = mergeGeometries([dome, bottom]);
  dome.dispose();
  bottom.dispose();
  if (!g) throw new Error('Worker loaf requires matching closed surfaces');
  const p = g.getAttribute('position'),
    colors = new Float32Array(p.count * 3);
  const crust = new THREE.Color('#bd8547'),
    score = new THREE.Color('#e8c797'),
    c = crust.clone();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const cut =
      Math.max(...[-0.029, 0, 0.029].map((at) => Math.exp(-(((z - at - x * 0.4) / 0.005) ** 2)))) *
      THREE.MathUtils.smoothstep(y, 0.019, 0.034);
    p.setY(i, Math.max(0, y - cut * 0.0012));
    c.copy(crust)
      .multiplyScalar(0.88 + y * 4)
      .lerp(score, cut * 0.65)
      .toArray(colors, i * 3);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

/** Closed, eased fittings built once, in the existing tool-local metres.
 * Working if the paper clamp meets the sheet and no new accessory draw is needed.
 */
export function createWorkerClipboardClip() {
  const parts = [
    new RoundedBoxGeometry(0.04, 0.006, 0.02, 1, 0.002).translate(0, 0.007, 0),
    new RoundedBoxGeometry(0.036, 0.026, 0.004, 1, 0.001).translate(0, -0.011, 0.0015),
    new RoundedBoxGeometry(0.036, 0.01, 0.004, 1, 0.001).translate(0, 0.003, -0.006),
  ];
  const plain = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const geometry = mergeGeometries(plain);
  new Set([...parts, ...plain]).forEach((part) => part.dispose());
  if (!geometry) throw new Error('Clipboard clip requires matching attributes');
  return geometry;
}
export function createWorkerRadioBody() {
  const parts: THREE.BufferGeometry[] = [new RoundedBoxGeometry(0.04, 0.1, 0.025, 1, 0.006)];
  for (const y of [-0.02, -0.012, -0.004])
    parts.push(new THREE.BoxGeometry(0.024, 0.0025, 0.003).translate(0, y, 0.013));
  parts.push(new THREE.CylinderGeometry(0.004, 0.004, 0.012, 8).translate(-0.009, 0.053, 0));
  const plain = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const geometry = mergeGeometries(plain);
  new Set([...parts, ...plain]).forEach((part) => part.dispose());
  if (!geometry) throw new Error('Radio fittings require matching attributes');
  return geometry;
}
/** Real inner wall/base, with the unchanged .07m height and .012m outer radius.
 * Working if the centre ray reaches the recessed base and caps still meet the lip.
 */
export function createWorkerSampleVial() {
  return new THREE.LatheGeometry(
    [
      [0, -0.035],
      [0.01, -0.035],
      [0.012, -0.032],
      [0.012, 0.033],
      [0.011, 0.035],
      [0.009, 0.035],
      [0.009, -0.028],
      [0, -0.028],
    ].map((p) => new THREE.Vector2(...p)),
    12
  );
}
export function createWorkerSampleScoop() {
  const section = new THREE.Shape();
  section.moveTo(-0.0125, 0.005);
  section.lineTo(-0.0125, -0.001);
  section.quadraticCurveTo(-0.0125, -0.005, -0.007, -0.005);
  section.lineTo(0.007, -0.005);
  section.quadraticCurveTo(0.0125, -0.005, 0.0125, -0.001);
  section.lineTo(0.0125, 0.005);
  section.lineTo(0.009, 0.005);
  section.lineTo(0.009, -0.001);
  section.lineTo(-0.009, -0.001);
  section.lineTo(-0.009, 0.005);
  section.closePath();
  const parts = [
    new THREE.ExtrudeGeometry(section, { depth: 0.04, bevelEnabled: false, curveSegments: 3 })
      .rotateX(Math.PI / 2)
      .translate(0, 0.045, 0),
    new RoundedBoxGeometry(0.009, 0.052, 0.006, 1, 0.002).translate(0, -0.019, -0.001),
    new THREE.BoxGeometry(0.025, 0.004, 0.01).translate(0, 0.005, 0),
  ];
  const plain = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  const geometry = mergeGeometries(plain);
  new Set([...parts, ...plain]).forEach((part) => part.dispose());
  if (!geometry) throw new Error('Sample scoop requires matching attributes');
  return geometry;
}

// === SHARED TOOL GEOMETRIES (module-level cache) ===
// These geometries are created once and shared across all workers to reduce memory and creation overhead
export const WORKER_TOOL_GEOMETRIES = {
  clipboard: {
    board: new RoundedBoxGeometry(0.12, 0.16, 0.015, 1, 0.003),
    clip: createWorkerClipboardClip(),
    paper: new THREE.BoxGeometry(0.1, 0.12, 0.002),
    line: new THREE.BoxGeometry(0.07, 0.008, 0.001),
  },
  tablet: {
    body: new RoundedBoxGeometry(0.1, 0.14, 0.01, 1, 0.004),
    screen: new RoundedBoxGeometry(0.085, 0.12, 0.002, 1, 0.0008),
    indicator: new THREE.BoxGeometry(0.06, 0.002, 0.001),
  },
  radio: {
    body: createWorkerRadioBody(),
    antenna: new THREE.CylinderGeometry(0.004, 0.003, 0.06, 8),
    led: new THREE.SphereGeometry(0.004, 8, 8),
  },
  wrench: {
    handle: new RoundedBoxGeometry(0.025, 0.14, 0.012, 1, 0.001),
    head: createWorkerWrenchHead(),
    grip: new THREE.BoxGeometry(0.027, 0.05, 0.004),
  },
  trowel: { blade: createWorkerTrowelBlade() },
  bread: { loaf: createWorkerLoafGeometry() },
  magnifier: {
    handle: new THREE.CylinderGeometry(0.012, 0.015, 0.08, 12),
    ring: new THREE.TorusGeometry(0.035, 0.006, 8, 24),
    lens: new THREE.CircleGeometry(0.032, 24),
  },
  sampleKit: {
    tray: new RoundedBoxGeometry(0.16, 0.025, 0.1, 1, 0.004),
    vial: createWorkerSampleVial(),
    cap: new THREE.LatheGeometry(
      [
        [0, -0.006],
        [0.012, -0.006],
        [0.014, -0.003],
        [0.014, 0.004],
        [0.012, 0.006],
        [0, 0.006],
      ].map((p) => new THREE.Vector2(...p)),
      10
    ),
    scoop: createWorkerSampleScoop(),
  },
};

/** A real panel edge or tray underside, fitted to the same measured palm used
 * by the existing work overlay. All values are wrist-local, cached by the owner.
 * Working if tool support stays within 8mm of the palm with no per-frame search.
 */
export function createWorkerHandheldMount(model: THREE.Object3D, tool: ToolType) {
  if (!isWorkerHandheldTool(tool)) return null;
  const palm = workerPalmInWrist(model);
  if (!palm) return null;
  const geometry =
    tool === 'clipboard'
      ? WORKER_TOOL_GEOMETRIES.clipboard.board
      : tool === 'tablet'
        ? WORKER_TOOL_GEOMETRIES.tablet.body
        : WORKER_TOOL_GEOMETRIES.sampleKit.tray;
  geometry.computeBoundingBox();
  const support =
    tool === 'sample-kit'
      ? new THREE.Vector3(0, geometry.boundingBox!.min.y, 0)
      : new THREE.Vector3(geometry.boundingBox!.min.x + 0.012, -0.035, 0);
  const rotation: THREE.EulerTuple = [
    tool === 'sample-kit' ? -Math.PI / 2 : -0.7,
    tool === 'sample-kit' ? 0 : Math.PI,
    0,
  ];
  const offset = support.multiplyScalar(0.88).applyEuler(new THREE.Euler(...rotation));
  const position = palm
    .add(new THREE.Vector3(0, 0, -0.008))
    .sub(offset)
    .toArray();
  return { position, rotation, scale: [0.88, 0.88, 0.88] as THREE.Vector3Tuple };
}

const Clipboard: React.FC = React.memo(() => (
  <group name="held-clipboard-assembly">
    <mesh
      geometry={WORKER_TOOL_GEOMETRIES.clipboard.board}
      material={SHARED_WORKER_MATERIALS.clipboardBrown}
    />
    <mesh
      position={[0, 0.07, 0.01]}
      geometry={WORKER_TOOL_GEOMETRIES.clipboard.clip}
      material={SHARED_WORKER_MATERIALS.chrome}
    />
    <mesh
      position={[0, -0.01, 0.0085]}
      geometry={WORKER_TOOL_GEOMETRIES.clipboard.paper}
      material={SHARED_WORKER_MATERIALS.white}
    />
    {[-0.03, 0, 0.03].map((y, i) => (
      <mesh
        key={i}
        position={[0, y, 0.01]}
        geometry={WORKER_TOOL_GEOMETRIES.clipboard.line}
        material={SHARED_WORKER_MATERIALS.mediumGray}
      />
    ))}
  </group>
));
Clipboard.displayName = 'Clipboard';

const Tablet: React.FC = React.memo(() => (
  <group name="held-tablet-assembly">
    <mesh
      geometry={WORKER_TOOL_GEOMETRIES.tablet.body}
      material={SHARED_WORKER_MATERIALS.darkGray}
    />
    <mesh
      position={[0, 0, 0.006]}
      geometry={WORKER_TOOL_GEOMETRIES.tablet.screen}
      material={SHARED_WORKER_MATERIALS.screenBlue}
    />
    <mesh
      position={[0, 0.02, 0.008]}
      geometry={WORKER_TOOL_GEOMETRIES.tablet.indicator}
      material={SHARED_WORKER_MATERIALS.safetyGreen}
    />
  </group>
));
Tablet.displayName = 'Tablet';

const RadioWalkieTalkie: React.FC = React.memo(() => (
  <group position={[0.04, 0, 0.03]} rotation={[0.2, 0.3, 0]}>
    <mesh
      geometry={WORKER_TOOL_GEOMETRIES.radio.body}
      material={SHARED_WORKER_MATERIALS.darkGray}
    />
    <mesh
      position={[0.01, 0.07, 0]}
      geometry={WORKER_TOOL_GEOMETRIES.radio.antenna}
      material={SHARED_WORKER_MATERIALS.mediumGray}
    />
    <mesh
      position={[0, 0.04, 0.014]}
      geometry={WORKER_TOOL_GEOMETRIES.radio.led}
      material={SHARED_WORKER_MATERIALS.safetyGreenBright}
    />
  </group>
));
RadioWalkieTalkie.displayName = 'RadioWalkieTalkie';

const Wrench: React.FC = React.memo(() => (
  <group position={[0.02, -0.04, 0.02]} rotation={[0, 0.5, -0.3]}>
    <mesh
      geometry={WORKER_TOOL_GEOMETRIES.wrench.handle}
      material={SHARED_WORKER_MATERIALS.chromeShiny}
    />
    <mesh
      position={[0, 0.08, 0]}
      geometry={WORKER_TOOL_GEOMETRIES.wrench.head}
      material={SHARED_WORKER_MATERIALS.chromeShiny}
    />
    <mesh
      position={[0, -0.03, 0.007]}
      geometry={WORKER_TOOL_GEOMETRIES.wrench.grip}
      material={SHARED_WORKER_MATERIALS.handleRed}
    />
  </group>
));
Wrench.displayName = 'Wrench';

const Magnifier: React.FC = React.memo(() => (
  <group position={[0.05, 0, 0.04]} rotation={[0.3, 0.2, 0]}>
    <mesh
      geometry={WORKER_TOOL_GEOMETRIES.magnifier.handle}
      material={SHARED_WORKER_MATERIALS.darkGray}
    />
    <mesh
      castShadow
      position={[0, 0.06, 0]}
      rotation={[Math.PI / 2, 0, 0]}
      geometry={WORKER_TOOL_GEOMETRIES.magnifier.ring}
      material={SHARED_WORKER_MATERIALS.chrome}
    />
    <mesh
      position={[0, 0.06, 0]}
      rotation={[Math.PI / 2, 0, 0]}
      geometry={WORKER_TOOL_GEOMETRIES.magnifier.lens}
      material={SHARED_WORKER_MATERIALS.lensBlue}
    />
  </group>
));
Magnifier.displayName = 'Magnifier';

const SampleKit: React.FC = React.memo(() => (
  <group name="held-sample-kit-assembly">
    <mesh
      geometry={WORKER_TOOL_GEOMETRIES.sampleKit.tray}
      material={SHARED_WORKER_MATERIALS.offWhite}
    />
    {[-0.045, 0, 0.045].map((x) => (
      <group key={x} position={[x, 0.045, 0]}>
        <mesh
          geometry={WORKER_TOOL_GEOMETRIES.sampleKit.vial}
          material={SHARED_WORKER_MATERIALS.sampleGlass}
        />
        <mesh
          position={[0, 0.041, 0]}
          geometry={WORKER_TOOL_GEOMETRIES.sampleKit.cap}
          material={SHARED_WORKER_MATERIALS.sampleCap}
        />
      </group>
    ))}
    <mesh
      position={[0.07, 0.04, 0]}
      rotation={[0, 0, -0.35]}
      geometry={WORKER_TOOL_GEOMETRIES.sampleKit.scoop}
      material={SHARED_WORKER_MATERIALS.chrome}
    />
  </group>
));
SampleKit.displayName = 'SampleKit';

const Trowel: React.FC = () => (
  <group rotation={[Math.atan2(0.6, -0.8), 0, 0]}>
    <mesh
      geometry={WORKER_TOOL_GEOMETRIES.wrench.handle}
      material={SHARED_WORKER_MATERIALS.clipboardBrown}
    />
    <mesh
      geometry={WORKER_TOOL_GEOMETRIES.trowel.blade}
      material={SHARED_WORKER_MATERIALS.chrome}
    />
  </group>
);
const breadMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
const BreadTray: React.FC = () => (
  <group>
    <mesh
      geometry={WORKER_TOOL_GEOMETRIES.sampleKit.tray}
      material={SHARED_WORKER_MATERIALS.clipboardBrown}
      scale={[2.375, 1, 2.4]}
    />
    {[-0.07, 0, 0.07].map((x) => (
      <mesh
        key={x}
        position={[x, 0.0125, 0]}
        geometry={WORKER_TOOL_GEOMETRIES.bread.loaf}
        material={breadMaterial}
      />
    ))}
  </group>
);

export const ToolAccessory: React.FC<{ tool: ToolType }> = React.memo(({ tool }) => {
  switch (tool) {
    case 'trowel':
      return <Trowel />;
    case 'bread-tray':
      return <BreadTray />;
    case 'clipboard':
      return <Clipboard />;
    case 'tablet':
      return <Tablet />;
    case 'radio':
      return <RadioWalkieTalkie />;
    case 'wrench':
      return <Wrench />;
    case 'magnifier':
      return <Magnifier />;
    case 'sample-kit':
      return <SampleKit />;
    default:
      return null;
  }
});
ToolAccessory.displayName = 'ToolAccessory';
