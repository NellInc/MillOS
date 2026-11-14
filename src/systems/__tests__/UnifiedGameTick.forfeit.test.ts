import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';

// Plan items 3.4 and 3.7, the way out (Chronicle rule 4). A signed charter
// with a wet crop year takes 5 points off wheat flour, so the best the line can
// make is 94.5, under strong white's 95. With no input at all the plant must
// keep shipping the 92 and 90 orders, forfeit the 95 order at the stated
// lateness with the reason in the record, and take the next programme. The
// real tick, stores and roster, as UnifiedGameTick.gradeRecovery.test.ts runs
// them (docks set by hand, no rendered yard).
vi.setConfig({ testTimeout: 300_000 });
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { MachineType, type MachineData } from '../../types';
import { centralTick } from '../../systems/CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../../systems/UnifiedGameTick';
import { useProductionStore } from '../../stores/productionStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import {
  FORFEIT_LATENESS_MINUTES,
  useOperationsCampaignStore,
} from '../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { usePartnerProposalStore } from '../../stores/partnerProposalStore';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import { useUIStore } from '../../stores/uiStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { describeOrderOutcome } from '../../simulation/shiftReview';
import { FORFEIT_WINDOW_MINUTES } from '../../simulation/partnerProposals';
import { answerPartnerProposal } from '../partnerProposalRuntime';
import { runTemper } from '../temperRuntime';
import { toSimulationMinutes } from '../../simulation/simulationClock';

const sceneFile = ts.createSourceFile(
  'MillScene.tsx',
  readFileSync('src/components/MillScene.tsx', 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
const bodies: string[] = [];
function findRoster(node: ts.Node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(sceneFile) === 'machines' &&
    node.initializer &&
    ts.isCallExpression(node.initializer) &&
    node.initializer.expression.getText(sceneFile) === 'useMemo'
  ) {
    const factory = node.initializer.arguments[0];
    if (factory && ts.isArrowFunction(factory)) bodies.push(factory.body.getText(sceneFile));
  }
  ts.forEachChild(node, findRoster);
}
findRoster(sceneFile);
expect(bodies).toHaveLength(1);
const rosterJS = ts.transpileModule(`function buildRoster() ${bodies[0]}`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;
const makeRoster = new Function(
  'SITE_LAYOUT',
  'MachineType',
  `${rosterJS}; return buildRoster();`
) as (layout: typeof SITE_LAYOUT, types: typeof MachineType) => MachineData[];
const deltaSeconds = centralTick.getStats().tickInterval;
let tickCount = 0;
let receivingDwell = 0;
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetUnifiedTickState();
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useGameSimulationStore.getState().resetGameState();
  useTruckScheduleStore.getState().resetTruckSchedule();
  useBreakdownStore.getState().resetBreakdownStore();
  useQCLabStore.getState().resetQCLab();
  usePartnerProposalStore.getState().reset();
  useWorkplaceStore.setState(useWorkplaceStore.getInitialState(), true);
  useChronicleStore.setState(useChronicleStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useProductionStore.setState({
    ...useProductionStore.getInitialState(),
    machines: makeRoster(SITE_LAYOUT, MachineType),
    productionSpeed: 1,
  });
  fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() =>
      Promise.reject(new Error('Optional services unavailable for offline audit'))
    );
  tickCount = 0;
  receivingDwell = 0;
});

afterEach(() => {
  fetchSpy.mockRestore();
  expect(Math.abs(useMaterialFlowStore.getState().getMaterialBalance().errorKg)).toBeLessThan(
    0.001
  );
});

function step() {
  const trucks = useTruckScheduleStore.getState();
  for (const dock of ['receiving', 'shipping'] as const) {
    const schedule = trucks.truckSchedule[dock];
    if (schedule.truckActive && !schedule.truckDocked) {
      trucks.setTruckDocked(dock, true);
      trucks.setTruckTransferReady(dock, true);
    }
  }
  unifiedGameTick({
    deltaSeconds,
    gameSpeed: useGameSimulationStore.getState().gameSpeed,
    gameTime: useGameSimulationStore.getState().gameTime,
    elapsedTime: tickCount * deltaSeconds,
    tickCount: ++tickCount,
  });
  // The wet wheat tempered as it comes (plan item 7.7): dried, the line makes 95.
  for (const proposal of usePartnerProposalStore.getState().proposals)
    if (proposal.kind === 'temper' && proposal.status === 'open')
      answerPartnerProposal(proposal.id, 'standard', 'operator');
  const clock = () =>
    toSimulationMinutes({
      day: useGameSimulationStore.getState().gameDay,
      hour: useGameSimulationStore.getState().gameTime,
    });
  if (
    useOperationsCampaignStore.getState().execution.dispatchLoad.status === 'ready' &&
    useTruckScheduleStore.getState().truckSchedule.shipping.transferReady
  )
    useTruckScheduleStore.getState().recordTruckDeparture('shipping', clock());
  if (
    useTruckScheduleStore.getState().truckSchedule.receiving.transferReady &&
    ++receivingDwell >= 3
  ) {
    useTruckScheduleStore.getState().recordTruckDeparture('receiving', clock());
    receivingDwell = 0;
  }
}

const campaign = () => useOperationsCampaignStore.getState();
const order = (id: string) => campaign().orders.find((candidate) => candidate.id === id)!;

/**
 * The case, with no input (the partner forfeits the order once it is overdue
 * and the facts say the line cannot make it), or with the player keeping it
 * open (the early forfeit answered "keep"), so it runs to its lateness bound.
 */
function wetCropCase(mode: 'partner' | 'keep') {
  useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'sandbox' }, 21);
  useChronicleStore.setState((state) => ({
    chronicle: { ...state.chronicle, crop: { index: 0, kind: 'wet', treated: false } },
  }));
  expect(useChronicleStore.getState().getEffect(true).qualityPenalty).toBe(5);
  usePartnerProposalStore.getState().setDelegation('temper', 'ask');
  if (mode === 'keep') usePartnerProposalStore.getState().setDelegation('forfeit', 'ask');
  const strongWhite = order('order-001');
  expect(strongWhite.recipe.minimumQuality).toBe(95);
  const due = strongWhite.dueAtMinute;
  const forfeitAt = mode === 'keep' ? due + FORFEIT_LATENESS_MINUTES : due + FORFEIT_WINDOW_MINUTES;

  // Every batch's stamp as packed, to check no order was paid under its minimum.
  const stamps = new Map<string, number | undefined>();
  for (let i = 0; i < 9000 && campaign().programmeCount === 0; i++) {
    step();
    for (const batch of useMaterialFlowStore.getState().productionBatches)
      stamps.set(batch.id, batch.qualityScore);
    if (mode === 'keep')
      for (const proposal of usePartnerProposalStore.getState().proposals)
        if (proposal.kind === 'forfeit' && proposal.status === 'open')
          answerPartnerProposal(proposal.id, 'keep', 'operator');
  }

  // The 92 and 90 orders were not held behind the order the line cannot make.
  for (const id of ['order-002', 'order-003']) {
    expect(order(id).status, id).toBe('fulfilled');
    expect(order(id).completedAtMinute!, id).toBeLessThanOrEqual(order(id).dueAtMinute);
  }
  // The 95 order is closed unfulfilled, and says why: by the partner once it
  // is overdue (within the card's window), or kept open, at the stated lateness.
  const forfeited = order('order-001');
  expect(forfeited.status).toBe('cancelled');
  expect(forfeited.forfeitedAtMinute!).toBeGreaterThanOrEqual(mode === 'keep' ? forfeitAt : due);
  expect(forfeited.forfeitedAtMinute!).toBeLessThan(forfeitAt + 1);
  expect(forfeited.forfeitReason).toBe('unreachable');
  expect(forfeited.forfeitBestQuality).toBeCloseTo(94.5, 5);
  expect(forfeited.shippedKg).toBe(0);
  const line = campaign().logbook.find(
    (entry) => entry.wording?.key === 'logOrderForfeited' && entry.relatedId === 'order-001'
  );
  expect(line?.message).toMatch(/94\.5/);
  // Its penalty is booked, and one bell notice names it: the bound's, or the
  // partner's decision.
  expect(campaign().economics.latePenalties).toBeGreaterThanOrEqual(forfeited.forfeitFee!);
  const forfeitProposal = usePartnerProposalStore
    .getState()
    .proposals.find((proposal) => proposal.kind === 'forfeit');
  const notices = useUIStore
    .getState()
    .alerts.filter(
      (alert) =>
        alert.id === 'order-forfeited-order-001' ||
        (forfeitProposal && alert.id === `partner-decided-${forfeitProposal.id}`)
    );
  expect(notices).toHaveLength(1);
  // The next programme was taken, by the partner.
  expect(campaign().programmeCount).toBe(1);

  // The shift that closes over the forfeit names it in its review, once.
  const at = forfeited.forfeitedAtMinute!;
  for (let i = 0; i < 4000 && !campaign().reports.some((r) => r.endedAtMinute >= at); i++) step();
  const listing = campaign().reports.filter((r) =>
    r.orderOutcomes?.some((o) => o.id === 'order-001' && o.forfeit)
  );
  expect(listing).toHaveLength(1);
  const report = listing[0];
  const outcome = report.orderOutcomes?.find((o) => o.id === 'order-001');
  expect(outcome?.forfeit).toBeDefined();
  expect(describeOrderOutcome(outcome!, report.endedAtMinute, 'en')).toMatch(/forfeit/i);
  expect(report.grade).not.toBe('A');

  // The next programme runs the same way: its 92 and 90 orders ship, its 95
  // order is forfeited, and the plant takes the one after.
  const next = campaign().orders.filter((candidate) => candidate.id.startsWith('programme-'));
  expect(next).toHaveLength(3);
  for (let i = 0; i < 12000 && campaign().programmeCount < 2; i++) {
    step();
    if (mode === 'keep')
      for (const proposal of usePartnerProposalStore.getState().proposals)
        if (proposal.kind === 'forfeit' && proposal.status === 'open')
          answerPartnerProposal(proposal.id, 'keep', 'operator');
    for (const batch of useMaterialFlowStore.getState().productionBatches)
      stamps.set(batch.id, batch.qualityScore);
  }
  expect(campaign().programmeCount).toBe(2);
  for (const planned of next) {
    const closed = order(planned.id);
    if (planned.recipe.minimumQuality === 95)
      expect(closed, planned.id).toMatchObject({
        status: 'cancelled',
        forfeitReason: 'unreachable',
      });
    else expect(closed.status, planned.id).toBe('fulfilled');
  }

  // No order was paid for flour under its minimum.
  for (const candidate of campaign().orders)
    for (const batchId of candidate.batchIds) {
      const stamp = stamps.get(batchId);
      if (stamp !== undefined)
        expect(stamp, `${candidate.id} ${batchId}`).toBeGreaterThanOrEqual(
          candidate.recipe.minimumQuality - 1e-6
        );
    }
}

it('a wet crop year under a charter, no input: the partner forfeits the 95 order once overdue, the 92 and 90 orders ship on time, and the next programme is taken', () =>
  wetCropCase('partner'));

it('the same, the early forfeit answered "keep": the 95 order is forfeited at the stated lateness', () =>
  wetCropCase('keep'));

it('a "dry first" answer still in its rest at the due minute: the partner does not forfeit the 95 order it will make reachable', () => {
  // Review 2, finding 3: reachability read the temper at the rolls now only,
  // so the partner forfeited an order the drying it had been given was about
  // to make reachable.
  useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'sandbox' }, 21);
  useChronicleStore.setState((state) => ({
    chronicle: { ...state.chronicle, crop: { index: 0, kind: 'wet', treated: false } },
  }));
  usePartnerProposalStore.getState().setDelegation('temper', 'ask');
  const due = order('order-001').dueAtMinute;
  // Tempered as it comes (step), until an hour before the 95 order is due.
  for (let i = 0; i < 9000 && campaign().elapsedMinutes < due - 60; i++) step();
  expect(runTemper({ option: 'dry-first', kwh: 0, cost: 0 })).toBe(true);
  const atRolls = useChronicleStore
    .getState()
    .chronicle.crop!.temper!.schedule.find((entry) => entry.option === 'dry-first')!.fromMinute;
  expect(atRolls).toBeGreaterThan(due);
  expect(atRolls).toBeLessThan(due + FORFEIT_LATENESS_MINUTES);
  const forfeitRaised = () =>
    usePartnerProposalStore
      .getState()
      .proposals.some(
        (proposal) =>
          proposal.kind === 'forfeit' &&
          (proposal.facts as { orderId: string }).orderId === 'order-001'
      );
  for (let i = 0; i < 9000 && campaign().elapsedMinutes < atRolls + 30; i++) {
    step();
    expect(forfeitRaised(), `minute ${campaign().elapsedMinutes}`).toBe(false);
  }
  const strongWhite = order('order-001');
  expect(strongWhite.forfeitedAtMinute).toBeUndefined();
  // Once the dried grain is at the rolls the line can make 95 again.
  expect(useChronicleStore.getState().chronicle.crop!.temper!.inForce).toBe('dry-first');
});

it('a "dry first" answer that cannot help before the bound: the forfeit comes at the bound, not never, and the plant goes on', () => {
  // Coordinator's check (14 November): the drying wait must end. Only the
  // partner's early forfeit reads it; the bound's forfeit never does, so the
  // latest a forfeit comes is the bound. Answered at due + 200, the dried
  // wheat reaches the rolls at due + 320, after the bound at due + 240.
  useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'sandbox' }, 21);
  useChronicleStore.setState((state) => ({
    chronicle: { ...state.chronicle, crop: { index: 0, kind: 'wet', treated: false } },
  }));
  usePartnerProposalStore.getState().setDelegation('temper', 'ask');
  usePartnerProposalStore.getState().setDelegation('forfeit', 'ask');
  const due = order('order-001').dueAtMinute;
  // Kept open until then: the early forfeit's card answered "keep".
  for (let i = 0; i < 12000 && campaign().elapsedMinutes < due + 200; i++) {
    step();
    for (const proposal of usePartnerProposalStore.getState().proposals)
      if (proposal.kind === 'forfeit' && proposal.status === 'open')
        answerPartnerProposal(proposal.id, 'keep', 'operator');
  }
  expect(order('order-001')).toMatchObject({ status: 'late', shippedKg: 0 });
  expect(runTemper({ option: 'dry-first', kwh: 0, cost: 0 })).toBe(true);
  const bound = due + FORFEIT_LATENESS_MINUTES;
  for (let i = 0; i < 12000 && order('order-001').status !== 'cancelled'; i++) {
    step();
    if (campaign().elapsedMinutes > bound + 120) break;
  }
  const closed = order('order-001');
  expect(closed.status).toBe('cancelled');
  expect(closed.forfeitedAtMinute!).toBeLessThanOrEqual(bound + 1);
  // The plant goes on: the 92 and 90 orders ship and the next programme is taken.
  for (const id of ['order-002', 'order-003']) expect(order(id).status, id).toBe('fulfilled');
  for (let i = 0; i < 4000 && campaign().programmeCount === 0; i++) step();
  expect(campaign().programmeCount).toBeGreaterThan(0);
});
