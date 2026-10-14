/**
 * Worker tool accessory components
 */

import React from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHARED_WORKER_MATERIALS } from './SharedWorkerMaterials';
import type { ToolType } from './workerTypes';

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

// === SHARED TOOL GEOMETRIES (module-level cache) ===
// These geometries are created once and shared across all workers to reduce memory and creation overhead
const sharedToolGeometries = {
  clipboard: {
    board: new THREE.BoxGeometry(0.12, 0.16, 0.015),
    clip: new THREE.BoxGeometry(0.04, 0.02, 0.02),
    paper: new THREE.BoxGeometry(0.1, 0.12, 0.002),
    line: new THREE.BoxGeometry(0.07, 0.008, 0.001),
  },
  tablet: {
    body: new THREE.BoxGeometry(0.1, 0.14, 0.01),
    screen: new THREE.BoxGeometry(0.085, 0.12, 0.002),
    indicator: new THREE.BoxGeometry(0.06, 0.002, 0.001),
  },
  radio: {
    body: new THREE.BoxGeometry(0.04, 0.1, 0.025),
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
    tray: new THREE.BoxGeometry(0.16, 0.025, 0.1),
    vial: new THREE.CylinderGeometry(0.012, 0.012, 0.07, 10),
    cap: new THREE.CylinderGeometry(0.014, 0.014, 0.012, 10),
    scoop: new THREE.BoxGeometry(0.025, 0.09, 0.01),
  },
};

const Clipboard: React.FC = React.memo(() => (
  <group position={[0.08, -0.02, 0.04]} rotation={[0.3, 0, 0.1]}>
    <mesh
      geometry={sharedToolGeometries.clipboard.board}
      material={SHARED_WORKER_MATERIALS.clipboardBrown}
    />
    <mesh
      position={[0, 0.07, 0.01]}
      geometry={sharedToolGeometries.clipboard.clip}
      material={SHARED_WORKER_MATERIALS.chrome}
    />
    <mesh
      position={[0, -0.01, 0.01]}
      geometry={sharedToolGeometries.clipboard.paper}
      material={SHARED_WORKER_MATERIALS.white}
    />
    {[-0.03, 0, 0.03].map((y, i) => (
      <mesh
        key={i}
        position={[0, y, 0.012]}
        geometry={sharedToolGeometries.clipboard.line}
        material={SHARED_WORKER_MATERIALS.mediumGray}
      />
    ))}
  </group>
));
Clipboard.displayName = 'Clipboard';

const Tablet: React.FC = React.memo(() => (
  <group position={[0.06, -0.02, 0.04]} rotation={[0.4, 0, 0.15]}>
    <mesh geometry={sharedToolGeometries.tablet.body} material={SHARED_WORKER_MATERIALS.darkGray} />
    <mesh
      position={[0, 0, 0.006]}
      geometry={sharedToolGeometries.tablet.screen}
      material={SHARED_WORKER_MATERIALS.screenBlue}
    />
    <mesh
      position={[0, 0.02, 0.008]}
      geometry={sharedToolGeometries.tablet.indicator}
      material={SHARED_WORKER_MATERIALS.safetyGreen}
    />
  </group>
));
Tablet.displayName = 'Tablet';

const RadioWalkieTalkie: React.FC = React.memo(() => (
  <group position={[0.04, 0, 0.03]} rotation={[0.2, 0.3, 0]}>
    <mesh geometry={sharedToolGeometries.radio.body} material={SHARED_WORKER_MATERIALS.darkGray} />
    <mesh
      position={[0.01, 0.07, 0]}
      geometry={sharedToolGeometries.radio.antenna}
      material={SHARED_WORKER_MATERIALS.mediumGray}
    />
    <mesh
      position={[0, 0.04, 0.014]}
      geometry={sharedToolGeometries.radio.led}
      material={SHARED_WORKER_MATERIALS.safetyGreenBright}
    />
  </group>
));
RadioWalkieTalkie.displayName = 'RadioWalkieTalkie';

const Wrench: React.FC = React.memo(() => (
  <group position={[0.02, -0.04, 0.02]} rotation={[0, 0.5, -0.3]}>
    <mesh
      geometry={sharedToolGeometries.wrench.handle}
      material={SHARED_WORKER_MATERIALS.chromeShiny}
    />
    <mesh
      position={[0, 0.08, 0]}
      geometry={sharedToolGeometries.wrench.head}
      material={SHARED_WORKER_MATERIALS.chromeShiny}
    />
    <mesh
      position={[0, -0.03, 0.007]}
      geometry={sharedToolGeometries.wrench.grip}
      material={SHARED_WORKER_MATERIALS.handleRed}
    />
  </group>
));
Wrench.displayName = 'Wrench';

const Magnifier: React.FC = React.memo(() => (
  <group position={[0.05, 0, 0.04]} rotation={[0.3, 0.2, 0]}>
    <mesh
      geometry={sharedToolGeometries.magnifier.handle}
      material={SHARED_WORKER_MATERIALS.darkGray}
    />
    <mesh
      castShadow
      position={[0, 0.06, 0]}
      rotation={[Math.PI / 2, 0, 0]}
      geometry={sharedToolGeometries.magnifier.ring}
      material={SHARED_WORKER_MATERIALS.chrome}
    />
    <mesh
      position={[0, 0.06, 0]}
      rotation={[Math.PI / 2, 0, 0]}
      geometry={sharedToolGeometries.magnifier.lens}
      material={SHARED_WORKER_MATERIALS.lensBlue}
    />
  </group>
));
Magnifier.displayName = 'Magnifier';

const SampleKit: React.FC = React.memo(() => (
  <group position={[0.07, -0.02, 0.05]} rotation={[0.22, 0.1, 0.08]}>
    <mesh
      geometry={sharedToolGeometries.sampleKit.tray}
      material={SHARED_WORKER_MATERIALS.offWhite}
    />
    {[-0.045, 0, 0.045].map((x) => (
      <group key={x} position={[x, 0.045, 0]}>
        <mesh
          geometry={sharedToolGeometries.sampleKit.vial}
          material={SHARED_WORKER_MATERIALS.sampleGlass}
        />
        <mesh
          position={[0, 0.041, 0]}
          geometry={sharedToolGeometries.sampleKit.cap}
          material={SHARED_WORKER_MATERIALS.sampleCap}
        />
      </group>
    ))}
    <mesh
      position={[0.07, 0.04, 0]}
      rotation={[0, 0, -0.35]}
      geometry={sharedToolGeometries.sampleKit.scoop}
      material={SHARED_WORKER_MATERIALS.chrome}
    />
  </group>
));
SampleKit.displayName = 'SampleKit';

const Trowel: React.FC = () => (
  <group rotation={[Math.atan2(0.6, -0.8), 0, 0]}>
    <mesh
      geometry={sharedToolGeometries.wrench.handle}
      material={SHARED_WORKER_MATERIALS.clipboardBrown}
    />
    <mesh geometry={sharedToolGeometries.trowel.blade} material={SHARED_WORKER_MATERIALS.chrome} />
  </group>
);
const breadMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
const BreadTray: React.FC = () => (
  <group>
    <mesh
      geometry={sharedToolGeometries.sampleKit.tray}
      material={SHARED_WORKER_MATERIALS.clipboardBrown}
      scale={[2.375, 1, 2.4]}
    />
    {[-0.07, 0, 0.07].map((x) => (
      <mesh
        key={x}
        position={[x, 0.0125, 0]}
        geometry={sharedToolGeometries.bread.loaf}
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
