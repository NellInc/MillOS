import { beforeEach, expect, it, vi } from 'vitest';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { createWorkplace } from './bilateralWorkplace';
import { autoplayWorkplaceStep, useWorkplaceAutoplay } from './workplaceAutoplay';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { beginReplayClock, endReplayClock } from './workplaceReplayRuntime';
import { fairnessReceipt } from './workplaceFairness';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
beforeEach(() => {
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  vi.useRealTimers();
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
});
it('automates fictional decisions through three shifts without manufactured physical delivery', () => {
  const material = useMaterialFlowStore.getState();
  const before = {
    manifests: structuredClone(material.manifests),
    total: material.shippedKg,
  };
  for (let i = 0; i < 600; i++) {
    const result = autoplayWorkplaceStep('team');
    const store = useWorkplaceStore.getState();
    if (result.reason?.includes('complete')) break;
    if (!result.changed) expect(result.reason).toBeNull();
    if (
      store.workplace.phase === 'active' &&
      !(
        store.workplace.campaign?.shift === 1 &&
        store.workplace.minute >= 25 &&
        store.workplace.campaign.decision === null
      )
    )
      store.tick(5, 0, false);
  }
  const s = useWorkplaceStore.getState().workplace;
  expect(s.phase).toBe('review');
  expect(s.campaign?.shift).toBe(2);
  expect(s.campaign?.mission?.creditedKg).toBe(0);
  expect(fairnessReceipt(s).every((r) => r.recoveryOwed === 0)).toBe(true);
  expect(fairnessReceipt(s).some((r) => r.compensationPaid > 0)).toBe(true);
  expect(useMaterialFlowStore.getState().manifests).toEqual(before.manifests);
  expect(useMaterialFlowStore.getState().shippedKg).toBe(before.total);
});
it('never automates separate turns, replay, pilot or raiser-owned objections', () => {
  useWorkplaceStore.getState().setParticipationMode('separate-turns');
  const before = useWorkplaceStore.getState().workplace;
  expect(autoplayWorkplaceStep('team').changed).toBe(false);
  expect(useWorkplaceStore.getState().workplace).toBe(before);
  useWorkplaceStore.setState({ participationMode: 'solo', workplace: createWorkplace('pilot') });
  expect(autoplayWorkplaceStep('team').changed).toBe(false);
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  beginReplayClock(1, 0);
  expect(autoplayWorkplaceStep('team').changed).toBe(false);
  endReplayClock();
  autoplayWorkplaceStep('team');
  useWorkplaceStore.getState().object('quality', 'privacy');
  expect(autoplayWorkplaceStep('team').reason).toContain('original raiser');
});
it('uses one pausable ephemeral runner that survives the guide closing, and stops before impersonation', () => {
  vi.useFakeTimers();
  const auto = useWorkplaceAutoplay.getState();
  auto.start('team');
  auto.start('team');
  vi.advanceTimersByTime(400);
  expect(useWorkplaceStore.getState().workplace.campaign).not.toBeNull();
  auto.pause();
  const before = useWorkplaceStore.getState().workplace;
  vi.advanceTimersByTime(5000);
  expect(useWorkplaceStore.getState().workplace).toBe(before);
  expect(useWorkplaceAutoplay.getState().running).toBe(false);
  vi.useRealTimers();
});

it('rechecks emergency and drill before any automated work or clock resume', () => {
  for (const field of ['emergencyActive', 'emergencyDrillMode'] as const) {
    useGameSimulationStore.setState({ [field]: true });
    const before = useWorkplaceStore.getState().workplace;
    expect(autoplayWorkplaceStep('team').changed).toBe(false);
    expect(useWorkplaceStore.getState().workplace).toBe(before);
    expect(useWorkplaceStore.getState().activate(before.revision).reason).toContain('safety stop');
    useGameSimulationStore.setState({ [field]: false });
  }
});
it.each([0, 30, 180])(
  'manual pace %s takes over without losing the chosen clock speed',
  (speed) => {
    vi.useFakeTimers();
    useGameSimulationStore.getState().setGameSpeed(1);
    useWorkplaceAutoplay.getState().start('team');
    const before = useWorkplaceStore.getState().workplace;
    useGameSimulationStore.getState().setGameSpeed(speed);
    expect(useWorkplaceAutoplay.getState().running).toBe(false);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(speed);
    vi.advanceTimersByTime(2000);
    expect(useWorkplaceStore.getState().workplace).toBe(before);
    vi.useRealTimers();
  }
);
it.each(['wrong-answer', 'manual-stop', 'reload'] as const)(
  'manual %s pauses the runner before its next action',
  (action) => {
    vi.useFakeTimers();
    useWorkplaceAutoplay.getState().start('team');
    vi.advanceTimersByTime(1200);
    const store = useWorkplaceStore.getState();
    if (action === 'wrong-answer') store.answerCheck('packing', 'refusal', 'majority');
    else if (action === 'manual-stop') store.stop();
    else store.rehearseReload(store.workplace.revision);
    expect(useWorkplaceAutoplay.getState().running).toBe(false);
    const before = useWorkplaceStore.getState().workplace;
    vi.advanceTimersByTime(2000);
    expect(useWorkplaceStore.getState().workplace).toBe(before);
    vi.useRealTimers();
  }
);

it('manual archiving pauses an active runner before it can start another campaign', () => {
  for (let i = 0; i < 600; i++) {
    const r = autoplayWorkplaceStep('team');
    const store = useWorkplaceStore.getState();
    if (r.reason?.includes('complete')) break;
    if (
      store.workplace.phase === 'active' &&
      !(
        store.workplace.campaign?.shift === 1 &&
        store.workplace.minute >= 25 &&
        store.workplace.campaign.decision === null
      )
    )
      store.tick(5, 0, false);
  }
  vi.useFakeTimers();
  useWorkplaceAutoplay.getState().start('team');
  const store = useWorkplaceStore.getState();
  expect(store.archiveCampaign(store.workplace.revision).changed).toBe(true);
  expect(useWorkplaceAutoplay.getState().running).toBe(false);
  const before = useWorkplaceStore.getState().workplace;
  vi.advanceTimersByTime(1000);
  expect(useWorkplaceStore.getState().workplace).toBe(before);
  vi.useRealTimers();
});
