import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useWorkplaceStore } from './workplaceStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useMaterialFlowStore } from './materialFlowStore';
import { useQCLabStore } from './qcLabStore';
import { safeJSONStorage } from './storage';
import { buildProgramme } from '../simulation/programmes';
import { createWorkplace } from '../simulation/bilateralWorkplace';
import {
  seasonDraw,
  seasonReserveCarried,
  seasonSobrasPool,
  requiredChecks,
  WORKPLACE_CHECKS,
} from '../simulation/workplaceCampaign';
import { endReplayClock } from '../simulation/workplaceReplayRuntime';
import { autoplayWorkplaceStep, useWorkplaceAutoplay } from '../simulation/workplaceAutoplay';
import { fulfilFirstDelivery } from '../test/firstDelivery';
import { setLocale } from '../i18n';
import type { WorkplaceProfile, WorkplaceState } from '../types/workplace';

// Review 2 of the cooperative season, store side. Each test failed on the
// build the defect was found in.

const store = () => useWorkplaceStore.getState();
const workplace = () => store().workplace;
const must = (result: { changed: boolean; reason: string | null }) =>
  expect(result.changed, result.reason ?? '').toBe(true);

function reset() {
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
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
    completedCampaigns: [],
    leftCampaigns: [],
    seasonsBegun: 0,
  });
}

/** Packing's checks, understanding and yes; the others answer for themselves. */
function agree() {
  for (const id of requiredChecks('packing')) {
    const q = WORKPLACE_CHECKS.find((c) => c.id === id)!;
    if (workplace().campaign?.checks.packing?.[id] !== q.correct)
      must(store().answerCheck('packing', id, q.correct));
  }
  for (const id of requiredChecks('mind')) {
    const q = WORKPLACE_CHECKS.find((c) => c.id === id)!;
    if (workplace().campaign?.checks.mind?.[id] !== q.correct)
      store().answerCheck('mind', id, q.correct);
  }
  if (!workplace().members[0].understood) must(store().understand('packing'));
  if (workplace().members[0].ballot !== true) must(store().vote('packing', true));
  store().simulateResponses();
}

/** One shift, steady, `kgPerTick` of unlinked dispatch each 5 minutes. */
function playShift(kgPerTick = 0) {
  agree();
  must(store().activate(workplace().revision));
  for (let i = 0; i < 40 && workplace().phase === 'active'; i++) store().tick(5, kgPerTick, false);
  expect(workplace().phase).toBe('review');
}

describe('review 2, finding 1: a resequenced shift credits what the line ships', () => {
  const RUSH = 'programme-2-order-1';
  const STANDARD = 'programme-2-order-2';
  beforeEach(() => {
    reset();
    const initial = useOperationsCampaignStore.getInitialState();
    useOperationsCampaignStore.setState(initial, true);
    const programme = buildProgramme(initial.orders, 2, 'morning', 0);
    useOperationsCampaignStore.setState({ orders: programme, activeOrderId: RUSH });
  });
  const ship = (orderId: string, kg: number, manifest: string) =>
    useOperationsCampaignStore.setState((s) => ({
      orders: s.orders.map((o) =>
        o.id === orderId
          ? { ...o, shippedKg: o.shippedKg + kg, manifestIds: [...o.manifestIds, manifest] }
          : o
      ),
    }));

  it('the order resequencing made active earns the season its delivered kilograms', () => {
    must(store().startMission('team', 17));
    must(store().selectPlan('resequence'));
    agree();
    must(store().activate(workplace().revision));
    expect(useOperationsCampaignStore.getState().activeOrderId).toBe(STANDARD);
    store().tick(5, 0, false);
    ship(STANDARD, 500, 'manifest-review2-1');
    store().tick(5, 0, false);
    expect(workplace().shippedKg).toBeCloseTo(500, 6);
    // The season's own order still earns too, and nothing is counted twice.
    ship(RUSH, 200, 'manifest-review2-2');
    store().tick(5, 0, false);
    expect(workplace().shippedKg).toBeCloseTo(700, 6);
    store().tick(5, 0, false);
    expect(workplace().shippedKg).toBeCloseTo(700, 6);
  });

  it('Monday’s bench reads the order the agreed plan made active', () => {
    // A seed whose Monday has no one away, so the bench is the only question.
    let seed = 1;
    while (seasonDraw(seed).pressures[1] === 'repeat-cover') seed += 1;
    must(store().startMission('team', seed));
    agree();
    must(store().activate(workplace().revision));
    for (let i = 0; i < 40 && workplace().phase === 'active'; i++) store().tick(5, 0, false);
    must(store().nextCampaignShift());
    must(store().selectPlan('resequence'));
    agree();
    must(store().activate(workplace().revision));
    expect(useOperationsCampaignStore.getState().activeOrderId).toBe(STANDARD);
    const standard = useOperationsCampaignStore.getState().orders.find((o) => o.id === STANDARD)!;
    useMaterialFlowStore.setState({
      productionBatches: [
        {
          id: 'batch-review2-monday',
          disposition: 'released',
          packerId: 'packer-1',
          materialType: standard.recipe.finishedMaterial,
          producedKg: 800,
          availableKg: 800,
          simulationTime: 1,
          sourceContributions: [{ lotId: 'lot-00001', amount: 800, path: ['silo-1', 'packer-1'] }],
          dispositionReason: null,
          qcTestIds: [],
          dispatchManifestIds: [],
          sealed: true,
          qualityScore: 99,
          awaitingTest: true,
        },
      ],
    });
    const monday = seasonDraw(seed).mondayMinute;
    store().tick(monday + 1, 0, false);
    expect(workplace().campaign?.mondaySample?.batchId).toBe('batch-review2-monday');
  });

  it('the headless runner plays a resequenced season to its end, crediting what ships', () => {
    let manifests = 0;
    let shipped = 0;
    let said: string | null = null;
    for (let i = 0; i < 3000; i++) {
      const s = workplace();
      if (s.phase === 'active') {
        const active = useOperationsCampaignStore.getState().activeOrderId!;
        ship(active, 40, `manifest-run-${++manifests}`);
        shipped += 40;
        store().tick(5, 0, false);
        continue;
      }
      // Resequencing needs the team budget, which the cooperative charter has.
      const step = autoplayWorkplaceStep('cooperative', { plan: 'resequence' });
      if (step.reasonKey === 'seasonComplete') break;
      if (!step.changed && step.reasonKey) throw new Error(step.reason ?? step.reasonKey);
      said = step.reason;
    }
    const end = workplace();
    expect(end.campaign?.shift, `${end.phase}: ${said}`).toBe(2);
    expect(end.phase).toBe('review');
    expect(end.campaign?.history.map((h) => h.planId)).toEqual(['resequence', 'resequence']);
    expect(end.planId).toBe('resequence');
    const delivered = [...end.campaign!.history.map((h) => h.shippedKg), end.shippedKg].reduce(
      (n, kg) => n + kg,
      0
    );
    // Every kilogram the line shipped on an active shift earned the season.
    expect(delivered).toBeCloseTo(shipped, 6);
    expect(end.distributionComplete).toBe(true);
  });
});

describe('review 2, findings 2 and 3: the sobras and the Reserve Fund', () => {
  beforeEach(async () => {
    reset();
    await safeJSONStorage.removeItem('millos-workplace-laboratory');
    useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
    useOperationsCampaignStore.getState().initializeCampaign();
    fulfilFirstDelivery();
  });

  /** A Lab season (no linked order) to its final review, every shift profitable. */
  function profitableSeason(profile: WorkplaceProfile, seed: number) {
    must(store().startCampaign(profile, seed));
    for (let shift = 0; shift < 3; shift++) {
      playShift(50);
      if (shift < 2) must(store().nextCampaignShift());
    }
    expect(seasonSobrasPool(workplace())).toBeGreaterThan(0);
    return workplace();
  }

  it('archiving refuses while the sobras are unsettled, and says why', () => {
    const review = profitableSeason('cooperative', 17);
    expect(review.distributionComplete).toBe(false);
    const refused = store().archiveCampaign(review.revision);
    expect(refused.changed).toBe(false);
    expect(refused.reasonCopy?.key).toBe('settleSurplusBeforeArchive');
    expect(store().completedCampaigns).toHaveLength(0);
  });

  it('a charter that shares no surplus settles it into the Reserve Fund at archive, never loses it', () => {
    const review = profitableSeason('team', 17);
    must(store().archiveCampaign(review.revision));
    const archived = store().completedCampaigns[0];
    expect(archived.sobras?.destination).toBe('reserve');
    expect(seasonReserveCarried(archived)).toBeCloseTo(seasonSobrasPool(review) * (1 - 0.05), 6);
  });

  it('the Reserve Fund is carried forward exactly once (A, B from the card, C)', async () => {
    // A: a season settled and archived, with a Reserve Fund to carry.
    profitableSeason('cooperative', 1);
    must(store().voteSurplus('packing', 'members'));
    must(store().distributeSurplus());
    const a = workplace();
    const carriedA = seasonReserveCarried(a);
    expect(carriedA).toBeGreaterThan(0);
    must(store().archiveCampaign(a.revision));
    // B: started from the Overview card (no seed), brings A's reserve, loses a shift, is left.
    must(store().startMission('toe-dip'));
    const b0 = workplace();
    expect(b0.campaign?.reserveBrought).toBeCloseTo(carriedA, 6);
    // Its own seed and draw, not season A's first.
    expect(b0.seed).not.toBe(1);
    expect(b0.campaign?.draw).toEqual(seasonDraw(b0.seed));
    playShift(0);
    must(store().leaveCampaign(workplace().revision));
    const b = store().leftCampaigns.at(-1)!;
    const carriedB = seasonReserveCarried(b);
    expect(carriedB).toBeLessThan(carriedA);
    // A reload keeps the order seasons began in.
    const begun = store().seasonsBegun;
    await useWorkplaceStore.persist.rehydrate();
    expect(store().seasonsBegun).toBe(begun);
    expect(store().leftCampaigns.at(-1)?.campaign?.season).toBe(b0.campaign?.season);
    // C: brings what B left, never A's again.
    must(store().startMission('toe-dip'));
    expect(workplace().campaign?.reserveBrought ?? 0).toBeCloseTo(carriedB, 6);
    expect(workplace().campaign?.season).toBe(begun + 1);
  });

  it('a season left early settles what it earned by the statutory default, and says so', () => {
    must(store().startCampaign('cooperative', 17));
    playShift(50);
    const earned = seasonSobrasPool(workplace());
    expect(earned).toBeGreaterThan(0);
    must(store().leaveCampaign(workplace().revision));
    const left = store().leftCampaigns.at(-1)!;
    expect(left.sobras).toMatchObject({ destination: 'reserve' });
    expect(left.sobras!.pool).toBeCloseTo(earned, 6);
    // The Reserve Fund and the Assistance Fund first, the rest kept in the reserve.
    expect(seasonReserveCarried(left)).toBeCloseTo(earned * 0.95, 6);
    expect(left.events.some((e) => e.kind === 'surplus-left')).toBe(true);
    // The next season opens with it.
    must(store().startCampaign('team', 23));
    expect(workplace().campaign?.reserveBrought).toBeCloseTo(earned * 0.95, 6);
  });

  it('the headless runner asks for cover only on the shift where cover does something', () => {
    let seed = 1;
    for (; seed < 500; seed++) {
      const d = seasonDraw(seed);
      if (d.decliner === 'coordinator' && d.pressures[1] === 'repeat-cover') break;
    }
    useWorkplaceStore.setState({ workplace: createWorkplace('game', seed) });
    for (let i = 0; i < 2000; i++) {
      const s = workplace();
      if (s.campaign && s.campaign.shift === 2 && s.phase === 'deliberating') break;
      if (s.phase === 'active') {
        store().tick(5, 0, false);
        continue;
      }
      const step = autoplayWorkplaceStep('team');
      if (!step.changed && step.reasonKey) throw new Error(step.reason ?? step.reasonKey);
    }
    // Monday's cover was Maintenance's, and the bench never waited for Quality.
    const monday = workplace().campaign!.history[1];
    expect(monday.members.find((m) => m.id === 'maintenance')?.extraMinutes).toBeGreaterThan(0);
    // Shift 0 has no one away; Monday has Quality away and Maintenance covers it.
    expect(workplace().campaign?.history.map((h) => h.planId)).toEqual(['steady', 'cover']);
  });

  it('a handoff begun from an unshared final review waits for the surplus to be shared', () => {
    const review = profitableSeason('cooperative', 17);
    const refused = store().beginImprovement('cooperative', review.revision);
    expect(refused.changed).toBe(false);
    expect(refused.reasonCopy?.key).toBe('settleSurplusBeforeArchive');
  });
});

describe('review 2: a season saved before seasons were numbered', () => {
  it('the live build’s save loads numbered, so its reserve passes on once', async () => {
    reset();
    const raw = readFileSync(
      join(
        __dirname,
        '../simulation/__tests__/fixtures/workplace-saves/2026-11-09-bb193231-live-demo-minute-70.json'
      ),
      'utf8'
    );
    await safeJSONStorage.setItem('millos-workplace-laboratory', JSON.parse(raw));
    await useWorkplaceStore.persist.rehydrate();
    expect(workplace().campaign?.shift).toBe(2);
    expect(workplace().minute).toBe(70);
    expect(workplace().campaign?.season).toBe(1);
    expect(store().seasonsBegun).toBe(1);
  });
});

describe('review 2, finding 10: the actor of a campaign decision', () => {
  beforeEach(() => {
    reset();
    useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
    useOperationsCampaignStore.getState().initializeCampaign();
    fulfilFirstDelivery();
  });

  it('reads the actor, not the decision, when it refuses another role’s call', () => {
    must(store().startCampaign('cooperative', 17));
    // Packing owns no campaign decision: the engine says so, not the authored-role guard.
    const own = store().campaignDecision('keep-target', 'packing');
    expect(own.changed).toBe(false);
    expect(own.reasonCopy?.key).not.toBe('authoredRoleAnswers');
    // Another role's call is still refused as that role's own.
    const theirs = store().campaignDecision('keep-target', 'coordinator');
    expect(theirs.reasonCopy?.key).toBe('authoredRoleAnswers');
  });
});

describe('review 2, item 11: the replay start and the Reserve Fund', () => {
  beforeEach(() => {
    reset();
    useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
    useOperationsCampaignStore.getState().initializeCampaign();
    fulfilFirstDelivery();
  });

  it('a start that replaces a season at its first deliberation reuses that season’s reserve', () => {
    must(store().startCampaign('cooperative', 1));
    for (let shift = 0; shift < 3; shift++) {
      playShift(50);
      if (shift < 2) must(store().nextCampaignShift());
    }
    must(store().voteSurplus('packing', 'members'));
    must(store().distributeSurplus());
    const carried = seasonReserveCarried(workplace());
    must(store().archiveCampaign(workplace().revision));
    must(store().startMission('cooperative'));
    const live = workplace();
    expect(live.campaign?.reserveBrought).toBeCloseTo(carried, 6);
    // The replay puts a fresh workplace in place and starts its charter on it.
    useWorkplaceStore.setState({ workplace: { ...createWorkplace('game', 9), revision: 99 } });
    must(store().startMission('team', 9, live));
    expect(workplace().campaign?.reserveBrought).toBeCloseTo(carried, 6);
    expect(workplace().campaign?.season).toBe(live.campaign?.season);
    // A second charter from the same checkpoint does the same, never twice.
    const first = workplace();
    useWorkplaceStore.setState({ workplace: { ...createWorkplace('game', 9), revision: 120 } });
    must(store().startMission('toe-dip', 9, first));
    expect(workplace().campaign?.reserveBrought).toBeCloseTo(carried, 6);
  });
});

export type { WorkplaceState };
