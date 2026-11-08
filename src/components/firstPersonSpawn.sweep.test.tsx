/**
 * Every place first person can start from lands a body on free ground, in all
 * three controllers: each named camera (the orbit presets copy theirs from
 * `SITE_LAYOUT.cameras`), each machine-focus pose (`App.tsx` flies to
 * `[x + 15, max(9, y + 10), z + 16]`), and a camera hung straight over the
 * middle of every walking solid, so a spawn inside a cottage, the shop or on
 * the fence line has to be moved out. The controllers are the real ones.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import * as THREE from 'three';
import { FirstPersonController } from './FirstPersonController';
import { MobileFirstPersonController } from './mobile/MobileFirstPersonController';
import { PhysicsFirstPersonController } from './physics/PhysicsFirstPersonController';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useUIStore } from '../stores/uiStore';
import { SITE_LAYOUT } from '../constants/siteLayout';
import {
  createConveyorObstacles,
  createMachineObstacles,
  DOCK_PLATFORM_OBSTACLES,
} from '../constants/factoryObstacles';
import {
  isDryWalkingGround,
  isWithinWalkingDomain,
  sampleWalkingGroundHeight,
  walkingBlocks,
} from '../utils/castleNavigation';
import { WALKING_OBSTACLES, walkingObstacleAt } from '../utils/walkingObstacles';
import {
  PERSONNEL_DOORS,
  TOWN_HALL_RAMP_RAILS,
  TOWN_HALL_STEP_FREE_ROUTE,
  townHallToWorld,
} from '../constants/accessibilityLayout';
import { getTerrainGridSegments } from './terrain/terrainTypes';

const h = vi.hoisted(() => ({
  camera: null as unknown as THREE.PerspectiveCamera,
  body: { x: 0, y: 0, z: 0 },
}));
vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ camera: h.camera, gl: { domElement: document.createElement('canvas') } }),
  useFrame: () => {},
}));
vi.mock('@react-three/drei', () => ({ PointerLockControls: () => null }));
vi.mock('@react-three/rapier', async () => {
  const React = await import('react');
  return {
    CapsuleCollider: () => null,
    RigidBody: React.forwardRef(
      ({ position, children }: { position: number[]; children: React.ReactNode }, ref) => {
        React.useLayoutEffect(() => {
          h.body = { x: position[0], y: position[1], z: position[2] };
        }, [position]);
        React.useImperativeHandle(ref, () => ({ translation: () => ({ ...h.body }) }));
        return <>{children}</>;
      }
    ),
  };
});
vi.mock('../utils/critterAudio', () => ({ playCritterSound: vi.fn() }));

const R = 0.4;
const MACHINE_BOXES = [
  ...createMachineObstacles(0),
  ...createConveyorObstacles(),
  ...DOCK_PLATFORM_OBSTACLES,
];

type Spawn = readonly [string, number, number, number];
const SPAWNS: Spawn[] = [
  ...Object.entries(SITE_LAYOUT.cameras).map(
    ([name, pose]) => [`camera ${name}`, ...pose.position] as const
  ),
  ...Object.values(SITE_LAYOUT.machines)
    .flat()
    .map(
      ({ id, position: [x, y, z] }) => [`focus ${id}`, x + 15, Math.max(9, y + 10), z + 16] as const
    ),
  ...WALKING_OBSTACLES.map(
    (o) => [`over ${o.id}`, (o.minX + o.maxX) / 2, 20, (o.minZ + o.maxZ) / 2] as const
  ),
  // The town hall ramp (D-058): over each point of its step-free route, and
  // over the middle of each handrail, where a body has to be moved off.
  ...TOWN_HALL_STEP_FREE_ROUTE.map(([x, y, z], i) => {
    const [wx, , wz] = townHallToWorld(x, y, z);
    return [`town hall route ${i}`, wx, 6, wz] as const;
  }),
  ...TOWN_HALL_RAMP_RAILS.map(({ from, to }, i) => {
    const [wx, , wz] = townHallToWorld((from[0] + to[0]) / 2, 0, (from[1] + to[1]) / 2);
    return [`over town hall ramp rail ${i}`, wx, 6, wz] as const;
  }),
  // The step-free personnel doors beside the docks: their markers and refuges.
  ...PERSONNEL_DOORS.flatMap((door) => [
    [`${door.id} personnel door marker`, door.marker[0], 3, door.marker[1]] as const,
    [`${door.id} personnel door refuge`, door.refuge[0], 3, door.refuge[1]] as const,
  ]),
];

/** Why a body at (x, z) is not standing free, or null. */
function notFree(x: number, z: number, machines: boolean): string | null {
  const segments = getTerrainGridSegments(useGraphicsStore.getState().graphics.quality);
  if (!isWithinWalkingDomain(x, z, R)) return 'outside the walking domain';
  if (!isDryWalkingGround(x, z, segments)) return 'in water';
  const solid = walkingObstacleAt(x, z, R);
  if (solid) return `inside ${solid.id}`;
  if (walkingBlocks(x, z, sampleWalkingGroundHeight(x, z, segments))) return 'walkingBlocks';
  if (machines) {
    const box = MACHINE_BOXES.find(
      (b) => x + R > b.minX && x - R < b.maxX && z + R > b.minZ && z - R < b.maxZ
    );
    if (box) return `inside machine box ${box.id}`;
  }
  return null;
}

beforeEach(() => {
  useGraphicsStore.getState().setGraphicsQuality('medium');
  h.camera = new THREE.PerspectiveCamera();
});
afterEach(() => {
  cleanup();
  useUIStore.getState().setFpsMode(false);
});

describe('first-person spawns land free', () => {
  it('sweeps cameras, machine focus poses and every walking solid', () => {
    expect(SPAWNS.length).toBeGreaterThan(WALKING_OBSTACLES.length);
  });
  for (const [name, x, y, z] of SPAWNS) {
    it(`${name} (${x.toFixed(2)}, ${z.toFixed(2)})`, () => {
      const results: string[] = [];
      for (const [label, Controller] of [
        ['desktop', FirstPersonController],
        ['mobile', MobileFirstPersonController],
      ] as const) {
        h.camera.position.set(x, y, z);
        const { unmount } = render(<Controller />);
        const p = h.camera.position;
        const why = notFree(p.x, p.z, true);
        if (why) results.push(`${label} at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}): ${why}`);
        unmount();
      }
      h.camera.position.set(x, y, z);
      const { unmount } = render(<PhysicsFirstPersonController />);
      // Rapier keeps machines out with its own colliders; the shared walking
      // checks are what its spawn search applies.
      const why = notFree(h.body.x, h.body.z, false);
      if (why) results.push(`physics at (${h.body.x.toFixed(2)}, ${h.body.z.toFixed(2)}): ${why}`);
      unmount();
      expect(results).toEqual([]);
    });
  }
});
