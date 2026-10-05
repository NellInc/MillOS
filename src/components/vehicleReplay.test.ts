import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  frames: [] as Array<(state: { camera: THREE.PerspectiveCamera }, delta: number) => void>,
  participants: new Map<string, { capture: () => any; restore: (state: any) => void }>(),
  restoring: false,
}));

// Invoke the live component functions with deterministic hooks. JSX remains
// unmounted, so refs own real Three groups and decorative children do not run.
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
    useId: () => 'replay-test',
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
vi.mock('zustand/react/shallow', () => ({ useShallow: (selector: unknown) => selector }));
vi.mock('@react-three/fiber', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@react-three/fiber')>()),
  useFrame: (frame: (typeof harness.frames)[number]) => harness.frames.push(frame),
}));
vi.mock('../simulation/workplaceReplayRuntime', () => ({
  isWorkplaceReplayRestoring: () => harness.restoring,
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

import { TruckBay } from './TruckBay';
import { ForkliftSystem } from './ForkliftSystem';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useTruckScheduleStore } from '../stores/truckScheduleStore';
import { positionRegistry } from '../utils/positionRegistry';
import { vehicleTelemetryRegistry } from '../simulation/vehicles/vehicleTelemetryRegistry';
import {
  useLogisticsLayoutStore,
  defaultSavedLogisticsLayout,
} from '../stores/logisticsLayoutStore';
import {
  currentLogisticsLayout,
  DEFAULT_PLANNING_ASSUMPTIONS,
  optimizeLogisticsLayout,
  planningObstacles,
} from '../simulation/layoutPlanning';
import { canonicalProcessMachines } from '../simulation/materialTransport';
import { spoutMachineKey } from './flow/spoutRoutes';
import type { MachineData } from '../types';

const camera = new THREE.PerspectiveCamera();
const flushEffects = () => {
  for (const effect of harness.effects.splice(0)) {
    const cleanup = effect();
    if (cleanup) harness.cleanups.push(cleanup);
  }
};

beforeEach(() => {
  useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
  harness.frames.length = 0;
  harness.effects.length = 0;
  harness.participants.clear();
  harness.restoring = false;
  useProductionStore.setState({ productionSpeed: 0 });
  useGameSimulationStore.setState({ gameSpeed: 0, isTabVisible: true });
});
afterEach(() => {
  for (const cleanup of harness.cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
});

describe('component-owned vehicle replay', () => {
  it('restores both truck fixed-step authorities and publishes without lifecycle writes', () => {
    TruckBay({ productionSpeed: 0 });
    flushEffects();
    const participant = harness.participants.get('trucks')!;
    const checkpoint = structuredClone(participant.capture());
    checkpoint.shippingControllerRef.motion.speed = 2.5;
    checkpoint.shippingControllerRef.phaseDistance = 4;
    checkpoint.shippingPreviousControllerRef.motion.speed = 2;
    checkpoint.shippingAccumulatorRef = 0.006;
    const consume = vi.spyOn(useTruckScheduleStore.getState(), 'consumeTruckArrival');
    const depart = vi.spyOn(useTruckScheduleStore.getState(), 'recordTruckDeparture');
    const dock = vi.spyOn(useTruckScheduleStore.getState(), 'setTruckDocked');
    const lifecycle = vi.spyOn(useTruckScheduleStore.getState(), 'setTruckLifecycle');
    const transfer = vi.spyOn(useTruckScheduleStore.getState(), 'setTruckTransferReady');
    const status = vi.spyOn(useProductionStore.getState(), 'updateDockStatus');
    const publish = vi.spyOn(vehicleTelemetryRegistry, 'publish');
    participant.restore(structuredClone(checkpoint));
    harness.frames[0]({ camera }, 0.1);
    expect(participant.capture()).toEqual(checkpoint);
    for (const spy of [consume, depart, dock, lifecycle, transfer, status])
      expect(spy).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalled();
    expect(publish.mock.calls.every(([row]) => row.speedMps === 0)).toBe(true);
  });

  it('preserves forklift momentum, operation timers and collision cache across paused frames', () => {
    const tree = ForkliftSystem({}) as React.ReactElement<{ children: any[] }>;
    const vehicles = tree.props.children[1];
    for (const element of vehicles) element.type(element.props);
    flushEffects();
    expect([...harness.participants.keys()].sort()).toEqual([
      'forklift-crossings',
      'forklift:forklift-1',
      'forklift:forklift-2',
    ]);
    const participant = harness.participants.get('forklift:forklift-1')!;
    const checkpoint = structuredClone(participant.capture());
    checkpoint.motionStateRef.speed = 1.8;
    checkpoint.motionStateRef.acceleration = 0.4;
    checkpoint.operationRef = 'loading';
    checkpoint.hasCargoRef = true;
    checkpoint.operationTimerRef = 2.3;
    checkpoint.operationDurationRef = 7;
    checkpoint.crossingTimerRef = 0.7;
    checkpoint.frameCountRef = 2;
    checkpoint.lastCollisionCheckRef.pathClear = false;
    checkpoint.forkHeightRef = 0.4;
    checkpoint.mastTiltRef = -0.03;
    checkpoint.transform.rotation = [0.01, 0.6, -0.02];
    const register = vi.spyOn(positionRegistry, 'register');
    const publish = vi.spyOn(vehicleTelemetryRegistry, 'publish');
    participant.restore(structuredClone(checkpoint));
    harness.frames[0]({ camera }, 0.1);
    expect(participant.capture()).toEqual(checkpoint);
    expect(register).toHaveBeenCalled();
    expect(publish.mock.calls.at(-1)?.[0]).toMatchObject({
      id: 'forklift-1',
      speedMps: 0,
      stopReason: 'simulation-paused',
    });
    // Restoring suppression also freezes frames when React subscriptions have
    // not yet received the root's paused-store render.
    harness.restoring = true;
    harness.frames[0]({ camera }, 0.1);
    expect(participant.capture()).toEqual(checkpoint);
  });
  it('restores crossing ownership and suppresses running-frame side effects during replay', () => {
    useProductionStore.setState({ productionSpeed: 1 });
    useGameSimulationStore.setState({ gameSpeed: 1 });
    const tree = ForkliftSystem({}) as React.ReactElement<{ children: any[] }>;
    for (const element of tree.props.children[1]) element.type(element.props);
    flushEffects();
    const crossings = harness.participants.get('forklift-crossings')!;
    crossings.restore([
      ['receiving-crossing', 'forklift-2'],
      ['foreign-crossing', 'other-vehicle'],
    ]);
    expect(crossings.capture()).toEqual([['receiving-crossing', 'forklift-2']]);
    const participant = harness.participants.get('forklift:forklift-1')!;
    const checkpoint = structuredClone(participant.capture());
    checkpoint.motionStateRef.speed = 1.5;
    checkpoint.operationTimerRef = 2;
    checkpoint.operationRef = 'loading';
    participant.restore(structuredClone(checkpoint));
    harness.restoring = true;
    harness.frames[0]({ camera }, 0.1);
    expect(participant.capture()).toEqual(checkpoint);
    expect(crossings.capture()).toEqual([['receiving-crossing', 'forklift-2']]);
    harness.restoring = false;
    useGameSimulationStore.setState({ gameSpeed: 0 });
    harness.frames[0]({ camera }, 0.1);
    expect(participant.capture()).toEqual(checkpoint);
  });
});

it('applies to mounted controllers while preserving cargo, operation phase, timers and replay owners', () => {
  useProductionStore.setState({
    machines: canonicalProcessMachines() as MachineData[],
    scadaLive: false,
  });
  const tree = ForkliftSystem({}) as React.ReactElement<{ children: any[] }>;
  for (const element of tree.props.children[1]) element.type(element.props);
  flushEffects();
  const participant = harness.participants.get('forklift:forklift-1')!;
  const checkpoint = structuredClone(participant.capture());
  checkpoint.operationRef = 'loading';
  checkpoint.hasCargoRef = true;
  checkpoint.loadPhaseRef = 'lifting';
  checkpoint.operationTimerRef = 2.3;
  checkpoint.operationDurationRef = 7;
  checkpoint.motionStateRef.wheelTravel = 197;
  participant.restore(structuredClone(checkpoint));
  const plan = optimizeLogisticsLayout(
    currentLogisticsLayout(),
    DEFAULT_PLANNING_ASSUMPTIONS,
    planningObstacles()
  ).proposal;
  const key = spoutMachineKey(useProductionStore.getState().machines);
  expect(useLogisticsLayoutStore.getState().apply(plan, 0, key)).toEqual({
    changed: true,
    reason: null,
  });
  expect(harness.participants.get('forklift:forklift-1')).toBe(participant);
  expect(participant.capture()).toEqual(checkpoint);
  harness.frames[0]({ camera }, 0.1);
  expect(participant.capture()).toEqual(checkpoint);
  expect(useLogisticsLayoutStore.getState().undoApplied(1, key).changed).toBe(true);
  expect(participant.capture()).toEqual(checkpoint);
});
