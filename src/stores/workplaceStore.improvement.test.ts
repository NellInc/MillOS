import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceStore } from './workplaceStore';
import { createWorkplace, saveWorkplace, restoreWorkplace } from '../simulation/bilateralWorkplace';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useWorkplaceReplayStore } from './workplaceReplayStore';
import { beginReplayClock, endReplayClock } from '../simulation/workplaceReplayRuntime';
import { useProductionStore } from './productionStore';
import {
  HANDOFF_EPISODES,
  improvementConduct,
  improvementEpisodeOutcome,
} from '../simulation/workplaceImprovement';
import { cloneMaterialFlowData } from './materialFlowStore';
import { captureCurrentPackingPlant } from './workplaceStore';

beforeEach(() => {
  endReplayClock();
  useWorkplaceStore.setState({ workplace: createWorkplace(), completedCampaigns: [] });
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useGameSimulationStore.getState().setGameSpeed(0);
  useProductionStore.getState().setProductionSpeed(1);
});
const prepare = () => {
  const store = useWorkplaceStore.getState();
  expect(store.beginImprovement('cooperative', store.workplace.revision).changed).toBe(true);
  store.proposeImprovement('buffer', 'maintenance');
  store.acknowledgeImprovement();
  for (const m of useWorkplaceStore.getState().workplace.members) {
    store.understand(m.id);
    store.vote(m.id, true);
  }
  return store;
};

describe('improvement store boundaries', () => {
  it('does not advise departure through a paused direct incident gate before execution updates', () => {
    const store = prepare();
    const before = captureCurrentPackingPlant(useWorkplaceStore.getState().workplace);
    const execution = useOperationsCampaignStore.getState().execution;
    useOperationsCampaignStore.getState().triggerIncident('supplier_contamination');
    expect(useOperationsCampaignStore.getState().getIncidentEffect().dispatchBlocked).toBe(true);
    expect(useOperationsCampaignStore.getState().execution).toBe(execution);
    const after = captureCurrentPackingPlant(useWorkplaceStore.getState().workplace);
    expect(after.context.qualityRelease).toBe(false);
    expect(after.fingerprint).not.toBe(before.fingerprint);
    store.acknowledgeImprovement();
    expect(useWorkplaceStore.getState().workplace.improvement!.advice!.dispatchUpperKg).toBe(0);
  });
  it('re-advises ordinary pacing when an arrangement is cancelled before funding', () => {
    const store = prepare();
    store.stopImprovement('quality');
    expect(store.acknowledgeImprovement().changed).toBe(true);
    const state = useWorkplaceStore.getState().workplace;
    expect(state.improvement!.advice!.arrangement).toBe('steady');
    for (const m of state.members) {
      store.understand(m.id);
      store.vote(m.id, true);
    }
    expect(store.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
    expect(useWorkplaceStore.getState().workplace.finance.improvementSpend).toBe(0);
  });
  it('freezes public plant facts, rejects stale activation and clears decisions on refresh', () => {
    const store = prepare();
    const current = useWorkplaceStore.getState().workplace;
    const advice = structuredClone(current.improvement!.advice!);
    expect(advice.fingerprint).toBe(captureCurrentPackingPlant(current).fingerprint);
    useProductionStore.getState().setProductionSpeed(0.5);
    expect(store.activate(current.revision).changed).toBe(false);
    expect(useWorkplaceStore.getState().workplace).toBe(current);
    expect(current.finance.improvementSpend).toBe(0);
    expect(store.acknowledgeImprovement().changed).toBe(true);
    const refreshed = useWorkplaceStore.getState().workplace;
    expect(refreshed.improvement!.advice!.fingerprint).not.toBe(advice.fingerprint);
    expect(refreshed.members.every((m) => !m.understood && m.ballot === null)).toBe(true);
    expect(refreshed.events.some((e) => e.kind === 'improvement-advice-changed')).toBe(true);
    expect(advice).toEqual(current.improvement!.advice);
    expect(store.activate(refreshed.revision).changed).toBe(false);
  });

  it('quarantines optional corrupt evidence while retaining actual pay and recovery', () => {
    const store = prepare();
    store.activate(useWorkplaceStore.getState().workplace.revision);
    store.tick(15, 0, false);
    store.stop();
    const current = useWorkplaceStore.getState().workplace;
    const raw = saveWorkplace(current) as typeof current;
    raw.improvement!.advice!.packedHighKg = Infinity;
    raw.improvement!.episode = {
      id: 'tight-cash',
      actorId: 'packing',
      choice: 'decline',
      private: 'discard',
    } as never;
    const restored = restoreWorkplace(raw);
    expect(restored.improvement).toBeDefined();
    expect(restored.improvement!.advice).toBeUndefined();
    expect(restored.improvement!.episode).toBeUndefined();
    expect(restored.finance).toEqual(current.finance);
    expect(restored.members.map((m) => m.earnedPay)).toEqual(
      current.members.map((m) => m.earnedPay)
    );
    expect(restored.members.map((m) => m.recoveryOwedMinutes)).toEqual(
      current.members.map((m) => m.recoveryOwedMinutes)
    );
  });

  it('retains optional advice and each pressure episode without touching physical facts or money', () => {
    const store = prepare();
    const plant = cloneMaterialFlowData(useMaterialFlowStore.getState());
    const finances = structuredClone(useWorkplaceStore.getState().workplace.finance);
    for (const e of HANDOFF_EPISODES) {
      expect(store.setImprovementEpisode(e.id).changed).toBe(true);
      expect(store.respondImprovementEpisode('quality', 'decline').changed).toBe(true);
      const state = useWorkplaceStore.getState().workplace;
      expect(
        state.members.every((m) => m.ballot === null && !m.sharing && m.coverConsent === null)
      ).toBe(true);
      expect(improvementEpisodeOutcome(state)).toContain('Extra duty is declined');
      expect(state.finance).toEqual(finances);
      expect(cloneMaterialFlowData(useMaterialFlowStore.getState())).toEqual(plant);
      expect(store.respondImprovementEpisode('mind', 'ordinary').changed).toBe(false);
      store.acknowledgeImprovement();
    }
    for (const m of useWorkplaceStore.getState().workplace.members) {
      store.understand(m.id);
      store.vote(m.id, m.id !== 'quality');
    }
    expect(store.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
    store.tick(90, 0, false);
    const review = useWorkplaceStore.getState().workplace;
    const restored = restoreWorkplace(saveWorkplace(review));
    expect(restored.improvement!.advice).toEqual(review.improvement!.advice);
    expect(restored.improvement!.episode).toEqual(review.improvement!.episode);
    expect(improvementConduct(review).declined).toEqual(['quality']);
    expect(review.finance.wagesPaid).toBe(108);
    expect(review.members.every((m) => m.restMinutes === 15 && m.extraMinutes === 0)).toBe(true);
  });

  it('shows honest outcomes for smaller delivery, assumed hold, deferral and a wage-first budget', () => {
    const store = prepare();
    store.setImprovementEpisode('late-truck');
    store.respondImprovementEpisode('packing', 'smaller-delivery');
    expect(improvementEpisodeOutcome(useWorkplaceStore.getState().workplace, 100)).toContain(
      'at most 100 kg'
    );
    store.setImprovementEpisode('quality-hold');
    store.respondImprovementEpisode('quality', 'ordinary');
    expect(improvementEpisodeOutcome(useWorkplaceStore.getState().workplace)).toContain('0 kg');
    store.setImprovementEpisode('tight-cash');
    store.respondImprovementEpisode('coordinator', 'ordinary');
    expect(improvementEpisodeOutcome(useWorkplaceStore.getState().workplace)).toContain(
      'unaffordable'
    );
    store.respondImprovementEpisode('coordinator', 'defer');
    expect(improvementEpisodeOutcome(useWorkplaceStore.getState().workplace)).toContain(
      'remains outstanding'
    );
  });
  it('keeps a real customer commitment and freezes the review after new external receipts', () => {
    const store = prepare();
    const mission = useWorkplaceStore.getState().workplace.improvement!.mission!;
    expect(mission.orderId).toBe(useOperationsCampaignStore.getState().activeOrderId);
    expect(store.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
    const order = useOperationsCampaignStore
      .getState()
      .orders.find((o) => o.id === mission.orderId)!;
    useOperationsCampaignStore.setState({
      orders: [{ ...order, shippedKg: 700, manifestIds: ['qualified-1'] }],
    });
    store.tick(90, 100000, false);
    const review = useWorkplaceStore.getState().workplace;
    expect(review.shippedKg).toBe(700);
    expect(review.improvement?.mission?.creditedKg).toBe(700);
    useOperationsCampaignStore.setState({
      orders: [{ ...order, shippedKg: 1200, manifestIds: ['qualified-1', 'qualified-2'] }],
    });
    store.tick(3, 100000, false);
    expect(useWorkplaceStore.getState().workplace).toBe(review);
    store.acknowledgeImprovementReview();
    for (const m of review.members) store.voteImprovementReview(m.id, 'adopt');
    store.finishImprovementReview(useWorkplaceStore.getState().workplace.revision);
    expect(store.continueImprovement(useWorkplaceStore.getState().workplace.revision).changed).toBe(
      true
    );
    const next = useWorkplaceStore.getState().workplace;
    expect(next.shippedKg).toBe(0);
    expect(next.improvement?.mission?.observedShippedKg).toBe(1200);
    expect(next.improvement?.mission?.originalTargetKg).toBe(mission.originalTargetKg);
    expect(next.improvement?.history[0].snapshot.shippedKg).toBe(700);
  });

  it('rechecks quality and material identity atomically before spending money', () => {
    const store = prepare();
    const before = useWorkplaceStore.getState().workplace;
    const order = useOperationsCampaignStore
      .getState()
      .orders.find((o) => o.id === before.improvement!.mission!.orderId)!;
    useOperationsCampaignStore.setState({ orders: [{ ...order, qualityFailureKg: 1 }] });
    expect(store.activate(before.revision).changed).toBe(false);
    expect(useWorkplaceStore.getState().workplace).toBe(before);
    useOperationsCampaignStore.setState({ orders: [order] });
    useMaterialFlowStore.setState({ sessionId: 'different-plant-session' });
    expect(store.activate(before.revision).changed).toBe(false);
    expect(useWorkplaceStore.getState().workplace).toBe(before);
  });

  it('blocks both replay entry directions and preserves rehydrated trial pay', async () => {
    beginReplayClock(17, 1);
    const idle = useWorkplaceStore.getState().workplace;
    expect(useWorkplaceStore.getState().beginImprovement('team', idle.revision).changed).toBe(
      false
    );
    endReplayClock();
    const store = prepare();
    expect(useWorkplaceReplayStore.getState().capture(17).changed).toBe(false);
    store.activate(useWorkplaceStore.getState().workplace.revision);
    store.tick(15, 0, false);
    const running = useWorkplaceStore.getState().workplace;
    await useWorkplaceStore.persist.rehydrate();
    const loaded = useWorkplaceStore.getState().workplace;
    expect(loaded.improvement?.stopped).toBe(true);
    expect(loaded.finance).toEqual({ ...running.finance, wageReserve: 0 });
    expect(
      loaded.members.every((m) => !m.sharing && m.ballot === null && m.coverConsent === null)
    ).toBe(true);
  });
});
