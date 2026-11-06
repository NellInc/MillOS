import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  frames: [] as Array<(state: { camera: THREE.PerspectiveCamera }, delta: number) => void>,
  participants: new Map<string, { capture: () => any; restore: (state: any) => void }>(),
}));

// The live component functions with deterministic hooks, as vehicleReplay.test.ts
// drives them: refs own real Three groups and frames run on demand.
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
    useId: () => 'speed-zone-test',
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
import { SPEED_ZONE_MIN_SPEED, speedZoneLimit, useSafetyStore } from '../stores/safetyStore';
import {
  useLogisticsLayoutStore,
  defaultSavedLogisticsLayout,
} from '../stores/logisticsLayoutStore';
import {
  manualForkliftInput,
  resetManualForkliftInput,
  useForkliftDriveStore,
} from '../stores/forkliftDriveStore';

const camera = new THREE.PerspectiveCamera();
const defaultZones = useSafetyStore.getState().speedZones;

beforeEach(() => {
  useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
  harness.frames.length = 0;
  harness.effects.length = 0;
  harness.participants.clear();
  useProductionStore.setState({ productionSpeed: 1 });
  useGameSimulationStore.setState({
    gameSpeed: STANDARD_GAME_SPEED,
    isTabVisible: true,
    emergencyActive: false,
    emergencyDrillMode: false,
  });
  vi.spyOn(audioManager, 'playHorn').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const cleanup of harness.cleanups.splice(0)) cleanup();
  useForkliftDriveStore.setState({ drivenId: null });
  resetManualForkliftInput();
  useSafetyStore.setState((state) => ({
    speedZones: defaultZones,
    safetyConfig: { ...state.safetyConfig, speedZoneSlowdown: 0.5 },
  }));
  vi.restoreAllMocks();
});

/**
 * The receiving route's west legs (x -35 and -28, z -22 to -42), outside the
 * receiving-dock crossing, whose own 1.2 m/s limit covers the whole shipping
 * route and the rest of this one.
 */
const WEST = { x: -31, z: -32, radius: 13 };

/**
 * Mounts forklift-2 loaded, so it travels its route, and returns its top speed
 * while well inside WEST over a run.
 */
function topSpeedOverRun(): { top: number; travelled: number } {
  const tree = ForkliftSystem({}) as React.ReactElement<{ children: any[] }>;
  for (const element of tree.props.children[1]) element.type(element.props);
  for (const effect of harness.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) harness.cleanups.push(cleanup);
  }
  const participant = harness.participants.get('forklift:forklift-2')!;
  const loaded = structuredClone(participant.capture());
  loaded.hasCargoRef = true;
  participant.restore(loaded);
  const startTravel = participant.capture().motionStateRef.wheelTravel;
  let top = 0;
  for (let step = 0; step < 900; step++) {
    for (const frame of harness.frames) frame({ camera }, 1 / 30);
    const motion = participant.capture().motionStateRef;
    if (Math.hypot(motion.x - WEST.x, motion.z - WEST.z) < WEST.radius - 1)
      top = Math.max(top, motion.speed);
  }
  return { top, travelled: participant.capture().motionStateRef.wheelTravel - startTravel };
}

describe('speed zones cap the forklifts inside them', () => {
  it('a forklift outside every zone runs well above the zone rate (control)', () => {
    useSafetyStore.setState((state) => ({
      speedZones: [],
      safetyConfig: { ...state.safetyConfig, speedZoneSlowdown: 0.3 },
    }));
    expect(topSpeedOverRun().top).toBeGreaterThan(3 * 0.3 + 0.5);
  });

  it('a forklift inside a zone holds the zone rate of its speed and keeps working', () => {
    // One zone over the receiving route's west legs.
    useSafetyStore.setState((state) => ({
      speedZones: [{ id: 'zone-west', ...WEST, name: 'West' }],
      safetyConfig: { ...state.safetyConfig, speedZoneSlowdown: 0.3 },
    }));
    const { top, travelled } = topSpeedOverRun();
    expect(top).toBeLessThanOrEqual(3 * 0.3 + 0.05);
    // A ceiling, not a stop: it still travels its route.
    expect(top).toBeGreaterThan(0.5);
    expect(travelled).toBeGreaterThan(10);
  });
});

// The six old defaults lay off every forklift route, so the Speed Zone Rate
// slider changed nothing until the player drew a zone. Working if, with the
// store's own defaults, the slider changes how far a forklift gets.
describe('the default speed zones lie where forklifts meet people', () => {
  it('the Speed Zone Rate slider changes a forklift at the default zones', () => {
    const travelledAt = (rate: number) => {
      useSafetyStore.setState((state) => ({
        speedZones: defaultZones,
        safetyConfig: { ...state.safetyConfig, speedZoneSlowdown: rate },
      }));
      const { travelled } = topSpeedOverRun();
      for (const cleanup of harness.cleanups.splice(0)) cleanup();
      harness.frames.length = 0;
      harness.participants.clear();
      return travelled;
    };
    const free = travelledAt(1);
    const slowed = travelledAt(0.3);
    expect(slowed).toBeLessThan(free - 2);
    // Still a ceiling: the slowed forklift keeps working its route.
    expect(slowed).toBeGreaterThan(10);
  });

  it('every default zone has a finite centre and a positive radius', () => {
    expect(defaultZones.length).toBeGreaterThan(0);
    for (const zone of defaultZones) {
      expect(Number.isFinite(zone.x) && Number.isFinite(zone.z)).toBe(true);
      expect(zone.radius).toBeGreaterThan(0);
    }
  });
});

// A forklift the player boarded (F) drove at its full speed through any zone:
// only the autopilot read the cap. Working if the driven forklift holds the
// same zone rate of its speed.
describe('a driven forklift obeys the speed zone it is in', () => {
  /** Boards forklift-2 where it stands, full throttle ahead, and returns its top speed. */
  const drivenTopSpeed = (zoned: boolean) => {
    const tree = ForkliftSystem({}) as React.ReactElement<{ children: any[] }>;
    for (const element of tree.props.children[1]) element.type(element.props);
    for (const effect of harness.effects.splice(0)) {
      const cleanup = effect();
      if (cleanup) harness.cleanups.push(cleanup);
    }
    useSafetyStore.setState((state) => ({
      speedZones: [],
      safetyConfig: { ...state.safetyConfig, speedZoneSlowdown: 0.3 },
    }));
    // A restore clears the harness's placeholder refs (as topSpeedOverRun's
    // does); then the autopilot places it on its route.
    const participant = harness.participants.get('forklift:forklift-2')!;
    participant.restore(structuredClone(participant.capture()));
    for (let step = 0; step < 30; step++)
      for (const frame of harness.frames) frame({ camera }, 1 / 30);
    const start = participant.capture().motionStateRef;
    if (zoned)
      useSafetyStore.setState({
        speedZones: [{ id: 'zone-around', x: start.x, z: start.z, radius: 60, name: 'Around' }],
      });
    useForkliftDriveStore.setState({ drivenId: 'forklift-2' });
    manualForkliftInput.throttle = 1;
    let top = 0;
    for (let step = 0; step < 120; step++) {
      for (const frame of harness.frames) frame({ camera }, 1 / 30);
      top = Math.max(top, Math.abs(participant.capture().motionStateRef.speed));
    }
    return top;
  };

  it('drives faster than the zone rate with no zone (control)', () => {
    expect(drivenTopSpeed(false)).toBeGreaterThan(3 * 0.3 + 0.5);
  });

  it('holds the zone rate of its speed inside a zone, and still moves', () => {
    const top = drivenTopSpeed(true);
    expect(top).toBeLessThanOrEqual(3 * 0.3 + 0.05);
    expect(top).toBeGreaterThan(0.5);
  });
});

// The speed-zone view drew the crossings and the routes but not the zones the
// Safety panel edits, so a player could not see where a forklift would slow.
// Working if each valid zone gets a floor disc at its centre and size.
describe('the speed-zone view draws the speed zones', () => {
  /** Every host element in the tree, function components called through. */
  const hostElements = (node: unknown, out: React.ReactElement<any>[] = []) => {
    if (Array.isArray(node)) {
      for (const child of node) hostElements(child, out);
      return out;
    }
    if (!node || typeof node !== 'object' || !('type' in node)) return out;
    const element = node as React.ReactElement<any>;
    if (typeof element.type === 'function') {
      hostElements((element.type as (props: unknown) => unknown)(element.props), out);
      return out;
    }
    if (typeof element.type === 'string') out.push(element);
    hostElements(element.props?.children, out);
    return out;
  };
  const zoneDiscs = (showSpeedZones: boolean) => {
    const tree = ForkliftSystem({ showSpeedZones }) as React.ReactElement<{ children: any[] }>;
    // The overlays sit with the crossing markers; the forklifts are not walked.
    return hostElements(tree.props.children[0]).filter(
      (element) =>
        hostElements(element.props?.children).some((child) => child.type === 'circleGeometry') &&
        element.type === 'mesh'
    );
  };

  it('draws one disc per valid zone while the view is on, and none while it is off', () => {
    useSafetyStore.setState({
      speedZones: [
        { id: 'a', x: -31, z: -32, radius: 6, name: 'A' },
        { id: 'b', x: 4, z: 44, radius: 2.5, name: 'B' },
        // A persisted bad entry is skipped, as speedZoneLimit skips it.
        { id: 'bad', x: Number.NaN, z: 0, radius: 4, name: 'Bad' },
      ],
    });
    const discs = zoneDiscs(true);
    expect(discs).toHaveLength(2);
    const placed = discs.map((disc) => {
      const [x, , z] = disc.props.position as [number, number, number];
      const geometry = hostElements(disc.props.children).find(
        (child) => child.type === 'circleGeometry'
      )!;
      return { x, z, radius: geometry.props.args[0] };
    });
    expect(placed).toEqual([
      { x: -31, z: -32, radius: 6 },
      { x: 4, z: 44, radius: 2.5 },
    ]);
    expect(zoneDiscs(false)).toHaveLength(0);
  });
});

describe('speedZoneLimit', () => {
  const zone = { id: 'z', x: 0, z: 0, radius: 4, name: 'Z' };

  it('is no limit outside every zone and with no zones', () => {
    expect(speedZoneLimit(0, 0, [], 0.5, 3.5)).toBe(Infinity);
    expect(speedZoneLimit(40, 40, [zone], 0.5, 3.5)).toBeGreaterThan(3.5);
  });

  it('is the zone rate of the base speed inside a zone', () => {
    expect(speedZoneLimit(1, 1, [zone], 0.5, 3.5)).toBeCloseTo(1.75, 6);
    expect(speedZoneLimit(1, 1, [zone], 0.2, 3)).toBeCloseTo(0.6, 6);
  });

  it('eases down on approach so the forklift is at the rate by the edge', () => {
    const atEdge = speedZoneLimit(4, 0, [zone], 0.5, 3.5);
    const nearer = speedZoneLimit(5, 0, [zone], 0.5, 3.5);
    const further = speedZoneLimit(9, 0, [zone], 0.5, 3.5);
    expect(atEdge).toBeCloseTo(1.75, 6);
    expect(nearer).toBeGreaterThan(atEdge);
    expect(further).toBeGreaterThan(nearer);
  });

  it('is never zero, so an unmanned forklift still reaches its crew point', () => {
    for (const rate of [0, -1, Number.NaN, 0.2, 0.01])
      for (const base of [0, 1.2, 3.5, Number.NaN])
        expect(speedZoneLimit(0, 0, [zone], rate, base)).toBeGreaterThanOrEqual(
          SPEED_ZONE_MIN_SPEED
        );
    expect(SPEED_ZONE_MIN_SPEED).toBeGreaterThan(0);
  });

  it('skips a zone with a non-finite field rather than capping everywhere', () => {
    const broken = { id: 'b', x: Number.NaN, z: 0, radius: 4, name: 'B' };
    expect(speedZoneLimit(0, 0, [broken], 0.5, 3.5)).toBe(Infinity);
    // A persisted list is only checked to be an array, and this runs every frame.
    const persisted = [null, 'zone', broken] as unknown as Parameters<typeof speedZoneLimit>[2];
    expect(speedZoneLimit(0, 0, persisted, 0.5, 3.5)).toBe(Infinity);
  });
});
