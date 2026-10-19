import { beforeEach, expect, it } from 'vitest';
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

// After a programme completes, the line builds stock at its 70% setpoint. A
// shipping truck that loaded then would carry that stock to no customer: no
// order credit, no revenue, and the batches it took could never be credited
// to the next programme. The truck holds at the dock, with nothing loaded and
// a reason, until a programme opens a commitment.

const tick: TickContext = {
  deltaSeconds: 0.5,
  gameTime: 0,
  gameSpeed: STANDARD_GAME_SPEED,
  elapsedTime: 0,
  tickCount: 0,
};

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
  // Genuine packed flour with batch identity, as the line would leave it.
  useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
  // The programme is complete: every commitment fulfilled.
  const campaign = useOperationsCampaignStore.getState();
  useOperationsCampaignStore.setState({
    orders: campaign.orders.map((order) => ({
      ...order,
      status: 'fulfilled' as const,
      shippedKg: order.requiredKg,
      completedAtMinute: 120,
    })),
    activeOrderId: null,
  });
  unifiedGameTick({ ...tick, tickCount: 1 });
});

it('holds a docked truck with nothing loaded while no commitment is open, then loads for the next programme', () => {
  const flow = useMaterialFlowStore.getState();
  const releasedBefore = flow.productionBatches
    .filter((batch) => batch.materialType === 'flour')
    .reduce((sum, batch) => sum + batch.availableKg, 0);
  expect(releasedBefore).toBeGreaterThan(0);
  const creditedBefore = { ...useOperationsCampaignStore.getState().creditedBatchKg };
  const revenueBefore = useOperationsCampaignStore.getState().economics.revenue;

  const trucks = useTruckScheduleStore.getState();
  trucks.setTruckDocked('shipping', true);
  trucks.setTruckTransferReady('shipping', true);
  for (let index = 0; index < 40; index++) unifiedGameTick({ ...tick, tickCount: index + 2 });

  const campaign = useOperationsCampaignStore.getState();
  expect(campaign.execution.dispatchLoad).toMatchObject({ status: 'held', loadedKg: 0 });
  expect(campaign.execution.dispatchLoad.blockReason).toMatch(/^No customer commitment is open/);
  // Not ready, so the dock never completes service and the truck stays.
  expect(campaign.execution.dispatchLoad.status).not.toBe('ready');
  expect(useMaterialFlowStore.getState().shippedKg).toBe(0);
  expect(campaign.creditedBatchKg).toEqual(creditedBefore);
  expect(campaign.economics.revenue).toBe(revenueBefore);
  // A wait for a commitment is not a quality hold: no demurrage accrues.
  expect(campaign.costRates.demurrage).toBe(0);
  // One notice says why, not a quality-hold warning.
  const notices = useUIStore
    .getState()
    .alerts.filter((alert) => alert.id.startsWith('dispatch-commitment-wait-'));
  expect(notices).toHaveLength(1);
  expect(notices[0]).toMatchObject({ type: 'info', title: 'Shipping Waiting for a Programme' });
  expect(useUIStore.getState().alerts.some((a) => a.title === 'Dispatch Quality Hold')).toBe(false);

  // The stock is still there for the next programme, which loads it.
  expect(campaign.acceptNextProgramme()).toBe(true);
  const flourOrder = useOperationsCampaignStore
    .getState()
    .orders.find(
      (order) => order.status !== 'fulfilled' && order.recipe.finishedMaterial === 'flour'
    )!;
  useOperationsCampaignStore.getState().activateOrder(flourOrder.id);
  for (let index = 0; index < 20; index++) unifiedGameTick({ ...tick, tickCount: index + 50 });
  const load = useOperationsCampaignStore.getState().execution.dispatchLoad;
  expect(load.materialType).toBe('flour');
  expect(load.loadedKg).toBeGreaterThan(0);
});

it('says why in Brazilian Portuguese', () => {
  setLocale('pt-BR');
  try {
    const trucks = useTruckScheduleStore.getState();
    trucks.setTruckDocked('shipping', true);
    trucks.setTruckTransferReady('shipping', true);
    unifiedGameTick({ ...tick, tickCount: 2 });
    expect(useOperationsCampaignStore.getState().execution.dispatchLoad.blockReason).toMatch(
      /^Nenhum compromisso com cliente está aberto/
    );
  } finally {
    setLocale('en');
  }
});
