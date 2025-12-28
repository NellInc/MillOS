/**
 * Worker tool accessory components
 */

import React from 'react';
import * as THREE from 'three';
import { SHARED_WORKER_MATERIALS } from './SharedWorkerMaterials';
import type { ToolType } from './workerTypes';

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
    handle: new THREE.BoxGeometry(0.025, 0.14, 0.012),
    head: new THREE.BoxGeometry(0.05, 0.03, 0.012),
    grip: new THREE.BoxGeometry(0.027, 0.05, 0.004),
  },
  magnifier: {
    handle: new THREE.CylinderGeometry(0.012, 0.015, 0.08, 12),
    ring: new THREE.TorusGeometry(0.035, 0.006, 8, 24),
    lens: new THREE.CircleGeometry(0.032, 24),
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

export const ToolAccessory: React.FC<{ tool: ToolType }> = React.memo(({ tool }) => {
  switch (tool) {
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
    default:
      return null;
  }
});
ToolAccessory.displayName = 'ToolAccessory';
