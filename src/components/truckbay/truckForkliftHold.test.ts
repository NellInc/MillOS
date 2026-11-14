import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createTruckController,
  stepTruckController,
  truckWorldFrame,
  type TruckControllerState,
} from './truckController';
import { manualForkliftInTruckPath } from '../../simulation/vehicles/forkliftManualWorld';
import { positionRegistry } from '../../utils/positionRegistry';
import { useUIStore } from '../../stores/uiStore';
import { setLocale } from '../../i18n';
import { alertText } from '../../i18n/alertCopy';
import {
  forkliftHoldingTruck,
  resetTruckForkliftHoldNotices,
  syncTruckForkliftHoldNotice,
  truckForkliftHoldAlertId,
} from './truckForkliftHold';

const NOTICE = truckForkliftHoldAlertId('shipping');
const notice = () => useUIStore.getState().alerts.find((alert) => alert.id === NOTICE);

const frame = { x: 0, z: 0, tractorYaw: 0, trailerYaw: 0 };

/**
 * One controller step as TruckBay's tick takes it: the manual-forklift path
 * hold, the step, then the notice for whatever holds the truck.
 */
const tick = (truck: TruckControllerState, lane: { stopReason?: string; stop?: boolean } = {}) => {
  const heldInPath = truck.active && truck.phase !== 'docked' && manualForkliftInTruckPath(truck);
  const next = stepTruckController(truck, {
    deltaSeconds: 1 / 60,
    arrivalReady: true,
    safetyHold: heldInPath,
    serviceComplete: true,
    speedMultiplier: 1,
  }).state;
  const world = truckWorldFrame(next, frame);
  syncTruckForkliftHoldNotice(
    'shipping',
    forkliftHoldingTruck(
      'shipping',
      world.x,
      world.z,
      heldInPath,
      next.phase === 'docked' && next.servicePhase === 'transfer',
      false,
      lane.stop ?? false,
      lane.stopReason
    ),
    next.motion.speed,
    next.active
  );
  return { truck: next, heldInPath };
};

beforeEach(() => {
  useUIStore.setState({ alerts: [] });
  resetTruckForkliftHoldNotices();
});

afterEach(() => {
  positionRegistry.unregister('forklift-1');
  positionRegistry.unregister('forklift-2');
  setLocale('en');
});

describe('a truck held by a forklift says which one', () => {
  it('names FLT01 once when it is driven into the backing truck’s path, and clears when the truck moves on', () => {
    let truck = createTruckController('shipping', true, 'entering');
    for (let i = 0; i < 60 * 600 && truck.phase !== 'backing'; i += 1) truck = tick(truck).truck;
    const world = truckWorldFrame(truck, frame);
    // FLT01, driven, standing on the apron behind the reversing trailer.
    positionRegistry.register(
      'forklift-1',
      world.x - Math.sin(world.trailerYaw) * 16,
      world.z - Math.cos(world.trailerYaw) * 16,
      0,
      1,
      true,
      0,
      'forklift',
      true
    );

    let raised = 0;
    const stop = useUIStore.subscribe((state, previous) => {
      const now = state.alerts.find((alert) => alert.id === NOTICE);
      const before = previous.alerts.find((alert) => alert.id === NOTICE);
      if (now && now !== before) raised += 1;
    });
    let heldSteps = 0;
    for (let i = 0; i < 60 * 30; i += 1) {
      const step = tick(truck);
      truck = step.truck;
      if (step.heldInPath) heldSteps += 1;
    }
    expect(heldSteps).toBeGreaterThan(0);
    expect(Math.abs(truck.motion.speed)).toBeLessThan(1e-3);
    expect(notice()?.type).toBe('warning');
    expect(notice()?.title).toBe('Truck waiting for FLT01');
    expect(notice()?.message).toBe('FLT01 is in the shipping truck’s path.');

    // The driver moves off: the truck backs on to the dock and the notice goes.
    positionRegistry.unregister('forklift-1');
    for (let i = 0; i < 60 * 30 && notice(); i += 1) truck = tick(truck).truck;
    stop();
    expect(notice()).toBeUndefined();
    expect(raised).toBe(1);
  });

  it('files nothing for the dock forklift working the load in its lane', () => {
    positionRegistry.register('forklift-1', 0, 45, 0, 1, false, 0, 'forklift', false);
    let truck = createTruckController('shipping', true, 'docked');
    for (let i = 0; i < 60 * 20; i += 1) {
      truck = tick(truck, { stopReason: 'load-operation' }).truck;
    }
    expect(useUIStore.getState().alerts).toEqual([]);
  });

  it('names FLT01 when the forklift-only stop holds it in the dock lane', () => {
    positionRegistry.register('forklift-1', 0, 45, 0, 1, true, 0, 'forklift', false);
    let truck = createTruckController('shipping', true, 'docked');
    for (let i = 0; i < 60 * 20 && !notice(); i += 1) {
      truck = tick(truck, { stopReason: 'emergency-stop', stop: true }).truck;
    }
    expect(notice()?.title).toBe('Truck waiting for FLT01');
    expect(notice()?.message).toBe(
      'FLT01 is in the shipping dock lane, so the truck cannot leave.'
    );
  });

  it('leaves a truck held by a plant-wide stop to that stop’s own notices', () => {
    positionRegistry.register('forklift-1', 0, 45, 0, 1, true, 0, 'forklift', true);
    expect(
      forkliftHoldingTruck('shipping', 0, 60, true, true, true, true, 'emergency-stop')
    ).toBeNull();
  });

  it('reads in Portuguese after a language switch', () => {
    syncTruckForkliftHoldNotice('shipping', { forkliftId: 'forklift-1', kind: 'lane' }, 0, true);
    setLocale('pt-BR');
    const words = alertText(notice()!);
    expect(words.title).toBe('Caminhão aguardando FLT01');
    expect(words.message).toBe(
      'FLT01 está na faixa da doca de expedição, e o caminhão não pode sair.'
    );
  });
});
