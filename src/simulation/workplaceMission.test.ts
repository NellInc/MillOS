import { beforeEach, describe, expect, it } from 'vitest';
import {
  createWorkplace,
  transitionWorkplace,
  saveWorkplace,
  restoreWorkplace,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import {
  campaignOutcomes,
  campaignComplete,
  campaignStory,
  requiredChecks,
  WORKPLACE_CHECKS,
} from './workplaceCampaign';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import type { WorkplaceMission, WorkplaceMissionObservation } from '../types/workplace';

const binding = (): WorkplaceMission => ({
  orderId: 'order-real',
  customer: 'Fictional customer',
  materialSessionId: 'session-real',
  startingShippedKg: 100,
  originalTargetKg: 3000,
  targetKg: 3000,
  observedShippedKg: 100,
  creditedKg: 0,
  manifestIds: ['old'],
  evidence: 'current',
});
function runMission() {
  let state = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    const r = transitionWorkplace(state, command);
    state = r.state;
    return r;
  };
  run({ type: 'startCampaign', args: ['cooperative', 17, binding()] });
  let observation: WorkplaceMissionObservation = {
    orderId: 'order-real',
    materialSessionId: 'session-real',
    shippedKg: 100,
    qualityFailureKg: 0,
    manifestIds: ['old'],
    cancelled: false,
  };
  const agree = () => {
    for (const actor of ['packing', 'mind']) {
      for (const id of requiredChecks(actor))
        run({
          type: 'answerCheck',
          args: [actor, id, WORKPLACE_CHECKS.find((q) => q.id === id)!.correct],
        });
      if (actor !== 'mind') run({ type: 'understand', args: [actor] });
    }
    run({ type: 'vote', args: ['packing', true] });
    if (state.planId === 'cover') run({ type: 'consentToCover', args: ['packing', true] });
    run({ type: 'simulateResponses', args: [] });
    expect(run({ type: 'activate', args: [state.revision] }).changed).toBe(true);
  };
  const tick = (delta = 5, change: Partial<WorkplaceMissionObservation> = {}) => {
    observation = { ...observation, ...change };
    return run({ type: 'tick', args: [delta, 999999, false, observation] });
  };
  const finish = () => {
    while (state.phase === 'active') {
      if (state.campaign?.shift === 1 && state.minute >= 25 && !state.campaign.decision)
        run({ type: 'campaignDecision', args: ['inspect', 'quality'] });
      tick();
    }
  };
  return {
    run,
    agree,
    tick,
    finish,
    get state() {
      return state;
    },
  };
}

beforeEach(() => {
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useOperationsCampaignStore.getState().initializeCampaign();
});

describe('ordinary customer commitment and working agreement', () => {
  it('binds only outstanding commitment, without adding revenue or changing the order', () => {
    const ops = useOperationsCampaignStore.getState();
    const order = ops.orders.find((o) => o.id === ops.activeOrderId)!;
    useOperationsCampaignStore.setState({
      orders: ops.orders.map((o) =>
        o.id === order.id ? { ...o, shippedKg: 100, manifestIds: ['prior'] } : o
      ),
    });
    const before = useOperationsCampaignStore.getState();
    expect(useWorkplaceStore.getState().startMission('toe-dip', 17).changed).toBe(true);
    const mission = useWorkplaceStore.getState().workplace.campaign!.mission!;
    expect(mission.orderId).toBe(order.id);
    expect(mission.originalTargetKg).toBe(order.requiredKg - 100);
    expect(mission.creditedKg).toBe(0);
    expect(useOperationsCampaignStore.getState()).toBe(before);
    expect(useWorkplaceStore.getState().workplace.finance.operatingRevenue).toBe(0);
  });
  it('does not replace an active campaign or accept a failed-quality commitment', () => {
    const ops = useOperationsCampaignStore.getState();
    useOperationsCampaignStore.setState({
      orders: ops.orders.map((o) => ({ ...o, qualityFailureKg: 1 })),
    });
    expect(useWorkplaceStore.getState().startMission('cooperative').changed).toBe(false);
    useOperationsCampaignStore.setState({ orders: ops.orders });
    expect(useWorkplaceStore.getState().startMission('cooperative').changed).toBe(true);
    const current = useWorkplaceStore.getState().workplace;
    expect(useWorkplaceStore.getState().startMission('team').changed).toBe(false);
    expect(useWorkplaceStore.getState().workplace).toBe(current);
  });
  it('credits only fresh selected-order receipts and keeps negotiation-time revenue unearned', () => {
    const c = runMission();
    c.tick(5, { shippedKg: 600, manifestIds: ['old', 'dispatch-1'] });
    expect(c.state.campaign?.mission?.creditedKg).toBe(500);
    expect(c.state.shippedKg).toBe(0);
    expect(c.state.finance.operatingRevenue).toBe(0);
    c.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.agree();
    c.tick(5, { shippedKg: 900, manifestIds: ['old', 'dispatch-1', 'dispatch-2'] });
    expect(c.state.shippedKg).toBe(300);
    expect(c.state.finance.operatingRevenue).toBe(150);
    c.tick();
    expect(c.state.shippedKg).toBe(300);
    expect(c.state.campaign?.mission?.creditedKg).toBe(800);
  });
  it.each([
    { orderId: 'unrelated' },
    { materialSessionId: 'reset' },
    { shippedKg: 600 },
    { qualityFailureKg: 1 },
    { cancelled: true },
  ])('stops optional authority on invalid evidence %j without credit', (change) => {
    const c = runMission();
    c.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    c.agree();
    c.tick(5, change);
    expect(c.state.phase).toBe('review');
    expect(c.state.campaign?.mission?.creditedKg).toBe(0);
    expect(c.state.finance.operatingRevenue).toBe(0);
    expect(campaignOutcomes(c.state).delivery.status).toBe('blocked');
    expect(c.state.members.every((m) => m.coverConsent === null)).toBe(true);
  });
  it('renegotiates an installment without declaring the deferred customer remainder fulfilled', () => {
    const c = runMission();
    c.run({ type: 'campaignDecision', args: ['renegotiate', 'coordinator'] });
    const report = campaignOutcomes(c.state);
    expect(report.delivery.targetKg).toBe(2400);
    expect(report.delivery.deferredKg).toBe(600);
    expect(c.state.campaign?.mission?.originalTargetKg).toBe(3000);
  });
  it('requires both outcomes, carries receipt/work history, and freezes the final run window', () => {
    const c = runMission();
    for (let shift = 0; shift < 3; shift++) {
      if (shift !== 1)
        c.run({
          type: 'campaignDecision',
          args: [shift === 0 ? 'keep-target' : 'protect-refusal', 'coordinator'],
        });
      c.agree();
      if (shift === 0) c.tick(5, { shippedKg: 3100, manifestIds: ['old', 'dispatch-all'] });
      c.finish();
      if (shift < 2) {
        expect(c.run({ type: 'nextCampaignShift', args: [] }).changed).toBe(true);
        expect(c.state.campaign?.mission?.creditedKg).toBe(3000);
        expect(campaignStory(c.state).length).toBeGreaterThan(0);
      }
    }
    expect(campaignComplete(c.state)).toBe(true);
    expect(campaignOutcomes(c.state).agreement.status).toBe('honoured');
    expect(campaignOutcomes(c.state).delivery.status).toBe('met');
    c.tick(5, { shippedKg: 5000, manifestIds: ['old', 'dispatch-all', 'later'] });
    expect(c.state.campaign?.mission?.creditedKg).toBe(3000);
    expect(campaignComplete(restoreWorkplace(saveWorkplace(c.state)))).toBe(true);
    const bad = saveWorkplace(c.state) as typeof c.state;
    bad.campaign!.mission!.creditedKg += 1;
    expect(restoreWorkplace(bad).phase).toBe('idle');
  });
  it('reports fair zero-delivery play as a shortfall rather than a completed mission', () => {
    const c = runMission();
    for (let shift = 0; shift < 3; shift++) {
      if (shift !== 1)
        c.run({
          type: 'campaignDecision',
          args: [shift === 0 ? 'keep-target' : 'protect-refusal', 'coordinator'],
        });
      c.agree();
      c.finish();
      if (shift < 2) c.run({ type: 'nextCampaignShift', args: [] });
    }
    expect(campaignOutcomes(c.state).agreement.status).toBe('honoured');
    expect(campaignOutcomes(c.state).delivery.status).toBe('shortfall');
    expect(campaignComplete(c.state)).toBe(false);
    expect(campaignOutcomes(c.state).accounts.wages).toBe(324);
  });
});
