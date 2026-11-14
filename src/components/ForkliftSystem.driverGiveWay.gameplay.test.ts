import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  frames: [] as Array<(state: unknown, delta: number) => void>,
  participants: new Map<string, { capture: () => any; restore: (state: any) => void }>(),
}));

// The live component with deterministic hooks, as ForkliftSystem.speedZone
// drives it: refs own real Three groups and frames run on demand.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const three = await import('three');
  const hooks = {
    useRef: (value: unknown) => ({ current: value === null ? new three.Group() : value }),
    useState: (value: unknown) => [typeof value === 'function' ? value() : value, vi.fn()],
    useMemo: (factory: () => unknown) => factory(),
    useCallback: (callback: unknown) => callback,
    useEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
    useLayoutEffect: (effect: () => void | (() => void)) => harness.effects.push(effect),
    useId: () => 'driver-give-way-test',
    useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
    useDebugValue: () => undefined,
  };
  return { ...actual, ...hooks, default: { ...actual.default, ...hooks } };
});
vi.mock('zustand', async (importOriginal) => {
  const actual = await importOriginal<typeof import('zustand')>();
  const build = (initializer: Parameters<typeof actual.createStore>[0]) => {
    const store = actual.createStore(initializer);
    return Object.assign(
      (selector: (state: unknown) => unknown = (state) => state) => selector(store.getState()),
      store
    );
  };
  return {
    ...actual,
    create: (initializer?: Parameters<typeof actual.createStore>[0]) =>
      initializer ? build(initializer) : build,
  };
});
vi.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('zustand/react/shallow', () => ({ useShallow: (selector: unknown) => selector }));
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  useFrame: (frame: (typeof harness.frames)[number]) => harness.frames.push(frame),
}));
vi.mock('../simulation/workplaceReplayRuntime', () => ({
  isWorkplaceReplayRestoring: () => false,
  isWorkplaceReplayActive: () => false,
  registerReplayParticipant: (
    id: string,
    participant: typeof harness.participants extends Map<string, infer T> ? T : never
  ) => {
    harness.participants.set(id, participant);
    return () => {
      harness.participants.delete(id);
    };
  },
}));

import { ForkliftSystem } from './ForkliftSystem';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { STANDARD_GAME_SPEED } from '../simulation/pace';
import { audioManager } from '../utils/audioManager';
import { useSafetyStore } from '../stores/safetyStore';
import {
  useLogisticsLayoutStore,
  defaultSavedLogisticsLayout,
} from '../stores/logisticsLayoutStore';
import {
  manualForkliftInput,
  resetManualForkliftInput,
  useForkliftDriveStore,
} from '../stores/forkliftDriveStore';
import { resetForkliftCargoStations } from '../stores/forkliftCargoStore';

const camera = new THREE.PerspectiveCamera();
// One scene for the file: ForkliftSystem caches the personnel group it finds.
const scene = new THREE.Scene();
const personnel = new THREE.Group();
personnel.name = 'world-personnel';
scene.add(personnel);
let clockTicks = 0;
const frameState = { camera, scene, clock: { elapsedTime: 0 } };

const runFrames = (count: number, each?: () => void) => {
  for (let step = 0; step < count; step++) {
    clockTicks += 1;
    frameState.clock.elapsedTime = clockTicks / 30;
    for (const frame of harness.frames) frame(frameState, 1 / 30);
    each?.();
  }
};

const addPerson = (x: number, z: number) => {
  const person = new THREE.Object3D();
  person.position.set(x, 0, z);
  personnel.add(person);
  return person;
};

const initialSafety = useSafetyStore.getInitialState();

beforeEach(() => {
  useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
  resetForkliftCargoStations();
  harness.frames.length = 0;
  harness.effects.length = 0;
  harness.participants.clear();
  personnel.clear();
  useProductionStore.setState({ productionSpeed: 1 });
  useGameSimulationStore.setState({
    gameSpeed: STANDARD_GAME_SPEED,
    isTabVisible: true,
    emergencyActive: false,
    emergencyDrillMode: false,
  });
  useSafetyStore.setState(initialSafety, true);
  vi.spyOn(audioManager, 'playHorn').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const cleanup of harness.cleanups.splice(0)) cleanup();
  useForkliftDriveStore.setState({ drivenId: null });
  resetManualForkliftInput();
  personnel.clear();
  useSafetyStore.setState(initialSafety, true);
  vi.restoreAllMocks();
});

/**
 * Mounts the fleet and boards forklift-2, optionally first standing it at
 * `pose` (x, z, heading). Returns its replay participant.
 */
function boardForklift2(pose?: { x: number; z: number; heading: number }) {
  const tree = ForkliftSystem({}) as React.ReactElement<{ children: any[] }>;
  for (const element of tree.props.children[1]) element.type(element.props);
  for (const effect of harness.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) harness.cleanups.push(cleanup);
  }
  const participant = harness.participants.get('forklift:forklift-2')!;
  const snapshot = structuredClone(participant.capture());
  if (pose) snapshot.transform = { position: [pose.x, 0, pose.z], rotation: [0, pose.heading, 0] };
  participant.restore(snapshot);
  useForkliftDriveStore.setState({ drivenId: 'forklift-2' });
  runFrames(1);
  return participant;
}

const poseOf = (participant: { capture: () => any }) => {
  const { transform, motionStateRef } = participant.capture();
  return {
    x: transform.position[0] as number,
    z: transform.position[2] as number,
    heading: transform.rotation[1] as number,
    speed: motionStateRef.speed as number,
    stopReason: motionStateRef.stopReason as string,
  };
};

/** Top speed under full throttle for `frames` frames. */
const topSpeed = (participant: { capture: () => any }, frames: number, throttle = 1) => {
  manualForkliftInput.throttle = throttle;
  let top = 0;
  runFrames(frames, () => {
    top = Math.max(top, Math.abs(participant.capture().motionStateRef.speed));
  });
  return top;
};

const nearMisses = () =>
  useSafetyStore.getState().safetyIncidents.filter((incident) => incident.type === 'near_miss');

// A forklift under the player's control drove through people: only the
// autopilot gave way. Working if the driven forklift slows within 6 m of
// someone on foot ahead and stops within 3.5 m, as the autopilot does.
/** The x -35 leg of the receiving route, heading south: clear of every solid. */
const WEST_LEG = { x: -35, z: -22.5, heading: Math.PI };

describe('a driven forklift gives way to people on foot', () => {
  it('drives off with nobody ahead (control)', () => {
    const participant = boardForklift2(WEST_LEG);
    expect(topSpeed(participant, 90)).toBeGreaterThan(1.4);
  });

  it('does not move toward someone standing 3 m ahead, and says why', () => {
    const participant = boardForklift2(WEST_LEG);
    const start = poseOf(participant);
    addPerson(start.x + Math.sin(start.heading) * 3, start.z + Math.cos(start.heading) * 3);
    expect(topSpeed(participant, 90)).toBe(0);
    const after = poseOf(participant);
    expect(Math.hypot(after.x - start.x, after.z - start.z)).toBeLessThan(1e-6);
    expect(after.stopReason).toBe('pedestrian-yield');
  });

  it('creeps no faster than the slow speed toward someone 5.5 m ahead', () => {
    const participant = boardForklift2(WEST_LEG);
    const start = poseOf(participant);
    addPerson(start.x + Math.sin(start.heading) * 5.5, start.z + Math.cos(start.heading) * 5.5);
    const top = topSpeed(participant, 60);
    expect(top).toBeGreaterThan(0.2);
    expect(top).toBeLessThanOrEqual(1 + 1e-6);
  });

  it('can still back away from someone standing ahead', () => {
    const participant = boardForklift2(WEST_LEG);
    const start = poseOf(participant);
    addPerson(start.x + Math.sin(start.heading) * 3, start.z + Math.cos(start.heading) * 3);
    expect(topSpeed(participant, 60, -1)).toBeGreaterThan(0.3);
  });

  it('logs one near miss, where it happened, when the driver closes on someone at speed', () => {
    // No speed zone here: the default west zones would slow the driver.
    useSafetyStore.setState({ speedZones: [] });
    const participant = boardForklift2(WEST_LEG);
    const start = poseOf(participant);
    const person = addPerson(
      start.x + Math.sin(start.heading) * 14,
      start.z + Math.cos(start.heading) * 14
    );
    topSpeed(participant, 240);
    const logged = nearMisses();
    expect(logged).toHaveLength(1);
    expect(logged[0].forkliftId).toBe('forklift-2');
    const at = logged[0].location!;
    expect(Math.hypot(at.x - person.position.x, at.z - person.position.z)).toBeLessThan(6);
    expect(
      useSafetyStore.getState().incidentHeatMap.some((cell) => cell.type === 'near_miss')
    ).toBe(true);
    // The log and the heat map, not the score (F9b is still open).
    expect(useSafetyStore.getState().safetyMetrics.nearMisses).toBe(0);
    // It stopped short of them.
    const end = poseOf(participant);
    expect(Math.hypot(end.x - person.position.x, end.z - person.position.z)).toBeGreaterThan(2);
  });
});

/** A seeded uniform generator (mulberry32), local to this test. */
const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// Speed zones capped a forklift and nothing else: no zone changed whether
// anyone was put at risk. Working if, with the driver giving way, the west
// walkway zone at the default rate turns closings at speed into slow ones.
describe('the west walkway speed zone prevents near misses', () => {
  const WALKWAY = { id: 'zone-west-walkway', x: -35, z: -34, radius: 5, name: 'West Walkway' };

  /** Near misses over seeded runs south down the x -35 leg, through the walkway. */
  const runs = (zoned: boolean, seed: number) => {
    const random = seeded(seed);
    let total = 0;
    for (let run = 0; run < 3; run++) {
      for (const cleanup of harness.cleanups.splice(0)) cleanup();
      harness.frames.length = 0;
      harness.participants.clear();
      useForkliftDriveStore.setState({ drivenId: null });
      resetManualForkliftInput();
      personnel.clear();
      useSafetyStore.setState(initialSafety, true);
      useSafetyStore.setState((state) => ({
        speedZones: zoned ? [WALKWAY] : [],
        safetyConfig: { ...state.safetyConfig, speedZoneSlowdown: 0.5 },
      }));
      // Someone on the walkway, somewhere along the leg inside the zone.
      addPerson(-35 + (random() - 0.5) * 0.8, -35.5 - random() * 1.5);
      const participant = boardForklift2(WEST_LEG);
      topSpeed(participant, 300);
      total += nearMisses().length;
    }
    return total;
  };

  it('closes at speed without the zone and not with it, on the same seeded runs', () => {
    for (const seed of [7, 11]) {
      const without = runs(false, seed);
      const withZone = runs(true, seed);
      expect(without).toBeGreaterThan(0);
      expect(withZone).toBeLessThan(without);
      expect(withZone).toBe(0);
    }
  });
});
