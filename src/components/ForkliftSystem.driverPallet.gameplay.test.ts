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
    useId: () => 'driver-pallet-test',
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
import { forkliftCargoStation, resetForkliftCargoStations } from '../stores/forkliftCargoStore';
import { useTruckScheduleStore } from '../stores/truckScheduleStore';
import { FORKLIFT_PALLET_REACH_METRES } from './models/ForkliftModel';
import { FORKLIFT_INSERT_METRES } from '../simulation/vehicles/forkliftWork';

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

const initialSafety = useSafetyStore.getInitialState();
const initialTrucks = useTruckScheduleStore.getState().truckSchedule;

beforeEach(() => {
  useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
  resetForkliftCargoStations();
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
  useSafetyStore.setState(initialSafety, true);
  // The receiving trailer is docked with its doors open: it puts one pallet
  // of packaging supplies out on the deck (FLT02's pick, D-060).
  useTruckScheduleStore.setState({
    truckSchedule: {
      ...initialTrucks,
      receiving: {
        ...initialTrucks.receiving,
        truckActive: true,
        lifecyclePhase: 'docked',
        transferReady: true,
      },
    },
  });
  vi.spyOn(audioManager, 'playHorn').mockImplementation(() => undefined);
});
afterEach(() => {
  for (const cleanup of harness.cleanups.splice(0)) cleanup();
  useForkliftDriveStore.setState({ drivenId: null, workOffer: null, workRefusal: null });
  resetManualForkliftInput();
  useTruckScheduleStore.setState({ truckSchedule: initialTrucks });
  useSafetyStore.setState(initialSafety, true);
  vi.restoreAllMocks();
});

type Participant = { capture: () => any; restore: (state: any) => void };

/** Mounts the fleet with the player in FLT02's seat, standing where it starts. */
function mountDriving(): Participant {
  const tree = ForkliftSystem({}) as React.ReactElement<{ children: any[] }>;
  for (const element of tree.props.children[1]) element.type(element.props);
  for (const effect of harness.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) harness.cleanups.push(cleanup);
  }
  const participant = harness.participants.get('forklift:forklift-2')!;
  participant.restore(structuredClone(participant.capture()));
  useForkliftDriveStore.setState({ drivenId: 'forklift-2' });
  return participant;
}

/** Where a pick or drop at this station begins: a metre short of the marker, on the forks' line. */
function workStart(action: 'pickup' | 'dropoff') {
  const pose = forkliftCargoStation('forklift-2', action)!.pose!;
  const back = FORKLIFT_PALLET_REACH_METRES.authored + FORKLIFT_INSERT_METRES;
  return {
    x: pose.x - Math.sin(pose.heading) * back,
    z: pose.z - Math.cos(pose.heading) * back,
    heading: pose.heading,
  };
}

/** Steps down, moves the forklift to `pose` (as a driver would have), and climbs back in. */
function standAt(participant: Participant, pose: { x: number; z: number; heading: number }) {
  useForkliftDriveStore.getState().exit();
  const snapshot = structuredClone(participant.capture());
  snapshot.transform = { position: [pose.x, 0, pose.z], rotation: [0, pose.heading, 0] };
  participant.restore(snapshot);
  useForkliftDriveStore.setState({ drivenId: 'forklift-2' });
  runFrames(1);
}

/** Runs frames until the forklift is back in the driver's hands, returning the largest per-frame jump. */
function runOperation(participant: Participant): { frames: number; largestStep: number } {
  let largestStep = 0;
  let frames = 0;
  let last = participant.capture().transform.position as number[];
  let started = false;
  for (; frames < 1200; frames++) {
    runFrames(1);
    const snapshot = participant.capture();
    const at = snapshot.transform.position as number[];
    largestStep = Math.max(largestStep, Math.hypot(at[0] - last[0], at[2] - last[2]));
    last = at;
    if (snapshot.operationRef !== 'traveling') started = true;
    else if (started) break;
  }
  return { frames, largestStep };
}

// Driving a forklift achieved nothing: the manual branch never picked or
// dropped, so a pallet the player moved counted for nothing (D-012 in the
// review). Working if a driver lined up at FLT02's pick, asking for it, runs
// the existing pick, and the drop at the store completes the trip, moving one
// station pallet through the real stores.
describe('a driver works a pallet trip', () => {
  it('picks the pallet off the receiving deck and sets it down at the packing-line store', () => {
    const participant = mountDriving();
    // The trailer puts its pallet out on the deck tail while the driver waits.
    runFrames(150);
    const pickup = forkliftCargoStation('forklift-2', 'pickup')!;
    const store = forkliftCargoStation('forklift-2', 'dropoff')!;
    expect(pickup.station.present).toBe(true);
    expect(pickup.station.progress).toBe(0);

    // Lined up a little off the forks' line, as a driver would be.
    const pickStart = workStart('pickup');
    standAt(participant, {
      x: pickStart.x + Math.cos(pickStart.heading) * 0.15,
      z: pickStart.z - Math.sin(pickStart.heading) * 0.15,
      heading: pickStart.heading + 0.05,
    });
    expect(useForkliftDriveStore.getState().workOffer).toBe('pickup');

    // The tines are on the floor and the pallet stands on the deck: refused.
    expect(useForkliftDriveStore.getState().requestWork()).toBe(true);
    runFrames(1);
    expect(useForkliftDriveStore.getState().workRefusal).toBe('forksLow');
    expect(participant.capture().operationRef).toBe('traveling');

    // Forks up to the deck, then the pick runs.
    manualForkliftInput.lift = 1;
    runFrames(90);
    manualForkliftInput.lift = 0;
    expect(useForkliftDriveStore.getState().requestWork()).toBe(true);
    const pick = runOperation(participant);
    expect(pick.frames).toBeLessThan(1200);
    expect(pick.largestStep).toBeLessThan(0.2);
    expect(participant.capture().hasCargoRef).toBe(true);
    expect(pickup.station.present).toBe(false);
    expect(pickup.station.served).toBe(true);
    // The driver has it again, where it backed out.
    runFrames(2);
    expect(participant.capture().operationRef).toBe('traveling');
    expect(useForkliftDriveStore.getState().drivenId).toBe('forklift-2');

    // At the store, the drop completes the trip, counted as the trip it replaces.
    const recordVehicle = vi.spyOn(useLogisticsLayoutStore.getState(), 'recordVehicle');
    standAt(participant, workStart('dropoff'));
    expect(useForkliftDriveStore.getState().workOffer).toBe('dropoff');
    expect(store.station.present).toBe(false);
    expect(useForkliftDriveStore.getState().requestWork()).toBe(true);
    const drop = runOperation(participant);
    expect(drop.frames).toBeLessThan(1200);
    expect(drop.largestStep).toBeLessThan(0.2);
    expect(participant.capture().hasCargoRef).toBe(false);
    expect(store.station.present).toBe(true);
    expect(recordVehicle).toHaveBeenCalledWith('receiving', 0, true);
  });

  it('offers nothing away from a station, so the activation steps the driver down', () => {
    mountDriving();
    runFrames(5);
    expect(useForkliftDriveStore.getState().workOffer).toBeNull();
    expect(useForkliftDriveStore.getState().requestWork()).toBe(false);
  });

  it('finishes the pick on autopilot when the driver steps down part-way', () => {
    const participant = mountDriving();
    runFrames(150);
    standAt(participant, workStart('pickup'));
    manualForkliftInput.lift = 1;
    runFrames(90);
    manualForkliftInput.lift = 0;
    expect(useForkliftDriveStore.getState().requestWork()).toBe(true);
    runFrames(30);
    expect(participant.capture().operationRef).toBe('loading');
    useForkliftDriveStore.getState().exit();
    runFrames(400);
    expect(participant.capture().operationRef).toBe('traveling');
    expect(participant.capture().hasCargoRef).toBe(true);
    expect(forkliftCargoStation('forklift-2', 'pickup')!.station.served).toBe(true);
  });
});
