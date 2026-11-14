import { beforeEach, describe, expect, it } from 'vitest';
import { planPlantEffect, useWorkplaceStore } from './workplaceStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { useQCLabStore } from './qcLabStore';
import { buildProgramme } from '../simulation/programmes';
import { planShipment, shipmentOrdersFrom } from '../simulation/shipmentPlan';
import { createWorkplace, restoreWorkplace, saveWorkplace } from '../simulation/bilateralWorkplace';
import { minutesInHand } from '../simulation/workplaceResequence';
import { WORKPLACE_CHECKS, requiredChecks } from '../simulation/workplaceCampaign';
import { endReplayClock } from '../simulation/workplaceReplayRuntime';
import { useWorkplaceAutoplay } from '../simulation/workplaceAutoplay';
import { setLocale } from '../i18n';

// Plan item 5.4. "Resequence together" cost 40 credits and changed nothing the
// plant reads. Working if, agreed and activated, it moves which order the next
// truck serves (the campaign's own order activation), says so on its choice
// with the minutes each open order then has in hand, and gives the order back
// when the shift ends.

const RUSH = 'programme-2-order-1';
const STANDARD = 'programme-2-order-2';

beforeEach(() => {
  setLocale('en');
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  useGameSimulationStore.setState({
    emergencyActive: false,
    emergencyDrillMode: false,
    preEmergencyMachineStatuses: new Map(),
  });
  useMaterialFlowStore.getState().resetMaterialFlow();
  useQCLabStore.getState().resetQCLab();
  const initial = useOperationsCampaignStore.getInitialState();
  useOperationsCampaignStore.setState(initial, true);
  // Programme 2: the rush is the semolina customer, alone on its grain; the
  // standard (high) and bulk orders are flour.
  const programme = buildProgramme(initial.orders, 2, 'morning', 0);
  useOperationsCampaignStore.setState({ orders: programme, activeOrderId: RUSH });
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
    completedCampaigns: [],
    leftCampaigns: [],
  });
});

const store = () => useWorkplaceStore.getState();
const workplace = () => store().workplace;
const must = (result: { changed: boolean; reason: string | null }) => {
  expect(result.changed, result.reason ?? '').toBe(true);
};
const nextTruckServes = () => {
  const operations = useOperationsCampaignStore.getState();
  return planShipment({
    orders: shipmentOrdersFrom(operations.orders),
    activeOrderId: operations.activeOrderId,
    truck: { materialType: 'flour', loadedKg: 0, capacityKg: 5000 },
    stock: [],
  }).orderId;
};

function agreeResequence() {
  must(store().selectPlan('resequence'));
  for (const id of requiredChecks('packing')) {
    const q = WORKPLACE_CHECKS.find((c) => c.id === id)!;
    if (workplace().campaign?.checks.packing?.[id] !== q.correct)
      must(store().answerCheck('packing', id, q.correct));
  }
  must(store().understand('packing'));
  must(store().vote('packing', true));
  store().simulateResponses({});
}

describe('5.4: resequencing moves the rush', () => {
  it('agreed, it serves another order first on the next truck; the shift’s end gives the rush back', () => {
    expect(useOperationsCampaignStore.getState().orders[0].rushPremiumPercent).toBeGreaterThan(0);
    expect(nextTruckServes()).toBe(RUSH);
    must(store().startMission('team', 17));
    agreeResequence();
    // Its choice says what it does, before the vote.
    const said = planPlantEffect(workplace()).join(' ');
    expect(said).toMatch(/^.*Serves .+ first; the rush waits a truck\. In hand: .+min/);
    must(store().activate(workplace().revision));
    expect(useOperationsCampaignStore.getState().activeOrderId).toBe(STANDARD);
    expect(nextTruckServes()).toBe(STANDARD);
    for (let i = 0; i < 40 && workplace().phase === 'active'; i++) store().tick(5, 0, false);
    expect(workplace().phase).toBe('review');
    expect(useOperationsCampaignStore.getState().activeOrderId).toBe(RUSH);
    expect(nextTruckServes()).toBe(RUSH);
  });

  it('a shift reloaded and resumed resequences the same way it began', () => {
    must(store().startMission('team', 17));
    agreeResequence();
    must(store().activate(workplace().revision));
    store().tick(20, 0, false);
    expect(useOperationsCampaignStore.getState().activeOrderId).toBe(STANDARD);
    // A reload pauses the shift; the plant keeps the order it was given.
    useWorkplaceStore.setState({ workplace: restoreWorkplace(saveWorkplace(workplace())) });
    must(store().resumeShift(workplace().revision));
    for (const id of requiredChecks('packing')) {
      const q = WORKPLACE_CHECKS.find((c) => c.id === id)!;
      if (workplace().campaign?.checks.packing?.[id] !== q.correct)
        must(store().answerCheck('packing', id, q.correct));
    }
    if (!workplace().members[0].understood) must(store().understand('packing'));
    if (workplace().members[0].ballot !== true) must(store().vote('packing', true));
    store().simulateResponses({});
    expect(planPlantEffect(workplace()).join(' ')).toMatch(/the rush waits a truck/);
    must(store().activate(workplace().revision));
    expect(useOperationsCampaignStore.getState().activeOrderId).toBe(STANDARD);
    expect(nextTruckServes()).toBe(STANDARD);
    for (let i = 0; i < 40 && workplace().phase === 'active'; i++) store().tick(5, 0, false);
    expect(useOperationsCampaignStore.getState().activeOrderId).toBe(RUSH);
  });

  it('steady moves no order', () => {
    must(store().startMission('team', 17));
    for (const id of requiredChecks('packing')) {
      const q = WORKPLACE_CHECKS.find((c) => c.id === id)!;
      if (workplace().campaign?.checks.packing?.[id] !== q.correct)
        must(store().answerCheck('packing', id, q.correct));
    }
    must(store().understand('packing'));
    must(store().vote('packing', true));
    store().simulateResponses({});
    must(store().activate(workplace().revision));
    expect(useOperationsCampaignStore.getState().activeOrderId).toBe(RUSH);
    expect(nextTruckServes()).toBe(RUSH);
  });

  it('the minutes in hand are the dock projection’s, order by order', () => {
    const orders = useOperationsCampaignStore.getState().orders;
    const dock = { nextTruckInMinutes: 10, cycleMinutes: 80, capacityKg: 5000 };
    // Rush first: it leaves on the first truck at 10, due at 125.
    const rushFirst = minutesInHand(orders, RUSH, dock, 0);
    expect(rushFirst[0]).toMatchObject({ orderId: RUSH, minutes: 115 });
    // Standard first: the rush waits behind it (another product) for a truck.
    const rushLast = minutesInHand(orders, STANDARD, dock, 0);
    expect(rushLast[0].orderId).toBe(STANDARD);
    const rush = rushLast.find((entry) => entry.orderId === RUSH)!;
    expect(rush.minutes).toBeLessThan(rushFirst[0].minutes);
  });
});
