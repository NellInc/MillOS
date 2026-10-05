import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  currentLogisticsLayout,
  DEFAULT_PLANNING_ASSUMPTIONS,
  logisticsLoadingRate,
  optimizeLogisticsLayout,
  planningObstacles,
} from './layoutPlanning';
import {
  drivenLogisticsRoute,
  prepareLogisticsFleet,
  reconcileLogisticsMotion,
  registerLogisticsVehicle,
} from './logisticsRuntime';
import { createInitialForkliftMotion } from './vehicles/forkliftController';
import { sampleArcLengthPath } from './vehicles/vehicleKinematics';
import {
  useLogisticsLayoutStore,
  defaultSavedLogisticsLayout,
  logisticsControlHold,
} from '../stores/logisticsLayoutStore';
import { canonicalProcessMachines } from './materialTransport';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useSafetyStore } from '../stores/safetyStore';
import { useMaterialFlowStore, cloneMaterialFlowData } from '../stores/materialFlowStore';
import { spoutMachineKey } from '../components/flow/spoutRoutes';
import type { MachineData } from '../types';
import * as scada from '../scada/SCADAService';

const removals: Array<() => void> = [];
beforeEach(() => {
  useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
  useProductionStore.setState({
    machines: canonicalProcessMachines() as MachineData[],
    productionSpeed: 0,
    scadaLive: false,
  });
  useGameSimulationStore.getState().resetGameState();
  useGameSimulationStore.getState().setGameSpeed(0);
  useSafetyStore.getState().setForkliftEmergencyStop(false);
  useMaterialFlowStore.getState().resetMaterialFlow();
});
afterEach(() => {
  removals.splice(0).forEach((f) => f());
  vi.restoreAllMocks();
});
const proposal = () =>
  optimizeLogisticsLayout(
    currentLogisticsLayout(),
    DEFAULT_PLANNING_ASSUMPTIONS,
    planningObstacles()
  ).proposal;
const key = () => spoutMachineKey(useProductionStore.getState().machines);

describe('live logistics contract', () => {
  it('remaps the directed loaded and return legs without changing physical momentum or pose', () => {
    const current = currentLogisticsLayout();
    const old = drivenLogisticsRoute('shipping', current.routes.shipping).plan;
    const next = drivenLogisticsRoute('shipping', proposal().routes.shipping).plan;
    for (const [distance, action] of [
      [10, 1],
      [old.path.totalLength - 10, 0],
    ] as const) {
      const sample = sampleArcLengthPath(old.path, distance);
      const motion = {
        ...createInitialForkliftMotion(old, current.routes.shipping[0]),
        routeDistance: distance,
        x: sample.x,
        z: sample.z,
        wheelTravel: 137,
        speed: 1.3,
        acceleration: 0.2,
      };
      const mapped = reconcileLogisticsMotion(old, next, motion, action);
      expect(mapped).not.toBeNull();
      expect({ ...mapped, routeDistance: motion.routeDistance }).toEqual(motion);
      const target = sampleArcLengthPath(next.path, mapped!.routeDistance);
      expect(target.x).toBeCloseTo(sample.x, 6);
      expect(target.z).toBeCloseTo(sample.z, 6);
      expect(target.tangentX * sample.tangentX + target.tangentZ * sample.tangentZ).toBeGreaterThan(
        0.995
      );
    }
    const corner = old.path.samples.find((s) => s.x > 23 && s.z > 42.05 && s.z < 43)!;
    expect(corner).toBeDefined();
    const changed = structuredClone(current);
    changed.routes.shipping[2] = [27, 0, 42];
    expect(
      reconcileLogisticsMotion(
        old,
        drivenLogisticsRoute('shipping', changed.routes.shipping).plan,
        {
          ...createInitialForkliftMotion(old, current.routes.shipping[0]),
          x: corner.x,
          z: corner.z,
          routeDistance: corner.distance,
        },
        1
      )
    ).toBeNull();
  });

  it('prepares all owners without writes and refuses the complete commit when either owner rejects', () => {
    let writes = 0;
    removals.push(
      registerLogisticsVehicle('shipping', { prepare: () => () => writes++, restore: () => {} })
    );
    removals.push(
      registerLogisticsVehicle('receiving', { prepare: () => 'changed corner', restore: () => {} })
    );
    expect(prepareLogisticsFleet(proposal())).toBe('changed corner');
    expect(writes).toBe(0);
  });

  it('gates apply, seals actual observations and undoes geometry without rewinding stock', () => {
    const plan = proposal();
    for (const dock of ['shipping', 'receiving'] as const)
      removals.push(registerLogisticsVehicle(dock, { prepare: () => () => {}, restore: () => {} }));
    const store = useLogisticsLayoutStore.getState();
    useProductionStore.getState().setProductionSpeed(1);
    expect(store.apply(plan, 0, key()).reason).toContain('Pause');
    useProductionStore.getState().setProductionSpeed(0);
    useSafetyStore.getState().setForkliftEmergencyStop(true);
    expect(store.apply(plan, 0, key()).reason).toContain('safety hold');
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useProductionStore.setState({ scadaLive: true });
    expect(store.apply(plan, 0, key()).reason).toContain('SCADA');
    useProductionStore.setState({ scadaLive: false });
    expect(store.apply(plan, 99, key()).reason).toContain('changed');
    const session = useMaterialFlowStore.getState().sessionId;
    store.observe(session, 10, 12, 120, 0, 'same');
    store.recordVehicle('shipping', 20, true);
    const stock = cloneMaterialFlowData(useMaterialFlowStore.getState());
    expect(store.apply(plan, 0, key()).changed).toBe(true);
    expect(useLogisticsLayoutStore.getState().before).toMatchObject({
      activeSeconds: 10,
      packedKg: 120,
      vehicleMetres: 20,
      completedUnloads: 1,
    });
    store.observe(session, 8, 8, 80, 10, 'same');
    expect(store.undoApplied(1, key()).changed).toBe(true);
    expect(useLogisticsLayoutStore.getState().layout).toEqual(currentLogisticsLayout());
    expect(useLogisticsLayoutStore.getState().retainedAfter?.shippedKg).toBe(10);
    expect(cloneMaterialFlowData(useMaterialFlowStore.getState())).toEqual(stock);
    store.observe('new-material-session', 1, 1, 0, 0, 'same');
    expect(useLogisticsLayoutStore.getState().before).toBeNull();
    expect(useLogisticsLayoutStore.getState().retainedAfter).toBeNull();
    expect(logisticsLoadingRate(currentLogisticsLayout())).toBe(400);
    expect(logisticsLoadingRate(plan)).toBeGreaterThan(400);
  });
});

it('permits default simulated telemetry while blocking live, hybrid and disconnected service modes', () => {
  useProductionStore.setState({ scadaLive: true });
  const peek = vi.spyOn(scada, 'peekSCADAService');
  peek.mockReturnValue(new scada.SCADAService({ mode: 'simulation' }));
  expect(logisticsControlHold()).toBeNull();
  for (const mode of ['live', 'hybrid', 'disconnected'] as const) {
    peek.mockReturnValue(new scada.SCADAService({ mode }));
    expect(logisticsControlHold()).toContain('local simulation control');
  }
});
