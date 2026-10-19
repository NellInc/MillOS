import { beforeEach, expect, it, vi } from 'vitest';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { createWorkplace, restoreWorkplace, saveWorkplace } from './bilateralWorkplace';
import { autoplayWorkplaceStep, useWorkplaceAutoplay } from './workplaceAutoplay';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { beginReplayClock, endReplayClock } from './workplaceReplayRuntime';
import { fairnessReceipt } from './workplaceFairness';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
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
it.each([0, 30, 120])(
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
it('stopping by itself keeps the plant running and says why where the player looks', () => {
  vi.useFakeTimers();
  useGameSimulationStore.getState().setGameSpeed(30);
  useWorkplaceAutoplay.getState().start('team');
  // A safety boundary is one of the reasons the runner stops on its own.
  useGameSimulationStore.setState({ emergencyActive: true });
  vi.advanceTimersByTime(500);
  expect(useWorkplaceAutoplay.getState().running).toBe(false);
  expect(useGameSimulationStore.getState().gameSpeed).toBe(30);
  expect(
    useUIStore
      .getState()
      .alerts.some((alert) => alert.title === 'Automatic cooperative season stopped')
  ).toBe(true);
  useGameSimulationStore.setState({ emergencyActive: false });
  vi.useRealTimers();
});
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

it('demonstrates sharing the sobras by member vote in the default season before opening the next shift', () => {
  for (let i = 0; i < 200 && useWorkplaceStore.getState().workplace.phase !== 'review'; i++) {
    autoplayWorkplaceStep('toe-dip');
    if (useWorkplaceStore.getState().workplace.phase === 'active')
      useWorkplaceStore.getState().tick(5, 0, false);
  }
  const reviewed = useWorkplaceStore.getState().workplace;
  expect(reviewed.campaign?.shift).toBe(0);
  expect(reviewed.practices).toContain('gainsharing');
  // Fresh real dispatch earned this shift: 1,200 kg at 0.30 net per kg.
  useWorkplaceStore.setState({
    workplace: {
      ...reviewed,
      shippedKg: reviewed.shippedKg + 1200,
      finance: {
        ...reviewed.finance,
        operatingRevenue: reviewed.finance.operatingRevenue + 600,
        operatingCost: reviewed.finance.operatingCost + 240,
        cash: reviewed.finance.cash + 360,
      },
    },
  });
  const f = useWorkplaceStore.getState().workplace.finance;
  const surplus =
    f.operatingRevenue - f.operatingCost - f.wagesPaid - f.compensationPaid - f.improvementSpend;
  expect(surplus).toBeGreaterThan(0);
  const pay = reviewed.members.map((m) => m.earnedPay);
  for (let i = 0; i < 10 && !useWorkplaceStore.getState().workplace.distributionComplete; i++)
    expect(autoplayWorkplaceStep('toe-dip').changed).toBe(true);
  const shared = useWorkplaceStore.getState().workplace;
  expect(shared.distributionComplete).toBe(true);
  expect(shared.finance.distributed).toBeCloseTo(surplus, 6);
  shared.members.forEach((m, i) => expect(m.earnedPay - pay[i]).toBeCloseTo(surplus / 4, 6));
  expect(shared.events.some((e) => e.kind === 'surplus-decided')).toBe(true);
  expect(autoplayWorkplaceStep('toe-dip').changed).toBe(true);
  const next = useWorkplaceStore.getState().workplace;
  expect(next.campaign?.shift).toBe(1);
  // The shared sobras survive a reload as part of the reviewed shift.
  const reloaded = restoreWorkplace(saveWorkplace(next));
  expect(reloaded.campaign?.shift).toBe(1);
  expect(reloaded.campaign?.history[0].finance.distributed).toBeCloseTo(surplus, 6);
});
