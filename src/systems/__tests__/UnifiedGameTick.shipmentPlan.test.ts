import { beforeEach, describe, expect, it } from 'vitest';
import type { ShipmentPolicy } from '../../simulation/shipmentPlan';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import type { TickContext } from '../CentralTickSystem';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useUIStore } from '../../stores/uiStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import {
  useLogisticsLayoutStore,
  defaultSavedLogisticsLayout,
} from '../../stores/logisticsLayoutStore';
import { setLocale } from '../../i18n';

// Today a shipping truck is SIZED by the active order (it loads toward that
// order's remainder) but CREDITED by the dispatch queue (open orders of its
// product, by priority, then due). After the player activates a later order of
// the same product, the two differ: the load goes to the earlier, more urgent
// order. Working if the default plan keeps that split exactly, so extracting
// the decision (src/simulation/shipmentPlan.ts) changes no credit.

const tick: TickContext = {
  deltaSeconds: 0.5,
  gameTime: 0,
  gameSpeed: STANDARD_GAME_SPEED,
  elapsedTime: 0,
  tickCount: 0,
};

/**
 * Sets the released flour on hand to `kg`, on the first released batch, as
 * tested stock (plan item 3.2): this fixture predates the lab's bench, and
 * the flour it describes is ready to load.
 */
function setReleasedFlour(kg: number) {
  const first = useMaterialFlowStore
    .getState()
    .productionBatches.find(
      (batch) => batch.materialType === 'flour' && batch.disposition === 'released'
    )!;
  useMaterialFlowStore.setState((state) => ({
    productionBatches: state.productionBatches.map((batch) =>
      batch.materialType !== 'flour' || batch.disposition !== 'released'
        ? batch
        : batch.id === first.id
          ? {
              ...batch,
              availableKg: kg,
              producedKg: Math.max(batch.producedKg, kg),
              awaitingTest: undefined,
            }
          : { ...batch, availableKg: 0 }
    ),
  }));
}

const order = (id: string) =>
  useOperationsCampaignStore.getState().orders.find((candidate) => candidate.id === id)!;

beforeEach(() => {
  setLocale('en');
  resetUnifiedTickState();
  useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useTruckScheduleStore.getState().resetTruckSchedule();
  useQCLabStore.setState((state) => ({
    qcLab: {
      ...state.qcLab,
      isRunning: false,
      currentTest: null,
      testHistory: [],
      certificationStatus: 'valid',
      contaminationAlerts: [],
    },
  }));
  useUIStore.setState({ alerts: [] });
  unifiedGameTick(tick);
  useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
});

/**
 * order-001 (critical flour, owes 6,000) and order-003 (normal flour, owes
 * 8,000) are both open; the player puts order-003 first. A truck docks,
 * loads from 3,000 kg of released flour and leaves.
 */
function loadAndDepartWithOrder003Active(policy?: ShipmentPolicy) {
  const run = (context: TickContext) =>
    policy ? unifiedGameTick(context, policy) : unifiedGameTick(context);
  useOperationsCampaignStore.getState().activateOrder('order-003');
  expect(useOperationsCampaignStore.getState().activeOrderId).toBe('order-003');
  setReleasedFlour(3000);
  const trucks = useTruckScheduleStore.getState();
  trucks.setTruckDocked('shipping', true);
  trucks.setTruckTransferReady('shipping', true);
  for (let index = 0; index < 30; index++) {
    setReleasedFlour(3000);
    run({ ...tick, tickCount: index + 1 });
  }
  const load = useOperationsCampaignStore.getState().execution.dispatchLoad;
  trucks.setTruckDocked('shipping', false);
  trucks.setTruckTransferReady('shipping', false);
  trucks.recordTruckDeparture('shipping', 30);
  run({ ...tick, tickCount: 40 });
  return load;
}

it('credits a load sized by a later active order to the most urgent open order of its product', () => {
  // Pinned to the old rule: 'fill' is the game's policy since plan item 3.4,
  // and it serves the earliest-due order first.
  const load = loadAndDepartWithOrder003Active('default');
  expect(load.materialType).toBe('flour');
  expect(load.loadedKg).toBeGreaterThan(2900);
  expect(load.status).toBe('ready');

  // The fixture inflates the batch's released kg, not the packer's output or
  // its traced grain, so less ships and is credited than was loaded; what is
  // credited all goes to order-001.
  expect(useMaterialFlowStore.getState().shippedKg).toBeGreaterThan(0);
  expect(useMaterialFlowStore.getState().manifests.at(-1)?.orderId).toBe('order-001');
  expect(order('order-001').shippedKg).toBeGreaterThan(0);
  expect(order('order-003').shippedKg).toBe(0);
});

it('under the partial policy, leaves at 2,500 kg and credits the active order', () => {
  const load = loadAndDepartWithOrder003Active('partial');
  expect(load.loadedKg).toBeCloseTo(2500, 6);
  expect(load.status).toBe('ready');
  expect(useMaterialFlowStore.getState().manifests.at(-1)?.orderId).toBe('order-003');
  expect(order('order-003').shippedKg).toBeGreaterThan(0);
  expect(order('order-001').shippedKg).toBe(0);
});

describe('crediting a shipping manifest', () => {
  const shipAndCredit = (orderId?: string) => {
    useOperationsCampaignStore.getState().activateOrder('order-003');
    const shipped = useMaterialFlowStore
      .getState()
      .shipFinishedGoods(10, 'flour', orderId ? { orderId } : undefined);
    expect(shipped).toBeGreaterThan(0);
    // No truck is docked: this tick only credits the new manifest.
    unifiedGameTick({ ...tick, tickCount: 50 });
  };

  it('credits a manifest without an order id by the dispatch queue (old saves, trucks in flight)', () => {
    shipAndCredit();
    expect(order('order-001').shippedKg).toBeGreaterThan(0);
    expect(order('order-003').shippedKg).toBe(0);
  });

  it('serves the order a manifest names first', () => {
    shipAndCredit('order-003');
    expect(order('order-003').shippedKg).toBeGreaterThan(0);
    expect(order('order-001').shippedKg).toBe(0);
  });

  it('ignores a named order of another product', () => {
    shipAndCredit('order-002');
    expect(order('order-001').shippedKg).toBeGreaterThan(0);
    expect(order('order-002').shippedKg).toBe(0);
  });
});
