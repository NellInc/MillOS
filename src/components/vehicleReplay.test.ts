import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

const harness = vi.hoisted(() => ({
  effects: [] as Array<() => void | (() => void)>,
  cleanups: [] as Array<() => void>,
  frames: [] as Array<(state: { camera: THREE.PerspectiveCamera }, delta: number) => void>,
  participants: new Map<string, { capture: () => any; restore: (state: any) => void }>(),
  restoring: false,
  reducedMotion: false,
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
vi.mock('../hooks/useReducedMotion', () => ({ useReducedMotion: () => harness.reducedMotion }));
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
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import {
  COMMUNITY_ROSTER,
  COMMUNITY_WALK_SPEED_MPS,
  sampleCommunityCyclist,
  sampleCommunityPerson,
} from '../simulation/communityLife';
import { TruckBay } from './TruckBay';
import { TRUCK_WHEEL_RADIUS } from './truckbay/OptimizedTruckBay';
import { ForkliftSystem } from './ForkliftSystem';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { STANDARD_GAME_SPEED } from '../simulation/pace';
import { useTruckScheduleStore } from '../stores/truckScheduleStore';
import { positionRegistry } from '../utils/positionRegistry';
import { audioManager } from '../utils/audioManager';
import { useSafetyStore } from '../stores/safetyStore';
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
  harness.reducedMotion = false;
  useProductionStore.setState({ productionSpeed: 0 });
  useGameSimulationStore.setState({ gameSpeed: 0, isTabVisible: true });
});
afterEach(() => {
  for (const cleanup of harness.cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
});

describe('component-owned vehicle replay', () => {
  // Trucks run on plant time: a pace multiplier scales them with the clock.
  it.each([1, 2])('bounds real truck display steps after a stall at %sx pace', (speed) => {
    useProductionStore.setState({ productionSpeed: 1 });
    useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED * speed });
    const models: any[] = [];
    const collect = (node: any): void => {
      if (!node) return;
      if (Array.isArray(node)) node.forEach(collect);
      else if (node.type?.name === 'TruckVisualLOD') models.push(node);
      else collect(node.props?.children);
    };
    collect(TruckBay());
    flushEffects();
    expect(models).toHaveLength(2);
    const frame = harness.frames[0];
    // Reach incoming road speed through the live fixed-step authority. The
    // speed plan tops out near 13 m/s on the incoming road, because it brakes
    // in time to meet the yard turn at 5 m/s instead of carrying 15 into it.
    for (let i = 0; i < 900 && models[0].props.stateRef.current.speed < 12; i++)
      frame({ camera }, 1 / 60);
    expect(models[0].props.stateRef.current).toMatchObject({ phase: 'entering' });
    expect(models[0].props.stateRef.current.speed).toBeGreaterThanOrEqual(12);
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
      // The per-frame display bound scales with the pace it accelerates.
      expect(distance).toBeLessThanOrEqual(1.5 * speed);
      expect(wheelTravel).toBeCloseTo(distance, 5);
      expect(pose.phase).toBe('entering');
    }
    expect(depart).not.toHaveBeenCalled();
    expect(consume).not.toHaveBeenCalled();
    // The stall's plant time is carried, not dropped, and paid back over the
    // following frames, so the yard never falls behind the clock for good.
    const carried = participant.capture().shippingAccumulatorRef;
    // Less one capped frame: about 0.22 s of 2x plant time at 12 m/s.
    expect(carried).toBeGreaterThan(speed * 2 - 0.25);
    for (let i = 0; i < 600 && participant.capture().shippingAccumulatorRef > 1 / 30; i++)
      frame({ camera }, 1 / 60);
    expect(participant.capture().shippingAccumulatorRef).toBeLessThanOrEqual(1 / 30);
  });

  it('keeps slow-frame truck time where the 1.5 m display bound allows it', () => {
    useProductionStore.setState({ productionSpeed: 1 });
    useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED });
    const models: any[] = [];
    const collect = (node: any): void => {
      if (!node) return;
      if (Array.isArray(node)) node.forEach(collect);
      else if (node.type?.name === 'TruckVisualLOD') models.push(node);
      else collect(node.props?.children);
    };
    collect(TruckBay());
    flushEffects();
    const frame = harness.frames[0];
    const participant = harness.participants.get('trucks')!;
    // A truck at rest cannot cross the display bound in one tick interval, so
    // a 4 FPS frame keeps its full time instead of the 80 ms top-speed floor.
    const restElapsed = participant.capture().shippingControllerRef.phaseElapsed;
    frame({ camera }, 0.25);
    expect(participant.capture().shippingControllerRef.phaseElapsed - restElapsed).toBeGreaterThan(
      0.2
    );
    for (let i = 0; i < 900 && models[0].props.stateRef.current.speed < 4; i++)
      frame({ camera }, 1 / 60);
    expect(models[0].props.stateRef.current).toMatchObject({ phase: 'entering' });
    const before = { ...models[0].props.stateRef.current };
    const elapsed = participant.capture().shippingControllerRef.phaseElapsed;
    frame({ camera }, 2);
    const pose = models[0].props.stateRef.current;
    expect(Math.hypot(pose.x - before.x, pose.z - before.z)).toBeLessThanOrEqual(1.5);
    expect(participant.capture().shippingControllerRef.phaseElapsed - elapsed).toBeGreaterThan(0.1);
  });

  it('moves both trucks at the shift pace even when the line is stopped', () => {
    const execution = useOperationsCampaignStore.getState().execution;
    useOperationsCampaignStore.setState({ execution: { ...execution, lineSetpointPercent: 0 } });
    try {
      expect(useOperationsCampaignStore.getState().getProductionMultiplier()).toBe(0);
      // Neither the campaign setpoint nor the line rate is a pause.
      useProductionStore.setState({ productionSpeed: 0 });
      useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED });
      TruckBay();
      flushEffects();
      const participant = harness.participants.get('trucks')!;
      for (let i = 0; i < 60; i++) harness.frames[0]({ camera }, 1 / 60);
      // The receiving truck is what refills an empty recipe source.
      expect(participant.capture().receivingControllerRef.phaseElapsed).toBeGreaterThan(0.5);
      expect(participant.capture().shippingControllerRef.phaseElapsed).toBeGreaterThan(0.5);
    } finally {
      useOperationsCampaignStore.setState({ execution });
    }
  });

  it('counts neither a yield nor a queue behind a vehicle as a near miss, but counts a barrier', () => {
    useProductionStore.setState({ productionSpeed: 1 });
    useGameSimulationStore.setState({
      gameSpeed: STANDARD_GAME_SPEED,
      emergencyActive: false,
      emergencyDrillMode: false,
    });
    vi.spyOn(audioManager, 'playHorn').mockImplementation(() => undefined);
    const tree = ForkliftSystem({}) as React.ReactElement<{ children: any[] }>;
    for (const element of tree.props.children[1]) element.type(element.props);
    flushEffects();
    const participant = harness.participants.get('forklift:forklift-1')!;
    // Loaded at its pickup marker, the forklift has no dock interlock to wait
    // on and travels its route, so only the peer decides why it stops.
    const loaded = structuredClone(participant.capture());
    loaded.hasCargoRef = true;
    participant.restore(loaded);
    const stops = () => useSafetyStore.getState().safetyMetrics.safetyStops;
    // A moving peer is placed along forklift-1's heading: behind it is inside
    // the 4 m yield radius but outside the route corridor; ahead blocks it.
    const placePeer = (ahead: number) => {
      const self = positionRegistry.getAllForklifts().find((entry) => entry.id === 'forklift-1');
      if (!self) return;
      positionRegistry.register(
        'test-peer',
        self.x + (self.dirX ?? 0) * ahead,
        self.z + (self.dirZ ?? 0) * ahead,
        self.dirX,
        self.dirZ,
        false,
        self.y ?? 0
      );
    };
    const reason = () => participant.capture().motionStateRef.stopReason;
    const obstaclesBefore = positionRegistry.getAllObstacles();
    try {
      for (let i = 0; i < 900 && reason() !== 'vehicle-yield'; i++) {
        placePeer(-3);
        harness.frames[0]({ camera }, 1 / 30);
      }
      expect(reason()).toBe('vehicle-yield');
      const stopsBeforeYield = stops();
      for (let i = 0; i < 30; i++) {
        placePeer(-3);
        harness.frames[0]({ camera }, 1 / 30);
      }
      expect(reason()).toBe('vehicle-yield');
      expect(stops()).toBe(stopsBeforeYield);
      for (let i = 0; i < 30; i++) {
        placePeer(2);
        harness.frames[0]({ camera }, 1 / 30);
      }
      // Another vehicle ahead is traffic: the forklift queues behind it.
      expect(reason()).toBe('vehicle-queue');
      expect(stops()).toBe(stopsBeforeYield);
      positionRegistry.unregister('test-peer');
      // A static barrier on the route, whichever way it turns next.
      const at = positionRegistry.getAllForklifts().find((entry) => entry.id === 'forklift-1')!;
      const [bx, bz] = [at.x, at.z];
      positionRegistry.registerObstacles([
        ...obstaclesBefore,
        { id: 'test-barrier', minX: bx - 3, maxX: bx + 3, minZ: bz - 3, maxZ: bz + 3 },
      ]);
      for (let i = 0; i < 30; i++) harness.frames[0]({ camera }, 1 / 30);
      expect(reason()).toBe('route-blocked');
      expect(stops()).toBeGreaterThan(stopsBeforeYield);
    } finally {
      positionRegistry.unregister('test-peer');
      positionRegistry.registerObstacles(obstaclesBefore);
    }
  });
  it('retains both truck models across distance hysteresis without remounting finishes', () => {
    const findLod = (node: any): any => {
      if (!node) return undefined;
      if (Array.isArray(node)) return node.map(findLod).find(Boolean);
      if (node.type?.name === 'TruckVisualLOD') return node;
      return findLod(node.props?.children);
    };
    const element = findLod(TruckBay());
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
  const shopkeeper = roots.find((root: THREE.Group) => root.name === 'village-shopkeeper')!;
  expect(shopkeeper.userData.greeting).toBe(false); // Day1 noon is a working stop.
  expect(roots.filter((root: THREE.Group) => root.userData.greeting)).toEqual([]);
  const checkpoint = structuredClone(participant.capture());
  useGameSimulationStore.setState({ gameTime: 12.025 });
  // One display frame consumes 180/60 game seconds of the admitted tick, which a
  // resident on a straight walking segment covers at walking pace, scaled by 180.
  const frameHours = 180 / 60 / 3600;
  const walkerIndex = COMMUNITY_ROSTER.findIndex((person) => {
    if (person.district !== 'mill') return false;
    const a = sampleCommunityPerson(person, 36),
      b = sampleCommunityPerson(person, 36 + frameHours);
    return a.activity === 'walking' && b.activity === 'walking' && a.rotation === b.rotation;
  });
  expect(walkerIndex).toBeGreaterThanOrEqual(0);
  const walker = roots[walkerIndex];
  const at = walker.position.clone();
  frame({ camera, scene }, 1 / 60);
  expect(walker.position.distanceTo(at)).toBeCloseTo(
    (COMMUNITY_WALK_SPEED_MPS * 180) / STANDARD_GAME_SPEED / 60,
    6
  );
  useGameSimulationStore.setState({ gameSpeed: 0 });
  const paused = walker.position.clone();
  frame({ camera, scene }, 1 / 60);
  expect(walker.position.equals(paused)).toBe(true);
  useGameSimulationStore.setState({ gameTime: 20, emergencyDrillMode: true });
  frame({ camera, scene }, 1 / 60);
  expect(walker.position.equals(paused)).toBe(true);
  expect(shopkeeper.userData.greeting).toBe(false);
  const held = participant.capture();
  expect(held.clocks.presentation).toBe(44);
  expect(held.clocks.people).toBeLessThan(36.025);
  useGameSimulationStore.setState({ gameTime: 12, emergencyDrillMode: false, gameSpeed: 180 });
  participant.restore(structuredClone(checkpoint));
  frame({ camera, scene }, 1 / 60);
  expect(walker.position.equals(at)).toBe(true);
  useGameSimulationStore.setState({ gameTime: 12.025 });
  frame({ camera, scene }, 1 / 60);
  participant.restore(structuredClone(checkpoint));
  expect(participant.capture().clocks).toEqual(checkpoint.clocks);
  expect(checkpoint.clocks.presentation).toBe(36);
  // Reframe, paused, to a moment the shopkeeper's schedule puts her at the social stop.
  const shopkeeperPerson = COMMUNITY_ROSTER.find((p) => p.id === 'village-shopkeeper')!;
  let greetingHour = 7;
  while (
    greetingHour < 18 &&
    sampleCommunityPerson(shopkeeperPerson, greetingHour).task !== 'Greeting a neighbour'
  )
    greetingHour += 0.001;
  expect(greetingHour).toBeLessThan(18);
  useGameSimulationStore.setState({ gameDay: 0, gameTime: greetingHour, gameSpeed: 0 });
  frame({ camera, scene }, 1 / 60);
  // A social stop is eligible, but an empty street must never generate a wave.
  const social = participant
    .capture()
    .residents.find((r: any) => r.pose.task === 'Greeting a neighbour');
  expect(social).toBeDefined();
  expect(shopkeeper.userData.greeting).toBe(!!shopkeeper.userData.greetingTargetId);
  expect(shopkeeper.userData.task).toBe(
    shopkeeper.userData.greeting ? 'Greeting a passing neighbour' : 'A moment outside the shop'
  );
});

it('locks a turning rider to the actual bicycle heading, preserving pedal and hand contacts', () => {
  // A moment the schedule puts the rider into one of the loop's turns.
  let turnHour = 11.1;
  while (
    turnHour < 12 &&
    Math.abs(
      sampleCommunityCyclist(turnHour + 0.025).rotation - sampleCommunityCyclist(turnHour).rotation
    ) < 0.5
  )
    turnHour += 0.001;
  expect(turnHour).toBeLessThan(12);
  useGameSimulationStore.setState({
    gameTime: turnHour,
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
  useGameSimulationStore.setState({ gameTime: turnHour + 0.025 });
  const initialHeading = harness.participants.get('personnel')!.capture().bicycle.rotation;
  let finalHeading = initialHeading;
  for (let i = 0; i < 30; i++) {
    frame({ camera, scene }, 1 / 60);
    const bike = harness.participants.get('personnel')!.capture().bicycle;
    finalHeading = bike.rotation;
    const rider = roots.find((root: THREE.Group) => root.name === 'village-cyclist')!;
    expect(rider.userData.attentionYaw).toBe(0);
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

function mountCommunity(state: Partial<ReturnType<typeof useGameSimulationStore.getState>>) {
  useGameSimulationStore.setState({
    gameDay: 0,
    isTabVisible: true,
    emergencyActive: false,
    emergencyDrillMode: false,
    ...state,
  });
  const nodes = CommunityLife().props.children[0].props.children;
  const roots: THREE.Group[] = nodes.map((node: any) => {
    const root = new THREE.Group();
    root.name = node.props.name;
    root.position.fromArray(node.props.position);
    root.rotation.y = node.props.rotation[1];
    node.props.ref(root);
    return root;
  });
  flushEffects();
  const scene = new THREE.Scene();
  roots.forEach((root) => scene.add(root));
  const frame = harness.frames[harness.frames.length - 1] as (state: any, delta: number) => void;
  return {
    roots,
    step: (delta = 1 / 60) => frame({ camera, scene }, delta),
    capture: () => harness.participants.get('personnel')!.capture(),
  };
}
/** The first moment from `from` when a mill resident walks one straight segment
 * for `span` game hours, and which resident it is. */
function findMillWalk(from: number, span: number) {
  for (let hour = from; hour < from + 4; hour += 0.001) {
    const index = COMMUNITY_ROSTER.findIndex((person) => {
      if (person.district !== 'mill') return false;
      const a = sampleCommunityPerson(person, hour),
        b = sampleCommunityPerson(person, hour + span);
      return a.activity === 'walking' && b.activity === 'walking' && a.rotation === b.rotation;
    });
    if (index >= 0) return { hour, index };
  }
  throw new Error('no mill resident walks a straight segment');
}

it('walks a time-lapsed resident with its real-time gait and uncapped ground speed', () => {
  const pace = 120;
  const { hour, index } = findMillWalk(10, 0.002);
  const community = mountCommunity({ gameTime: hour, gameSpeed: pace });
  useGameSimulationStore.setState({ gameTime: hour + 0.002 });
  community.step();
  community.step();
  const motion = community.capture().residents[index].motion;
  expect(motion.gaitScale).toBe(pace / STANDARD_GAME_SPEED);
  expect(motion.groundSpeed).toBeCloseTo(
    (COMMUNITY_WALK_SPEED_MPS * pace) / STANDARD_GAME_SPEED,
    6
  );
});

it('keeps a pausing walker turned where it was, rather than snapping to the route heading', () => {
  const { hour, index } = findMillWalk(10, 0.002);
  const community = mountCommunity({ gameTime: hour, gameSpeed: STANDARD_GAME_SPEED });
  community.step();
  const root = community.roots[index];
  // Mid-turn: the body still lags the route's heading by a fraction of a radian.
  root.rotation.y -= 0.5;
  const turning = root.rotation.y;
  useGameSimulationStore.setState({ gameSpeed: 0 });
  community.step();
  expect(root.rotation.y).toBe(turning);
  useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, gameTime: hour + 0.001 });
  community.step();
  expect(Math.abs(root.rotation.y - turning)).toBeGreaterThan(0);
});

it('settles walkers into the drill stance over a short blend, then holds', () => {
  const { hour, index } = findMillWalk(10, 0.01);
  const community = mountCommunity({ gameTime: hour, gameSpeed: STANDARD_GAME_SPEED });
  useGameSimulationStore.setState({ gameTime: hour + 0.002 });
  community.step();
  const motion = () => community.capture().residents[index].motion;
  // Watch from close by; other tests leave the shared camera elsewhere.
  const viewpoint = camera.position.clone();
  camera.position.copy(community.roots[index].position).add(new THREE.Vector3(0, 2, 5));
  try {
    community.step();
    expect(motion().activity).toBe('walking');
    expect(motion().enabled).toBe(true);
    useGameSimulationStore.setState({ emergencyDrillMode: true });
    community.step();
    // Still animating, so the walk clip damps into the stance instead of snapping.
    expect(motion().activity).toBe('idle');
    expect(motion().enabled).toBe(true);
    expect(motion().groundSpeed).toBe(0);
    const at = community.roots[index].position.clone();
    for (let i = 0; i < 40; i++) community.step();
    expect(motion().enabled).toBe(false);
    expect(community.roots[index].position.equals(at)).toBe(true);
  } finally {
    camera.position.copy(viewpoint);
  }
});

it('holds reduced-motion residents still between stops instead of gliding them', () => {
  harness.reducedMotion = true;
  const { hour, index } = findMillWalk(10, 0.01);
  const community = mountCommunity({ gameTime: hour, gameSpeed: STANDARD_GAME_SPEED });
  community.step();
  const root = community.roots[index];
  const at = root.position.clone(),
    heading = root.rotation.y;
  const cyclist = community.roots.find((r) => r.name === 'village-cyclist')!;
  for (let i = 1; i <= 20; i++) {
    useGameSimulationStore.setState({ gameTime: hour + i * 0.0003 });
    community.step();
    const motion = community.capture().residents[index].motion;
    // The schedule walks on underneath; the body stays where its trip began.
    expect(root.position.equals(at)).toBe(true);
    expect(root.rotation.y).toBe(heading);
    expect(motion.groundSpeed).toBe(0);
    expect(motion.activity).not.toBe('walking');
    expect(motion.enabled).toBe(false);
  }
  expect(cyclist.position.z).toBeCloseTo(sampleCommunityCyclist(11).z, 9);
});

it('transports seat frames after root turning, freezes holds and clears old replay cues', () => {
  // A moment the schedule has a mill resident fully seated on a rest.
  let seatedHour = 0;
  while (
    seatedHour < 4 &&
    !COMMUNITY_ROSTER.some(
      (p) => p.district === 'mill' && sampleCommunityPerson(p, seatedHour).seat?.amount === 1
    )
  )
    seatedHour += 0.005;
  expect(seatedHour).toBeLessThan(4);
  useGameSimulationStore.setState({
    gameDay: 0,
    gameTime: seatedHour,
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
  const frame = harness.frames[0] as (state: any, delta: number) => void,
    participant = harness.participants.get('personnel')!;
  const snapshot = structuredClone(participant.capture());
  const index = snapshot.residents.findIndex((r: any) => r.pose.seated && r.pose.seat);
  expect(index).toBeGreaterThanOrEqual(0);
  const root = roots[index],
    motion = nodes[index].props.children[0].props.motion;
  root.rotation.y += 1.3;
  frame({ camera, scene }, 1 / 60);
  const cue = motion.seat!,
    anchor = participant.capture().residents[index].pose.seat;
  const mapped = new THREE.Vector3(cue.x, 0, cue.z)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), root.rotation.y)
    .add(root.position);
  expect(mapped.x).toBeCloseTo(anchor.position[0], 6);
  expect(mapped.z).toBeCloseTo(anchor.position[2], 6);
  expect(root.rotation.y + cue.yaw).toBeCloseTo(anchor.rotation, 6);
  expect(motion.attentionYaw).toBe(0);
  const held = structuredClone(cue);
  useGameSimulationStore.setState({ gameSpeed: 0 });
  frame({ camera, scene }, 1 / 60);
  expect(motion.seat.amount).toBe(held.amount);
  const old = structuredClone(participant.capture());
  for (const actor of old.residents) {
    delete actor.pose.seat;
    delete actor.motion.seat;
  }
  participant.restore(old);
  expect(motion.seat).toBeUndefined();
  expect(participant.capture().residents[index].pose.seat).toBeUndefined();
  participant.restore(snapshot);
  expect(motion.seat).toEqual(snapshot.residents[index].motion.seat);
});

it('initializes an unstocked baker as waiting before the first presentation frame', () => {
  const saved = useOperationsCampaignStore.getState();
  try {
    useOperationsCampaignStore.setState({ orders: [], elapsedMinutes: 0 });
    const baker = COMMUNITY_ROSTER.find((person) => person.role === 'Baker')!;
    let hour = 0;
    while (
      (!sampleCommunityPerson(baker, hour).visible ||
        sampleCommunityPerson(baker, hour).activity !== 'working') &&
      hour < 24
    )
      hour += 0.01;
    expect(hour).toBeLessThan(24);
    expect(sampleCommunityPerson(baker, hour).visible).toBe(true);
    useGameSimulationStore.setState({
      gameDay: 0,
      gameTime: hour,
      gameSpeed: 0,
      emergencyActive: false,
      emergencyDrillMode: false,
      weather: 'clear',
    });
    const tree = CommunityLife();
    const node = tree.props.children[0].props.children.find((n: any) => n.props.name === baker.id);
    expect(node.props.children[0].props.motion.activity).toBe('idle');
    expect(node.props.userData).toMatchObject({
      activity: 'idle',
      task: 'Waiting for the cooperative flour order',
    });
    expect(useOperationsCampaignStore.getState().orders).toEqual([]);
  } finally {
    useOperationsCampaignStore.setState(saved);
  }
});

it.each(['stocked', 'rain', 'storm', 'safety'] as const)(
  'resolves initial%s duties from current operations and retains the same live metadata',
  (kind) => {
    const campaign = useOperationsCampaignStore.getState(),
      game = useGameSimulationStore.getState();
    try {
      const orders =
        kind === 'stocked'
          ? ([
              {
                customer: "Riverside Bakers' Cooperative",
                recipe: { finishedMaterial: 'flour' },
                requiredKg: 6000,
                shippedKg: 6000,
                qualityFailureKg: 0,
                status: 'fulfilled',
                manifestIds: ['verified-test-dispatch'],
                completedAtMinute: 100,
              },
            ] as typeof campaign.orders)
          : [];
      useOperationsCampaignStore.setState({ orders, elapsedMinutes: 101 });
      const role = kind === 'rain' || kind === 'storm' ? 'Gardener' : 'Baker';
      const person = COMMUNITY_ROSTER.find((p) => p.role === role)!;
      let hour = 0;
      while (
        (!sampleCommunityPerson(person, hour).visible ||
          sampleCommunityPerson(person, hour).activity !== 'working') &&
        hour < 24
      )
        hour += 0.01;
      expect(hour).toBeLessThan(24);
      useGameSimulationStore.setState({
        gameDay: 0,
        gameTime: hour,
        gameSpeed: 0,
        isTabVisible: true,
        emergencyActive: kind === 'safety',
        emergencyDrillMode: false,
        weather: kind === 'rain' || kind === 'storm' ? kind : 'clear',
      });
      const tree = CommunityLife(),
        nodes = tree.props.children[0].props.children;
      const node = nodes.find((n: any) => n.props.name === person.id),
        metadata = node.props.userData,
        motion = node.props.children[0].props.motion;
      expect(motion.activity).toBe(kind === 'stocked' ? 'working' : 'idle');
      expect(metadata.task).toBe(
        kind === 'safety'
          ? 'Holding safely for the site safety stop'
          : kind === 'rain'
            ? 'Pausing garden work in the rain'
            : kind === 'storm'
              ? 'Pausing garden work during the storm'
              : sampleCommunityPerson(person, hour).task
      );
      const roots = nodes.map((n: any) => {
        const root = new THREE.Group();
        root.name = n.props.name;
        root.position.fromArray(n.props.position);
        root.rotation.y = n.props.rotation[1];
        root.userData = n.props.userData;
        n.props.ref(root);
        return root;
      });
      const scene = new THREE.Scene();
      roots.forEach((root: THREE.Group) => scene.add(root));
      const root = scene.getObjectByName(person.id)!;
      harness.frames[0]({ camera, scene } as never, 1 / 60);
      expect(root.userData).toBe(metadata);
      expect(root.userData.activity).toBe(motion.activity);
      expect(motion.enabled).toBe(false);
      if (kind === 'stocked') {
        useOperationsCampaignStore.setState({ elapsedMinutes: 1540 });
        harness.frames[0]({ camera, scene } as never, 1 / 60);
        expect(root.userData).toBe(metadata);
        expect(motion.activity).toBe('idle');
        expect(metadata.task).toBe('Waiting for the cooperative flour order');
      }
      expect(useOperationsCampaignStore.getState().orders).toBe(orders);
    } finally {
      useOperationsCampaignStore.setState(campaign);
      useGameSimulationStore.setState(game);
    }
  }
);

it('reads walking attention from the actual eased route, wraps headings and preserves holds and replay', () => {
  const person = COMMUNITY_ROSTER.find((p) => p.id === 'village-neighbour')!;
  let hour = 0;
  while (
    hour < 24 &&
    (sampleCommunityPerson(person, hour).activity !== 'walking' ||
      !sampleCommunityPerson(person, hour).visible ||
      sampleCommunityPerson(person, hour).seat)
  )
    hour += 0.001;
  expect(hour).toBeLessThan(24);
  useGameSimulationStore.setState({
    gameTime: hour,
    gameDay: 0,
    gameSpeed: 180,
    isTabVisible: true,
    emergencyActive: false,
    emergencyDrillMode: false,
    weather: 'clear',
  });
  const tree = CommunityLife(),
    nodes = tree.props.children[0].props.children;
  const roots = nodes.map((n: any) => {
    const r = new THREE.Group();
    r.name = n.props.name;
    r.position.fromArray(n.props.position);
    r.rotation.y = n.props.rotation[1];
    n.props.ref(r);
    return r;
  });
  flushEffects();
  const scene = new THREE.Scene();
  roots.forEach((r: THREE.Group) => scene.add(r));
  const index = nodes.findIndex((n: any) => n.props.name === person.id),
    root = roots[index],
    motion = nodes[index].props.children[0].props.motion;
  const previousCamera = camera.position.clone();
  camera.position.copy(root.position).add(new THREE.Vector3(0, 2, 8));
  const frame = harness.frames[0] as (state: any, dt: number) => void,
    participant = harness.participants.get('personnel')!;
  try {
    for (const offset of [-1.1, 1.1, Math.PI * 2 + 0.3]) {
      root.rotation.y = sampleCommunityPerson(person, hour).rotation + offset;
      hour += 0.0001;
      useGameSimulationStore.setState({ gameTime: hour });
      frame({ camera, scene }, 1 / 60);
      const actor = participant.capture().residents[index],
        difference = actor.pose.rotation - root.rotation.y;
      const expected = THREE.MathUtils.clamp(
        Math.atan2(Math.sin(difference), Math.cos(difference)),
        -0.6,
        0.6
      );
      expect(motion.enabled).toBe(true);
      expect(motion.activity).toBe('walking');
      expect(motion.attentionYaw).toBeCloseTo(expected, 8);
      expect(Math.abs(expected)).toBeGreaterThan(0.2);
      expect(root.userData.attentionYaw).toBe(motion.attentionYaw);
      const saved = structuredClone(participant.capture());
      participant.restore(saved);
      expect(motion.attentionYaw).toBe(saved.residents[index].motion.attentionYaw);
    }
    useGameSimulationStore.setState({ gameSpeed: 0 });
    frame({ camera, scene }, 1 / 60);
    expect(motion.attentionYaw).toBe(0);
    useGameSimulationStore.setState({ gameSpeed: 180, gameTime: hour + 1 });
    frame({ camera, scene }, 1 / 60);
    expect(motion.attentionYaw).toBe(0);
    const old = structuredClone(participant.capture());
    old.residents.forEach((a: any) => {
      delete a.motion.attentionYaw;
    });
    participant.restore(old);
    expect(motion.attentionYaw).toBe(0); // Existing old-replay neutral default.
  } finally {
    camera.position.copy(previousCamera);
  }
});
