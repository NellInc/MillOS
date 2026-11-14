import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useUIStore } from '../../stores/uiStore';
import type { TickContext } from '../CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import { celebrateCampaignResults, openOrderIds } from '../campaignResults';

const context: TickContext = {
  deltaSeconds: 0.5,
  gameTime: 0,
  gameSpeed: 1,
  elapsedTime: 0,
  tickCount: 1,
};
const campaign = () => useOperationsCampaignStore.getState();
const queue = () => useGameSimulationStore.getState().celebrations.milestoneQueue;
const fulfil = (id: string, completedAtMinute: number) =>
  useOperationsCampaignStore.setState({
    orders: campaign().orders.map((order) =>
      order.id === id
        ? { ...order, shippedKg: order.requiredKg, status: 'fulfilled' as const, completedAtMinute }
        : order
    ),
  });

beforeEach(() => {
  resetUnifiedTickState();
  campaign().resetCampaign();
  useTruckScheduleStore.getState().resetTruckSchedule();
  useMaterialFlowStore.getState().resetMaterialFlow();
  useBreakdownStore.getState().resetBreakdownStore();
  useQCLabStore.getState().resetQCLab();
  useGameSimulationStore.getState().resetGameState();
  useUIStore.setState({ alerts: [] });
  unifiedGameTick(context);
  useGameSimulationStore.getState().discardCelebrations();
});

describe('the results a running tick queues for the HUD', () => {
  it('queues order-001 delivered, naming its customer, on time, once', () => {
    // The real tick: the campaign's own tick fulfils the order inside it.
    const real = campaign().tickCampaign;
    const tick = vi.spyOn(campaign(), 'tickCampaign').mockImplementation((seconds, ctx) => {
      real(seconds, ctx);
      fulfil('order-001', campaign().elapsedMinutes);
    });
    try {
      unifiedGameTick({ ...context, tickCount: 2 });
    } finally {
      tick.mockRestore();
      // Later states copied the spy; put the store's own action back.
      useOperationsCampaignStore.setState({ tickCampaign: real });
    }
    expect(queue()).toEqual([
      expect.objectContaining({
        type: 'order_fulfilled',
        customer: "Riverside Bakers' Cooperative",
        value: 6000,
        lateMinutes: 0,
      }),
    ]);
    unifiedGameTick({ ...context, tickCount: 3 });
    expect(queue()).toHaveLength(1);
  });

  it('queues nothing for an order a restore wrote as fulfilled', () => {
    // A restore sets the stores before any tick runs.
    fulfil('order-001', 100);
    unifiedGameTick({ ...context, tickCount: 2 });
    expect(queue()).toEqual([]);
  });

  it('counts a delivery past its due minute as late, in whole minutes rounded up', () => {
    const openBefore = openOrderIds();
    const due = campaign().orders.find((order) => order.id === 'order-001')!.dueAtMinute;
    fulfil('order-001', due + 12.2);
    celebrateCampaignResults(openBefore, campaign().reports.at(-1)?.id);
    expect(queue()).toEqual([
      expect.objectContaining({ type: 'order_fulfilled', lateMinutes: 13 }),
    ]);
  });

  it('queues a graded shift close with its grade, and not an ungraded one', () => {
    const report = {
      id: 'report-test-1',
      shiftKey: 'day-0-morning',
      shiftLabel: 'Morning',
      startedAtMinute: 0,
      endedAtMinute: 480,
      metrics: campaign().shiftMetrics,
      completedOrderIds: [],
      openRisks: [],
      grade: 'B' as const,
      summary: '',
    };
    useOperationsCampaignStore.setState({ reports: [report] });
    celebrateCampaignResults(new Set(), undefined);
    expect(queue()).toEqual([
      expect.objectContaining({ type: 'shift_complete', grade: 'B', shiftKey: 'day-0-morning' }),
    ]);
    useOperationsCampaignStore.setState({
      reports: [report, { ...report, id: 'report-test-2', grade: null }],
    });
    celebrateCampaignResults(new Set(), 'report-test-1');
    expect(queue()).toHaveLength(1);
  });
});
