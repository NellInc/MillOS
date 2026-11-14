/**
 * The Chronicle probe with the tick in the loop (plan item 4c; review
 * instrument, inert in the ordinary suite). It signs a charter on the plant the
 * measurement harness drives (plantMeasure.playtest.test.ts, through
 * plantDriver.ts) and plays the whole chronicle: every close's evidence is the
 * report the real tick wrote, so trial medals, the fund and the score answer to
 * what the plant did, not to fixed inputs.
 *
 * RUN
 *   MILLOS_CHRONICLE_PROBE_OUT=<dir>   play and write one JSON per run into <dir>
 *   MILLOS_CHRONICLE_PROBE_SEEDS=8     seeds per style and length (charter seeds 101..)
 *   MILLOS_CHRONICLE_PROBE_FIRST_SEED=101  the first of them
 *   MILLOS_CHRONICLE_PROBE_CARDS=leave the styles leave every asked floor card to
 *                                      its window (the events-only reading)
 *   MILLOS_CHRONICLE_PROBE_STYLES=idle,attentive,skilled
 *   MILLOS_CHRONICLE_PROBE_LENGTHS=short,full
 *   MILLOS_CHRONICLE_PROBE_SHARD=i/n   play every n-th run from the i-th, so n
 *                                      processes split one sweep
 *   MILLOS_CHRONICLE_PROBE_GATES=<dir> read every run in <dir>, print the
 *                                      table and assert the gates (no plant run)
 *
 * STYLES (the plant floor runs on the partner's defaults in every style: no
 * button but those named, every proposal left to its window unless named)
 * - idle: answers nothing. Every Chronicle decision lapses to its default, no
 *   plan is drawn, no note read, no incident acknowledged.
 * - attentive: answers every Chronicle event with the recommended choice (the
 *   conventional brief's pick), mitigates a forecast at the conventional
 *   brief's threshold, answers the shortfall and the fire, restores what the
 *   Chronicle raised once it is recovered, draws plans and installs the
 *   cheapest it can afford while keeping three shifts of upkeep, hires a
 *   contractor when one is offered and nothing is installing, reads every note,
 *   and acknowledges and mitigates every plant incident (PlayableShift's next
 *   action). It also answers every floor card the game asks (a kind whose
 *   delegation reads "ask": the early programme and the grain intake by
 *   default) as it appears, with the pick the card shows, so it takes an early
 *   programme when the card shows "take". It runs no test the game does not ask
 *   for. Before 13 November it left those cards to their windows
 *   (MILLOS_CHRONICLE_PROBE_CARDS=leave plays it so).
 * - skilled: attentive, and prepares: asks to be asked about early programmes
 *   and takes every one ("take") through every tonnage trial's window (outside
 *   them it answers the card's pick), runs Test batch on Overview
 *   every shift (the Inspection asks for it; the certifier reads it), blends a
 *   sprouted year in place (a wet year is dried on the floor's temper card,
 *   which every style leaves to the partner: plan item 7.7), presses
 *   Maintain on every wear prediction from two shifts before a bad crop year
 *   to its end, takes the answers that prepare a long-night front, banks the
 *   reserve to 100 before the long night and holds there the front less
 *   prepared, and answers the quiz it can.
 *
 * WHAT IT DOES NOT MODEL, beyond the harness's own list (its header)
 * - The harness raises no safety hold and no E-stop; a Chronicle fire's stop
 *   is the plant's crisis state, which the tick reads. An idle player never
 *   answers a fire, so its plant stands stopped from the fire on: that is the
 *   game's rule for an absent player (rule 4: the way out exists, by hand).
 * - Recovery challenges are never started, so challenge medals are 0 for all.
 * - Part three's policy proposals and the reserve's autofill are left at their
 *   defaults.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractDockPredicates,
  extractRoster,
  LINE_RATE,
  runPolicy,
  type Policy,
  type ShiftRow,
} from './plantDriver';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { usePartnerProposalStore } from '../../stores/partnerProposalStore';
import {
  BENCH_CONTROL_SOURCE,
  OPERATOR_CONTROL_SOURCE,
  readAgainstOrder,
  useQCLabStore,
} from '../../stores/qcLabStore';
import { answerPartnerProposal } from '../partnerProposalRuntime';
import { firstOrderOwed } from '../../simulation/shipmentPlan';
import type { TemperFacts } from '../../simulation/temperProposal';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { qcReadingsForLots } from '../../chronicle/cropYears';
import {
  canAfford,
  choiceAvailable,
  currentForecastChance,
  fundOf,
  installBlockReason,
  installPrice,
  installShifts,
  knowHowOf,
  partnerChoice,
  upkeepDue,
  type ChronicleState,
} from '../../chronicle/engine';
import { EVENT_DECK } from '../../chronicle/eventDeck';
import { briefMitigationThreshold } from '../../chronicle/governance';
import { frontPreparation, LONG_NIGHT_EVENT_ID } from '../../chronicle/longNight';
import { eraById, IMPROVEMENTS, improvementById } from '../../chronicle/plans';
import { FORECASTS } from '../../chronicle/forecasts';
import { quizPool } from '../../chronicle/quiz';
import { MARKS } from '../../chronicle/record';
import { chronicleShifts, cropYearAt, cropYearStart, trialsFor } from '../../chronicle/schedule';
import { RANKS } from '../../chronicle/scoring';
import { standingOf } from '../../chronicle/certifier';
import type { ChronicleEventChoice, ChronicleLength, FrontId } from '../../chronicle/types';

const OUT = process.env.MILLOS_CHRONICLE_PROBE_OUT;
const GATES = process.env.MILLOS_CHRONICLE_PROBE_GATES;
const SEEDS = Number(process.env.MILLOS_CHRONICLE_PROBE_SEEDS ?? 8);
/** The first charter seed (a partial sweep re-plays a few seeds of the full one). */
const FIRST_SEED = Number(process.env.MILLOS_CHRONICLE_PROBE_FIRST_SEED ?? 101);
const STYLES = (process.env.MILLOS_CHRONICLE_PROBE_STYLES ?? 'idle,attentive,skilled').split(
  ','
) as Style[];
const LENGTHS = (process.env.MILLOS_CHRONICLE_PROBE_LENGTHS ?? 'short,full').split(
  ','
) as ChronicleLength[];
/** Measurement only: the skilled player takes every early programme, not only in trial windows. */
const TAKE_ALWAYS = process.env.MILLOS_CHRONICLE_PROBE_TAKE === 'always';
/**
 * Measurement only: 'leave' plays the attentive and skilled styles as before
 * 13 November, every asked floor card left to its window (the events-only reading).
 */
const ANSWER_CARDS = process.env.MILLOS_CHRONICLE_PROBE_CARDS !== 'leave';
const [SHARD, SHARDS] = (process.env.MILLOS_CHRONICLE_PROBE_SHARD ?? '0/1').split('/').map(Number);

type Style = 'idle' | 'attentive' | 'skilled';

/** One close as the probe saw it. */
interface CloseRow {
  shift: number;
  shippedKg: number;
  energyCost: number;
  net: number;
  grade: string | null;
  fund: number;
  knowHow: number;
  era: string;
  standing: number;
  /** Fund moved at this close, by source. */
  fundIn: Record<string, number>;
  qcKnowHow: number;
  benchTests: number;
  playerTests: number;
  installed: string[];
  upkeepDue: number;
  maintenanceCost: number;
  partsCost: number;
  automationCost: number;
  /** Fund each plan's avoided cost brought at this close (item 4.3). */
  planSaved: Record<string, number>;
  /** The crop year at the close: kind, treated, and the temper at the rolls. */
  crop?: string;
  /**
   * The cheapest purchase open at the close: an uninstalled plan's install or
   * a pending forecast's mitigation; null when nothing is open. Absent on runs
   * from before review 2, which the lock gate refuses to judge.
   */
  cheapestOpen?: number | null;
  /**
   * The cheapest purchase the player could make at the close: a pending
   * forecast's mitigation, or the install of a plan its era has reached whose
   * requirements are installed and which can still finish; null when none.
   * The lock gate reads this; a run from before it was kept is judged on
   * `cheapestOpen` read the same way from the row (`cheapestBuyableOf`).
   */
  cheapestBuyable?: number | null;
}

/** The dearest forecast mitigation: a recorded cheapestOpen at or under it was a mitigation. */
const DEAREST_MITIGATION = Math.max(...Object.values(FORECASTS).map((f) => f.mitigationCost));

/** See CloseRow.cheapestBuyable. */
function cheapestBuyable(state: ChronicleState): number | null {
  const prices: number[] = [];
  const reached = eraById(state.era).order;
  const last = chronicleShifts(state.charter);
  for (const plan of IMPROVEMENTS) {
    const progress = state.improvements.find((p) => p.id === plan.id);
    if (progress?.phase === 'installed' || progress?.phase === 'installing') continue;
    if (eraById(plan.era).order > reached) continue;
    const ready = plan.requires.every((id) =>
      state.improvements.some((p) => p.id === id && p.phase === 'installed')
    );
    if (!ready) continue;
    if (state.shift + installShifts(state, plan.id) > last) continue;
    prices.push(installPrice(state, plan.id));
  }
  for (const forecast of state.forecasts)
    if (forecast.status === 'pending' && !forecast.mitigated)
      prices.push(FORECASTS[forecast.kind].mitigationCost);
  return prices.length ? Math.min(...prices) : null;
}

/**
 * A row's cheapest buyable purchase: recorded, or for a run from before it was
 * recorded, read from `cheapestOpen` (which counted every uninstalled plan,
 * era-locked ones too): a figure at or under the dearest mitigation was a
 * mitigation and stands; otherwise the cheapest plan the row's era and
 * installs allow, at its list price (a firm's discount is not on the row, so
 * this can only overstate the price, never hide a lock).
 */
function cheapestBuyableOf(row: CloseRow, length: ChronicleLength): number | null | undefined {
  if (row.cheapestBuyable !== undefined) return row.cheapestBuyable;
  if (row.cheapestOpen === undefined) return undefined;
  if (typeof row.cheapestOpen === 'number' && row.cheapestOpen <= DEAREST_MITIGATION)
    return row.cheapestOpen;
  const reached = eraById(row.era as Parameters<typeof eraById>[0]).order;
  const last = chronicleShifts({ length });
  const prices = IMPROVEMENTS.filter(
    (plan) =>
      !row.installed.includes(plan.id) &&
      eraById(plan.era).order <= reached &&
      plan.requires.every((id) => row.installed.includes(id)) &&
      row.shift + plan.installShifts <= last
  ).map((plan) => plan.installCost);
  return prices.length ? Math.min(...prices) : null;
}

/**
 * Closes in a row unable to pay for anything the player could buy that count
 * as the fund locking: a whole crop year (9 closes in 63 shifts, 4 in 27, the
 * short form's longest year). Saving for the next plan over a few closes is
 * the economy working; a crop year with nothing affordable, through its
 * contractor offers, events and forecasts, without the fund rising, is a fund
 * that has dropped out.
 */
const LOCK_CLOSES: Readonly<Record<ChronicleLength, number>> = { full: 9, short: 4 };
/** Installs with the window left a plan's payback needs per length to be judged: half a sweep's seeds. */
const MIN_PAYBACK_INSTALLS = 4;

/** See CloseRow.cheapestOpen. */
function cheapestOpen(state: ChronicleState): number | null {
  const prices: number[] = [];
  for (const plan of IMPROVEMENTS) {
    const progress = state.improvements.find((p) => p.id === plan.id);
    if (progress?.phase === 'installed' || progress?.phase === 'installing') continue;
    prices.push(installPrice(state, plan.id));
  }
  for (const forecast of state.forecasts)
    if (forecast.status === 'pending' && !forecast.mitigated)
      prices.push(FORECASTS[forecast.kind].mitigationCost);
  return prices.length ? Math.min(...prices) : null;
}

/** The closes of each run of LOCK_CLOSES or more short of the cheapest purchase the player could make. */
function lockedClosesOf(rows: readonly CloseRow[], length: ChronicleLength): number[] {
  const locked: number[] = [];
  let stretch: CloseRow[] = [];
  // A fund that rises through the stretch is saving toward the next purchase
  // (on the short form a skilled player bought a plan at shift 19 and was
  // short of the next, 260, for four closes while the fund rose 140 to 249,
  // then bought it); one that does not rise has dropped out.
  const flush = () => {
    const saving = stretch.length > 0 && stretch.at(-1)!.fund > stretch[0].fund;
    if (stretch.length >= LOCK_CLOSES[length] && !saving)
      locked.push(...stretch.map((row) => row.shift));
    stretch = [];
  };
  for (const row of rows) {
    const cheapest = cheapestBuyableOf(row, length);
    if (typeof cheapest === 'number' && row.fund < cheapest) stretch.push(row);
    else flush();
  }
  flush();
  return locked;
}

export interface ProbeRun {
  style: Style;
  length: ChronicleLength;
  seed: number;
  status: string;
  shifts: number;
  score: Record<string, number | string> | null;
  rankIndex: number;
  era: string;
  eras: Record<string, number>;
  trials: Array<{
    id: string;
    phase: string;
    medal: string | null;
    dispatchedKg: number;
    shiftsUsed: number;
    energyPerKg: number | null;
    failureReason: string | null;
  }>;
  rows: CloseRow[];
  fundMin: number;
  fundEnd: number;
  /**
   * Closes inside a run of LOCK_CLOSES or more in a row at which the fund could
   * not pay for the cheapest open purchase (review 2, finding 6).
   */
  lockedCloses: number[];
  installs: Array<{
    id: string;
    installedShift: number | null;
    paidFund: number;
    upkeep: number;
  }>;
  decisions: {
    events: number;
    lapsed: number;
    mitigations: number;
    plans: number;
    commitmentsSeen: number;
    commitmentsTaken: number;
    tests: number;
    /** Asked floor cards answered with the card's own pick (absent on runs before it). */
    cards?: number;
  };
  marks: string[];
  realSeconds: number;
  /** The harness's own row for each shift (orders on time, late, forfeited; slack; grain). */
  plant?: ShiftRow[];
  /** Every Chronicle event answered or lapsed: shift, event, choice, actor. */
  events?: Array<{ shift: number; eventId: string; choiceId: string; actor: string }>;
  /** Every floor card once settled: the pick shown on it, the answer that ran, and who gave it. */
  proposals?: ProposalLog[];
}

interface ProposalLog {
  kind: string;
  shift: number;
  minute: number;
  shown: string;
  chosen: string | null;
  by: string | null;
  status: string;
  /** A temper card's facts: the stamp before the grain, both penalties, the open minimums. */
  temper?: { moisture: number; base: number; standard: number; dried: number; minimums: number[] };
}

/** OverviewPanel's Test batch (runConformingTest, 'initial') on the newest batch it is offered on. */
function pressTestBatch(): boolean {
  const flow = useMaterialFlowStore.getState();
  const batch = [...flow.productionBatches]
    .reverse()
    .find((b) => b.disposition === 'released' && !b.awaitingTest && b.availableKg > 0);
  if (!batch) return false;
  const orders = useOperationsCampaignStore.getState().orders;
  const order = firstOrderOwed(orders, batch.materialType) ?? null;
  const { grade, passed } = readAgainstOrder(
    batch.qualityScore,
    order?.recipe.minimumQuality ?? null
  );
  const readings = qcReadingsForLots(
    batch.sourceContributions.map((source) => ({
      crop: flow.sourceLots.get(source.lotId)?.crop,
      amountKg: source.amount,
    }))
  );
  const sourceLotIds = [...new Set(batch.sourceContributions.map((source) => source.lotId))];
  const lab = useQCLabStore.getState();
  lab.startQCTest(batch.packerId, {
    batchId: batch.id,
    sourceLotIds,
    testType: 'initial',
    controlSource: OPERATOR_CONTROL_SOURCE,
  });
  lab.completeQCTest({
    machineId: batch.packerId,
    batchId: batch.id,
    sourceLotIds,
    testType: 'initial',
    controlSource: OPERATOR_CONTROL_SOURCE,
    grade,
    moistureContent: readings.moistureContent,
    proteinLevel: readings.proteinLevel,
    ashContent: readings.ashContent,
    particleSize: readings.particleSize,
    ...(readings.fallingNumber !== null ? { fallingNumber: readings.fallingNumber } : {}),
    ...(order ? { orderId: order.id, minimumQuality: order.recipe.minimumQuality } : {}),
    ...(typeof batch.qualityScore === 'number' && Number.isFinite(batch.qualityScore)
      ? { qualityScore: batch.qualityScore }
      : {}),
    passed,
  });
  return true;
}

const BAD_CROPS = new Set(['wet', 'sprouted']);

/** The player, one style, between ticks. */
function makePlayer(style: Style, length: ChronicleLength, seed: number, policy: Policy) {
  const answers = style !== 'idle';
  const skilled = style === 'skilled';
  let signed = false;
  let lastShift = -1;
  let testedShift = -1;
  const decisions = {
    events: 0,
    lapsed: 0,
    mitigations: 0,
    plans: 0,
    commitmentsSeen: 0,
    commitmentsTaken: 0,
    tests: 0,
    cards: 0,
  };
  const seenCommitments = new Set<string>();
  const proposals: ProposalLog[] = [];
  const loggedProposals = new Set<string>();
  const rows: CloseRow[] = [];
  const eras: Record<string, number> = { village: 0 };
  const seenTests = new Set<string>();
  let benchTests = 0;
  let playerTests = 0;
  const chronicle = () => useChronicleStore.getState().chronicle;

  const trialWindow = (state: ChronicleState, kinds: 'dispatch' | 'clean_closes') =>
    trialsFor(state.charter).some((definition) => {
      if (definition.goal.kind !== kinds) return false;
      const progress = state.trials.find((t) => t.id === definition.id);
      if (!progress) return false;
      return (
        progress.phase === 'active' ||
        (progress.phase === 'telegraphed' && state.shift >= definition.startShift - 1)
      );
    });

  const badCropSoon = (state: ChronicleState) => {
    const charter = state.charter;
    if (!charter) return false;
    if (state.crop && BAD_CROPS.has(state.crop.kind)) return true;
    // The next crop year is drawn at its turn; two shifts before a turn the
    // skilled player services whatever comes (it cannot know the draw).
    const next = cropYearStart(charter, cropYearAt(charter, state.shift) + 1);
    return next - state.shift <= 2;
  };

  function chooseFor(state: ChronicleState, instanceId: string, eventId: string) {
    const event = EVENT_DECK.find((candidate) => candidate.id === eventId);
    if (!event) return;
    let choice: ChronicleEventChoice | null = null;
    if (skilled && eventId === LONG_NIGHT_EVENT_ID) {
      // Hold the front that is less prepared; the other holds on its preparation.
      const fronts: FrontId[] = ['intake', 'floor'];
      const weakest = fronts.sort(
        (a, b) => frontPreparation(state, a) - frontPreparation(state, b)
      )[0];
      choice =
        event.choices.find(
          (c) =>
            c.effect.holdFront === weakest && choiceAvailable(state, c) && canAfford(state, c.cost)
        ) ?? null;
    }
    if (!choice && skilled) {
      choice =
        event.choices.find(
          (c) =>
            choiceAvailable(state, c) &&
            canAfford(state, c.cost) &&
            (c.effect.marks ?? []).some((mark) => (MARKS[mark]?.prepares?.length ?? 0) > 0)
        ) ?? null;
    }
    choice ??= partnerChoice(state, event);
    if (!choice || !choiceAvailable(state, choice) || !canAfford(state, choice.cost)) return;
    useChronicleStore.getState().choose(instanceId, choice.id);
    decisions.events++;
  }

  function atClose(state: ChronicleState) {
    const store = useChronicleStore.getState();
    for (const pending of [...state.pendingEvents]) {
      const live = chronicle();
      if (!live.pendingEvents.some((p) => p.instanceId === pending.instanceId)) continue;
      chooseFor(live, pending.instanceId, pending.eventId);
    }
    for (const forecast of chronicle().forecasts) {
      if (forecast.status !== 'pending' || forecast.mitigated) continue;
      const live = chronicle();
      if (
        currentForecastChance(live, forecast) >=
        briefMitigationThreshold(live.governance.brief, forecast.kind)
      ) {
        const before = fundOf(live);
        store.mitigate(forecast.id);
        if (fundOf(chronicle()) !== before) decisions.mitigations++;
      }
    }
    if (chronicle().upkeepShortfall !== null)
      store.answerShortfall(knowHowOf(chronicle()) >= 4 ? 'forced' : 'conserve');
    if (skilled && chronicle().crop && BAD_CROPS.has(chronicle().crop!.kind)) store.treatCrop();
    // Plans: draw every plan the era allows, cheapest first, then install the
    // cheapest drawn while three shifts of upkeep stay in hand.
    for (const plan of [...IMPROVEMENTS].sort((a, b) => a.installCost - b.installCost)) {
      const before = chronicle().improvements.length;
      store.plan(plan.id);
      if (chronicle().improvements.length > before) decisions.plans++;
    }
    const live = chronicle();
    if (!live.improvements.some((p) => p.phase === 'installing')) {
      const offer = live.contractor ? null : live.contractorOffers[0];
      if (offer && fundOf(live) - offer.retainer >= upkeepDue(live) * 3) store.hire(offer.id);
    }
    const planned = chronicle()
      .improvements.filter((p) => p.phase === 'planned')
      .map((p) => improvementById(p.id)!)
      .filter((plan) => installBlockReason(chronicle(), plan.id) === null)
      .sort((a, b) => installPrice(chronicle(), a.id) - installPrice(chronicle(), b.id));
    for (const plan of planned) {
      const now = chronicle();
      if (fundOf(now) - installPrice(now, plan.id) < upkeepDue(now) * 3) break;
      store.install(plan.id);
    }
    for (const noteId of chronicle().unlockedNotes)
      if (!chronicle().readNotes.includes(noteId)) store.readNote(noteId);
    if (skilled) {
      for (const question of quizPool(chronicle())) store.answerQuiz(question.id, true);
      // The reserve counts as one long-night preparation at 100 or more (item 4.8).
      const night = chronicle();
      if (
        !night.firedScheduled.includes(LONG_NIGHT_EVENT_ID) &&
        night.governance.reserve.balance < 100
      )
        store.depositReserve();
    }
  }

  function everyTick() {
    const campaign = useOperationsCampaignStore.getState();
    if (!signed) {
      if (campaign.reports.length === 0) return;
      useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, length }, seed);
      // The early-programme card is asked by default (DELEGATION_EVIDENCE); the
      // skilled player sets it so anyway, so a changed default cannot hide it.
      if (skilled) usePartnerProposalStore.getState().setDelegation('commitment', 'ask');
      signed = true;
      lastShift = 0;
      return;
    }
    const state = chronicle();
    // Lab tests by who ran them (fix-up d): the record keeps the bench's apart.
    for (const test of useQCLabStore.getState().qcLab.testHistory) {
      const key = `${test.id}@${new Date(test.timestamp).getTime()}`;
      if (seenTests.has(key)) continue;
      seenTests.add(key);
      if (test.controlSource === BENCH_CONTROL_SOURCE) benchTests++;
      else playerTests++;
    }
    if (state.shift !== lastShift) {
      lastShift = state.shift;
      const report = campaign.reports.at(-1);
      const m = report?.metrics;
      rows.push({
        shift: state.shift,
        shippedKg: m?.dispatchedKg ?? 0,
        energyCost: m?.energyCost ?? 0,
        net: m
          ? m.revenue -
            m.energyCost -
            m.automationCost -
            m.wasteCost -
            m.maintenanceCost -
            m.demurrageCost -
            m.latePenalties -
            (m.grainCost ?? 0) -
            (m.partsCost ?? 0) +
            (m.stockHeld ?? 0)
          : 0,
        grade: report?.grade ?? null,
        fund: fundOf(state),
        knowHow: knowHowOf(state),
        era: state.era,
        standing: standingOf(state.certifier),
        fundIn: { ...state.ledger.lastShiftFund },
        qcKnowHow: state.ledger.lastShiftKnowHow.qc ?? 0,
        benchTests,
        playerTests,
        installed: state.improvements.filter((p) => p.phase === 'installed').map((p) => p.id),
        upkeepDue: upkeepDue(state),
        maintenanceCost: m?.maintenanceCost ?? 0,
        partsCost: m?.partsCost ?? 0,
        automationCost: m?.automationCost ?? 0,
        planSaved: Object.fromEntries(
          Object.entries(state.planSavings ?? {}).map(([id, saved]) => [id, saved.last])
        ),
        crop: state.crop
          ? `${state.crop.kind}${state.crop.treated ? '+treated' : ''}:${state.crop.temper?.inForce ?? 'standard'}`
          : undefined,
        cheapestOpen: cheapestOpen(state),
        cheapestBuyable: cheapestBuyable(state),
      });
      benchTests = 0;
      playerTests = 0;
      eras[state.era] ??= state.shift;
      decisions.lapsed = state.eventHistory.filter((e) => e.actor === 'chronicle').length;
      if (answers && state.status === 'active') atClose(state);
    }
    for (const proposal of usePartnerProposalStore.getState().proposals) {
      if (proposal.status === 'open' || loggedProposals.has(proposal.id)) continue;
      loggedProposals.add(proposal.id);
      const facts = proposal.kind === 'temper' ? (proposal.facts as TemperFacts) : null;
      proposals.push({
        kind: proposal.kind,
        shift: state.shift,
        minute: proposal.raisedAtMinute,
        shown: proposal.defaultOptionId,
        chosen: proposal.resolution?.optionId ?? null,
        by: proposal.resolution?.decidedBy ?? null,
        status: proposal.status,
        ...(facts
          ? {
              temper: {
                moisture: facts.moisturePct,
                base: facts.base,
                standard: facts.standardPenalty,
                dried: facts.driedPenalty,
                minimums: facts.openMinimums,
              },
            }
          : {}),
      });
    }
    if (!answers || state.status !== 'active') return;
    // The fire and the plant's incidents are answered as they come.
    if (state.fire.active && !state.fire.suppressing)
      useChronicleStore.getState().suppress(fundOf(state) >= 70 ? 'suppress' : 'by_hand');
    for (const incident of campaign.incidents) {
      if (incident.phase === 'raised') campaign.acknowledgeIncident(incident.id, 'operator');
      else if (incident.phase === 'acknowledged')
        campaign.mitigateIncident(incident.id, 'operator');
    }
    for (const owned of state.ownedIncidents) {
      const incident = campaign.incidents.find((i) => i.id === owned.incidentId);
      if (incident?.phase === 'mitigated' && incident.effectApplied)
        useChronicleStore.getState().restore(owned.incidentId);
    }
    for (const proposal of usePartnerProposalStore.getState().proposals)
      if (proposal.kind === 'commitment' && !seenCommitments.has(proposal.id)) {
        seenCommitments.add(proposal.id);
        decisions.commitmentsSeen++;
      }
    if (skilled && (TAKE_ALWAYS || trialWindow(state, 'dispatch')))
      for (const proposal of usePartnerProposalStore.getState().proposals)
        if (
          proposal.status === 'open' &&
          proposal.kind === 'commitment' &&
          answerPartnerProposal(proposal.id, 'take', 'operator')
        )
          decisions.commitmentsTaken++;
    // Every floor card the game asks (its delegation reads "ask"), answered as
    // it appears with the pick the card shows; nothing the game does not ask.
    if (ANSWER_CARDS) {
      const cards = usePartnerProposalStore.getState();
      for (const proposal of cards.proposals)
        if (
          proposal.status === 'open' &&
          cards.delegation[proposal.kind] === 'ask' &&
          answerPartnerProposal(proposal.id, proposal.defaultOptionId, 'operator')
        )
          decisions.cards++;
    }
    if (!skilled) return;
    if (testedShift !== state.shift && pressTestBatch()) {
      testedShift = state.shift;
      decisions.tests++;
    }
    policy.service = badCropSoon(state);
  }

  return { everyTick, rows, eras, decisions, proposals };
}

function playOne(style: Style, length: ChronicleLength, seed: number): ProbeRun {
  const started = Date.now();
  const policy: Policy = {
    label: `${style}-${length}-${seed}`,
    accepts: false,
    repairs: false,
    lineRate: LINE_RATE,
    service: false,
    proposals: 'leave',
  };
  const player = makePlayer(style, length, seed, policy);
  const shifts = chronicleShifts({ length });
  // One partial report, then `shifts` whole ones; the charter is signed on the first.
  const plant = runPolicy(
    policy,
    STANDARD_GAME_SPEED,
    shifts,
    extractRoster(),
    extractDockPredicates(),
    player.everyTick
  );
  const state = useChronicleStore.getState().chronicle;
  const rows = player.rows;
  const lockedCloses = lockedClosesOf(rows, length);
  const score = state.finalScore;
  const rankIndex = score ? RANKS.findIndex((rank) => rank.title === score.rank) : -1;
  return {
    style,
    length,
    seed,
    status: state.status,
    shifts: state.shift,
    score: score as unknown as Record<string, number | string> | null,
    rankIndex,
    era: state.era,
    eras: player.eras,
    trials: state.trials.map((t) => ({
      id: t.id,
      phase: t.phase,
      medal: t.medal,
      dispatchedKg: Math.round(t.dispatchedKg),
      shiftsUsed: t.shiftsUsed,
      energyPerKg:
        t.dispatchedKg > 0 ? Math.round((t.energyCost / t.dispatchedKg) * 1e4) / 1e4 : null,
      failureReason: t.failureReason,
    })),
    rows,
    fundMin: Math.min(...rows.map((r) => r.fund)),
    fundEnd: fundOf(state),
    lockedCloses,
    installs: state.improvements.map((p) => ({
      id: p.id,
      installedShift: p.phase === 'installed' ? (p.completesShift ?? null) : null,
      paidFund: p.paidFund,
      upkeep: improvementById(p.id)?.upkeep ?? 0,
    })),
    decisions: player.decisions,
    marks: Object.keys(state.marks),
    realSeconds: Math.round((Date.now() - started) / 100) / 10,
    plant: plant.rows,
    proposals: player.proposals,
    events: state.eventHistory.map((e) => ({
      shift: e.shift,
      eventId: e.eventId,
      choiceId: e.choiceId,
      actor: String(e.actor),
    })),
  };
}

describe.skipIf(!OUT)('the Chronicle probe, the tick in the loop', () => {
  it('plays every style, length and seed on the measured plant', () => {
    mkdirSync(OUT!, { recursive: true });
    let index = 0;
    for (const length of LENGTHS)
      for (const style of STYLES)
        for (let s = 0; s < SEEDS; s++) {
          if (index++ % SHARDS !== SHARD) continue;
          const seed = FIRST_SEED + s;
          const run = playOne(style, length, seed);
          writeFileSync(join(OUT!, `${style}-${length}-${seed}.json`), JSON.stringify(run));
          process.stdout.write(
            `${style} ${length} seed ${seed}: ${run.status} ${run.shifts} shifts, score ${run.score?.total ?? '-'} (${run.score?.rank ?? '-'}), era ${run.era}, fund ${Math.round(run.fundEnd)} (min ${Math.round(run.fundMin)}), trials ${run.trials.map((t) => `${t.id}:${t.medal ?? t.phase}`).join(' ')}, ${run.realSeconds} s\n`
          );
          expect(run.status).toBe('ended');
        }
  });
});

// ---------------------------------------------------------------------------
// The paired control for plan item 4.3: does a plan's effect move a booked cost?
// ---------------------------------------------------------------------------

const CONTROL = process.env.MILLOS_CHRONICLE_PROBE_CONTROL;

describe.skipIf(!CONTROL)('plans move booked costs (paired control)', () => {
  /** Ten shifts, sandbox charter, the given plans installed at signing; booked lines summed. */
  const run = (plans: string[]) => {
    let signed = false;
    const totals = { energyCost: 0, maintenanceCost: 0, partsCost: 0, shippedKg: 0 };
    let lastReport: string | undefined;
    runPolicy(
      {
        label: `control-${plans.join('+') || 'none'}`,
        accepts: false,
        repairs: false,
        lineRate: LINE_RATE,
        service: false,
        proposals: 'leave',
      },
      STANDARD_GAME_SPEED,
      10,
      extractRoster(),
      extractDockPredicates(),
      () => {
        const campaign = useOperationsCampaignStore.getState();
        if (!signed) {
          if (!campaign.reports.length) return;
          useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'sandbox' }, 7);
          const state = useChronicleStore.getState().chronicle;
          useChronicleStore.setState({
            chronicle: {
              ...state,
              improvements: plans.map((id) => ({
                id: id as ChronicleState['improvements'][number]['id'],
                phase: 'installed' as const,
                contractorId: null,
                startedShift: 0,
                completesShift: 0,
                paidFund: 0,
                effectScale: 1,
                initiatedBy: 'player' as const,
              })),
            },
          });
          signed = true;
          lastReport = campaign.reports.at(-1)?.id;
          return;
        }
        const report = campaign.reports.at(-1);
        if (!report || report.id === lastReport) return;
        lastReport = report.id;
        totals.energyCost += report.metrics.energyCost;
        totals.maintenanceCost += report.metrics.maintenanceCost;
        totals.partsCost += report.metrics.partsCost ?? 0;
        totals.shippedKg += report.metrics.dispatchedKg;
      }
    );
    return totals;
  };

  it('wind and heat recovery cut booked energy by their effect; vibration monitoring moves parts and work orders', () => {
    const none = run([]);
    const energy = run(['wind-turbine', 'heat-recovery']);
    const wear = run(['vibration-monitoring']);
    const ratio = (a: number, b: number) => (b > 0 ? a / b : NaN);
    const out = {
      none,
      energy,
      wear,
      energyRatio: ratio(energy.energyCost, none.energyCost),
      expectedEnergyRatio: 0.94 * 0.96,
      wearCostRatio: ratio(
        wear.maintenanceCost + wear.partsCost,
        none.maintenanceCost + none.partsCost
      ),
    };
    process.stdout.write(`control ${JSON.stringify(out)}\n`);
    writeFileSync(CONTROL!, JSON.stringify(out, null, 1));
    expect(out.energyRatio).toBeGreaterThan(0.85);
    expect(out.energyRatio).toBeLessThan(0.95);
  });
});

// ---------------------------------------------------------------------------
// Gates (plan item 4.1), read from a sweep's runs
// ---------------------------------------------------------------------------

function loadRuns(dir: string): ProbeRun[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(dir, file), 'utf8')) as ProbeRun);
}

/**
 * For each run where the plan was installed with at least `window` closes left,
 * the closes from its install until the fund it brought, less its upkeep, has
 * paid what it cost; null where it had not within `window`.
 */
function paybackShifts(runs: ProbeRun[], id: string, window = Infinity): Array<number | null> {
  const out: Array<number | null> = [];
  for (const run of runs) {
    const install = run.installs.find((p) => p.id === id && p.installedShift !== null);
    if (!install || install.installedShift === null) continue;
    const after = run.rows.filter((row) => row.shift > install.installedShift!);
    if (Number.isFinite(window) && after.length < window) continue;
    let balance = -install.paidFund;
    let found: number | null = null;
    after.slice(0, Number.isFinite(window) ? window : undefined).forEach((row, i) => {
      balance += (row.planSaved[id] ?? 0) - install.upkeep;
      if (found === null && balance >= 0) found = i + 1;
    });
    out.push(found);
  }
  return out;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;
};

describe.skipIf(!GATES)('the Chronicle probe gates', () => {
  const runs = GATES ? loadRuns(GATES) : [];
  const of = (style: Style, length: ChronicleLength) =>
    runs.filter((run) => run.style === style && run.length === length);

  it('prints the table', () => {
    const lines: string[] = [];
    for (const length of ['short', 'full'] as const)
      for (const style of ['idle', 'attentive', 'skilled'] as const) {
        const group = of(style, length);
        if (!group.length) continue;
        const medals = trialsFor({ length }).map((definition) => {
          const counts: Record<string, number> = {};
          for (const run of group) {
            const trial = run.trials.find((t) => t.id === definition.id);
            const key = trial?.medal ?? trial?.phase ?? '-';
            counts[key] = (counts[key] ?? 0) + 1;
          }
          return `${definition.id}{${Object.entries(counts)
            .map(([k, v]) => `${k}:${v}`)
            .join(',')}}`;
        });
        const eraCounts: Record<string, number> = {};
        for (const run of group) eraCounts[run.era] = (eraCounts[run.era] ?? 0) + 1;
        lines.push(
          `${style.padEnd(9)} ${length.padEnd(5)} n=${group.length} score med ${median(group.map((r) => Number(r.score?.total ?? 0)))} [${Math.min(...group.map((r) => Number(r.score?.total ?? 0)))}-${Math.max(...group.map((r) => Number(r.score?.total ?? 0)))}] rank med ${median(group.map((r) => r.rankIndex))} fund end med ${Math.round(median(group.map((r) => r.fundEnd)))} min ${Math.round(Math.min(...group.map((r) => r.fundMin)))} eras ${JSON.stringify(eraCounts)} ${medals.join(' ')}`
        );
      }
    // The figures measuredPlant.ts reads: the attentive style outside every
    // trial window and the wet year's shifts (the partner's defaults, a serviced
    // line, incidents answered, no early programme).
    const attentive = runs.filter((run) => run.style === 'attentive');
    const steady = attentive.flatMap((run) =>
      run.rows.filter((row) => {
        const inWindow = trialsFor({ length: run.length }).some(
          (t) => row.shift > t.startShift && row.shift <= t.startShift + t.durationShifts
        );
        return !inWindow && row.grade === 'A';
      })
    );
    const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / (values.length || 1);
    lines.push(
      `measured (attentive, outside windows, graded A, n=${steady.length}): shiftKg median ${Math.round(median(steady.map((r) => r.shippedKg)))}, shiftNet mean ${Math.round(mean(steady.map((r) => r.net)))}, shiftEnergyCost mean ${Math.round(mean(steady.map((r) => r.energyCost)))}, energy per kg ${(mean(steady.map((r) => r.energyCost)) / Math.max(1, mean(steady.map((r) => r.shippedKg)))).toFixed(4)}; parts a shift ${Math.round(mean(steady.map((r) => r.partsCost)))}`
    );
    // Grid Winter: energy per kg over the window, by style.
    for (const style of ['idle', 'attentive', 'skilled'] as const) {
      const values = runs
        .filter((run) => run.style === style)
        .flatMap((run) => run.trials.filter((t) => t.id === 'grid_winter'))
        .map((t) => t.energyPerKg)
        .filter((v): v is number => v !== null);
      if (values.length)
        lines.push(
          `grid winter energy per kg, ${style}: median ${median(values)} [${Math.min(...values)}-${Math.max(...values)}]`
        );
    }
    // Plan item 4.3: shifts from install until the fund the plan brought, less
    // its upkeep, has paid its price.
    for (const id of ['wind-turbine', 'heat-recovery', 'vibration-monitoring']) {
      for (const length of ['short', 'full'] as const) {
        const paybacks = paybackShifts(
          runs.filter((run) => run.length === length),
          id
        );
        if (paybacks.length)
          lines.push(
            `payback ${id} ${length}: ${paybacks.map((p) => (p === null ? 'none' : p)).join(' ')}`
          );
      }
    }
    for (const length of ['short', 'full'] as const)
      lines.push(
        `idle ${length} fund at the end: ${of('idle', length)
          .map((run) => Math.round(run.fundEnd))
          .join(' ')}`
      );
    process.stdout.write(`${lines.join('\n')}\n`);
    expect(runs.length).toBeGreaterThan(0);
  });

  for (const length of ['short', 'full'] as const) {
    it(`${length}: an idle player ranks in the lowest two`, () => {
      for (const run of of('idle', length))
        expect(run.rankIndex, `seed ${run.seed}`).toBeLessThanOrEqual(1);
    });
    it(`${length}: gold on each dispatch trial for the skilled player in most seeds, the idle one in none`, () => {
      for (const definition of trialsFor({ length })) {
        const gold = (style: Style) =>
          of(style, length).filter(
            (run) => run.trials.find((t) => t.id === definition.id)?.medal === 'gold'
          ).length;
        expect(gold('idle'), `${definition.id} idle`).toBe(0);
        expect(gold('skilled') * 2, `${definition.id} skilled`).toBeGreaterThan(
          of('skilled', length).length
        );
      }
      // Review 2, finding 3: idle's medals of any colour, per seed. No tonnage
      // can deny them while skilled keeps gold: in the Wet Harvest's window the
      // idle plant (the partner's defaults) ships as the attentive one does, and
      // more over the whole window than skilled ships in the shifts gold allows.
      // Nor can a silver bar of its own: at silver's shift idle reaches what
      // attentive does where idle medals (the plant is dock-bound, D-082; the
      // per-seed table is in D-118). So the gate is "no gold", not "no medal".
      const idleMedals = of('idle', length)
        .sort((a, b) => a.seed - b.seed)
        .map(
          (run) =>
            `${run.seed}:${
              run.trials
                .filter((t) => t.medal)
                .map((t) => `${t.id}=${t.medal}`)
                .join('+') || 'none'
            }`
        );
      process.stdout.write(`idle medals ${length}: ${idleMedals.join(' ')}\n`);
    });
    // Review 2, finding 6: "locks" is read as it is meant, the fund short of
    // the cheapest purchase the player could make for LOCK_CLOSES closes in a
    // row, from what each close recorded, and a run without that record cannot
    // pass. A plan its era has not reached is no purchase: in the full form an
    // attentive Regional mill that had bought everything else was short of
    // Federated purchasing (280) for its last four closes, and that is not a
    // locked fund.
    it(`${length}: the fund never locks`, () => {
      const judged = runs.filter((r) => r.length === length);
      expect(judged.length, `${length}: no runs`).toBeGreaterThan(0);
      for (const run of judged) {
        const unrecorded = run.rows.filter(
          (row) => cheapestBuyableOf(row, length) === undefined
        ).length;
        expect(unrecorded, `${run.style} ${run.seed}: closes without the record`).toBe(0);
        expect(lockedClosesOf(run.rows, length), `${run.style} ${run.seed}`).toEqual([]);
      }
      // The longest stretch short of everything buyable, against the bound.
      let longest = 0;
      for (const run of judged.filter((r) => r.style !== 'idle')) {
        let stretch = 0;
        for (const row of run.rows) {
          const cheapest = cheapestBuyableOf(row, length);
          stretch = typeof cheapest === 'number' && row.fund < cheapest ? stretch + 1 : 0;
          longest = Math.max(longest, stretch);
        }
      }
      process.stdout.write(
        `fund short of everything buyable, ${length}: longest ${longest} closes in a row against ${LOCK_CLOSES[length]}\n`
      );
    });
    const dearest = Math.max(...IMPROVEMENTS.map((plan) => plan.installCost));
    // Only for the players who spend it. The briefed form held every style to
    // it, idle included, and no tuning can meet that: an idle player buys
    // nothing, so its end balance is the whole of its income, and a share low
    // enough to keep it under the cap would leave a buyer unable to afford the
    // plans (plan wave 4c; close-out 1 of item 7c retired that form).
    it(`${length}: a buyer's fund never ends above three times the dearest plan`, () => {
      const buyers = runs.filter((r) => r.length === length && r.style !== 'idle');
      const over = buyers
        .filter((run) => run.fundEnd > dearest * 3)
        .map((run) => `${run.style} ${run.seed} ${Math.round(run.fundEnd)}`);
      process.stdout.write(
        `buyers' fund at the end, ${length}: max ${Math.round(Math.max(...buyers.map((r) => r.fundEnd)))} against ${dearest * 3}\n`
      );
      expect(over).toEqual([]);
    });
    it(`${length}: wind, heat recovery and vibration monitoring each pay back in time where installed`, () => {
      const within = length === 'short' ? Math.round((25 * 27) / 63) : 25;
      const lengthRuns = runs.filter((r) => r.length === length);
      const last = chronicleShifts({ length });
      const counted: string[] = [];
      for (const id of ['wind-turbine', 'heat-recovery', 'vibration-monitoring']) {
        // Scoped to what the length can show (review 2, finding 6): a plan is
        // judged where its era arrives with the window still left in at least
        // MIN_PAYBACK_INSTALLS runs. Wind and heat recovery are Regional plans,
        // and a 27-shift chronicle reaches Regional at shift 23 to 27, so
        // neither can be installed with 11 closes left there; that is printed,
        // not passed.
        const era = improvementById(id)!.era;
        const reachable = lengthRuns.filter((r) => (r.eras[era] ?? Infinity) <= last - within);
        if (reachable.length < MIN_PAYBACK_INSTALLS) {
          process.stdout.write(
            `payback ${length} ${id}: out of scope, its era (${era}) arrives with ${within} closes left in ${reachable.length} of ${lengthRuns.length} runs\n`
          );
          continue;
        }
        const paybacks = paybackShifts(
          runs.filter((r) => r.length === length),
          id,
          within
        );
        counted.push(`${id} ${paybacks.length}`);
        for (const payback of paybacks) expect(payback, id).not.toBeNull();
      }
      process.stdout.write(
        `payback ${length} (installs with ${within} closes left): ${counted.join(', ')}\n`
      );
      // Review 2, finding 6: no qualifying install is no evidence, not a pass.
      expect(counted.length, `${length}: no plan in scope`).toBeGreaterThan(0);
      for (const entry of counted) {
        const count = Number(entry.split(' ').at(-1));
        expect(
          count,
          `${length}: ${entry} installs with ${within} closes left, at least ${MIN_PAYBACK_INSTALLS} needed`
        ).toBeGreaterThanOrEqual(MIN_PAYBACK_INSTALLS);
      }
    });
    it(`${length}: answering every decision adds at least 25 points`, () => {
      const idle = median(of('idle', length).map((r) => Number(r.score?.total ?? 0)));
      const attentive = median(of('attentive', length).map((r) => Number(r.score?.total ?? 0)));
      expect(attentive - idle).toBeGreaterThanOrEqual(25);
    });
  }
});
