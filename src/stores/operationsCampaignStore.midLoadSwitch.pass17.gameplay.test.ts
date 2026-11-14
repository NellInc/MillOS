import { beforeEach, expect, it } from 'vitest';
import { STANDARD_GAME_SPEED } from '../simulation/pace';
import { resetUnifiedTickState, unifiedGameTick } from '../systems/UnifiedGameTick';
import type { TickContext } from '../systems/CentralTickSystem';
import { useMaterialFlowStore } from './materialFlowStore';
import { useQCLabStore } from './qcLabStore';
import { useTruckScheduleStore } from './truckScheduleStore';
import { useUIStore } from './uiStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useLogisticsLayoutStore, defaultSavedLogisticsLayout } from './logisticsLayoutStore';
import { setLocale } from '../i18n';

// A shipping truck loads the product it docked for. Switching the line to
// another product's commitment mid-load leaves the truck's material as it was
// (it already holds that product), and the departure credits the load to the
// open orders of THAT product. The loading cap read the newly active order's
// remainder instead, a different product's: a flour truck holding 3,000 kg was
// cut to the 1,000 kg a semolina order still owed and left nearly empty.
// Working if the truck keeps loading its own product toward what that
// product's open orders owe, and never holds less than it already loaded.

const tick: TickContext = {
  deltaSeconds: 0.5,
  gameTime: 0,
  gameSpeed: STANDARD_GAME_SPEED,
  elapsedTime: 0,
  tickCount: 0,
};

const releasedFlour = () =>
  useMaterialFlowStore
    .getState()
    .productionBatches.filter(
      (batch) => batch.materialType === 'flour' && batch.disposition === 'released'
    );

/** Sets the released flour on hand to `kg`, on the first released batch. */
function setReleasedFlour(kg: number) {
  const first = releasedFlour()[0];
  useMaterialFlowStore.setState((state) => ({
    productionBatches: state.productionBatches.map((batch) =>
      batch.materialType !== 'flour' || batch.disposition !== 'released'
        ? batch
        : batch.id === first.id
          ? // Tested stock (plan item 3.2): the fixture predates the lab's bench.
            {
              ...batch,
              availableKg: kg,
              producedKg: Math.max(batch.producedKg, kg),
              awaitingTest: undefined,
            }
          : { ...batch, availableKg: 0 }
    ),
  }));
}

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

it('keeps loading a flour truck after the line switches to a semolina order that owes less', () => {
  expect(releasedFlour().length).toBeGreaterThan(0);
  expect(useOperationsCampaignStore.getState().activeOrderId).toBe('order-001');
  setReleasedFlour(3000);
  const trucks = useTruckScheduleStore.getState();
  trucks.setTruckDocked('shipping', true);
  trucks.setTruckTransferReady('shipping', true);
  for (let index = 0; index < 30; index++) {
    setReleasedFlour(3000);
    unifiedGameTick({ ...tick, tickCount: index + 1 });
  }
  const before = useOperationsCampaignStore.getState().execution.dispatchLoad;
  expect(before.materialType).toBe('flour');
  expect(before.loadedKg).toBeCloseTo(3000, 0);

  // The semolina commitment owes only 1,000 kg; the player puts it first.
  useOperationsCampaignStore.setState((state) => ({
    orders: state.orders.map((order) =>
      order.id === 'order-002' ? { ...order, shippedKg: order.requiredKg - 1000 } : order
    ),
  }));
  useOperationsCampaignStore.getState().activateOrder('order-002');
  expect(useOperationsCampaignStore.getState().activeOrderId).toBe('order-002');

  // More flour is released from the line's pipeline.
  for (let index = 0; index < 30; index++) {
    setReleasedFlour(4000);
    unifiedGameTick({ ...tick, tickCount: index + 40 });
  }
  const after = useOperationsCampaignStore.getState().execution.dispatchLoad;
  expect(after.materialType).toBe('flour');
  // The flour the truck already holds stays on it, and it finishes its load.
  expect(after.loadedKg).toBeCloseTo(4000, 0);
});

it('never holds less than it loaded when the newly active order of its own product owes less', () => {
  setReleasedFlour(3000);
  const trucks = useTruckScheduleStore.getState();
  trucks.setTruckDocked('shipping', true);
  trucks.setTruckTransferReady('shipping', true);
  for (let index = 0; index < 30; index++) {
    setReleasedFlour(3000);
    unifiedGameTick({ ...tick, tickCount: index + 1 });
  }
  expect(useOperationsCampaignStore.getState().execution.dispatchLoad.loadedKg).toBeCloseTo(
    3000,
    0
  );
  // order-003 (community flour) owes 1,000 kg; order-001 still owes 6,000.
  useOperationsCampaignStore.setState((state) => ({
    orders: state.orders.map((order) =>
      order.id === 'order-003' ? { ...order, shippedKg: order.requiredKg - 1000 } : order
    ),
  }));
  useOperationsCampaignStore.getState().activateOrder('order-003');
  for (let index = 0; index < 30; index++) {
    setReleasedFlour(4000);
    unifiedGameTick({ ...tick, tickCount: index + 40 });
  }
  const after = useOperationsCampaignStore.getState().execution.dispatchLoad;
  expect(after.loadedKg).toBeGreaterThanOrEqual(3000 - 1e-6);
});
