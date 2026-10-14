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
vi.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
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

import { CommunityLife } from './CommunityLife';
import { TruckBay } from './TruckBay';
import { TRUCK_WHEEL_RADIUS } from './truckbay/OptimizedTruckBay';
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
  it.each([1, 2])('bounds real truck display steps after a stall at %sx production', (speed) => {
    useProductionStore.setState({ productionSpeed: speed });
    useGameSimulationStore.setState({ gameSpeed: 1 });
    const models: any[] = [];
    const collect = (node: any): void => {
      if (!node) return;
      if (Array.isArray(node)) node.forEach(collect);
      else if (node.type?.name === 'TruckVisualLOD') models.push(node);
      else collect(node.props?.children);
    };
    collect(TruckBay({ productionSpeed: speed }));
    flushEffects();
    expect(models).toHaveLength(2);
    const frame = harness.frames[0];
    // Reach incoming road speed through the live fixed-step authority.
    for (let i = 0; i < 900 && models[0].props.stateRef.current.speed < 16.5; i++)
      frame({ camera }, 1 / 60);
    expect(models[0].props.stateRef.current).toMatchObject({ phase: 'entering' });
    expect(models[0].props.stateRef.current.speed).toBeGreaterThanOrEqual(16.5);
    frame({ camera }, 0.007);
    const participant = harness.participants.get('trucks')!;
    expect(participant.capture().shippingAccumulatorRef).toBeGreaterThan(0);
    const before = models.map((model) => ({
      ...model.props.stateRef.current,
      wheelRotation: model.props.wheelRotationRef.current,
    }));
    const depart = vi.spyOn(useTruckScheduleStore.getState(), 'recordTruckDeparture');
    const consume = vi.spyOn(useTruckScheduleStore.getState(), 'consumeTruckArrival');
    frame({ camera }, 2);
    for (const [i, model] of models.entries()) {
      const pose = model.props.stateRef.current;
      const distance = Math.hypot(pose.x - before[i].x, pose.z - before[i].z);
      const wheelTravel =
        (model.props.wheelRotationRef.current - before[i].wheelRotation) * TRUCK_WHEEL_RADIUS;
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThanOrEqual(1.5);
      expect(wheelTravel).toBeCloseTo(distance, 5);
      expect(pose.phase).toBe('entering');
    }
    expect(depart).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
    const elapsed = participant.capture().shippingControllerRef.phaseElapsed;
    frame({ camera }, 1 / 30);
    expect(participant.capture().shippingControllerRef.phaseElapsed - elapsed).toBeCloseTo(
      speed / 30,
      6
    );
  });
  it('retains both truck models across distance hysteresis without remounting finishes', () => {
    const findLod = (node: any): any => {
      if (!node) return undefined;
      if (Array.isArray(node)) return node.map(findLod).find(Boolean);
      if (node.type?.name === 'TruckVisualLOD') return node;
      return findLod(node.props?.children);
    };
    const element = findLod(TruckBay({ productionSpeed: 0 }));
    expect(element).toBeDefined();
    const tree = element.type(element.props);
    const [full, compact] = tree.props.children;
    expect(full.props.name).toBe('truck-full-detail');
    expect(compact.props.name).toBe('truck-compact-detail');
    expect(compact.props.visible).toBe(false);
    const fullGroup = full.props.ref.current as THREE.Group;
    const compactGroup = compact.props.ref.current as THREE.Group;
    compactGroup.visible = false; // Apply the JSX prop in the unmounted harness.
    const frame = harness.frames.at(-1)!;
    const state = element.props.stateRef.current;
    const visit = (distance: number) => {
      camera.position.set(state.x + distance, 0, state.z);
      for (let i = 0; i < 15; i++) frame({ camera }, 0.016);
      expect(Number(fullGroup.visible) + Number(compactGroup.visible)).toBe(1);
    };
    const children = [full.props.children, compact.props.children];
    visit(136);
    expect(fullGroup.visible).toBe(false);
    visit(130);
    expect(fullGroup.visible).toBe(false);
    visit(119);
    expect(fullGroup.visible).toBe(true);
    visit(130);
    expect(fullGroup.visible).toBe(true);
    visit(136);
    visit(119);
    expect([full.props.children, compact.props.children]).toEqual(children);
  });

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

it('interpolates live personnel safely and restores the captured presentation cursor repeatedly', () => {
  useGameSimulationStore.setState({
    gameTime: 12,
    gameDay: 1,
    gameSpeed: 180,
    isTabVisible: true,
    emergencyActive: false,
    emergencyDrillMode: false,
  });
  const tree = CommunityLife();
  const nodes = tree.props.children[0].props.children;
  const roots = nodes.map((node: any) => {
    const root = new THREE.Group();
    root.name = node.props.name;
    root.position.fromArray(node.props.position);
    root.rotation.y = node.props.rotation[1];
    node.props.ref(root);
    return root;
  });
  flushEffects();
  const scene = new THREE.Scene();
  roots.forEach((root: THREE.Group) => scene.add(root));
  const frame = harness.frames[0] as (state: any, delta: number) => void;
  frame({ camera, scene }, 1 / 60);
  const participant = harness.participants.get('personnel')!;
  const checkpoint = structuredClone(participant.capture());
  useGameSimulationStore.setState({ gameTime: 12.025 });
  const at = roots[0].position.clone();
  frame({ camera, scene }, 1 / 60);
  expect(roots[0].position.distanceTo(at)).toBeCloseTo(1.1 / 60, 6);
  useGameSimulationStore.setState({ gameSpeed: 0 });
  const paused = roots[0].position.clone();
  frame({ camera, scene }, 1 / 60);
  expect(roots[0].position.equals(paused)).toBe(true);
  useGameSimulationStore.setState({ gameTime: 20, emergencyDrillMode: true });
  frame({ camera, scene }, 1 / 60);
  expect(roots[0].position.equals(paused)).toBe(true);
  const held = participant.capture();
  expect(held.clocks.presentation).toBe(44);
  expect(held.clocks.people).toBeLessThan(36.025);
  useGameSimulationStore.setState({ gameTime: 12, emergencyDrillMode: false, gameSpeed: 180 });
  participant.restore(structuredClone(checkpoint));
  frame({ camera, scene }, 1 / 60);
  expect(roots[0].position.equals(at)).toBe(true);
  useGameSimulationStore.setState({ gameTime: 12.025 });
  frame({ camera, scene }, 1 / 60);
  participant.restore(structuredClone(checkpoint));
  expect(participant.capture().clocks).toEqual(checkpoint.clocks);
  expect(checkpoint.clocks.presentation).toBe(36);
});

it('locks a turning rider to the actual bicycle heading, preserving pedal and hand contacts', () => {
  useGameSimulationStore.setState({
    gameTime: 11.76,
    gameDay: 0,
    gameSpeed: 180,
    isTabVisible: true,
    emergencyActive: false,
    emergencyDrillMode: false,
  });
  const tree = CommunityLife(),
    nodes = tree.props.children[0].props.children;
  const roots = nodes.map((node: any) => {
    const root = new THREE.Group();
    root.name = node.props.name;
    root.position.fromArray(node.props.position);
    root.rotation.y = node.props.rotation[1];
    node.props.ref(root);
    return root;
  });
  flushEffects();
  const scene = new THREE.Scene();
  roots.forEach((root: THREE.Group) => scene.add(root));
  const frame = harness.frames[0] as (state: any, delta: number) => void;
  useGameSimulationStore.setState({ gameTime: 11.785 });
  const initialHeading = harness.participants.get('personnel')!.capture().bicycle.rotation;
  let finalHeading = initialHeading;
  for (let i = 0; i < 30; i++) {
    frame({ camera, scene }, 1 / 60);
    const bike = harness.participants.get('personnel')!.capture().bicycle;
    finalHeading = bike.rotation;
    const rider = roots.find((root: THREE.Group) => root.name === 'village-cyclist')!;
    const angle = Math.atan2(
      Math.sin(rider.rotation.y - bike.rotation),
      Math.cos(rider.rotation.y - bike.rotation)
    );
    expect(Math.abs(angle)).toBeLessThan(1e-8);
    expect(rider.position.x).toBeCloseTo(bike.x, 9);
    expect(rider.position.z).toBeCloseTo(bike.z, 9);
  }
  expect(Math.abs(finalHeading - initialHeading)).toBeGreaterThan(0.1);
});
