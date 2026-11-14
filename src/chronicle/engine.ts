/**
 * The Chronicle engine: pure reducers over ChronicleState.
 *
 * Every function returns the next state plus the commands the store must
 * perform on other stores (raise an incident, unlock a Datalinks note, start a
 * crisis). The engine never reaches into another store itself, so a sequence
 * of recorded shift reports always produces the same chronicle.
 */
import type {
  CustomerOrder,
  IncidentKind,
  OperationalIncident,
  ShiftCampaignReport,
} from '../stores/operationsCampaignStore';
// The incident table only, read to price an incident (`incidentFundCost`); the
// engine still reads no store's state.
import { INCIDENT_DEFINITIONS } from '../stores/operationsCampaignStore';
import type { OperationsChallengeRun } from '../simulation/operationsPlay';
import {
  charterStartingFund,
  charterStartingRelationship,
  fortuneForecastShift,
  fortuneWeights,
  TRAINING_MODE,
} from './charter';
import {
  contractorCandidates,
  contractorCostMultiplier,
  contractorEffectScale,
  contractorInstallShifts,
  contractorSnagChance,
} from './contractors';
import { createCropYear, CROP_YEARS, cropTreatmentCost, stampDelivery } from './cropYears';
import {
  chronicleShifts,
  cropYearAt,
  cropYearShifts,
  cropYearStart,
  onSchedule,
  trialsFor,
  trialTelegraphShifts,
} from './schedule';
import {
  AI_KNOW_HOW_SHARE,
  AI_UPKEEP_RESERVE_SHIFTS,
  aiShiftBudget,
  canAnswerEvents,
  canFundMitigations,
  canStartInstalls,
} from './delegation';
import {
  adjustStanding,
  initialCertifier,
  reinstate as reinstateCertifier,
  REINSTATEMENT_AFTER_SHIFTS,
  STANDING_PER_FAILED_SHIFT,
  STANDING_PER_QC_PASS,
  standingOf,
  standingScore,
  suspend as suspendCertifier,
  SUSPENSION_CUSTOMER_DELTA,
} from './certifier';
import { chronicleTotals, relievedCropKinds } from './effects';
import { avoidedByPlan } from './avoided';
import { MEASURED_PLANT, REINVESTED_PER_MEASURED_SHIFT } from './measuredPlant';
import { REFERENCE_DRYING_COST } from './temper';
import { FORECAST_ISSUE_CHANCE, FORECAST_KINDS, FORECASTS, forecastChance } from './forecasts';
import {
  ADMINISTRATION_COOL_ORGANISATIONS,
  ADMINISTRATION_MISSED_QUOTAS,
  ADMINISTRATION_SHIFTS,
  assemblyBallots,
  assemblyCount,
  assessConditions,
  BREAK_OFF_DELTA,
  briefInstallRank,
  briefLabel,
  briefMitigationThreshold,
  briefServes,
  briefScore,
  BRIEFS,
  COUNTDOWN_SHIFTS,
  createGovernance,
  emptyTally,
  FEDERATION_PREMIUM,
  ladderById,
  nextQuota,
  outvotedNeeds,
  POLICY_KNOW_HOW,
  POLICY_LADDER_IDS,
  policyForecastShift,
  QUOTA_RELATIONSHIP,
  RED_LINES,
  redLineKey,
  redLinesCrossed,
  RESERVE_AUTOFILL_SHARE,
  RESERVE_DEPOSIT,
  RULING_OBJECTIONS,
  rungOf,
  shiftsUntilUnlocked,
  STANDING_CONDITIONS,
  tieCarries,
  tieCarryReason,
} from './governance';
import {
  CUSTOMERS,
  clampRelationship,
  customerIdForName,
  initialRelationships,
  LOYALTY_PREMIUM_SHARE,
  fulfilmentGain,
  RELATIONSHIP_DELTAS,
  relationshipTier,
} from './customers';
import { formatFixed, formatGrouped } from '../i18n';
import { HISTORY_NOTES } from './history';
import {
  emptyLedger,
  finishShiftClose,
  openShiftClose,
  fundBalance,
  knowHowBalance,
  knowHowEarned,
  netContribution,
  recordFund,
  recordKnowHow,
} from './ledger';
import {
  FRONT_HOLD_THRESHOLD,
  FRONTS,
  frontHolds,
  frontPreparation,
  LONG_NIGHT_EVENT_ID,
  LONG_NIGHT_SCORE,
  LONG_NIGHT_SHIFT,
  LONG_NIGHT_TELEGRAPH_SHIFTS,
  otherFront,
} from './longNight';
import { eraById, ERAS, improvementById, IMPROVEMENTS, reachedEra } from './plans';
import {
  conditionMet,
  hasMark,
  MARKS,
  markForecastRelief,
  millCharacter,
  partyName,
} from './record';
import { chronicleChance, weightedPick } from './rng';
import { scoreChronicle, type ScoreBreakdown } from './scoring';
import { FEDERATION_ADMINISTRATOR_EVENT_ID } from './stewardDeck';
import {
  initialStakeholders,
  stakeholderForecastShift,
  stakeholderPhrase,
  stakeholderReinvestment,
  treatmentMultiplier,
} from './stakeholders';
import {
  advanceTrial,
  challengeMedal,
  emptyTrialProgress,
  GRADE_POINTS,
  MEDAL_KNOW_HOW,
  nextMedalTarget,
  trialById,
} from './trials';
import type {
  Actor,
  BriefId,
  CertifierState,
  Charter,
  ChronicleCommand,
  ChronicleEventChoice,
  ChronicleEventDefinition,
  ChronicleEventEffect,
  ChronicleNotice,
  Contractor,
  CooperativeSeasonFact,
  CooperativeSeasonRecord,
  Cost,
  ImprovementDefinition,
  CropAttributes,
  CropYearState,
  CropYearReturn,
  CrewRoleId,
  CustomerId,
  CustomerRelationship,
  DecisionMark,
  DelegationLevel,
  EraId,
  EventPolarity,
  ForecastKind,
  ForecastState,
  FrontId,
  GovernanceState,
  HistoryTrigger,
  ImprovementProgress,
  Initiative,
  Medal,
  NoticeKind,
  PartyChangeCause,
  PartyChangeRecord,
  PendingEvent,
  PolicyLadder,
  PolicyRung,
  RelationshipDelta,
  ScheduledFollowUp,
  StakeholderId,
  StakeholderRelationship,
  TimedModifier,
  TrialProgress,
} from './types';

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/**
 * Plan item 4.1 (D3), re-tuned on the measured plant (measuredPlant.ts). The
 * fund is kept in the plant's own currency (CURRENCY_TO_FUND 1), so a cost a
 * plan avoided reaches it at exactly what it saved (item 4.3), and the members
 * reinvest a share of each shift's surplus. Before: 0.25 of the net at 0.18 fund
 * a unit, tuned on a plant netting about 2,200 a shipping shift; the plant now
 * nets about 3,850 after grain and ships every shift, which made the fund
 * stop binding by shift 15. The share is set as what a measured shift
 * reinvests (measuredPlant.ts, REINVESTED_PER_MEASURED_SHIFT) over its net
 * (MEASURED_PLANT.shiftNet), so a re-measured net re-derives it; both figures
 * and their history are in measuredPlant.ts (30 of 4,259, 0.70%, on 13 November).
 */
export const REINVESTMENT_SHARE = REINVESTED_PER_MEASURED_SHIFT / MEASURED_PLANT.shiftNet;
/**
 * The share the authored reinvestment points (eras, crop years, stakeholders,
 * policies: "+5%") were written against. A point moves the share in that
 * proportion: +0.05 is a fifth more reinvestment at any share.
 */
export const AUTHORED_REINVESTMENT_SHARE = 0.25;
/** Plant currency to fund: 1, the fund is the plant's currency (see REINVESTMENT_SHARE). */
export const CURRENCY_TO_FUND = 1;
/**
 * Plan item 4.3 (D8): an avoided cost reaches the fund in full, where surplus
 * reaches it at REINVESTMENT_SHARE. 1 is "the full rate".
 */
export const AVOIDED_COST_RATE = 1;

/** The share reinvested with authored reinvestment points added (see AUTHORED_REINVESTMENT_SHARE). */
export function reinvestmentShare(points: number): number {
  return Math.max(0, REINVESTMENT_SHARE * (1 + points / AUTHORED_REINVESTMENT_SHARE));
}
export const BASE_UPKEEP = 6;
export const KNOW_HOW_PER_GRADE: Record<'A' | 'B' | 'C' | 'D' | 'F', number> = {
  A: 6,
  B: 4,
  C: 3,
  D: 2,
  F: 1,
};
export const KNOW_HOW_PER_QC_PASS = 1;
export const KNOW_HOW_PER_NOTE = 2;
export const KNOW_HOW_PER_QUIZ_ANSWER = 1;
/** Fund units of forced maintenance one know-how covers. */
export const FORCED_FUND_PER_KNOW_HOW = 25;
export const EVENT_CHANCE = 0.55;
export const FIRE_CHANCE_PER_AUSTERITY_SHIFT = 0.04;
export const FIRE_CHANCE_CAP = 0.25;
export const FIRE_DUST_BONUS = 0.1;
export const FIRE_SUPPRESSION_COST = 70;
export const FIRE_SUPPRESSION_MINUTES = 45;
/** Cleaning the duct by hand costs nothing but takes longer; a fire never deadlocks the mill. */
export const FIRE_HAND_CLEAN_MINUTES = 120;

/**
 * A window closed again after a restore ends within a tick of its first close,
 * on either side; a new window ends at least 240 campaign minutes after the
 * last (10:00 to 14:00 is the shortest), so this cannot swallow a real shift.
 */
const RECLOSE_TOLERANCE_MINUTES = 30;

const MAX_NOTICES = 80;
const MAX_INITIATIVES = 30;
const MAX_EVENT_HISTORY = 40;
const MAX_FORECAST_HISTORY = 12;
const MAX_SEEN_IDS = 200;
/**
 * The lab keeps 100 tests, so 200 seen test ids outlast any id it can show
 * again. Batches have no such ceiling (only shipped ones are dropped), so a
 * credited batch moves to the end each time it is retested: it falls out only
 * after 200 other batches have earned and it has not been tested since.
 */
const MAX_CREDITED_BATCHES = 200;
/** Cooperative seasons kept in the record; the workplace keeps fewer. */
const MAX_SEASONS = 40;
/** Organisations' changes outside rulings; the Partners tab shows three each. */
const MAX_PARTY_CHANGES = 40;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export interface EventRecord {
  eventId: string;
  shift: number;
  choiceId: string;
  actor: Actor;
}

export interface OwnedIncident {
  incidentId: string;
  kind: string;
  raisedShift: number;
}

export interface ChronicleState {
  status: 'unsigned' | 'active' | 'ended';
  charter: Charter | null;
  trainingMode: boolean;
  trainingOffered: boolean;
  shift: number;
  lastReportId: string | null;
  /** Campaign minute the last credited report ended; a smaller one is a rewind. */
  lastReportEndedAt: number | null;
  era: EraId;
  crop: CropYearState | null;
  deliveries: number;
  ledger: ReturnType<typeof emptyLedger>;
  modifiers: TimedModifier[];
  improvements: ImprovementProgress[];
  contractorOffers: Contractor[];
  contractor: Contractor | null;
  customers: CustomerRelationship[];
  orderShippedKg: Record<string, number>;
  orderFailureKg: Record<string, number>;
  orderFulfilled: string[];
  /**
   * Orders whose forfeit the relationships have counted (plant item 3.7's
   * forfeits). Absent in saves from before forfeits, and read as none.
   */
  orderForfeited?: string[];
  fulfilledCustomers: CustomerId[];
  seenIncidentIds: string[];
  forecasts: ForecastState[];
  pendingEvents: PendingEvent[];
  eventHistory: EventRecord[];
  lastEventId: string | null;
  lastEventPolarity: EventPolarity | null;
  trials: TrialProgress[];
  challengeMedals: Array<{ runId: string; medal: Medal }>;
  seenChallengeIds: string[];
  seenQcTestIds: string[];
  /**
   * Batches whose lab pass has earned know-how and standing: a batch earns
   * once in the chronicle. Absent in saves from before it was kept; the first
   * close rebuilds it from the tests already seen.
   */
  creditedQcBatchIds?: string[];
  gradeHistory: number[];
  austerity: { active: boolean; shifts: number };
  upkeepShortfall: number | null;
  fire: { active: boolean; suppressing: boolean; resolveAtMinute: number | null };
  inspectionOpen: boolean;
  ownedIncidents: OwnedIncident[];
  delegation: DelegationLevel;
  initiatives: Initiative[];
  aiSpentThisShift: number;
  notices: ChronicleNotice[];
  unlockedNotes: string[];
  readNotes: string[];
  /** Unlocked notes the player has seen listed in the Notes tab; the tab's badge counts the rest. */
  seenNotes: string[];
  quizAnswered: string[];
  /**
   * Quiz questions already attempted, right or wrong: only a first attempt can
   * earn (D19). Absent in saves from before it was kept; `quizAnswered` then
   * stands for it.
   */
  quizAttempted?: string[];
  quizBest: number | null;
  sequence: number;
  finalScore: ScoreBreakdown | null;
  // Part two (docs/CHRONICLE.md, systems 16-24)
  /** The record: what each decision left behind, by mark id. */
  marks: Record<string, DecisionMark>;
  /** Follow-up events waiting for their shift. */
  followUps: ScheduledFollowUp[];
  /** Scheduled events already placed or passed over, so each happens once. */
  firedScheduled: string[];
  stakeholders: StakeholderRelationship[];
  certifier: CertifierState;
  longNightTelegraphed: boolean;
  // Part three (docs/CHRONICLE.md, systems 25-32)
  governance: GovernanceState;
  /**
   * Cooperative seasons finished while the charter ran, one entry each (item
   * 5.10). Absent in saves from before it was kept, and read as none.
   */
  cooperativeSeasons?: CooperativeSeasonRecord[];
  /** Seasons already archived when the charter was signed: not this chronicle's. */
  seasonsBeforeCharter?: string[];
  /**
   * Fund each plan's avoided cost brought (item 4.3): at the last close, and
   * since it was installed. Absent in saves from before it, and read as none.
   */
  planSavings?: Record<string, PlanSavings>;
  /**
   * Energy the temper card's drying booked since the last close (plan item
   * 7.7), as its answer reported it (`answerTemper`). A trial's energy goal
   * reads the plant's energy without it, so a wet year that falls in Grid
   * Winter is judged on output an hour and night running, as its card says.
   * Absent when nothing was dried, and in saves from before it.
   */
  dryingSinceClose?: number;
  /**
   * Drying a Chronicle answer (the hired dryer, blending) kept off the plant's
   * books since the last close: what the dry-first answers would have booked
   * without it, less what they booked. Credited to the fund in full at the
   * close, as a plan's avoided cost is (review 2, finding 2). Absent when none.
   */
  dryingAvoidedSinceClose?: number;
}

/** A close's energy as a trial judges it: the booked energy less the temper card's drying. */
export function trialEnergyCost(bookedEnergy: number, drying: number | undefined): number {
  const booked = Number.isFinite(bookedEnergy) ? bookedEnergy : 0;
  const dried = typeof drying === 'number' && Number.isFinite(drying) ? Math.max(0, drying) : 0;
  return Math.max(0, booked - dried);
}

export interface PlanSavings {
  last: number;
  total: number;
}

export interface Step {
  state: ChronicleState;
  commands: ChronicleCommand[];
}

export function createInitialState(): ChronicleState {
  return {
    status: 'unsigned',
    charter: null,
    trainingMode: false,
    trainingOffered: false,
    shift: 0,
    lastReportId: null,
    lastReportEndedAt: null,
    era: 'village',
    crop: null,
    deliveries: 0,
    ledger: emptyLedger(),
    modifiers: [],
    improvements: [],
    contractorOffers: [],
    contractor: null,
    customers: [],
    orderShippedKg: {},
    orderFailureKg: {},
    orderFulfilled: [],
    fulfilledCustomers: [],
    seenIncidentIds: [],
    forecasts: [],
    pendingEvents: [],
    eventHistory: [],
    lastEventId: null,
    lastEventPolarity: null,
    trials: [],
    challengeMedals: [],
    seenChallengeIds: [],
    seenQcTestIds: [],
    creditedQcBatchIds: [],
    gradeHistory: [],
    austerity: { active: false, shifts: 0 },
    upkeepShortfall: null,
    fire: { active: false, suppressing: false, resolveAtMinute: null },
    inspectionOpen: false,
    ownedIncidents: [],
    delegation: 0,
    initiatives: [],
    aiSpentThisShift: 0,
    notices: [],
    unlockedNotes: [],
    readNotes: [],
    seenNotes: [],
    quizAnswered: [],
    quizAttempted: [],
    quizBest: null,
    sequence: 0,
    finalScore: null,
    marks: {},
    followUps: [],
    firedScheduled: [],
    stakeholders: [],
    certifier: initialCertifier(),
    longNightTelegraphed: false,
    governance: createGovernance(null),
  };
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function bounded<T>(values: readonly T[], limit: number): T[] {
  return values.length > limit ? values.slice(values.length - limit) : [...values];
}

function notice(
  state: ChronicleState,
  kind: NoticeKind,
  title: string,
  body: string,
  relatedId: string | null = null
): ChronicleState {
  const sequence = state.sequence + 1;
  return {
    ...state,
    sequence,
    notices: bounded(
      [
        ...state.notices,
        { id: `notice-${sequence}`, shift: state.shift, kind, title, body, relatedId },
      ],
      MAX_NOTICES
    ),
  };
}

function initiative(
  state: ChronicleState,
  entry: Omit<Initiative, 'id' | 'shift' | 'reversed'>
): ChronicleState {
  const sequence = state.sequence + 1;
  return {
    ...state,
    sequence,
    initiatives: bounded(
      [
        ...state.initiatives,
        { ...entry, id: `initiative-${sequence}`, shift: state.shift, reversed: false },
      ],
      MAX_INITIATIVES
    ),
  };
}

export function fundOf(state: ChronicleState): number {
  return fundBalance(state.ledger);
}

export function knowHowOf(state: ChronicleState): number {
  return knowHowBalance(state.ledger);
}

/** A fund price after training mode. */
export function price(state: ChronicleState, base: number): number {
  return Math.round(base * (state.trainingMode ? TRAINING_MODE.costMultiplier : 1));
}

export function canAfford(state: ChronicleState, cost: Cost | undefined): boolean {
  if (!cost) return true;
  return fundOf(state) >= price(state, cost.fund ?? 0) && knowHowOf(state) >= (cost.knowHow ?? 0);
}

function pay(
  state: ChronicleState,
  cost: Cost | undefined,
  fundSource: 'events' | 'mitigation' | 'installs' | 'contractors' | 'suppression' | 'treatment'
): ChronicleState {
  if (!cost) return state;
  let ledger = state.ledger;
  if (cost.fund) ledger = recordFund(ledger, fundSource, -price(state, cost.fund));
  if (cost.knowHow) ledger = recordKnowHow(ledger, 'event_costs', -cost.knowHow);
  return { ...state, ledger };
}

function unlockTrigger(step: Step, trigger: HistoryTrigger): Step {
  let { state } = step;
  const commands = [...step.commands];
  for (const note of HISTORY_NOTES) {
    if (!note.triggers.includes(trigger) || state.unlockedNotes.includes(note.id)) continue;
    state = { ...state, unlockedNotes: [...state.unlockedNotes, note.id] };
    state = notice(state, 'history', note.title, note.brief, note.id);
    commands.push({ type: 'unlock_note', noteId: note.id });
  }
  return { state, commands };
}

function unlockNoteById(step: Step, noteId: string | null | undefined): Step {
  if (!noteId || step.state.unlockedNotes.includes(noteId)) return step;
  const note = HISTORY_NOTES.find((candidate) => candidate.id === noteId);
  if (!note) return step;
  let state: ChronicleState = {
    ...step.state,
    unlockedNotes: [...step.state.unlockedNotes, note.id],
  };
  state = notice(state, 'history', note.title, note.brief, note.id);
  return { state, commands: [...step.commands, { type: 'unlock_note', noteId: note.id }] };
}

function installedCount(state: ChronicleState): number {
  return state.improvements.filter((p) => p.phase === 'installed').length;
}

function trialsPassed(state: ChronicleState): number {
  return state.trials.filter((t) => t.phase === 'passed').length;
}

export function upkeepDue(state: ChronicleState): number {
  const totals = chronicleTotals(effectInput(state));
  const plans = state.improvements.reduce(
    (sum, p) => sum + (p.phase === 'installed' ? (improvementById(p.id)?.upkeep ?? 0) : 0),
    0
  );
  return price(state, Math.round((BASE_UPKEEP + plans) * totals.upkeep));
}

export function effectInput(state: ChronicleState) {
  return {
    charter: state.charter,
    era: state.era,
    improvements: state.improvements,
    modifiers: state.modifiers,
    austerity: state.austerity.active,
    crop: state.crop,
    policies: state.governance.policies,
    conditions: state.governance.conditions,
    machineryRenewed: state.governance.machineryRenewed,
  };
}

export function upkeepPerShift(state: ChronicleState): number {
  return upkeepDue(state);
}

// ---------------------------------------------------------------------------
// Signing
// ---------------------------------------------------------------------------

/** What already happened before signing, so it is not credited to the chronicle. */
export interface SigningBaseline {
  reportId: string | null;
  qcTestIds: readonly string[];
  challengeIds: readonly string[];
  orders: ReadonlyArray<
    Pick<CustomerOrder, 'id' | 'shippedKg' | 'qualityFailureKg' | 'status' | 'forfeitedAtMinute'>
  >;
  incidentIds?: readonly string[];
  /** Cooperative seasons already archived: they belong to no chronicle. */
  seasonIds?: readonly string[];
}

export function signCharter(
  previous: ChronicleState,
  choice: Omit<Charter, 'seed'>,
  seed: number,
  baseline: SigningBaseline
): Step {
  // A full chronicle stores no length, so its state is the one it always was.
  const { length, ...rest } = choice;
  const charter: Charter = { ...rest, ...(length === 'short' ? { length } : {}), seed };
  let state: ChronicleState = {
    ...createInitialState(),
    lastReportId: baseline.reportId,
    seenQcTestIds: bounded([...baseline.qcTestIds], MAX_SEEN_IDS),
    seenChallengeIds: bounded([...baseline.challengeIds], MAX_SEEN_IDS),
    orderShippedKg: Object.fromEntries(baseline.orders.map((o) => [o.id, o.shippedKg])),
    orderFailureKg: Object.fromEntries(baseline.orders.map((o) => [o.id, o.qualityFailureKg])),
    orderFulfilled: baseline.orders.filter((o) => o.status === 'fulfilled').map((o) => o.id),
    // An order forfeited before the charter is no chronicle's to count.
    ...(baseline.orders.some((o) => typeof o.forfeitedAtMinute === 'number')
      ? {
          orderForfeited: baseline.orders
            .filter((o) => typeof o.forfeitedAtMinute === 'number')
            .map((o) => o.id),
        }
      : {}),
    seenIncidentIds: (baseline.incidentIds ?? []).slice(-MAX_SEEN_IDS),
    ...(baseline.seasonIds?.length
      ? { seasonsBeforeCharter: baseline.seasonIds.slice(-MAX_SEASONS) }
      : {}),
    // Notes already read in an earlier chronicle stay read.
    readNotes: previous.readNotes,
    seenNotes: previous.seenNotes,
    unlockedNotes: previous.unlockedNotes,
    quizAnswered: previous.quizAnswered,
    quizAttempted: previous.quizAttempted ?? [],
    quizBest: previous.quizBest,
    status: 'active',
    charter,
    crop: createCropYear(charter, 0),
    customers: initialRelationships(charterStartingRelationship(charter.customers)),
    stakeholders: initialStakeholders(),
    governance: createGovernance(charter),
    contractorOffers: contractorCandidates(seed, 0),
    trials:
      charter.mode === 'historical'
        ? trialsFor(charter).map((trial) => ({
            ...emptyTrialProgress(trial.id),
            phase: 'scheduled' as const,
          }))
        : [],
  };
  state = {
    ...state,
    ledger: recordFund(state.ledger, 'charter', charterStartingFund(choice), false),
  };
  state = notice(
    state,
    'era',
    'The chronicle begins',
    `${eraById('village').label}, crop year 1: ${CROP_YEARS[state.crop!.kind].label.toLowerCase()}.`
  );
  return unlockTrigger({ state, commands: [] }, 'charter_signed');
}

// ---------------------------------------------------------------------------
// Deliveries
// ---------------------------------------------------------------------------

export function recordDelivery(state: ChronicleState): {
  state: ChronicleState;
  crop: CropAttributes | null;
  commands: ChronicleCommand[];
} {
  if (state.status !== 'active' || !state.charter || !state.crop)
    return { state, crop: null, commands: [] };
  const crop = stampDelivery(state.charter, state.crop, state.deliveries);
  const next = { ...state, deliveries: state.deliveries + 1 };
  const step =
    state.deliveries === 0
      ? unlockTrigger({ state: next, commands: [] }, 'first_receiving')
      : { state: next, commands: [] };
  return { state: step.state, crop, commands: step.commands };
}

// ---------------------------------------------------------------------------
// Shift close
// ---------------------------------------------------------------------------

export interface ShiftCloseEvidence {
  report: Pick<ShiftCampaignReport, 'id' | 'grade' | 'metrics' | 'endedAtMinute'>;
  orders: ReadonlyArray<
    Pick<
      CustomerOrder,
      | 'id'
      | 'customer'
      | 'shippedKg'
      | 'requiredKg'
      | 'qualityFailureKg'
      | 'status'
      | 'dueAtMinute'
      | 'completedAtMinute'
      | 'revenuePerKg'
      | 'forfeitedAtMinute'
    >
  >;
  incidents: ReadonlyArray<
    Pick<OperationalIncident, 'id' | 'kind' | 'phase' | 'severity' | 'effectApplied'>
  >;
  challengeActive: boolean;
  challengeHistory: ReadonlyArray<
    Pick<OperationsChallengeRun, 'id' | 'status' | 'deadlineMinute' | 'endedAtMinute'>
  >;
  /**
   * `batchId` is the batch tested, qualified by the plant run (the store keys it
   * by the material session); a test without one is keyed by its own id.
   */
  qcTests: ReadonlyArray<{
    id: string;
    passed: boolean;
    batchId?: string | null;
    /**
     * Not the player's own test: the plant's lab bench ran it on its own (it
     * tests every batch), or an agent or the partner ran it for the player.
     * That earns the steward nothing: no know-how, no review, no Inspection
     * close. Absent on evidence from before the bench: a person's.
     */
    bench?: boolean;
  }>;
  /**
   * Cooperative seasons archived on the floor so far (item 5.10), each known
   * by its id. Absent from evidence that predates it, which records none.
   */
  cooperativeSeasons?: ReadonlyArray<CooperativeSeasonFact>;
}

export function closeShift(
  previous: ChronicleState,
  evidence: ShiftCloseEvidence,
  deck: readonly ChronicleEventDefinition[]
): Step {
  if (previous.status !== 'active' || !previous.charter) return { state: previous, commands: [] };
  if (previous.lastReportId === evidence.report.id) return { state: previous, commands: [] };
  if (
    previous.lastReportEndedAt !== null &&
    evidence.report.endedAtMinute <= previous.lastReportEndedAt + RECLOSE_TOLERANCE_MINUTES
  ) {
    // A replay or session restore rewound the campaign: its reports, QC ids
    // and shipments are not new history. Re-baseline instead of crediting, but
    // keep the mark where history reached: a plant restored from a save taken
    // before the last close closes those windows again, and a mark moved back
    // to the first of them credited every later one a second time.
    return {
      state: {
        ...resyncBaseline(previous, evidence),
        lastReportEndedAt: Math.max(previous.lastReportEndedAt, evidence.report.endedAtMinute),
      },
      commands: [],
    };
  }
  const charter = previous.charter;
  let step: Step = {
    state: {
      ...previous,
      shift: previous.shift + 1,
      lastReportId: evidence.report.id,
      lastReportEndedAt: evidence.report.endedAtMinute,
      aiSpentThisShift: 0,
      ledger: openShiftClose(previous.ledger),
    },
    commands: [],
  };
  if (previous.shift === 0) step = unlockTrigger(step, 'first_shift_report');
  const seenBefore = new Set(previous.seenQcTestIds);
  const qcPassedThisShift = evidence.qcTests.some(
    (test) => test.passed && !test.bench && !seenBefore.has(test.id)
  );

  step = creditShift(step, evidence);
  step = updateRelationships(step, evidence);
  step = autofillReserve(step);
  step = chargeUpkeep(step);
  step = ageModifiers(step);
  step = advanceInstalls(step);
  step = tallyShift(step, evidence);
  step = recordSeasons(step, evidence);
  step = advanceCropYear(step);
  step = retireMootEvents(step, deck);
  if (charter.mode === 'historical') step = advanceTrials(step, evidence, qcPassedThisShift);
  if (
    step.state.dryingSinceClose !== undefined ||
    step.state.dryingAvoidedSinceClose !== undefined
  ) {
    // The window's drying is spent on this close (credited above, judged by
    // the trials); the next counts its own.
    const { dryingSinceClose: _closed, dryingAvoidedSinceClose: _credited, ...rest } = step.state;
    step = { state: rest, commands: step.commands };
  }
  step = recordChallengeMedals(step, evidence);
  if (charter.mode !== 'sandbox') {
    step = resolveForecasts(step, evidence);
    step = issueForecast(step, evidence);
    step = lapseEvents(step, deck, evidence.challengeActive);
    step = placeScheduled(step, deck, evidence.challengeActive);
    step = telegraphLongNight(step, deck);
    step = drawEvent(step, deck);
  }
  step = rollFire(step, evidence);
  step = closeGovernance(step, previous, deck);
  step = adoptCarriedProposal(step);
  step = delegatedInitiatives(step, evidence, deck);
  step = advanceEra(step);
  step = endIfDue(step);
  // Everything above is this close's doing; what is spent from here on is not.
  return {
    state: { ...step.state, ledger: finishShiftClose(step.state.ledger) },
    commands: step.commands,
  };
}

function creditShift(step: Step, evidence: ShiftCloseEvidence): Step {
  let state = step.state;
  const metrics = evidence.report.metrics;
  const totals = chronicleTotals(effectInput(state));
  const cropReinvestment = state.crop ? (CROP_YEARS[state.crop.kind].reinvestment ?? 0) : 0;
  const share = reinvestmentShare(
    totals.reinvestment + cropReinvestment + stakeholderReinvestment(state.stakeholders)
  );
  // Surplus is reinvested; a loss-making shift reinvests nothing. The loss is
  // already on the plant ledger, and a fund that went negative with it would
  // lock every decision until the plant recovered on its own.
  const reinvested = Math.round(Math.max(0, netContribution(metrics)) * share * CURRENCY_TO_FUND);
  let ledger = recordFund(state.ledger, 'reinvestment', reinvested);
  // Plan item 4.3 (D8): what each installed plan kept off the plant's books
  // this shift, at the full rate (no reinvestment share), beside its upkeep.
  // The temper card's drying is booked to energy but no plan scales it, so
  // the plans are credited on the energy without it, as trials judge it
  // (`dryingSinceClose` is cleared only after the trials have read it).
  const avoided = avoidedByPlan(state.improvements, {
    ...metrics,
    energyCost: trialEnergyCost(metrics.energyCost, state.dryingSinceClose),
  });
  const planSavings: Record<string, PlanSavings> = {};
  for (const [id, saved] of Object.entries(state.planSavings ?? {}))
    planSavings[id] = { last: 0, total: saved.total };
  let avoidedFund = 0;
  for (const [id, currency] of Object.entries(avoided)) {
    const fund = Math.round(currency * CURRENCY_TO_FUND * AVOIDED_COST_RATE * 100) / 100;
    avoidedFund += fund;
    planSavings[id] = { last: fund, total: (planSavings[id]?.total ?? 0) + fund };
  }
  ledger = recordFund(ledger, 'avoided', Math.round(avoidedFund * 100) / 100);
  // The drying a hired dryer or blending kept off the books, by the same rule.
  const driedAvoided = state.dryingAvoidedSinceClose;
  if (typeof driedAvoided === 'number' && Number.isFinite(driedAvoided) && driedAvoided > 0)
    ledger = recordFund(
      ledger,
      'drying',
      Math.round(driedAvoided * CURRENCY_TO_FUND * AVOIDED_COST_RATE * 100) / 100
    );
  // An idle window (no commitment, nothing shipped) carries no grade.
  const grade = evidence.report.grade;
  ledger = recordKnowHow(ledger, 'grades', grade ? KNOW_HOW_PER_GRADE[grade] : 0);
  const seen = new Set(state.seenQcTestIds);
  const fresh = evidence.qcTests.filter((test) => !seen.has(test.id));
  // A batch can be retested without limit and in any shift, so its pass is
  // credited once in the chronicle. Every fresh test is still marked seen
  // below, so the uncredited ones never pay at a later close. A test with no
  // batch is credited by its own id, as before.
  const batchOf = (test: ShiftCloseEvidence['qcTests'][number]) =>
    typeof test.batchId === 'string' ? test.batchId : null;
  // A save from before credited batches were kept: every batch it had already
  // seen pass was credited under the per-shift rule, so it stays credited.
  const creditedBefore =
    state.creditedQcBatchIds ??
    evidence.qcTests.flatMap((test) =>
      test.passed && !test.bench && seen.has(test.id) && batchOf(test) !== null
        ? [batchOf(test)!]
        : []
    );
  const credited = new Set(creditedBefore);
  // The bench's own passes are the plant's routine (fix-up d), and so is a test
  // an agent or the partner ran for the player: only the player's own test
  // earns (chronicleStore qcTestKeys marks every other `bench`).
  const freshPasses = fresh.filter((test) => test.passed && !test.bench);
  const passedBatches = [
    ...new Set(freshPasses.flatMap((test) => (batchOf(test) === null ? [] : [batchOf(test)!]))),
  ];
  const unbatched = new Set(
    freshPasses.filter((test) => batchOf(test) === null).map((test) => test.id)
  ).size;
  const passed = unbatched + passedBatches.filter((batchId) => !credited.has(batchId)).length;
  // A retested batch moves to the end, so a batch still in use is the last to be dropped.
  const retested = new Set(passedBatches);
  const creditedQcBatchIds = bounded(
    [...new Set(creditedBefore)].filter((batchId) => !retested.has(batchId)).concat(passedBatches),
    MAX_CREDITED_BATCHES
  );
  ledger = recordKnowHow(ledger, 'qc', passed * KNOW_HOW_PER_QC_PASS);
  // The library's know-how is its whole effect, so the contractor's trait scales it.
  const library = state.improvements.reduce(
    (sum, p) =>
      sum +
      (p.phase === 'installed'
        ? (improvementById(p.id)?.knowHowPerShift ?? 0) * (p.effectScale ?? 1)
        : 0),
    0
  );
  ledger = recordKnowHow(ledger, 'library', Math.round(library * 10) / 10);
  // The certifier hears of a quality failure at once (a customer complains), and
  // reads the lab's passes from the record at the crop year's turn, as an
  // auditor does, rather than reacting to every internal test (report 08, F15).
  const failed = (metrics.qualityFailureKg ?? 0) > 0;
  const review = state.certifier.review ?? { batches: 0, hundredths: 0 };
  const adjusted = adjustStanding(state.certifier, failed ? STANDING_PER_FAILED_SHIFT : 0);
  const certifier =
    passed > 0
      ? {
          ...adjusted,
          review: {
            batches: review.batches + passed,
            hundredths: review.hundredths + passed * STANDING_PER_QC_PASS,
          },
        }
      : adjusted;
  state = {
    ...state,
    certifier,
    ledger,
    ...(Object.keys(planSavings).length ? { planSavings } : {}),
    gradeHistory: grade ? [...state.gradeHistory, GRADE_POINTS[grade]] : state.gradeHistory,
    seenQcTestIds: bounded([...state.seenQcTestIds, ...fresh.map((test) => test.id)], MAX_SEEN_IDS),
    creditedQcBatchIds,
  };
  let next: Step = { state, commands: step.commands };
  if (fresh.length > 0) next = unlockTrigger(next, 'first_qc_test');
  return next;
}

const SEASON_PROFILES = new Set(['toe-dip', 'team', 'cooperative']);
const SEASON_DELIVERIES = new Set(['met', 'shortfall', 'blocked', 'pending']);
const SEASON_AGREEMENTS = new Set(['honoured', 'incomplete', 'pending']);
const SEASON_DESTINATIONS = new Set(['members', 'reserve', 'community']);

/** A season fact as the evidence or a save holds it, or null if it has not that shape. */
export function cooperativeSeasonFact(value: unknown): CooperativeSeasonFact | null {
  if (value === null || typeof value !== 'object') return null;
  const fact = value as Record<string, unknown>;
  const destination = fact.sobrasDestination ?? null;
  if (
    typeof fact.seasonId !== 'string' ||
    !fact.seasonId ||
    !SEASON_PROFILES.has(String(fact.profile)) ||
    !SEASON_DELIVERIES.has(String(fact.delivery)) ||
    !SEASON_AGREEMENTS.has(String(fact.agreement)) ||
    (destination !== null && !SEASON_DESTINATIONS.has(String(destination)))
  )
    return null;
  return {
    seasonId: fact.seasonId,
    profile: fact.profile as CooperativeSeasonFact['profile'],
    delivery: fact.delivery as CooperativeSeasonFact['delivery'],
    agreement: fact.agreement as CooperativeSeasonFact['agreement'],
    sobrasDestination: destination as CooperativeSeasonFact['sobrasDestination'],
  };
}

/**
 * Item 5.10: each cooperative season finished on the floor enters the record
 * once, by its id, with what it kept. It moves no fund, know-how, goods or
 * standing: the season's own books are the workplace's.
 */
function recordSeasons(step: Step, evidence: ShiftCloseEvidence): Step {
  const facts = (evidence.cooperativeSeasons ?? []).flatMap((value) => {
    const fact = cooperativeSeasonFact(value);
    return fact ? [fact] : [];
  });
  if (!facts.length) return step;
  let state = step.state;
  const known = new Set([
    ...(state.seasonsBeforeCharter ?? []),
    ...(state.cooperativeSeasons ?? []).map((season) => season.seasonId),
  ]);
  const fresh = facts.filter((fact) => {
    if (known.has(fact.seasonId)) return false;
    known.add(fact.seasonId);
    return true;
  });
  if (!fresh.length) return step;
  for (const fact of fresh) {
    const kept = fact.delivery === 'met' && fact.agreement === 'honoured';
    state = leaveMarks(
      state,
      [kept ? 'season-kept' : 'season-short'],
      'cooperative-season',
      fact.seasonId,
      'chronicle'
    );
  }
  return {
    state: {
      ...state,
      cooperativeSeasons: bounded(
        [
          ...(state.cooperativeSeasons ?? []),
          ...fresh.map((fact) => ({ ...fact, shift: state.shift })),
        ],
        MAX_SEASONS
      ),
    },
    commands: step.commands,
  };
}

function updateRelationships(step: Step, evidence: ShiftCloseEvidence): Step {
  let state = step.state;
  const deltas: Record<string, number> = {};
  let loyalty = 0;
  const shipped = { ...state.orderShippedKg };
  const failures = { ...state.orderFailureKg };
  const fulfilled = new Set(state.orderFulfilled);
  const forfeited = new Set(state.orderForfeited ?? []);
  const served = new Set<CustomerId>(state.fulfilledCustomers);
  for (const order of evidence.orders) {
    const customer = customerIdForName(order.customer);
    if (!customer) continue;
    const relationship = state.customers.find((c) => c.id === customer);
    const shippedDelta = Math.max(0, order.shippedKg - (shipped[order.id] ?? 0));
    const failureDelta = Math.max(0, order.qualityFailureKg - (failures[order.id] ?? 0));
    shipped[order.id] = order.shippedKg;
    failures[order.id] = order.qualityFailureKg;
    if (relationship && relationshipTier(relationship.value) === 'warm')
      loyalty += shippedDelta * order.revenuePerKg * LOYALTY_PREMIUM_SHARE * CURRENCY_TO_FUND;
    let delta = 0;
    if (failureDelta > 0) delta += RELATIONSHIP_DELTAS.qualityFailure;
    if (order.status === 'fulfilled' && !fulfilled.has(order.id)) {
      fulfilled.add(order.id);
      served.add(customer);
      const onTime =
        order.completedAtMinute !== null && order.completedAtMinute <= order.dueAtMinute;
      delta += fulfilmentGain(
        (relationship?.value ?? 50) + (deltas[customer] ?? 0) + delta,
        onTime
      );
    }
    if (order.status === 'late') delta += RELATIONSHIP_DELTAS.lateAtClose;
    // A forfeited order (closed unfulfilled at its lateness bound, or by the
    // partner when the crop year puts it out of reach) costs the customer what
    // a close with it late does, once, and earns no fulfilment: so it is never
    // kinder than delivering late, which at worst earns the late gain after it.
    if (typeof order.forfeitedAtMinute === 'number' && !forfeited.has(order.id)) {
      forfeited.add(order.id);
      delta += RELATIONSHIP_DELTAS.lateAtClose;
    }
    deltas[customer] = (deltas[customer] ?? 0) + delta;
  }
  const knownOrders = new Set(evidence.orders.map((o) => o.id));
  const prune = <T>(record: Record<string, T>) =>
    Object.fromEntries(Object.entries(record).filter(([id]) => knownOrders.has(id)));
  state = {
    ...state,
    customers: state.customers.map((c) => ({
      ...c,
      value: clampRelationship(c.value + (deltas[c.id] ?? 0)),
    })),
    orderShippedKg: prune(shipped),
    orderFailureKg: prune(failures),
    orderFulfilled: [...fulfilled].filter((id) => knownOrders.has(id)),
    ...(forfeited.size || state.orderForfeited
      ? { orderForfeited: [...forfeited].filter((id) => knownOrders.has(id)) }
      : {}),
    fulfilledCustomers: [...served],
    ledger: recordFund(state.ledger, 'loyalty', Math.round(loyalty)),
  };
  return { state, commands: step.commands };
}

function chargeUpkeep(step: Step): Step {
  let state = step.state;
  if (state.upkeepShortfall !== null) {
    // An unanswered shortfall lapses to conservation, the cautious default, and
    // pays for its shift what answering Conserve would have: leaving the prompt
    // must not be cheaper than answering it.
    const paid = Math.min(Math.max(0, fundOf(state)), Math.round(state.upkeepShortfall * 0.5));
    state = {
      ...state,
      upkeepShortfall: null,
      austerity: { active: true, shifts: 0 },
      ledger: recordFund(state.ledger, 'upkeep', -paid),
    };
    state = notice(
      state,
      'ledger',
      'Conserving resources',
      'The upkeep shortfall went unanswered, so the mill is conserving resources.'
    );
  }
  const due = upkeepDue(state);
  // D9: the support an accepted administrator brings. While it stays the
  // federation pays the mill's upkeep, its x1.1 keep included.
  if (state.governance.administration && due > 0)
    state = { ...state, ledger: recordFund(state.ledger, 'federation', due) };
  const fund = fundOf(state);
  if (state.austerity.active) {
    const paid = Math.min(due, Math.max(0, fundOf(state)));
    state = {
      ...state,
      ledger: recordFund(state.ledger, 'upkeep', -paid),
      austerity: { active: true, shifts: state.austerity.shifts + 1 },
    };
    return { state, commands: step.commands };
  }
  if (fund >= due) {
    return {
      state: { ...state, ledger: recordFund(state.ledger, 'upkeep', -due) },
      commands: step.commands,
    };
  }
  // The co-op reserve is drawn before austerity is asked for (CiK: "money will be
  // taken from here"). What it cannot cover is still a shortfall.
  const gap = due - Math.max(0, fund);
  const reserve = state.governance.reserve;
  const draw = Math.min(reserve.balance, gap);
  if (draw > 0) {
    state = notice(
      leaveMarks(
        withGovernance(
          { ...state, ledger: recordFund(state.ledger, 'reserve', draw) },
          { reserve: { ...reserve, balance: reserve.balance - draw, drawn: reserve.drawn + draw } }
        ),
        ['reserve-drawn'],
        'reserve',
        'shortfall',
        'chronicle'
      ),
      'ledger',
      'Drawn from the co-op reserve',
      draw >= gap
        ? `Upkeep of ${due} was due and the fund held ${Math.max(0, Math.floor(fund))}; the reserve covered ${draw}.`
        : `Upkeep of ${due} was due; the reserve gave its last ${draw}, and the rest is short.`
    );
    if (draw >= gap)
      return {
        state: { ...state, ledger: recordFund(state.ledger, 'upkeep', -due) },
        commands: step.commands,
      };
  }
  state = { ...state, upkeepShortfall: due };
  state = notice(
    state,
    'ledger',
    'Lack of material',
    `Upkeep of ${due} is due and the fund holds ${Math.max(0, Math.floor(fundOf(state)))}.`
  );
  return { state, commands: step.commands };
}

function ageModifiers(step: Step): Step {
  const modifiers = step.state.modifiers
    .map((m) => ({ ...m, remainingShifts: m.remainingShifts - 1 }))
    .filter((m) => m.remainingShifts > 0);
  return { state: { ...step.state, modifiers }, commands: step.commands };
}

function advanceInstalls(step: Step): Step {
  let next = step;
  for (const progress of step.state.improvements) {
    if (progress.phase !== 'installing' || progress.completesShift === null) continue;
    if (next.state.shift < progress.completesShift) continue;
    const state = next.state;
    const contractor =
      state.contractor && state.contractor.id === progress.contractorId ? state.contractor : null;
    const snag =
      chronicleChance(state.charter!.seed, `snag:${progress.id}`, progress.completesShift) <
      contractorSnagChance(contractor);
    const plan = improvementById(progress.id);
    if (snag) {
      next = {
        state: notice(
          {
            ...state,
            improvements: state.improvements.map((p) =>
              p.id === progress.id ? { ...p, completesShift: state.shift + 1 } : p
            ),
          },
          'event',
          `Snag on the ${plan?.label.toLowerCase() ?? progress.id}`,
          'Commissioning found rework; the install needs one more shift.'
        ),
        commands: next.commands,
      };
      continue;
    }
    next = {
      state: notice(
        {
          ...state,
          improvements: state.improvements.map((p) =>
            p.id === progress.id ? { ...p, phase: 'installed' } : p
          ),
        },
        'event',
        `${plan?.label ?? progress.id} installed`,
        'The plan is in service and its upkeep now applies.'
      ),
      commands: next.commands,
    };
    next = unlockTrigger(next, `improvement:${progress.id}`);
    next = unlockNoteById(next, plan?.noteId);
  }
  return next;
}

function advanceCropYear(step: Step): Step {
  const state = step.state;
  if (!state.charter) return step;
  const index = cropYearAt(state.charter, state.shift);
  if (cropYearStart(state.charter, index) !== state.shift) return step;
  // The closing shift ends the last crop year; it does not begin another.
  if (state.shift >= chronicleShifts(state.charter)) return step;
  if (state.crop?.index === index) return step;
  const filed = applyYearlyPolicies(fileReturn(reviewQcRecord(step), false));
  const crop = createCropYear(state.charter, index);
  let next: Step = {
    state: notice(
      {
        ...filed.state,
        crop,
        contractorOffers: contractorCandidates(state.charter.seed, index),
      },
      'event',
      `Crop year ${index + 1}: ${CROP_YEARS[crop.kind].label.toLowerCase()}`,
      cropYearSummary(crop)
    ),
    commands: filed.commands,
  };
  next = unlockTrigger(next, `crop:${crop.kind}`);
  return next;
}

/**
 * 23. The certifier reads the lab's record once a crop year, and with the
 * closing shift: the batches that passed since its last review bring their
 * standing now. A suspended mill's standing does not move (`adjustStanding`).
 */
function reviewQcRecord(step: Step): Step {
  const review = step.state.certifier.review;
  if (!review || review.batches <= 0) return step;
  const read: CertifierState = {
    score: step.state.certifier.score,
    suspended: step.state.certifier.suspended,
  };
  const certifier = adjustStanding(read, review.hundredths);
  // A suspended mill, or one at the ceiling, gains nothing: the record is read, no notice.
  if (certifier.score === read.score)
    return { state: { ...step.state, certifier }, commands: step.commands };
  return {
    state: notice(
      { ...step.state, certifier },
      'ledger',
      'County Food Standards reviews the QC record',
      `${whole(review.batches)} ${review.batches === 1 ? 'batch' : 'batches'} passed QC since the last review: standing +${formatFixed((certifier.score - read.score) / 100, 2, 'en')}.`
    ),
    commands: step.commands,
  };
}

export function cropYearSummary(crop: CropYearState): string {
  const definition = CROP_YEARS[crop.kind];
  const parts = [
    `Moisture about ${definition.moisture.mean}%, protein about ${definition.protein.mean}%.`,
  ];
  // A wet year is dried on the Tempering card, a shift's wheat at a time (plan
  // item 7.7); it has no treatment to name (review 2, finding 7).
  if (definition.wheatPenalty > 0)
    parts.push(
      crop.kind === 'wet'
        ? `Wheat recipes lose ${definition.wheatPenalty} quality points unless the grain is dried first on the Tempering card.`
        : `Wheat recipes lose ${definition.wheatPenalty} quality points until the grain is treated.`
    );
  if (definition.reinvestment)
    parts.push(`Reinvestment +${Math.round(definition.reinvestment * 100)}%.`);
  return parts.join(' ');
}

function advanceTrials(step: Step, evidence: ShiftCloseEvidence, qcPassedThisShift: boolean): Step {
  let next = step;
  const shift = next.state.shift;
  for (const definition of trialsFor(next.state.charter)) {
    const progress = next.state.trials.find((t) => t.id === definition.id);
    if (!progress) continue;
    const lead = trialTelegraphShifts(definition);
    if (progress.phase === 'scheduled' && shift >= definition.startShift - lead) {
      next = setTrial(next, { ...emptyTrialProgress(definition.id), phase: 'telegraphed' });
      next = {
        state: notice(
          next.state,
          'trial',
          `${definition.title} begins in ${lead} shifts`,
          // What it asks. The floor line that followed (item 4.5) was advice (D14).
          definition.briefing,
          definition.id
        ),
        commands: next.commands,
      };
      next = unlockNoteById(next, definition.introNoteId);
      continue;
    }
    if (progress.phase === 'telegraphed' && shift >= definition.startShift) {
      next = setTrial(next, { ...progress, phase: 'active', startedShift: shift });
      next = {
        state: notice(
          next.state,
          'trial',
          `${definition.title} has begun`,
          `${definition.briefing} ${definition.durationShifts} shifts.`,
          definition.id
        ),
        commands: next.commands,
      };
      continue;
    }
    if (progress.phase !== 'active') continue;
    const unresolvedHigh = evidence.incidents.some(
      (incident) =>
        incident.phase !== 'resolved' &&
        (incident.severity === 'high' || incident.severity === 'critical')
    );
    const advanced = advanceTrial(definition, progress, {
      dispatchedKg: evidence.report.metrics.dispatchedKg,
      qualityFailureKg: evidence.report.metrics.qualityFailureKg ?? 0,
      energyCost: trialEnergyCost(evidence.report.metrics.energyCost, next.state.dryingSinceClose),
      grade: evidence.report.grade,
      qcPassedThisShift,
      unresolvedHighIncident: unresolvedHigh,
    });
    next = setTrial(next, advanced);
    if (
      advanced.phase === 'active' &&
      !advanced.pressureShown &&
      advanced.shiftsUsed * 2 >= definition.durationShifts
    ) {
      next = setTrial(next, { ...advanced, pressureShown: true });
      next = {
        state: notice(
          next.state,
          'trial',
          definition.title,
          definition.pressureBeat,
          definition.id
        ),
        commands: next.commands,
      };
    }
    if (advanced.phase === 'passed' && advanced.medal) {
      const target = nextMedalTarget(definition, advanced.medal);
      next = {
        state: notice(
          {
            ...next.state,
            ledger: recordKnowHow(next.state.ledger, 'medals', MEDAL_KNOW_HOW[advanced.medal]),
          },
          'trial',
          `${definition.title}: ${advanced.medal} victory`,
          target
            ? `Completed in ${advanced.shiftsUsed} of ${definition.durationShifts} shifts. ${capitalise(target.medal)} needed completion within ${target.shiftsUsed}.`
            : `Completed in ${advanced.shiftsUsed} of ${definition.durationShifts} shifts.`,
          definition.id
        ),
        commands: next.commands,
      };
      next = unlockNoteById(next, definition.outroNoteId);
    }
    if (advanced.phase === 'failed') {
      next = {
        state: notice(
          next.state,
          'trial',
          `${definition.title}: trial failed`,
          advanced.failureReason ?? 'The window closed.',
          definition.id
        ),
        commands: next.commands,
      };
      next = unlockNoteById(next, definition.outroNoteId);
      next = offerTraining(next);
    }
  }
  return next;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function setTrial(step: Step, progress: TrialProgress): Step {
  return {
    state: {
      ...step.state,
      trials: step.state.trials.map((t) => (t.id === progress.id ? progress : t)),
    },
    commands: step.commands,
  };
}

function offerTraining(step: Step): Step {
  if (step.state.trainingOffered || step.state.trainingMode) return step;
  return {
    state: notice(
      { ...step.state, trainingOffered: true },
      'trial',
      'Training mode is available',
      `Fund costs -25%, forecast chance -25 points, final score -${TRAINING_MODE.scorePenalty}.`
    ),
    commands: step.commands,
  };
}

function recordChallengeMedals(step: Step, evidence: ShiftCloseEvidence): Step {
  let next = step;
  for (const run of evidence.challengeHistory) {
    if (next.state.seenChallengeIds.includes(run.id)) continue;
    next = {
      state: {
        ...next.state,
        seenChallengeIds: bounded([...next.state.seenChallengeIds, run.id], MAX_SEEN_IDS),
      },
      commands: next.commands,
    };
    const medal = challengeMedal(run);
    if (medal) {
      next = {
        state: notice(
          {
            ...next.state,
            challengeMedals: [...next.state.challengeMedals, { runId: run.id, medal }],
            ledger: recordKnowHow(next.state.ledger, 'medals', MEDAL_KNOW_HOW[medal]),
          },
          'trial',
          `Recovery challenge: ${medal}`,
          `${Math.round(run.deadlineMinute - (run.endedAtMinute ?? run.deadlineMinute))} simulated minutes to spare.`
        ),
        commands: next.commands,
      };
    } else if (run.status === 'failed') {
      next = offerTraining(next);
    }
  }
  return next;
}

function forecastRelief(state: ChronicleState, kind: ForecastKind): number {
  // A contractor's effect trait scales relief too: on drainage, aspiration, the
  // generator and haulage it is the plan's only effect (report 07, F7).
  const plans = state.improvements.reduce(
    (sum, p) =>
      sum +
      (p.phase === 'installed'
        ? (improvementById(p.id)?.forecastRelief?.[kind] ?? 0) * (p.effectScale ?? 1)
        : 0),
    0
  );
  // Standing cover from the record, and organisations that show up (or hold back).
  return (
    plans +
    markForecastRelief(state, kind) -
    stakeholderForecastShift(state.stakeholders, kind) -
    policyForecastShift(state.governance.policies, kind)
  );
}

export function currentForecastChance(state: ChronicleState, forecast: ForecastState): number {
  const totals = chronicleTotals(effectInput(state));
  return forecastChance(forecast.kind, {
    shift:
      fortuneForecastShift(state.charter?.fortune ?? 'even') +
      totals.forecastChance +
      (state.trainingMode ? -0.25 : 0),
    relief: forecastRelief(state, forecast.kind),
    mitigated: forecast.mitigated,
  });
}

/**
 * Chance a mitigation would still take off. A forecast never drops below the 5%
 * floor, so near it the full relief is not there to buy, and at it there is none.
 */
export function mitigationRelief(state: ChronicleState, forecast: ForecastState): number {
  if (forecast.mitigated) return 0;
  return Math.max(
    0,
    currentForecastChance(state, forecast) -
      currentForecastChance(state, { ...forecast, mitigated: true })
  );
}

function resolveForecasts(step: Step, evidence: ShiftCloseEvidence): Step {
  let next = step;
  for (const forecast of step.state.forecasts) {
    if (forecast.status !== 'pending' || forecast.dueShift > next.state.shift) continue;
    const state = next.state;
    if (evidence.challengeActive || state.fire.active) {
      next = {
        state: {
          ...state,
          forecasts: state.forecasts.map((f) =>
            f.id === forecast.id ? { ...f, dueShift: state.shift + 1 } : f
          ),
        },
        commands: next.commands,
      };
      continue;
    }
    const chance = currentForecastChance(state, forecast);
    const roll = chronicleChance(state.charter!.seed, `forecast:${forecast.id}`, state.shift);
    const alreadyActive = evidence.incidents.some(
      (incident) => incident.kind === forecast.kind && incident.phase !== 'resolved'
    );
    const struck = roll < chance && !alreadyActive && state.shift < chronicleShifts(state.charter);
    // It came true over the same hazard already blowing: nothing more is raised,
    // and the notice must not say the forecast did not come to pass.
    const overtaken =
      roll < chance && alreadyActive && state.shift < chronicleShifts(state.charter);
    const definition = FORECASTS[forecast.kind];
    next = {
      state: notice(
        {
          ...state,
          forecasts: bounded(
            state.forecasts.map((f) =>
              f.id === forecast.id ? { ...f, chance, status: struck ? 'struck' : 'passed' } : f
            ),
            MAX_FORECAST_HISTORY
          ),
        },
        'forecast',
        struck
          ? `${definition.title}: it struck`
          : overtaken
            ? `${definition.title}: already under way`
            : `${definition.title}: it passed`,
        struck
          ? `The ${Math.round(chance * 100)}% forecast came true.`
          : overtaken
            ? `The ${Math.round(chance * 100)}% forecast came true while the same incident was already under way, so nothing more was raised.`
            : `The ${Math.round(chance * 100)}% forecast did not come to pass.`,
        forecast.id
      ),
      commands: struck
        ? [
            ...next.commands,
            { type: 'raise_incident', kind: forecast.kind, reason: `Forecast ${forecast.id}` },
          ]
        : next.commands,
    };
  }
  return next;
}

function issueForecast(step: Step, evidence: ShiftCloseEvidence): Step {
  const state = step.state;
  if (state.forecasts.some((f) => f.status === 'pending')) return step;
  const seed = state.charter!.seed;
  if (chronicleChance(seed, 'forecast-issue', state.shift) >= FORECAST_ISSUE_CHANCE) return step;
  const candidates = FORECAST_KINDS.filter(
    (kind) => !evidence.incidents.some((i) => i.kind === kind && i.phase !== 'resolved')
  );
  const kind = weightedPick(
    candidates,
    () => 1,
    chronicleChance(seed, 'forecast-kind', state.shift)
  );
  if (!kind) return step;
  const definition = FORECASTS[kind];
  // A forecast due on the closing shift would strike after the hazards are released.
  if (state.shift + definition.leadShifts >= chronicleShifts(state.charter)) return step;
  const sequence = state.sequence + 1;
  const forecast: ForecastState = {
    id: `forecast-${sequence}`,
    kind,
    issuedShift: state.shift,
    dueShift: state.shift + definition.leadShifts,
    chance: 0,
    mitigated: false,
    mitigatedBy: null,
    paidFund: 0,
    status: 'pending',
  };
  let nextState: ChronicleState = {
    ...state,
    sequence,
    forecasts: bounded([...state.forecasts, forecast], MAX_FORECAST_HISTORY),
  };
  const chance = currentForecastChance(nextState, forecast);
  nextState = {
    ...nextState,
    forecasts: nextState.forecasts.map((f) => (f.id === forecast.id ? { ...f, chance } : f)),
  };
  nextState = notice(
    nextState,
    'forecast',
    `${definition.title}: ${Math.round(chance * 100)}% in ${definition.leadShifts} ${definition.leadShifts === 1 ? 'shift' : 'shifts'}`,
    definition.text,
    forecast.id
  );
  const first = !state.forecasts.length;
  const next: Step = { state: nextState, commands: step.commands };
  return first ? unlockTrigger(next, 'first_forecast') : next;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

function requirementsMet(state: ChronicleState, event: ChronicleEventDefinition): boolean {
  const requires = event.requires;
  if (state.pendingEvents.some((p) => p.eventId === event.id)) return false;
  if (event.onAppear?.inspection && state.inspectionOpen) return false;
  if (!requires) return true;
  if (requires.minEra && eraById(state.era).order < eraById(requires.minEra).order) return false;
  if (requires.cropKinds && (!state.crop || !requires.cropKinds.includes(state.crop.kind)))
    return false;
  if (cropEventMoot(state, event)) return false;
  // Authored on the full clock; a short chronicle reads them on its own (schedule.ts).
  if (requires.minShift !== undefined && state.shift < onSchedule(state.charter, requires.minShift))
    return false;
  if (requires.maxShift !== undefined && state.shift > onSchedule(state.charter, requires.maxShift))
    return false;
  if (requires.modes && state.charter && !requires.modes.includes(state.charter.mode)) return false;
  if (
    requires.customerTier &&
    !state.customers.some((c) => relationshipTier(c.value) === requires.customerTier)
  )
    return false;
  if (requires.deliveredTo && !state.fulfilledCustomers.includes(requires.deliveredTo))
    return false;
  if (requires.marks && !conditionMet(state, { marks: requires.marks })) return false;
  if (requires.suspended !== undefined && state.certifier.suspended !== requires.suspended)
    return false;
  return true;
}

/**
 * The current crop year's grain needs no treatment: already treated, a plan
 * relieves it, or no treatment in place exists for its kind (a wet year is
 * dried on the temper card a shift at a time, plan item 7.7).
 */
export function cropTreatmentMoot(state: ChronicleState): boolean {
  return (
    !state.crop ||
    state.crop.treated ||
    cropTreatmentCost(state.crop.kind) <= 0 ||
    relievedCropKinds(state.improvements).includes(state.crop.kind)
  );
}

/**
 * A crop-year event the crop has overtaken: its year has passed, or the grain
 * it would treat needs no treatment. Nothing it offers would do what it says,
 * so it is neither drawn nor left pending.
 */
export function cropEventMoot(state: ChronicleState, event: ChronicleEventDefinition): boolean {
  const kinds = event.requires?.cropKinds;
  if (!kinds) return false;
  if (!state.crop || !kinds.includes(state.crop.kind)) return true;
  // The year's grain needs nothing: treated (a save from before tempering paid
  // a wet year off), or an installed plan answers it (the dryer a wet year's).
  if (state.crop.treated || relievedCropKinds(state.improvements).includes(state.crop.kind))
    return true;
  return event.choices.some((choice) => choice.effect.treatCrop) && cropTreatmentMoot(state);
}

/**
 * An event the record has overtaken while it waited: a ruling since it appeared
 * broke what it was drawn on (Valley Haulage's lorry, once its contract is ended).
 */
export function recordOvertakes(state: ChronicleState, event: ChronicleEventDefinition): boolean {
  const marks = event.requires?.marks;
  return !!marks && !conditionMet(state, { marks });
}

/**
 * The pending events a player can answer: still in the deck (a save can name
 * one a later version dropped) and not overtaken by the crop or the record. The
 * rest are cleared at the next close.
 */
export function answerablePending(
  state: ChronicleState,
  deck: readonly ChronicleEventDefinition[]
): Array<{ pending: PendingEvent; event: ChronicleEventDefinition }> {
  return state.pendingEvents.flatMap((pending) => {
    const event = deck.find((candidate) => candidate.id === pending.eventId);
    return event && !cropEventMoot(state, event) && !recordOvertakes(state, event)
      ? [{ pending, event }]
      : [];
  });
}

/** Take overtaken events off the desk, without applying their defaults. */
function retireMootEvents(step: Step, deck: readonly ChronicleEventDefinition[]): Step {
  let state = step.state;
  for (const pending of step.state.pendingEvents) {
    const event = deck.find((candidate) => candidate.id === pending.eventId);
    if (!event) continue;
    const crop = cropEventMoot(state, event);
    if (!crop && !recordOvertakes(state, event)) continue;
    state = notice(
      {
        ...state,
        pendingEvents: state.pendingEvents.filter((p) => p.instanceId !== pending.instanceId),
      },
      'event',
      `${event.title}: no longer needed`,
      crop
        ? 'The crop year it asked about has passed, or its grain needs no more treatment.'
        : 'A later ruling has overtaken it.',
      pending.instanceId
    );
  }
  return state === step.state ? step : { state, commands: step.commands };
}

/** Drawn events: never a scheduled or chained one, never the same event twice running. */
function eventEligible(state: ChronicleState, event: ChronicleEventDefinition): boolean {
  if (event.scheduled || event.chained) return false;
  if (state.lastEventId === event.id) return false;
  return requirementsMet(state, event);
}

function drawEvent(step: Step, deck: readonly ChronicleEventDefinition[]): Step {
  const state = step.state;
  const seed = state.charter!.seed;
  // Nothing new on the closing shift: a decision there could never matter.
  if (state.shift >= chronicleShifts(state.charter)) return step;
  if (chronicleChance(seed, 'event', state.shift) >= EVENT_CHANCE) return step;
  const fortune = state.charter!.fortune;
  const weights = fortuneWeights(fortune);
  const candidates = deck.filter((event) => {
    if (!eventEligible(state, event)) return false;
    // Predynastic's easy mode: never two negative events in a row.
    if (
      fortune === 'kind' &&
      state.lastEventPolarity === 'negative' &&
      event.polarity === 'negative'
    )
      return false;
    return true;
  });
  const event = weightedPick(
    candidates,
    (candidate) => candidate.weight * weights[candidate.polarity],
    chronicleChance(seed, 'event-pick', state.shift)
  );
  if (!event) return step;
  const placed = appearEvent(step, event);
  return {
    state: { ...placed.state, lastEventId: event.id, lastEventPolarity: event.polarity },
    commands: placed.commands,
  };
}

/** The first echo whose condition holds: the text the event appears with. */
export function eventEcho(
  state: ChronicleState,
  event: ChronicleEventDefinition
): { text: string; because: string } | undefined {
  const echo = event.echoes?.find((candidate) => conditionMet(state, candidate.when));
  return echo ? { text: echo.text, because: echo.because } : undefined;
}

/** One appear path for drawn, scheduled and follow-up events. */
function appearEvent(step: Step, event: ChronicleEventDefinition): Step {
  const state = step.state;
  const sequence = state.sequence + 1;
  const echo = eventEcho(state, event);
  const pending: PendingEvent = {
    instanceId: `event-${sequence}`,
    eventId: event.id,
    appearedShift: state.shift,
    lapsesShift: state.shift + event.lapseShifts,
    ...(echo ? { echo } : {}),
  };
  let next: Step = {
    state: notice(
      {
        ...state,
        sequence,
        pendingEvents: [...state.pendingEvents, pending],
        inspectionOpen: state.inspectionOpen || !!event.onAppear?.inspection,
      },
      'event',
      event.title,
      echo ? `${echo.because}. ${echo.text}` : event.text,
      pending.instanceId
    ),
    // The inspection is Chronicle bookkeeping only. A crisis would put the
    // whole interface into its safety state while the player thinks it over.
    commands: step.commands,
  };
  next = unlockNoteById(next, event.noteId);
  return next;
}

/**
 * Scheduled events at their shift and follow-ups when due. Both wait while a
 * recovery challenge runs; a scheduled event whose requirements fail on its
 * shift is passed over for good.
 */
function placeScheduled(
  step: Step,
  deck: readonly ChronicleEventDefinition[],
  challengeActive: boolean
): Step {
  if (challengeActive || step.state.shift >= chronicleShifts(step.state.charter)) return step;
  let next = step;
  for (const event of deck) {
    if (!event.scheduled || next.state.firedScheduled.includes(event.id)) continue;
    if (next.state.shift < onSchedule(next.state.charter, event.scheduled.shift)) continue;
    const eligible = requirementsMet(next.state, event);
    next = {
      state: { ...next.state, firedScheduled: [...next.state.firedScheduled, event.id] },
      commands: next.commands,
    };
    if (eligible) next = appearEvent(next, event);
  }
  for (const followUp of step.state.followUps) {
    if (followUp.dueShift > next.state.shift) continue;
    next = {
      state: {
        ...next.state,
        followUps: next.state.followUps.filter((f) => f.id !== followUp.id),
      },
      commands: next.commands,
    };
    const event = deck.find((candidate) => candidate.id === followUp.eventId);
    if (event && requirementsMet(next.state, event)) next = appearEvent(next, event);
  }
  return next;
}

function telegraphLongNight(step: Step, deck: readonly ChronicleEventDefinition[]): Step {
  const state = step.state;
  if (state.longNightTelegraphed || state.firedScheduled.includes(LONG_NIGHT_EVENT_ID)) return step;
  if (state.shift < onSchedule(state.charter, LONG_NIGHT_SHIFT) - LONG_NIGHT_TELEGRAPH_SHIFTS)
    return step;
  if (!deck.some((event) => event.id === LONG_NIGHT_EVENT_ID)) return step;
  const summary = (['intake', 'floor'] as const)
    .map(
      (front, index) =>
        `${index === 0 ? FRONTS[front].label : FRONTS[front].label.toLowerCase()} ${frontPreparation(state, front)} of ${FRONT_HOLD_THRESHOLD}`
    )
    .join('; ');
  return {
    state: notice(
      { ...state, longNightTelegraphed: true },
      'forecast',
      `The long night comes in ${LONG_NIGHT_TELEGRAPH_SHIFTS} shifts`,
      `A storm and a grid emergency will arrive together. The mill can hold one front itself; the other holds with ${FRONT_HOLD_THRESHOLD} preparation. ${summary}.`,
      LONG_NIGHT_EVENT_ID
    ),
    commands: step.commands,
  };
}

function lapseEvents(
  step: Step,
  deck: readonly ChronicleEventDefinition[],
  challengeActive: boolean
): Step {
  let next = step;
  for (const pending of step.state.pendingEvents) {
    if (pending.lapsesShift > next.state.shift) continue;
    if (challengeActive) {
      // A lapse can raise an incident; never into a running recovery challenge.
      next = {
        state: {
          ...next.state,
          pendingEvents: next.state.pendingEvents.map((p) =>
            p.instanceId === pending.instanceId ? { ...p, lapsesShift: next.state.shift + 1 } : p
          ),
        },
        commands: next.commands,
      };
      continue;
    }
    next = applyChoiceInternal(next, pending.instanceId, null, 'chronicle', true, deck);
  }
  return next;
}

/** Whether a choice's requirements hold now. Costs are checked separately. */
export function choiceAvailable(state: ChronicleState, choice: ChronicleEventChoice): boolean {
  return !choice.requires || conditionMet(state, choice.requires);
}

/** The effect a choice will have now, and why it differs, if a variant applies. */
/** The long-night front with less preparation; a tie is the roller floor's. */
export function weakerFront(state: ChronicleState): FrontId {
  return frontPreparation(state, 'intake') < frontPreparation(state, 'floor') ? 'intake' : 'floor';
}

export function effectiveChoice(
  state: ChronicleState,
  choice: ChronicleEventChoice
): { effect: ChronicleEventEffect; because: string | null } {
  const variant = choice.variants?.find(
    (candidate) =>
      conditionMet(state, candidate.when) &&
      (candidate.when.weakerFront === undefined ||
        weakerFront(state) === candidate.when.weakerFront)
  );
  return variant
    ? { effect: variant.effect, because: variant.because }
    : { effect: choice.effect, because: null };
}

/**
 * What a ruling changes for the organisations, the customers and the
 * certifier, in the form its button gives ("Growers’ cooperative -10; standing
 * +0.10"), so the result notice carries the change as well as the prose. A
 * suspended mill's standing does not move, so none is named then.
 * `presentation.ts` re-renders it for pt-BR.
 */
export function effectChanges(
  effect: ChronicleEventEffect,
  context: { suspended?: boolean } = {}
): string {
  const parts = relationshipDeltas(effect).map(
    ({ customer, delta }) =>
      `${customer === 'all' ? 'all customers' : partyName(customer)} ${delta > 0 ? '+' : ''}${delta}`
  );
  if (effect.standing && !context.suspended)
    parts.push(
      `standing ${effect.standing > 0 ? '+' : '-'}${formatFixed(Math.abs(effect.standing) / 100, 2, 'en')}`
    );
  // A mill already suspended is not suspended again (applyEffect).
  if (effect.suspend && !context.suspended)
    parts.push(`approval suspended; all customers ${SUSPENSION_CUSTOMER_DELTA}`);
  if (effect.reinstate) parts.push('approval restored');
  return parts.join('; ');
}

/** A result notice's body: the prose, then its changes in brackets when it made any. */
export function withChanges(result: string, changes: string): string {
  return changes ? `${result} (${changes})` : result;
}

/** One change to an organisation: a ruling's, or one made outside rulings with its cause. */
export type PartyChange =
  | { eventId: string; choiceId: string; shift: number; delta: number }
  | { cause: PartyChangeCause; shift: number; delta: number };

/**
 * The latest changes to an organisation, newest first. Rulings are read back
 * from the event history and the deck rather than stored. The history does
 * not record which variant applied, so a variant counts when the marks it
 * needs were on the record by the ruling's shift (every variant in the decks
 * is conditioned on marks). Changes made outside rulings (a policy's yearly
 * effect, a quota, a red line acted on) are recorded where they happen
 * (`applyRelationshipDeltas`). Those are made at a close, so a ruling on the
 * same shift, answered after it, is listed first.
 */
export function recentPartyChanges(
  state: ChronicleState,
  party: StakeholderId,
  deck: readonly ChronicleEventDefinition[],
  limit = 3
): PartyChange[] {
  const recorded: PartyChange[] = (state.governance.partyChanges ?? [])
    .filter((change) => change.party === party)
    .slice(-limit)
    .reverse()
    .map(({ shift, delta, cause }) => ({ shift, delta, cause }));
  // Stable: rulings come first among changes on the same shift.
  return [...recentRulingChanges(state, party, deck, limit), ...recorded]
    .sort((a, b) => b.shift - a.shift)
    .slice(0, limit);
}

function recentRulingChanges(
  state: ChronicleState,
  party: StakeholderId,
  deck: readonly ChronicleEventDefinition[],
  limit: number
): PartyChange[] {
  const changes: PartyChange[] = [];
  for (let i = state.eventHistory.length - 1; i >= 0 && changes.length < limit; i--) {
    const entry = state.eventHistory[i];
    const event = deck.find((candidate) => candidate.id === entry.eventId);
    const choice = event?.choices.find((candidate) => candidate.id === entry.choiceId);
    if (!choice) continue;
    const then: ChronicleState = {
      ...state,
      marks: Object.fromEntries(
        Object.entries(state.marks).filter(([, mark]) => mark.shift <= entry.shift)
      ),
    };
    const delta = relationshipDeltas(effectiveChoice(then, choice).effect)
      .filter(({ customer }) => customer === party)
      .reduce((sum, { delta: value }) => sum + value, 0);
    if (delta)
      changes.push({ eventId: entry.eventId, choiceId: entry.choiceId, shift: entry.shift, delta });
  }
  return changes;
}

export function chooseEventOption(
  state: ChronicleState,
  instanceId: string,
  choiceId: string,
  actor: Actor,
  deck: readonly ChronicleEventDefinition[]
): Step {
  return applyChoiceInternal({ state, commands: [] }, instanceId, choiceId, actor, false, deck);
}

function applyChoiceInternal(
  step: Step,
  instanceId: string,
  choiceId: string | null,
  actor: Actor,
  lapsed: boolean,
  deck: readonly ChronicleEventDefinition[]
): Step {
  const pending = step.state.pendingEvents.find((p) => p.instanceId === instanceId);
  if (!pending) return step;
  const event = deck.find((candidate) => candidate.id === pending.eventId);
  const remaining = step.state.pendingEvents.filter((p) => p.instanceId !== instanceId);
  if (!event)
    return { state: { ...step.state, pendingEvents: remaining }, commands: step.commands };
  const choice = event.choices.find((c) => c.id === (choiceId ?? event.defaultChoiceId));
  if (!choice) return step;
  if (!lapsed && (!canAfford(step.state, choice.cost) || !choiceAvailable(step.state, choice)))
    return step;
  // A ruling handed to the AI partner is the partner's in the record.
  const decidedBy: Actor = choice.delegates ? 'ai-partner' : actor;
  const handed = effectiveChoice(step.state, choice);
  // A hand-over rules this case too, by the partner's brief (system 29).
  const chain = handed.effect.resolveChain ?? [];
  const ruling = chain.length ? briefRuling(step.state, event, choice) : choice;
  const { effect, because } =
    ruling === choice ? handed : briefRulingEffect(step.state, ruling, chain);
  const changes = effectChanges(effect, { suspended: step.state.certifier.suspended });
  let state = pay({ ...step.state, pendingEvents: remaining }, choice.cost, 'events');
  const applied = applyEffect(state, effect, event.id, decidedBy, ruling.id);
  state = {
    ...applied.state,
    eventHistory: bounded(
      [
        ...applied.state.eventHistory,
        { eventId: event.id, shift: applied.state.shift, choiceId: ruling.id, actor: decidedBy },
      ],
      MAX_EVENT_HISTORY
    ),
  };
  state =
    ruling === choice
      ? notice(
          state,
          'event',
          lapsed ? `${event.title}: lapsed` : `${event.title}: ${choice.label}`,
          withChanges(because ? `${because}. ${effect.result}` : effect.result, changes),
          instanceId
        )
      : // The partner's own ruling reads as the rest of its day does (resolveChain).
        notice(
          state,
          'event',
          `${event.title} (ruled by the AI partner)`,
          withChanges(`${ruling.label}. ${effect.result}`, changes)
        );
  let next: Step = { state, commands: [...step.commands, ...applied.commands] };
  next = unlockNoteById(next, effect.unlockNote);
  if (effect.resolveChain?.length) next = resolveChain(next, effect.resolveChain, deck);
  // A treatment or a ruling can overtake other decisions still on the desk.
  if (effect.treatCrop || effect.marks?.length || effect.resolveChain?.length)
    next = retireMootEvents(next, deck);
  return next;
}

/**
 * Seneschal Varel's "take over from here": each listed event is ruled at once
 * by the AI partner with its default, in order. Follow-ups to events in the
 * chain, and nested chains, are stripped so no case is ruled twice; any other
 * follow-up stands, so a ruling's later consequence still comes due.
 */
function resolveChain(
  step: Step,
  eventIds: readonly string[],
  deck: readonly ChronicleEventDefinition[]
): Step {
  let next = step;
  for (const eventId of eventIds) {
    const event = deck.find((candidate) => candidate.id === eventId);
    const fallback = event?.choices.find((c) => c.id === event.defaultChoiceId);
    if (!event || !fallback) continue;
    const choice = briefRuling(next.state, event, fallback);
    const { effect } = effectiveChoice(next.state, choice);
    const followUps = !effect.followUp
      ? []
      : Array.isArray(effect.followUp)
        ? effect.followUp
        : [effect.followUp];
    const stripped: ChronicleEventEffect = {
      ...effect,
      followUp: followUps.filter((followUp) => !eventIds.includes(followUp.eventId)),
      resolveChain: undefined,
    };
    const cleared: ChronicleState = {
      ...next.state,
      pendingEvents: next.state.pendingEvents.filter((p) => p.eventId !== eventId),
      followUps: next.state.followUps.filter((f) => f.eventId !== eventId),
    };
    const changes = effectChanges(stripped, { suspended: cleared.certifier.suspended });
    const applied = applyEffect(cleared, stripped, event.id, 'ai-partner', choice.id);
    let state: ChronicleState = {
      ...applied.state,
      eventHistory: bounded(
        [
          ...applied.state.eventHistory,
          {
            eventId: event.id,
            shift: applied.state.shift,
            choiceId: choice.id,
            actor: 'ai-partner',
          },
        ],
        MAX_EVENT_HISTORY
      ),
    };
    state = notice(
      state,
      'event',
      `${event.title} (ruled by the AI partner)`,
      withChanges(choice.delegates ? effect.result : `${choice.label}. ${effect.result}`, changes)
    );
    next = { state, commands: [...next.commands, ...applied.commands] };
  }
  return next;
}

function followUpsOf(effect: ChronicleEventEffect) {
  return !effect.followUp
    ? []
    : Array.isArray(effect.followUp)
      ? effect.followUp
      : [effect.followUp];
}

/**
 * The ruling the AI partner gives on a case handed to it (system 29). Under
 * the conventional brief it is the conventional ruling, as Seneschal Varel's
 * was. Another brief weighs the free answers by what it serves, and the
 * conventional ruling wins a tie, so a hand-over never spends what the
 * steward did not, and a "Good neighbour" partner docks rather than terminates.
 */
function briefRuling(
  state: ChronicleState,
  event: ChronicleEventDefinition,
  conventional: ChronicleEventChoice
): ChronicleEventChoice {
  const brief = state.governance.brief;
  if (brief === 'conventional') return conventional;
  let best = conventional;
  let bestScore = briefScore(brief, weighChoice(state, conventional)) ?? -Infinity;
  for (const choice of event.choices) {
    if (choice === conventional || choice.delegates || !choiceAvailable(state, choice)) continue;
    if ((choice.cost?.fund ?? 0) > 0 || (choice.cost?.knowHow ?? 0) > 0) continue;
    const score = briefScore(brief, weighChoice(state, choice));
    if (score === null || score <= bestScore) continue;
    best = choice;
    bestScore = score;
  }
  return best;
}

/** A brief's own ruling on a hand-over: its effect, with the rest of the day still handed over. */
function briefRulingEffect(
  state: ChronicleState,
  ruling: ChronicleEventChoice,
  chain: readonly string[]
): { effect: ChronicleEventEffect; because: string | null } {
  const own = effectiveChoice(state, ruling).effect;
  return {
    effect: {
      ...own,
      // The chain rules the cases a follow-up would have brought.
      followUp: followUpsOf(own).filter((followUp) => !chain.includes(followUp.eventId)),
      resolveChain: [...chain],
    },
    because: null,
  };
}

function relationshipDeltas(effect: ChronicleEventEffect): RelationshipDelta[] {
  if (!effect.relationship) return [];
  return Array.isArray(effect.relationship) ? effect.relationship : [effect.relationship];
}

function applyEffect(
  previous: ChronicleState,
  effect: ChronicleEventEffect,
  sourceId: string,
  actor: Actor,
  choiceId = ''
): Step {
  let state = previous;
  const commands: ChronicleCommand[] = [];
  if (effect.fund) state = { ...state, ledger: recordFund(state.ledger, 'events', effect.fund) };
  if (effect.knowHow) {
    // Only the AI partner's decisions are halved (docs/CHRONICLE.md, system 13). A
    // decision left to lapse pays what its default's button said; a lapse into a
    // hand-over is already the partner's here.
    const share = actor === 'ai-partner' && effect.knowHow > 0 ? AI_KNOW_HOW_SHARE : 1;
    state = {
      ...state,
      ledger: recordKnowHow(state.ledger, 'events', Math.round(effect.knowHow * share * 10) / 10),
    };
  }
  if (effect.modifier) {
    const { label, shifts, ...values } = effect.modifier;
    const sequence = state.sequence + 1;
    state = {
      ...state,
      sequence,
      modifiers: [
        ...state.modifiers,
        {
          ...values,
          id: `modifier-${sequence}`,
          sourceId,
          label,
          remainingShifts: Math.max(1, shifts),
        },
      ],
    };
  }
  for (const { customer, delta } of relationshipDeltas(effect)) {
    state = {
      ...state,
      customers: state.customers.map((c) =>
        customer === 'all' || c.id === customer
          ? { ...c, value: clampRelationship(c.value + delta) }
          : c
      ),
      stakeholders: state.stakeholders.map((s) =>
        s.id === customer ? { ...s, value: clampRelationship(s.value + delta) } : s
      ),
    };
  }
  if (effect.incident)
    commands.push({ type: 'raise_incident', kind: effect.incident, reason: sourceId });
  if (effect.treatCrop && state.crop) state = { ...state, crop: { ...state.crop, treated: true } };
  if (effect.closeInspection && state.inspectionOpen) state = { ...state, inspectionOpen: false };
  if (effect.administration) state = startAdministration(state);
  if (effect.clearMarks?.length) {
    const marks = { ...state.marks };
    for (const id of effect.clearMarks) delete marks[id];
    state = { ...state, marks };
  }
  if (effect.marks?.length) {
    state = leaveMarks(state, effect.marks, sourceId, choiceId, actor);
    state = raiseRulingObjections(state, effect.marks);
  }
  if (effect.standing)
    state = { ...state, certifier: adjustStanding(state.certifier, effect.standing) };
  if (effect.suspend && !state.certifier.suspended) {
    state = {
      ...state,
      certifier: suspendCertifier(),
      customers: state.customers.map((c) => ({
        ...c,
        value: clampRelationship(c.value + SUSPENSION_CUSTOMER_DELTA),
      })),
    };
    // There is always a way back: the audit is scheduled with the suspension.
    if (!state.followUps.some((f) => f.eventId === REINSTATEMENT_EVENT_ID))
      state = scheduleFollowUp(state, REINSTATEMENT_EVENT_ID, REINSTATEMENT_AFTER_SHIFTS, sourceId);
  }
  if (effect.reinstate) state = { ...state, certifier: reinstateCertifier(state.certifier) };
  const followUps = !effect.followUp
    ? []
    : Array.isArray(effect.followUp)
      ? effect.followUp
      : [effect.followUp];
  for (const followUp of followUps)
    state = scheduleFollowUp(state, followUp.eventId, followUp.afterShifts, sourceId);
  if (effect.holdFront) {
    const held = holdTheNight(state, effect.holdFront, sourceId, choiceId, actor);
    state = held.state;
    commands.push(...held.commands);
  }
  return { state, commands };
}

/**
 * 26. A ruling that cuts against what a member values raises their standing
 * objection (item 4.10): they vote against every change until it is met
 * through their concession. Whoever ruled, the record is the mill's.
 */
function raiseRulingObjections(state: ChronicleState, marks: readonly string[]): ChronicleState {
  let next = state;
  for (const entry of RULING_OBJECTIONS) {
    if (!marks.includes(entry.mark)) continue;
    const member = next.governance.crew.find((m) => m.id === entry.memberId);
    if (!member) continue;
    const objections = next.governance.objections;
    if (
      objections.some((o) => o.memberId === member.id && 'ruling' in o && o.ruling === entry.mark)
    )
      continue;
    next = withGovernance(next, {
      objections: [
        ...objections,
        { memberId: member.id, ruling: entry.mark, raisedShift: next.shift },
      ],
    });
    next = notice(
      next,
      'event',
      `The ${member.role.toLowerCase()} objects to ${entry.ruling}`,
      `It cuts against what they value: ${member.value}. The objection stands until it is met.`
    );
  }
  return next;
}

/** The reinstatement audit a suspension always schedules (docs/CHRONICLE.md, system 23). */
export const REINSTATEMENT_EVENT_ID = 'evt-reinstatement-audit';

function scheduleFollowUp(
  state: ChronicleState,
  eventId: string,
  afterShifts: number,
  sourceEventId: string
): ChronicleState {
  const sequence = state.sequence + 1;
  return {
    ...state,
    sequence,
    followUps: [
      ...state.followUps,
      {
        id: `follow-${sequence}`,
        eventId,
        // The closing shift places nothing, so a follow-up lands by the shift before it.
        dueShift: Math.max(
          state.shift + 1,
          Math.min(state.shift + Math.max(1, afterShifts), chronicleShifts(state.charter) - 1)
        ),
        sourceEventId,
      },
    ],
  };
}

function leaveMarks(
  state: ChronicleState,
  ids: readonly string[],
  eventId: string,
  choiceId: string,
  actor: Actor
): ChronicleState {
  const marks = { ...state.marks };
  for (const id of ids) marks[id] = { id, shift: state.shift, eventId, choiceId, actor };
  return { ...state, marks };
}

/**
 * The long night: the chosen front holds; the other holds on its preparation
 * alone, or falls and raises its real incident, owned and recoverable. No
 * incident is raised over an active one of the same kind (the store refuses
 * it), or on the closing shift (the guard forecasts and the duct fire share).
 */
function holdTheNight(
  state: ChronicleState,
  chosen: FrontId,
  eventId: string,
  choiceId: string,
  actor: Actor
): Step {
  const other = otherFront(chosen);
  const holds = frontHolds(state, other);
  const prepared = frontPreparation(state, other);
  let next = leaveMarks(
    state,
    [`held-${chosen}`, holds ? `held-${other}` : `fell-${other}`],
    eventId,
    choiceId,
    actor
  );
  next = notice(
    next,
    'trial',
    `${FRONTS[other].label} ${holds ? 'held' : 'fell'}`,
    holds
      ? `Held on preparation alone (${prepared} prepared, ${FRONT_HOLD_THRESHOLD} needed).`
      : `${capitalise(FRONTS[other].subject)} needed ${FRONT_HOLD_THRESHOLD} preparation and had ${prepared}.`,
    LONG_NIGHT_EVENT_ID
  );
  const commands: ChronicleCommand[] =
    !holds && next.shift < chronicleShifts(next.charter)
      ? [{ type: 'raise_incident', kind: FRONTS[other].hazard, reason: 'The long night' }]
      : [];
  return { state: next, commands };
}

// ---------------------------------------------------------------------------
// Fire under austerity (Old Kingdom: "Chance of collapse and fire +X%")
// ---------------------------------------------------------------------------

export function fireChance(state: ChronicleState, dustIncidentActive: boolean): number {
  if (!state.austerity.active) return 0;
  return Math.min(
    FIRE_CHANCE_CAP,
    state.austerity.shifts * FIRE_CHANCE_PER_AUSTERITY_SHIFT +
      (dustIncidentActive ? FIRE_DUST_BONUS : 0)
  );
}

function rollFire(step: Step, evidence: ShiftCloseEvidence): Step {
  const state = step.state;
  if (
    state.fire.active ||
    evidence.challengeActive ||
    state.charter?.mode === 'sandbox' ||
    state.shift >= chronicleShifts(state.charter)
  )
    return step;
  const dust = evidence.incidents.some(
    (i) => i.kind === 'dust_filter_pressure' && i.phase !== 'resolved'
  );
  const chance = fireChance(state, dust);
  if (chance <= 0) return step;
  if (chronicleChance(state.charter!.seed, 'fire', state.shift) >= chance) return step;
  let next: Step = {
    state: notice(
      { ...state, fire: { active: true, suppressing: false, resolveAtMinute: null } },
      'event',
      'Smouldering dust in the extraction ducting',
      'The fail-safe has stopped production and the forklifts. Nobody is in danger; the duct must be suppressed and cleaned before restart.'
    ),
    commands: [...step.commands, { type: 'start_fire' }],
  };
  next = unlockTrigger(next, 'fire');
  return next;
}

const NO_FIRE: ChronicleState['fire'] = {
  active: false,
  suppressing: false,
  resolveAtMinute: null,
};

/** Another stop held the interlock, so the fire's own stop never started. */
export function fireDidNotStart(state: ChronicleState): ChronicleState {
  if (!state.fire.active) return state;
  return notice(
    { ...state, fire: NO_FIRE },
    'event',
    'Duct cleared during the stop',
    'The plant was already stopped when the smouldering was found, so it was cleared then. No fire stop or suppression is needed.'
  );
}

/**
 * The plant's fire stop is gone (a reload does not persist it; a game reset
 * clears it), so nothing is left to suppress: release the chronicle's fire
 * rather than ask the fund to pay for one that is out.
 */
export function releaseStrandedFire(state: ChronicleState): ChronicleState {
  if (!state.fire.active) return state;
  return notice(
    { ...state, fire: NO_FIRE },
    'event',
    'Duct fire stop released',
    'The plant stop for the duct fire was cleared outside the chronicle. Nothing is left to suppress.'
  );
}

export function suppressFire(
  state: ChronicleState,
  nowMinute: number,
  actor: Actor,
  method: 'suppress' | 'by_hand' = 'suppress'
): Step {
  if (!state.fire.active || state.fire.suppressing) return { state, commands: [] };
  const cost = method === 'suppress' ? { fund: FIRE_SUPPRESSION_COST } : undefined;
  if (!canAfford(state, cost)) return { state, commands: [] };
  const minutes = method === 'suppress' ? FIRE_SUPPRESSION_MINUTES : FIRE_HAND_CLEAN_MINUTES;
  let next = pay(state, cost, 'suppression');
  next = {
    ...next,
    fire: {
      active: true,
      suppressing: true,
      resolveAtMinute: nowMinute + minutes,
    },
  };
  next = notice(
    next,
    'event',
    method === 'suppress' ? 'Suppression under way' : 'Cleaning the duct by hand',
    `Restart in about ${minutes} simulated minutes.`
  );
  if (actor === 'ai-partner')
    next = initiative(next, {
      kind: 'suppression',
      targetId: 'fire',
      summary: method === 'suppress' ? 'Funded fire suppression' : 'Cleaned the duct by hand',
      reason:
        method === 'suppress'
          ? 'Production was stopped by a duct fire; safety does not wait on the delegated share.'
          : 'Production was stopped by a duct fire and the fund could not cover suppression.',
      reversible: false,
    });
  return { state: next, commands: [] };
}

/** Per-tick check: cheap, returns the same state object when nothing is due. */
export function tickMinute(state: ChronicleState, nowMinute: number): Step {
  if (state.status !== 'active') return { state, commands: [] };
  if (state.fire.active && !state.fire.suppressing && canFundMitigations(state.delegation)) {
    // Safety does not wait on the 15% share (docs/CHRONICLE.md, delegation level 2):
    // on a charter-sized fund the share never reaches the price, and the plant
    // would always stand stopped for the slow clean. The spend is still logged
    // as the partner's for the shift. Only a fund that cannot cover suppression
    // sends the duct to be cleaned by hand.
    const cost = price(state, FIRE_SUPPRESSION_COST);
    const funded = suppressFire(state, nowMinute, 'ai-partner');
    if (funded.state !== state)
      return {
        state: { ...funded.state, aiSpentThisShift: funded.state.aiSpentThisShift + cost },
        commands: funded.commands,
      };
    const byHand = suppressFire(state, nowMinute, 'ai-partner', 'by_hand');
    if (byHand.state !== state) return byHand;
  }
  if (
    state.fire.active &&
    state.fire.suppressing &&
    state.fire.resolveAtMinute !== null &&
    nowMinute >= state.fire.resolveAtMinute
  ) {
    return {
      state: notice(
        { ...state, fire: { active: false, suppressing: false, resolveAtMinute: null } },
        'event',
        'Duct cleaned',
        'The extraction duct is clean and the interlock has released. Production restarts.'
      ),
      commands: [{ type: 'resolve_fire' }],
    };
  }
  return { state, commands: [] };
}

// ---------------------------------------------------------------------------
// Delegated initiatives
// ---------------------------------------------------------------------------

/**
 * What is left of the partner's share this shift. The share is of the fund as
 * the shift's decisions began, so its own spending does not shrink it: a free
 * answer is always within it.
 */
function aiShareLeft(state: ChronicleState): number {
  return aiShiftBudget(fundOf(state) + state.aiSpentThisShift) - state.aiSpentThisShift;
}

function delegatedInitiatives(
  step: Step,
  evidence: ShiftCloseEvidence,
  deck: readonly ChronicleEventDefinition[]
): Step {
  let next = step;
  const level = next.state.delegation;
  if (level === 0) return next;
  if (canAnswerEvents(level)) {
    for (const pending of next.state.pendingEvents) {
      // An earlier answer this close can take a decision off the desk (treating the
      // crop retires the other crop event); there is nothing left to answer or log.
      if (!next.state.pendingEvents.some((p) => p.instanceId === pending.instanceId)) continue;
      const event = deck.find((e) => e.id === pending.eventId);
      if (!event?.routine) continue;
      // The answer its brief picks; the conventional brief takes the cheapest
      // recommended answer, so a free answer beats a paid one.
      const choice = partnerChoice(next.state, event);
      if (!choice || !canAfford(next.state, choice.cost) || !choiceAvailable(next.state, choice))
        continue;
      const cost = price(next.state, choice.cost?.fund ?? 0);
      // A crop treatment may exceed the share, as fire suppression may: on a
      // charter-sized fund 15% never reaches the wet-year dryer, and the
      // untreated year fails strong white and the Wet Harvest (report 07, F10).
      const treats = effectiveChoice(next.state, choice).effect.treatCrop === true;
      if (cost > aiShareLeft(next.state) && !treats) continue;
      next = applyChoiceInternal(next, pending.instanceId, choice.id, 'ai-partner', false, deck);
      next = {
        state: initiative(
          { ...next.state, aiSpentThisShift: next.state.aiSpentThisShift + cost },
          {
            kind: 'event',
            targetId: pending.instanceId,
            summary: `${event.title}: ${choice.label}`,
            reason:
              next.state.governance.brief === 'conventional'
                ? 'Routine event within the delegated budget; the recommended choice.'
                : `Routine event within the delegated budget; the ${briefLabel(next.state.governance.brief).toLowerCase()} brief: ${BRIEFS.find((b) => b.id === next.state.governance.brief)?.rule ?? ''}.`,
            reversible: false,
          }
        ),
        commands: next.commands,
      };
    }
  }
  if (canFundMitigations(level)) {
    for (const forecast of next.state.forecasts) {
      if (forecast.status !== 'pending' || forecast.mitigated) continue;
      const chance = currentForecastChance(next.state, forecast);
      const cost = price(next.state, FORECASTS[forecast.kind].mitigationCost);
      // The partner's brief decides how early it guards each hazard (system 29).
      if (chance < briefMitigationThreshold(next.state.governance.brief, forecast.kind)) continue;
      if (cost > aiShareLeft(next.state)) continue;
      const mitigated = mitigateForecast(next.state, forecast.id, 'ai-partner', chance);
      if (mitigated.state === next.state) continue;
      next = {
        state: { ...mitigated.state, aiSpentThisShift: mitigated.state.aiSpentThisShift + cost },
        commands: next.commands,
      };
    }
    for (const owned of next.state.ownedIncidents) {
      const incident = evidence.incidents.find((i) => i.id === owned.incidentId);
      if (incident?.phase !== 'mitigated' || !incident.effectApplied) continue;
      const restored = restoreIncident(next.state, owned.incidentId, owned.kind, 'ai-partner');
      next = { state: restored.state, commands: [...next.commands, ...restored.commands] };
    }
  }
  if (canStartInstalls(level)) {
    const reserve = upkeepDue(next.state) * AI_UPKEEP_RESERVE_SHIFTS;
    const charter = next.state.charter;
    const yearShifts = cropYearShifts(charter, cropYearAt(charter, next.state.shift));
    const candidates = next.state.improvements
      .filter((p) => p.phase === 'planned')
      .map((p) => improvementById(p.id))
      .filter(
        (plan): plan is NonNullable<typeof plan> =>
          !!plan && installBlockReason(next.state, plan.id) === null
      )
      .sort(
        (a, b) =>
          briefInstallRank(next.state.governance.brief, a, yearShifts) -
            briefInstallRank(next.state.governance.brief, b, yearShifts) ||
          a.installCost - b.installCost
      );
    const plan = candidates[0];
    if (plan && fundOf(next.state) - installPrice(next.state, plan.id) >= reserve) {
      const started = startInstall(next.state, plan.id, 'ai-partner');
      next = { state: started.state, commands: next.commands };
    }
  }
  return next;
}

// ---------------------------------------------------------------------------
// Player and delegated actions
// ---------------------------------------------------------------------------

export function mitigateForecast(
  state: ChronicleState,
  forecastId: string,
  actor: Actor,
  /** The chance the AI partner judged against the threshold, for its reason. */
  judgedChance?: number
): Step {
  const forecast = state.forecasts.find((f) => f.id === forecastId);
  if (!forecast || forecast.status !== 'pending' || forecast.mitigated)
    return { state, commands: [] };
  const definition = FORECASTS[forecast.kind];
  const cost = { fund: definition.mitigationCost };
  if (!canAfford(state, cost)) return { state, commands: [] };
  // At the floor a mitigation changes nothing; it is not sold.
  if (mitigationRelief(state, forecast) <= 0) return { state, commands: [] };
  const paid = price(state, definition.mitigationCost);
  let next = pay(state, cost, 'mitigation');
  next = {
    ...next,
    forecasts: next.forecasts.map((f) =>
      f.id === forecastId ? { ...f, mitigated: true, mitigatedBy: actor, paidFund: paid } : f
    ),
  };
  next = {
    ...next,
    forecasts: next.forecasts.map((f) =>
      f.id === forecastId ? { ...f, chance: currentForecastChance(next, f) } : f
    ),
  };
  if (actor === 'ai-partner')
    next = initiative(next, {
      kind: 'mitigation',
      targetId: forecastId,
      summary: `${definition.mitigationLabel} (${definition.title.toLowerCase()})`,
      reason: `The forecast stood at ${Math.round((judgedChance ?? currentForecastChance(state, forecast)) * 100)}%, at or above the ${Math.round(briefMitigationThreshold(state.governance.brief, forecast.kind) * 100)}% threshold${state.governance.brief === 'conventional' ? '' : ` of the ${briefLabel(state.governance.brief).toLowerCase()} brief`}.`,
      reversible: true,
    });
  return { state: next, commands: [] };
}

/** Re-baseline after a rewind or a pause, so nothing that happened is credited twice. */
export function resyncBaseline(
  state: ChronicleState,
  evidence: ShiftCloseEvidence
): ChronicleState {
  // Drying answered in a rewound window is not history either: it is not
  // credited or judged (review 2, finding 2).
  const { dryingSinceClose: _dried, dryingAvoidedSinceClose: _avoided, ...kept } = state;
  return {
    ...kept,
    lastReportId: evidence.report.id,
    lastReportEndedAt: evidence.report.endedAtMinute,
    seenQcTestIds: bounded(
      [...new Set([...state.seenQcTestIds, ...evidence.qcTests.map((t) => t.id)])],
      MAX_SEEN_IDS
    ),
    seenChallengeIds: bounded(
      [...new Set([...state.seenChallengeIds, ...evidence.challengeHistory.map((r) => r.id)])],
      MAX_SEEN_IDS
    ),
    orderShippedKg: Object.fromEntries(evidence.orders.map((o) => [o.id, o.shippedKg])),
    orderFailureKg: Object.fromEntries(evidence.orders.map((o) => [o.id, o.qualityFailureKg])),
    orderFulfilled: evidence.orders.filter((o) => o.status === 'fulfilled').map((o) => o.id),
    // A forfeit seen during a replay or a pause is not history either.
    ...(evidence.orders.some((o) => typeof o.forfeitedAtMinute === 'number') || state.orderForfeited
      ? {
          orderForfeited: evidence.orders
            .filter((o) => typeof o.forfeitedAtMinute === 'number')
            .map((o) => o.id),
        }
      : {}),
  };
}

/** Unlock the lineage note for each incident kind the plant meets, whoever raised it. */
export function noteIncidents(
  state: ChronicleState,
  incidents: ReadonlyArray<Pick<OperationalIncident, 'id' | 'kind'>>
): Step {
  if (state.status !== 'active') return { state, commands: [] };
  let step: Step = { state, commands: [] };
  for (const incident of incidents) {
    if (step.state.seenIncidentIds.includes(incident.id)) continue;
    step = {
      state: {
        ...step.state,
        seenIncidentIds: bounded([...step.state.seenIncidentIds, incident.id], MAX_SEEN_IDS),
      },
      commands: step.commands,
    };
    step = unlockTrigger(step, `incident:${incident.kind}`);
  }
  return step;
}

export function recordOwnedIncident(
  state: ChronicleState,
  incidentId: string,
  kind: string
): ChronicleState {
  if (state.ownedIncidents.some((o) => o.incidentId === incidentId)) return state;
  return {
    ...state,
    ownedIncidents: [...state.ownedIncidents, { incidentId, kind, raisedShift: state.shift }],
  };
}

/** Return a Chronicle-raised incident to normal once it has been mitigated. */
export function restoreIncident(
  state: ChronicleState,
  incidentId: string,
  kind: string,
  actor: Actor
): Step {
  if (!state.ownedIncidents.some((o) => o.incidentId === incidentId))
    return { state, commands: [] };
  let next: ChronicleState = {
    ...state,
    ownedIncidents: state.ownedIncidents.filter((o) => o.incidentId !== incidentId),
  };
  if (actor === 'ai-partner')
    next = initiative(next, {
      kind: 'restore',
      targetId: incidentId,
      summary: 'Restored controls after a mitigated incident',
      reason: 'The incident was mitigated and its effects applied.',
      reversible: false,
    });
  const commands: ChronicleCommand[] = [
    actor === 'player'
      ? { type: 'resolve_incident', incidentId, actor: 'operator' }
      : { type: 'resolve_incident', incidentId },
  ];
  if (kind === 'severe_rain') commands.push({ type: 'clear_weather' });
  return { state: next, commands };
}

/** Clear owned incidents the campaign has already resolved by another path. */
export function forgetResolvedIncidents(
  state: ChronicleState,
  incidents: ReadonlyArray<Pick<OperationalIncident, 'id' | 'phase'>>
): ChronicleState {
  const owned = state.ownedIncidents.filter((o) => {
    const incident = incidents.find((i) => i.id === o.incidentId);
    return incident !== undefined && incident.phase !== 'resolved';
  });
  return owned.length === state.ownedIncidents.length ? state : { ...state, ownedIncidents: owned };
}

export function planImprovement(state: ChronicleState, id: string): Step {
  const plan = improvementById(id);
  if (!plan || state.status !== 'active') return { state, commands: [] };
  if (state.improvements.some((p) => p.id === id)) return { state, commands: [] };
  if (plan.column > eraById(state.era).order) return { state, commands: [] };
  if (!plan.requires.every((r) => state.improvements.some((p) => p.id === r)))
    return { state, commands: [] };
  if (knowHowOf(state) < plan.planCost) return { state, commands: [] };
  let next: ChronicleState = {
    ...state,
    ledger: recordKnowHow(state.ledger, 'plans', -plan.planCost),
    improvements: [
      ...state.improvements,
      {
        id,
        phase: 'planned',
        contractorId: null,
        startedShift: null,
        completesShift: null,
        paidFund: 0,
        effectScale: 1,
        initiatedBy: 'player',
      },
    ],
  };
  next = notice(
    next,
    'event',
    `${plan.label} planned`,
    'The plan is drawn up and ready to install.'
  );
  return { state: next, commands: [] };
}

export function installPrice(state: ChronicleState, id: string): number {
  const plan = improvementById(id);
  if (!plan) return 0;
  return price(state, Math.round(plan.installCost * contractorCostMultiplier(state.contractor)));
}

export function installShifts(state: ChronicleState, id: string): number {
  const plan = improvementById(id);
  return plan ? contractorInstallShifts(state.contractor, plan.installShifts) : 0;
}

export function installBlockReason(state: ChronicleState, id: string): string | null {
  const plan = improvementById(id);
  const own = state.improvements.find((p) => p.id === id);
  if (!plan || !own) return 'Plan it first.';
  if (own.phase !== 'planned') return own.phase === 'installing' ? 'Installing.' : 'Installed.';
  const missing = plan.requires.filter(
    (r) => !state.improvements.some((p) => p.id === r && p.phase === 'installed')
  );
  if (missing.length)
    return `Needs ${missing.map((r) => improvementById(r)?.label ?? r).join(', ')} installed.`;
  if (
    state.improvements.some(
      (p) => p.phase === 'installing' && p.contractorId === (state.contractor?.id ?? null)
    )
  )
    return state.contractor ? `${state.contractor.name} is busy.` : 'The in-house crew is busy.';
  if (state.shift + installShifts(state, id) > chronicleShifts(state.charter))
    return 'Too late to finish before the chronicle ends.';
  if (fundOf(state) < installPrice(state, id)) return 'Not enough fund.';
  return null;
}

export function startInstall(state: ChronicleState, id: string, actor: Actor): Step {
  if (installBlockReason(state, id) !== null) return { state, commands: [] };
  const plan = improvementById(id)!;
  const cost = installPrice(state, id);
  let next: ChronicleState = {
    ...state,
    ledger: recordFund(state.ledger, 'installs', -cost),
    improvements: state.improvements.map((p) =>
      p.id === id
        ? {
            ...p,
            phase: 'installing',
            contractorId: state.contractor?.id ?? null,
            startedShift: state.shift,
            completesShift: state.shift + installShifts(state, id),
            paidFund: cost,
            effectScale: contractorEffectScale(state.contractor),
            initiatedBy: actor,
          }
        : p
    ),
  };
  if (actor === 'ai-partner')
    next = initiative(next, {
      kind: 'install',
      targetId: id,
      summary: `Started installing ${plan.label.toLowerCase()}`,
      reason: installReason(state.governance.brief, plan),
      reversible: true,
    });
  return { state: next, commands: [] };
}

/**
 * Why the partner chose this plan, as `delegatedInitiatives` ranks them
 * (`briefInstallRank`): the conventional brief takes the cheapest install; a
 * brief takes the plans that serve it first, then the cheapest (thrift: over a
 * crop year).
 */
function installReason(brief: BriefId, plan: ImprovementDefinition): string {
  const reserve = `leaving ${AI_UPKEEP_RESERVE_SHIFTS} shifts of upkeep in reserve.`;
  if (brief === 'conventional') return `The cheapest ready plan, ${reserve}`;
  const name = briefLabel(brief).toLowerCase();
  const overYear = brief === 'thrift' ? ' over a crop year' : '';
  return briefServes(brief, plan)
    ? `The ${name} brief takes the ready plans that serve it first; this was the cheapest of them${overYear}, ${reserve}`
    : `No ready plan serves the ${name} brief, so this was the cheapest${overYear}, ${reserve}`;
}

export function cancelInstall(state: ChronicleState, id: string): Step {
  const own = state.improvements.find((p) => p.id === id);
  if (!own || own.phase !== 'installing') return { state, commands: [] };
  return {
    state: {
      ...state,
      ledger: recordFund(state.ledger, 'refunds', own.paidFund),
      improvements: state.improvements.map((p) =>
        p.id === id
          ? {
              ...p,
              phase: 'planned',
              contractorId: null,
              startedShift: null,
              completesShift: null,
              paidFund: 0,
              effectScale: 1,
            }
          : p
      ),
    },
    commands: [],
  };
}

export function hireContractor(state: ChronicleState, contractorId: string): Step {
  const offer = state.contractorOffers.find((c) => c.id === contractorId);
  if (state.status !== 'active' || !offer || state.contractor?.id === contractorId)
    return { state, commands: [] };
  if (state.improvements.some((p) => p.phase === 'installing')) return { state, commands: [] };
  const cost = { fund: offer.retainer };
  if (!canAfford(state, cost)) return { state, commands: [] };
  let next = pay(state, cost, 'contractors');
  next = { ...next, contractor: offer };
  next = notice(
    next,
    'event',
    `${offer.name} retained`,
    'Their crew will carry out the next installs.'
  );
  return unlockTrigger({ state: next, commands: [] }, 'contractor_hired');
}

/** Whether an initiative can still be undone: its target must still be live and the AI's. */
export function canReverse(state: ChronicleState, entry: Initiative): boolean {
  if (!entry.reversible || entry.reversed) return false;
  if (entry.kind === 'mitigation') {
    const forecast = state.forecasts.find((f) => f.id === entry.targetId);
    return (
      !!forecast &&
      forecast.status === 'pending' &&
      forecast.mitigated &&
      forecast.mitigatedBy === 'ai-partner'
    );
  }
  if (entry.kind === 'install') {
    const progress = state.improvements.find((p) => p.id === entry.targetId);
    return (
      !!progress &&
      progress.phase === 'installing' &&
      progress.initiatedBy === 'ai-partner' &&
      progress.startedShift === entry.shift
    );
  }
  return false;
}

export function reverseInitiative(state: ChronicleState, initiativeId: string): Step {
  const entry = state.initiatives.find((i) => i.id === initiativeId);
  if (!entry || !canReverse(state, entry)) return { state, commands: [] };
  let next = state;
  if (entry.kind === 'mitigation') {
    const forecast = state.forecasts.find((f) => f.id === entry.targetId);
    if (!forecast || forecast.status !== 'pending' || !forecast.mitigated)
      return { state, commands: [] };
    const refund = forecast.paidFund ?? price(state, FORECASTS[forecast.kind].mitigationCost);
    next = {
      ...next,
      ledger: recordFund(next.ledger, 'refunds', refund),
      forecasts: next.forecasts.map((f) =>
        f.id === forecast.id ? { ...f, mitigated: false, mitigatedBy: null, paidFund: 0 } : f
      ),
    };
    next = {
      ...next,
      forecasts: next.forecasts.map((f) =>
        f.id === forecast.id ? { ...f, chance: currentForecastChance(next, f) } : f
      ),
    };
  } else if (entry.kind === 'install') {
    const cancelled = cancelInstall(next, entry.targetId);
    if (cancelled.state === next) return { state, commands: [] };
    next = cancelled.state;
  } else {
    return { state, commands: [] };
  }
  next = {
    ...next,
    initiatives: next.initiatives.map((i) =>
      i.id === initiativeId ? { ...i, reversed: true } : i
    ),
  };
  return { state: next, commands: [] };
}

export function resolveShortfall(state: ChronicleState, choice: 'conserve' | 'forced'): Step {
  if (state.upkeepShortfall === null) return { state, commands: [] };
  const due = state.upkeepShortfall;
  const fund = Math.max(0, fundOf(state));
  if (choice === 'conserve') {
    const paid = Math.min(fund, Math.round(due * 0.5));
    return {
      state: notice(
        {
          ...state,
          upkeepShortfall: null,
          austerity: { active: true, shifts: 0 },
          ledger: recordFund(state.ledger, 'upkeep', -paid),
        },
        'ledger',
        'Conserving resources',
        'Some plant is shut down: upkeep halved, production x0.92, wear x1.2, fire risk rising each shift.'
      ),
      commands: [],
    };
  }
  const gap = Math.max(0, due - fund);
  const knowHowNeeded = Math.ceil(gap / FORCED_FUND_PER_KNOW_HOW);
  if (knowHowNeeded > knowHowOf(state)) return resolveShortfall(state, 'conserve');
  // A refund can land between the shortfall and the answer: pay what is due, not the fund.
  const paid = Math.min(fund, due);
  let ledger = recordFund(state.ledger, 'upkeep', -paid);
  ledger = recordKnowHow(ledger, 'forced_maintenance', -knowHowNeeded);
  return {
    state: notice(
      { ...state, upkeepShortfall: null, ledger },
      'ledger',
      'Forced maintenance',
      knowHowNeeded > 0
        ? `Upkeep paid in full: ${Math.round(paid)} from the fund and ${knowHowNeeded} know-how in members' extra effort.`
        : `Upkeep paid in full: ${Math.round(paid)} from the fund.`
    ),
    commands: [],
  };
}

export function setAusterity(state: ChronicleState, active: boolean): ChronicleState {
  // An ended chronicle charges no upkeep and applies no effect: there is no policy left to set.
  if (state.status !== 'active') return state;
  if (active && state.upkeepShortfall !== null) return resolveShortfall(state, 'conserve').state;
  if (state.austerity.active === active) return state;
  return notice(
    { ...state, austerity: { active, shifts: 0 } },
    'ledger',
    active ? 'Conserving resources' : 'Full maintenance restored',
    active
      ? 'Upkeep halved, production x0.92, wear x1.2, fire risk rising each shift.'
      : 'All plant is maintained again and upkeep is charged in full.'
  );
}

/** Crop treatment price before training mode: warm growers lend capacity, cool ones charge. */
export function treatmentPrice(state: ChronicleState): number {
  if (!state.crop) return 0;
  return Math.round(cropTreatmentCost(state.crop.kind) * treatmentMultiplier(state.stakeholders));
}

export function treatCropDirectly(
  state: ChronicleState,
  /** The deck whose crop decisions this treatment overtakes, as an event's treatment does. */
  deck: readonly ChronicleEventDefinition[] = []
): Step {
  if (state.status !== 'active' || !state.crop || cropTreatmentMoot(state))
    return { state, commands: [] };
  const base = treatmentPrice(state);
  if (base <= 0) return { state, commands: [] };
  const cost = { fund: base };
  if (!canAfford(state, cost)) return { state, commands: [] };
  const next = notice(
    { ...pay(state, cost, 'treatment'), crop: { ...state.crop, treated: true } },
    'event',
    state.crop.kind === 'sprouted' ? 'Grain blended' : 'Grain dried',
    CROP_YEARS[state.crop.kind].treatedPenalty > 0
      ? `This crop year’s grain is treated; its quality penalty is eased to ${CROP_YEARS[state.crop.kind].treatedPenalty}.`
      : 'This crop year’s grain is treated; its quality penalty is lifted.'
  );
  return retireMootEvents({ state: next, commands: [] }, deck);
}

export function setDelegation(state: ChronicleState, level: DelegationLevel): Step {
  if (state.status !== 'active' || state.delegation === level) return { state, commands: [] };
  // The federation's administrator keeps the partner acting at Forecasts or above.
  if (state.governance.administration && level < 2) return { state, commands: [] };
  const next = notice(
    { ...state, delegation: level },
    'initiative',
    `Delegation: level ${level}`,
    level === 0
      ? 'The AI partner advises only.'
      : 'The AI partner may act within its grant; every initiative is logged here.'
  );
  return level > 0
    ? unlockTrigger({ state: next, commands: [] }, 'delegation')
    : { state: next, commands: [] };
}

export function acceptTraining(state: ChronicleState): ChronicleState {
  // The final score is fixed once the chronicle ends; training could no longer change it.
  if (state.status !== 'active' || !state.trainingOffered || state.trainingMode) return state;
  return notice(
    { ...state, trainingMode: true },
    'trial',
    'Training mode on',
    `Fund costs -25%, forecast chance -25 points, final score -${TRAINING_MODE.scorePenalty}.`
  );
}

/** The Notes tab was opened: every unlocked note has now been seen in its list. Earns nothing. */
export function markNotesSeen(state: ChronicleState): ChronicleState {
  const seen = new Set(state.seenNotes);
  const fresh = state.unlockedNotes.filter((id) => !seen.has(id));
  if (fresh.length === 0) return state;
  return { ...state, seenNotes: [...state.seenNotes, ...fresh] };
}

export function markNoteRead(state: ChronicleState, noteId: string): ChronicleState {
  if (!state.unlockedNotes.includes(noteId) || state.readNotes.includes(noteId)) return state;
  return {
    ...state,
    readNotes: [...state.readNotes, noteId],
    ledger:
      state.status === 'active'
        ? recordKnowHow(state.ledger, 'notes', KNOW_HOW_PER_NOTE, false)
        : state.ledger,
  };
}

/** The question has had its one attempt that can earn (D19). */
export function quizQuestionAttempted(state: ChronicleState, questionId: string): boolean {
  return (
    state.quizAnswered.includes(questionId) || (state.quizAttempted ?? []).includes(questionId)
  );
}

/** Only a first attempt can earn: a wrong pick spends the question as a right one does. */
export function answerQuizQuestion(
  state: ChronicleState,
  questionId: string,
  correct: boolean
): ChronicleState {
  if (quizQuestionAttempted(state, questionId)) return state;
  const attempted = { ...state, quizAttempted: [...(state.quizAttempted ?? []), questionId] };
  if (!correct) return attempted;
  return {
    ...attempted,
    quizAnswered: [...state.quizAnswered, questionId],
    ledger:
      state.status === 'active'
        ? recordKnowHow(state.ledger, 'quiz', KNOW_HOW_PER_QUIZ_ANSWER, false)
        : state.ledger,
  };
}

export function recordQuizRound(state: ChronicleState, score: number): ChronicleState {
  return { ...state, quizBest: Math.max(state.quizBest ?? 0, score) };
}

// ---------------------------------------------------------------------------
// Eras and the end
// ---------------------------------------------------------------------------

function advanceEra(step: Step): Step {
  const state = step.state;
  const era = reachedEra(
    state.era,
    installedCount(state),
    knowHowEarned(state.ledger),
    trialsPassed(state),
    state.charter!.mode,
    standingOf(state.certifier),
    state.certifier.suspended
  );
  if (era === state.era) return step;
  const definition = eraById(era);
  let next: Step = {
    state: notice({ ...state, era }, 'era', `A new era: ${definition.label}`, eraBonusText(era)),
    commands: step.commands,
  };
  next = unlockTrigger(next, `era:${era}`);
  next = unlockNoteById(next, definition.noteId);
  return next;
}

export function eraBonusText(era: EraId): string {
  const bonus = eraById(era).bonus;
  const parts: string[] = [];
  if (bonus.reinvestment) parts.push(`reinvestment +${Math.round(bonus.reinvestment * 100)}%`);
  if (bonus.wear) parts.push(`wear x${bonus.wear}`);
  if (bonus.energy) parts.push(`energy x${bonus.energy}`);
  if (bonus.production) parts.push(`production x${bonus.production}`);
  if (bonus.qualityPenalty) parts.push(`quality +${-bonus.qualityPenalty}`);
  return parts.length ? `Bonus: ${parts.join(', ')}.` : 'New plans can be drawn up.';
}

export function nextEra(state: ChronicleState) {
  const current = eraById(state.era);
  return ERAS.find((era) => era.order === current.order + 1) ?? null;
}

/**
 * Everything the chronicle raised, handed back: a fire's stop is released and
 * owned incidents are resolved, so ending or abandoning never strands the plant.
 */
export function releaseHazards(state: ChronicleState): Step {
  const commands: ChronicleCommand[] = [];
  if (state.fire.active) commands.push({ type: 'resolve_fire' });
  for (const owned of state.ownedIncidents) {
    commands.push({ type: 'resolve_incident', incidentId: owned.incidentId });
    if (owned.kind === 'severe_rain') commands.push({ type: 'clear_weather' });
  }
  if (!commands.length) return { state, commands };
  return {
    state: {
      ...state,
      fire: { active: false, suppressing: false, resolveAtMinute: null },
      ownedIncidents: [],
    },
    commands,
  };
}

/**
 * An install a closing-shift snag pushed past the end can never be commissioned:
 * hand its fund back rather than leave it "installing" in a finished chronicle.
 */
export function settleUnfinishedInstalls(state: ChronicleState): ChronicleState {
  let settled = state;
  for (const progress of state.improvements) {
    if (progress.phase !== 'installing') continue;
    settled = notice(
      cancelInstall(settled, progress.id).state,
      'event',
      `${improvementById(progress.id)?.label ?? progress.id} not commissioned`,
      'The chronicle closed before the install could be commissioned, so its fund was refunded.'
    );
  }
  return settled;
}

function endIfDue(step: Step): Step {
  if (step.state.shift < chronicleShifts(step.state.charter)) return step;
  // The last crop year's return is filed with the close, and the reserve is counted.
  const filed = fileReturn(reviewQcRecord(step), true);
  step = {
    state:
      filed.state.governance.reserve.balance > 0
        ? leaveMarks(filed.state, ['reserve-kept'], 'reserve', 'close', 'chronicle')
        : filed.state,
    commands: filed.commands,
  };
  const released = releaseHazards(step.state);
  const settled = settleUnfinishedInstalls(released.state);
  // Decisions still open when the chronicle closes are dropped, not left to answer
  // afterwards: events, an upkeep shortfall, and forecasts a challenge or fire deferred.
  const state: ChronicleState = {
    ...settled,
    pendingEvents: [],
    followUps: [],
    upkeepShortfall: null,
    governance: { ...settled.governance, proposal: null, countdowns: [] },
    forecasts: released.state.forecasts.map((f) =>
      f.status === 'pending' ? { ...f, status: 'passed' as const } : f
    ),
  };
  const finalScore = currentScore(state);
  let next: Step = {
    state: notice(
      { ...state, status: 'ended', finalScore },
      'era',
      'The chronicle is complete',
      `Score ${finalScore.total}. You are as wise as ${finalScore.rank}. The valley came to call it ${millCharacter(state).title}.`
    ),
    // An incident raised on the closing shift (a lapsing default, say) would be
    // owned by a chronicle that has just released its hazards: nothing could
    // recover it from here, so the closing shift raises nothing.
    commands: [
      ...step.commands.filter((command) => command.type !== 'raise_incident'),
      ...released.commands,
    ],
  };
  next = unlockTrigger(next, 'chronicle_end');
  return next;
}

export function currentScore(state: ChronicleState): ScoreBreakdown {
  return scoreChronicle({
    charter: state.charter ?? {
      grain: 'cooperative',
      plant: 'overhauled',
      customers: 'loyal',
      fortune: 'kind',
      mode: 'historical',
    },
    trialMedals: state.trials.map((t) => (t.phase === 'passed' ? t.medal : null)),
    challengeMedals: state.challengeMedals.map((c) => c.medal),
    era: state.era,
    gradePoints: state.gradeHistory,
    trainingMode: state.trainingMode,
    standing: standingScore(state.certifier),
    longNight: longNightScore(state),
  });
}

/** Points for holding the front the mill did not choose (docs/CHRONICLE.md, system 21). */
export function longNightScore(state: Pick<ChronicleState, 'marks'>): number {
  return hasMark(state, 'held-intake') && hasMark(state, 'held-floor') ? LONG_NIGHT_SCORE : 0;
}

// ---------------------------------------------------------------------------
// Part three: standing orders (docs/CHRONICLE.md, systems 25-32)
// ---------------------------------------------------------------------------

function withGovernance(
  state: ChronicleState,
  governance: Partial<GovernanceState>
): ChronicleState {
  return { ...state, governance: { ...state.governance, ...governance } };
}

function installedIds(state: ChronicleState): string[] {
  return state.improvements.filter((p) => p.phase === 'installed').map((p) => p.id);
}

/**
 * Part three's changes to the parties. A ruling's changes are read back from
 * the event history; these have none, so each change to an organisation is
 * recorded with its cause for the Partners tab (`recentPartyChanges`).
 */
function applyRelationshipDeltas(
  state: ChronicleState,
  deltas: readonly RelationshipDelta[],
  cause: PartyChangeCause
): ChronicleState {
  let next = state;
  const recorded: PartyChangeRecord[] = deltas.flatMap(({ customer, delta }) =>
    delta !== 0 && state.stakeholders.some((party) => party.id === customer)
      ? [{ party: customer as StakeholderId, shift: state.shift, delta, cause }]
      : []
  );
  if (recorded.length)
    next = withGovernance(next, {
      partyChanges: bounded(
        [...(next.governance.partyChanges ?? []), ...recorded],
        MAX_PARTY_CHANGES
      ),
    });
  for (const { customer, delta } of deltas) {
    next = {
      ...next,
      customers: next.customers.map((c) =>
        customer === 'all' || c.id === customer
          ? { ...c, value: clampRelationship(c.value + delta) }
          : c
      ),
      stakeholders: next.stakeholders.map((party) =>
        party.id === customer ? { ...party, value: clampRelationship(party.value + delta) } : party
      ),
    };
  }
  return next;
}

/** 31. Autofill moves a share of this close's reinvestment into the co-op reserve. */
function autofillReserve(step: Step): Step {
  const state = step.state;
  const reserve = state.governance.reserve;
  if (!reserve.autofill) return step;
  const reinvested = state.ledger.sinceCloseFund.reinvestment ?? 0;
  const amount = Math.floor(Math.max(0, reinvested) * RESERVE_AUTOFILL_SHARE);
  if (amount <= 0) return step;
  return {
    state: withGovernance(
      { ...state, ledger: recordFund(state.ledger, 'reserve', -amount) },
      { reserve: { ...reserve, balance: reserve.balance + amount } }
    ),
    commands: step.commands,
  };
}

/** 30. Each close adds its recorded evidence to the crop year's tally. */
function tallyShift(step: Step, evidence: ShiftCloseEvidence): Step {
  const state = step.state;
  const metrics = evidence.report.metrics;
  const tally = state.governance.tally;
  const grade = evidence.report.grade;
  return {
    state: withGovernance(state, {
      tally: {
        ...tally,
        shifts: tally.shifts + 1,
        dispatchedKg: tally.dispatchedKg + Math.max(0, metrics.dispatchedKg ?? 0),
        qualityFailureKg: tally.qualityFailureKg + Math.max(0, metrics.qualityFailureKg ?? 0),
        energyCost: tally.energyCost + Math.max(0, metrics.energyCost ?? 0),
        gradePoints: grade ? [...tally.gradePoints, GRADE_POINTS[grade]] : tally.gradePoints,
        fundReinvested: tally.fundReinvested + (state.ledger.sinceCloseFund.reinvestment ?? 0),
      },
    }),
    commands: step.commands,
  };
}

/**
 * 30. The crop-year return, filed from the tally alone: nothing in it can be
 * edited, so the only figures the federation sees are the recorded ones. The
 * quota ratchets: a year that beat it becomes the next year's floor.
 */
function fileReturn(step: Step, final: boolean): Step {
  const state = step.state;
  const gov = state.governance;
  const tally = gov.tally;
  if (tally.shifts === 0) return step;
  const planned = state.charter?.mode !== 'sandbox';
  const quota = planned ? gov.quotaKg : null;
  // Judged on the figure the return files and prints, so it never reads
  // "16,200 kg dispatched against a quota of 16,200 kg. Quota missed by 0 kg."
  const met = quota === null ? null : Math.round(tally.dispatchedKg) >= quota;
  const following = planned && !final ? nextQuota(quota, tally.dispatchedKg) : null;
  const filed: CropYearReturn = {
    year: tally.year,
    shifts: tally.shifts,
    dispatchedKg: Math.round(tally.dispatchedKg),
    quotaKg: quota,
    met,
    nextQuotaKg: following,
    qualityFailureKg: Math.round(tally.qualityFailureKg),
    energyCost: Math.round(tally.energyCost),
    averageGrade: tally.gradePoints.length
      ? Math.round(
          (tally.gradePoints.reduce((sum, value) => sum + value, 0) / tally.gradePoints.length) * 10
        ) / 10
      : null,
    fundReinvested: Math.round(tally.fundReinvested),
    knowHowEarned: Math.round((knowHowEarned(state.ledger) - tally.knowHowStart) * 10) / 10,
    policies: { ...gov.policies },
    conditions: gov.conditions.map((c) => c.id),
  };
  let next: ChronicleState = withGovernance(state, {
    returns: [...gov.returns, filed],
    tally: emptyTally(tally.year + 1, knowHowEarned(state.ledger)),
    quotaKg: final ? gov.quotaKg : following,
  });
  const first = gov.returns.length === 0;
  const parts = [
    `${whole(filed.dispatchedKg)} kg dispatched in ${filed.shifts} shifts${quota !== null ? ` against a quota of ${whole(quota)} kg` : ''}.`,
  ];
  if (met === true) {
    next = applyRelationshipDeltas(
      { ...next, ledger: recordFund(next.ledger, 'federation', FEDERATION_PREMIUM) },
      [{ customer: 'federation', delta: QUOTA_RELATIONSHIP }],
      { kind: 'quota', met: true, year: filed.year }
    );
    next = withGovernance(next, {
      missedInRow: 0,
      conditions: next.governance.conditions.filter((c) => c.id !== 'behind-plan'),
    });
    parts.push(`Quota met: the federation pays ${FEDERATION_PREMIUM}.`);
  } else if (met === false) {
    next = applyRelationshipDeltas(next, [{ customer: 'federation', delta: -QUOTA_RELATIONSHIP }], {
      kind: 'quota',
      met: false,
      year: filed.year,
    });
    next = withGovernance(next, {
      missedInRow: next.governance.missedInRow + 1,
      conditions: next.governance.conditions.some((c) => c.id === 'behind-plan')
        ? next.governance.conditions
        : [...next.governance.conditions, { id: 'behind-plan', sinceShift: next.shift }],
    });
    next = leaveMarks(next, ['quota-missed'], 'return', `year-${filed.year}`, 'chronicle');
    parts.push(`Quota missed by ${whole(quota! - filed.dispatchedKg)} kg.`);
  }
  const raised = quota !== null && following !== null && following > quota;
  if (raised) {
    next = leaveMarks(next, ['quota-raised'], 'return', `year-${filed.year}`, 'chronicle');
    parts.push(`The federation raises next year’s quota to ${whole(following)} kg.`);
  } else if (following !== null) {
    parts.push(`Next year’s quota: ${whole(following)} kg.`);
  }
  next = notice(next, 'ledger', `Crop year ${filed.year + 1} return filed`, parts.join(' '));
  let result: Step = { state: next, commands: step.commands };
  if (first) result = unlockTrigger(result, 'first_return');
  if (raised) result = unlockTrigger(result, 'quota_raised');
  return result;
}

/** 25. What the standing policies do to the parties at each crop year's turn. */
function applyYearlyPolicies(step: Step): Step {
  let state = step.state;
  for (const ladder of POLICY_LADDER_IDS) {
    const rung = state.governance.policies[ladder];
    const deltas = rungOf(ladder, rung).yearly ?? [];
    if (deltas.length)
      state = applyRelationshipDeltas(state, deltas, { kind: 'policy', ladder, rung });
  }
  return state === step.state ? step : { state, commands: step.commands };
}

function whole(value: number): string {
  // Engine text is the canonical English record (presentation.ts translates it
  // for display), so its numbers are formatted in English too.
  return formatGrouped(Math.round(value), undefined, 'en');
}

/** 27, 28, 32. Conditions, countdowns and the administrator, read at each close. */
function closeGovernance(
  step: Step,
  previous: ChronicleState,
  deck: readonly ChronicleEventDefinition[]
): Step {
  let state = step.state;
  const gov = state.governance;
  // Conditions the plant raises and clears.
  const struck = state.forecasts.some(
    (f) =>
      f.kind === 'delayed_truck' &&
      f.status === 'struck' &&
      previous.forecasts.some((p) => p.id === f.id && p.status === 'pending')
  );
  const assessed = assessConditions({
    shift: state.shift,
    conditions: gov.conditions,
    streaks: gov.streaks,
    policies: gov.policies,
    austerity: state.austerity,
    installed: installedIds(state),
    delayedTruckStruck: struck,
    machineryRenewed: gov.machineryRenewed,
  });
  state = withGovernance(state, {
    conditions: assessed.conditions,
    streaks: assessed.streaks,
    machineryRenewed: assessed.machineryRenewed,
  });
  for (const id of assessed.raised) {
    const definition = STANDING_CONDITIONS[id];
    state = notice(
      state,
      'ledger',
      definition.label,
      `${capitalise(definition.effectText)}. To clear: ${definition.clearText}.`,
      id
    );
  }
  for (const id of assessed.cleared)
    state = notice(
      state,
      'ledger',
      `${STANDING_CONDITIONS[id].label}: cleared`,
      'Its effect has lifted.',
      id
    );

  // Red lines whose countdown has run out.
  for (const countdown of state.governance.countdowns) {
    if (countdown.dueShift > state.shift) continue;
    const line = RED_LINES.find(
      (candidate) =>
        candidate.party === countdown.party &&
        candidate.ladder === countdown.ladder &&
        candidate.rung === countdown.rung
    );
    state = withGovernance(state, {
      countdowns: state.governance.countdowns.filter((c) => c.id !== countdown.id),
    });
    if (!line || state.governance.policies[line.ladder] !== line.rung) continue;
    state = applyRelationshipDeltas(state, [{ customer: line.party, delta: BREAK_OFF_DELTA }], {
      kind: 'red-line',
      ladder: line.ladder,
      rung: line.rung,
    });
    state = withGovernance(state, {
      brokenOff: [...state.governance.brokenOff, redLineKey(line)],
    });
    state = leaveMarks(state, [line.mark], 'countdown', countdown.id, 'chronicle');
    state = notice(
      state,
      'event',
      `${partyNameOf(line.party)} acts on its warning`,
      `${capitalise(line.reason)}. Relationship ${BREAK_OFF_DELTA}.`,
      countdown.id
    );
  }

  // The administrator leaves, or arrives.
  const administration = state.governance.administration;
  if (administration && state.shift >= administration.untilShift) {
    // Only the grant it imposed is handed back; one the steward chose while it
    // stayed (Plans, say) is the steward's and stands.
    const imposed = Math.max(2, administration.previousDelegation);
    const restored = state.delegation === imposed;
    state = notice(
      withGovernance(
        { ...state, delegation: restored ? administration.previousDelegation : state.delegation },
        {
          administration: null,
          missedInRow: 0,
          conditions: state.governance.conditions.filter((c) => c.id !== 'administration'),
        }
      ),
      'era',
      'The administrator leaves',
      restored
        ? 'The mill’s policies are its own again, and the AI partner’s grant is back where it was.'
        : 'The mill’s policies are its own again, and the AI partner keeps the grant you set.'
    );
  } else if (
    !administration &&
    !hasMark(state, 'administered') &&
    !hasMark(state, 'administration-refused') &&
    !state.pendingEvents.some((p) => p.eventId === FEDERATION_ADMINISTRATOR_EVENT_ID) &&
    state.charter?.mode !== 'sandbox' &&
    state.shift < chronicleShifts(state.charter)
  ) {
    // D9: the federation offers its administrator, and the assembly accepts or
    // refuses it (ICA principle 4, autonomy and independence). Once a chronicle.
    const event = deck.find((candidate) => candidate.id === FEDERATION_ADMINISTRATOR_EVENT_ID);
    const cool = state.stakeholders.filter((party) => relationshipTier(party.value) === 'cool');
    const missed = state.governance.missedInRow >= ADMINISTRATION_MISSED_QUOTAS;
    if (event && (cool.length >= ADMINISTRATION_COOL_ORGANISATIONS || missed)) {
      const causes = administrationCauses(state, deck, missed);
      state = notice(
        state,
        'era',
        'Why the federation offers an administrator',
        (missed
          ? `The mill missed ${ADMINISTRATION_MISSED_QUOTAS} quotas in a row.`
          : `${cool.length} of the valley’s organisations have cooled on the mill.`) +
          (causes.length ? ` Brought by: ${causes.join('; ')}.` : '')
      );
      state = appearEvent({ state, commands: [] }, event).state;
    }
  }
  return { state, commands: step.commands };
}

/**
 * 32. The assembly accepted the federation's administrator: for four shifts the
 * policies are held, upkeep is x1.1 and the AI partner acts at Forecasts or above.
 */
function startAdministration(previous: ChronicleState): ChronicleState {
  let state = previous;
  if (state.governance.administration) return state;
  const cool = state.stakeholders.filter((party) => relationshipTier(party.value) === 'cool');
  const missed = state.governance.missedInRow >= ADMINISTRATION_MISSED_QUOTAS;
  const previousDelegation = state.delegation;
  // The locked policies take the steward's open proposal with them: say so.
  const setAside = state.governance.proposal
    ? ` The ${ladderById(state.governance.proposal.ladder).label.toLowerCase()} change before the assembly is set aside.`
    : '';
  // A running red-line warning is held for as long as the policies are locked.
  const waiting = state.governance.countdowns.length
    ? ' Running warnings wait until it leaves.'
    : '';
  state = withGovernance(
    { ...state, delegation: Math.max(2, state.delegation) as DelegationLevel },
    {
      administration: { untilShift: state.shift + ADMINISTRATION_SHIFTS, previousDelegation },
      proposal: null,
      // The locked policies cannot heed a running warning, so it waits as long:
      // the steward has the same shifts to move off once the administrator leaves.
      countdowns: state.governance.countdowns.map((countdown) => ({
        ...countdown,
        dueShift: countdown.dueShift + ADMINISTRATION_SHIFTS,
      })),
      conditions: [
        ...state.governance.conditions,
        { id: 'administration', sinceShift: state.shift },
      ],
    }
  );
  state = leaveMarks(state, ['administered'], 'administration', 'arrived', 'chronicle');
  return notice(
    state,
    'era',
    'The federation sends an administrator',
    (missed
      ? `The mill missed ${ADMINISTRATION_MISSED_QUOTAS} quotas in a row. For ${ADMINISTRATION_SHIFTS} shifts its policies are locked, upkeep is x1.1 and the AI partner acts at Forecasts or above. Then it leaves.`
      : `${cool.length} of the valley’s organisations have cooled on the mill. For ${ADMINISTRATION_SHIFTS} shifts its policies are locked, upkeep is x1.1 and the AI partner acts at Forecasts or above. Then it leaves.`) +
      setAside +
      waiting
  );
}

/**
 * What brought the federation's offer, named in its notice (report 08, F6):
 * the returns that missed, or the rulings and standing effects that cooled
 * each cool organisation, newest first.
 */
function administrationCauses(
  state: ChronicleState,
  deck: readonly ChronicleEventDefinition[],
  missed: boolean
): string[] {
  if (missed)
    return state.governance.returns
      .filter((filed) => filed.met === false)
      .slice(-ADMINISTRATION_MISSED_QUOTAS)
      .map((filed) => `the crop year ${filed.year + 1} return`);
  const causes: string[] = [];
  for (const party of state.stakeholders) {
    if (relationshipTier(party.value) !== 'cool') continue;
    for (const change of recentPartyChanges(state, party.id, deck)) {
      if (change.delta >= 0) continue;
      let cause: string | null = null;
      if ('eventId' in change) {
        const event = deck.find((candidate) => candidate.id === change.eventId);
        const choice = event?.choices.find((candidate) => candidate.id === change.choiceId);
        if (event && choice) cause = `${event.title} (${choice.label.toLowerCase()})`;
      } else if (change.cause.kind === 'quota') {
        cause = `the crop year ${change.cause.year + 1} return`;
      } else {
        cause = `the ${ladderById(change.cause.ladder).label.toLowerCase()} policy`;
      }
      if (cause && !causes.includes(cause)) causes.push(cause);
    }
  }
  return causes;
}

function partyNameOf(id: StakeholderId): string {
  return capitalise(stakeholderPhrase(id));
}

/** 28. Warnings follow the policies: a crossed red line counts down; an uncrossed one is withdrawn. */
function refreshCountdowns(state: ChronicleState): ChronicleState {
  const gov = state.governance;
  const crossed = redLinesCrossed(gov.policies);
  let next = state;
  for (const countdown of gov.countdowns) {
    if (crossed.some((line) => line.party === countdown.party && line.ladder === countdown.ladder))
      continue;
    next = withGovernance(next, {
      countdowns: next.governance.countdowns.filter((c) => c.id !== countdown.id),
    });
    next = notice(
      next,
      'event',
      `${partyNameOf(countdown.party)} withdraws its warning`,
      `The ${ladderById(countdown.ladder).label.toLowerCase()} policy has moved off ${rungOf(countdown.ladder, countdown.rung).label.toLowerCase()}.`
    );
  }
  for (const line of crossed) {
    if (next.governance.countdowns.some((c) => c.party === line.party && c.ladder === line.ladder))
      continue;
    if (next.governance.brokenOff.includes(redLineKey(line))) continue;
    const sequence = next.sequence + 1;
    const dueShift = next.shift + COUNTDOWN_SHIFTS;
    next = withGovernance(
      { ...next, sequence },
      {
        countdowns: [
          ...next.governance.countdowns,
          {
            id: `countdown-${sequence}`,
            party: line.party,
            ladder: line.ladder,
            rung: line.rung,
            dueShift,
          },
        ],
      }
    );
    next = notice(
      next,
      'forecast',
      `${partyNameOf(line.party)}: ${COUNTDOWN_SHIFTS} shifts`,
      `${capitalise(line.reason)}. Unless the ${ladderById(line.ladder).label.toLowerCase()} policy moves off ${rungOf(line.ladder, line.rung).label.toLowerCase()} within ${COUNTDOWN_SHIFTS} shifts, it will act: relationship ${BREAK_OFF_DELTA}.`,
      `countdown-${sequence}`
    );
  }
  return next;
}

/** The cost of putting a change to the assembly. */
export const POLICY_COST: Cost = { knowHow: POLICY_KNOW_HOW };

/** Why a ladder cannot move to this step now, or null if it can be proposed. */
export function policyBlockReason(
  state: ChronicleState,
  ladder: PolicyLadder,
  to: PolicyRung
): string | null {
  const gov = state.governance;
  if (state.status !== 'active') return 'the chronicle is not running';
  if (gov.administration) return 'the administrator has locked the policies';
  const from = gov.policies[ladder];
  if (Math.abs(to - from) !== 1) return 'one step at a time';
  const locked = shiftsUntilUnlocked(gov, ladder, state.shift);
  // A warning counting down on this step can be heeded at once: the lock lasts as
  // long as the countdown, so it would hold the policy until the close that acts.
  const heeding = gov.countdowns.some((c) => c.ladder === ladder && c.rung === from);
  if (locked > 0 && !heeding)
    return `changed lately: ${locked} ${locked === 1 ? 'shift' : 'shifts'} more`;
  const plan = rungOf(ladder, to).requiresPlan;
  if (plan && !state.improvements.some((p) => p.id === plan && p.phase === 'installed'))
    return `needs ${improvementById(plan)?.label ?? plan}`;
  if (gov.proposal) return 'a change is already before the assembly';
  if (!canAfford(state, POLICY_COST)) return `needs ${POLICY_KNOW_HOW} know-how`;
  return null;
}

/** How the assembly stands on the open proposal. */
export function proposalStanding(state: ChronicleState) {
  const proposal = state.governance.proposal;
  if (!proposal) return null;
  const ballots = assemblyBallots(state.governance, proposal);
  return { proposal, ballots, ...assemblyCount(ballots, tieCarries(state.governance, proposal)) };
}

function adoptProposal(state: ChronicleState): Step {
  const gov = state.governance;
  const proposal = gov.proposal;
  if (!proposal) return { state, commands: [] };
  const ballots = assemblyBallots(gov, proposal);
  const count = assemblyCount(ballots, tieCarries(gov, proposal));
  // A change carried by a concession still has to be paid for when it is adopted.
  if (!count.carried || !canAfford(state, POLICY_COST)) return { state, commands: [] };
  // The know-how is booked as policy.
  let next: ChronicleState = {
    ...state,
    ledger: recordKnowHow(state.ledger, 'policies', -POLICY_KNOW_HOW),
  };
  const outvoted = outvotedNeeds(gov.crew, proposal.ladder, proposal.to, proposal.concessions);
  const lifted = gov.objections.filter(
    (objection) => objection.ladder === proposal.ladder && objection.rung !== proposal.to
  );
  next = withGovernance(next, {
    policies: { ...gov.policies, [proposal.ladder]: proposal.to },
    changedShift: { ...gov.changedShift, [proposal.ladder]: next.shift },
    proposal: null,
    objections: [
      ...gov.objections.filter((objection) => !lifted.includes(objection)),
      ...outvoted.map((member) => ({
        memberId: member.id,
        ladder: proposal.ladder,
        rung: proposal.to,
        raisedShift: next.shift,
      })),
    ],
  });
  if (outvoted.length)
    next = leaveMarks(next, ['crew-overruled'], 'assembly', proposal.ladder, 'player');
  const ladder = ladderById(proposal.ladder);
  const parts = [
    `Carried ${count.for} to ${count.against}${count.abstain ? `, ${count.abstain} abstaining` : ''}. ${ladder.label}: ${rungOf(proposal.ladder, proposal.to).label.toLowerCase()} (${rungOf(proposal.ladder, proposal.to).effectText}).`,
  ];
  // A tie carries only a move rule 4 needs (tieCarries); say which, so a
  // "Carried 1 to 1" never reads as a miscount.
  if (count.for === count.against) {
    const reason = tieCarryReason(gov, proposal);
    if (reason === 'red-line')
      parts.push('The tie carries it: the move leaves a step an organisation has warned against.');
    else if (reason === 'condition')
      parts.push(
        'The tie carries it: the move leaves the step a standing condition needs left to clear.'
      );
  }
  for (const member of outvoted)
    parts.push(
      `The ${member.role.toLowerCase()} was outvoted on ${member.need.text}; the objection stands.`
    );
  for (const objection of lifted) {
    const member = gov.crew.find((m) => m.id === objection.memberId);
    if (member) parts.push(`The ${member.role.toLowerCase()}’s objection is lifted.`);
  }
  next = notice(
    next,
    'event',
    `The assembly carries the ${ladder.label.toLowerCase()} change`,
    parts.join(' ')
  );
  next = refreshCountdowns(next);
  return unlockTrigger({ state: next, commands: [] }, 'assembly_vote');
}

/**
 * A change a met need carried while the mill could not pay for it waits for its
 * price; each close brings know-how, so it is
 * adopted at the first close that can pay. Nothing else would ever adopt it:
 * its concessions are spent, and the steward could only withdraw it.
 */
function adoptCarriedProposal(step: Step): Step {
  const state = step.state;
  if (!state.governance.proposal || state.shift >= chronicleShifts(state.charter)) return step;
  if (state.governance.administration) return step;
  const adopted = adoptProposal(state);
  return adopted.state === state
    ? step
    : { state: adopted.state, commands: [...step.commands, ...adopted.commands] };
}

/**
 * 25, 26. Put one step on one ladder to the members' assembly. Their values
 * decide their votes; a carried change is adopted at once, and one that falls
 * stays open for the steward to meet needs, or to withdraw.
 */
export function proposePolicy(state: ChronicleState, ladder: PolicyLadder, to: PolicyRung): Step {
  if (policyBlockReason(state, ladder, to) !== null) return { state, commands: [] };
  const from = state.governance.policies[ladder];
  const proposal = {
    ladder,
    from,
    to,
    proposedShift: state.shift,
    concessions: [] as CrewRoleId[],
  };
  const opened = withGovernance(state, { proposal });
  const adopted = adoptProposal(opened);
  if (adopted.state !== opened) return adopted;
  const count = assemblyCount(assemblyBallots(opened.governance, proposal));
  return unlockTrigger(
    {
      state: notice(
        opened,
        'event',
        `The assembly does not carry the ${ladderById(ladder).label.toLowerCase()} change`,
        `${count.for} for, ${count.against} against${count.abstain ? `, ${count.abstain} abstaining` : ''}. Meet a need another way, or withdraw it.`
      ),
      commands: [],
    },
    'assembly_vote'
  );
}

export function withdrawProposal(state: ChronicleState): ChronicleState {
  if (!state.governance.proposal) return state;
  return notice(
    withGovernance(state, { proposal: null }),
    'event',
    'Proposal withdrawn',
    'The policy stays where it was.'
  );
}

/** The fund a concession to this member costs, or null if none is open to them. */
export function concessionFor(
  state: ChronicleState,
  memberId: CrewRoleId
): { fund: number; text: string; kind: 'proposal' | 'objection' } | null {
  const gov = state.governance;
  const member = gov.crew.find((m) => m.id === memberId);
  if (!member) return null;
  const proposal = gov.proposal;
  if (
    proposal &&
    member.need.ladder === proposal.ladder &&
    member.need.rung === proposal.to &&
    !proposal.concessions.includes(member.id)
  )
    return { fund: member.need.fund, text: member.need.concession, kind: 'proposal' };
  if (gov.objections.some((o) => o.memberId === memberId))
    return { fund: member.need.fund, text: member.need.concession, kind: 'objection' };
  return null;
}

/**
 * Why a concession on the open proposal is refused before the money is spent,
 * or null (item 4.10; report 08, defect 2). It is refused when meeting every
 * need and objection the assembly has would still not carry the change; a
 * concession that is one of two needed is allowed. A standing objection can
 * always be met: lifting it changes every later vote.
 */
export function concessionBlockReason(state: ChronicleState, memberId: CrewRoleId): string | null {
  const concession = concessionFor(state, memberId);
  const proposal = state.governance.proposal;
  if (!concession || concession.kind !== 'proposal' || !proposal) return null;
  const open = state.governance.crew
    .filter((member) => concessionFor(state, member.id)?.kind === 'proposal')
    .map((member) => member.id);
  const everyNeedMet = { ...proposal, concessions: [...proposal.concessions, ...open] };
  const ballots = assemblyBallots({ crew: state.governance.crew, objections: [] }, everyNeedMet);
  return assemblyCount(ballots, tieCarries(state.governance, proposal)).carried
    ? null
    : 'meeting every need would still not carry it';
}

/**
 * Meet a member's need another way: on an open proposal it turns their vote
 * to an abstention; on a standing objection it lifts it. Either way it is paid
 * for and written in the record.
 */
export function meetNeed(state: ChronicleState, memberId: CrewRoleId): Step {
  if (state.status !== 'active') return { state, commands: [] };
  const concession = concessionFor(state, memberId);
  if (!concession) return { state, commands: [] };
  if (concessionBlockReason(state, memberId) !== null) return { state, commands: [] };
  const cost = { fund: concession.fund };
  if (!canAfford(state, cost)) return { state, commands: [] };
  const member = state.governance.crew.find((m) => m.id === memberId)!;
  let next = {
    ...state,
    ledger: recordFund(state.ledger, 'concessions', -price(state, concession.fund)),
  };
  next = leaveMarks(next, ['crew-concession'], 'assembly', memberId, 'player');
  if (concession.kind === 'proposal') {
    const proposal = next.governance.proposal!;
    next = withGovernance(next, {
      proposal: { ...proposal, concessions: [...proposal.concessions, memberId] },
    });
    next = notice(
      next,
      'event',
      `The ${member.role.toLowerCase()}’s need is met`,
      `${capitalise(member.need.concession)}: their need for ${member.need.text} is met another way, and they abstain.`
    );
    const adopted = adoptProposal(next);
    return adopted.state !== next ? adopted : { state: next, commands: [] };
  }
  next = withGovernance(next, {
    objections: next.governance.objections.filter((o) => o.memberId !== memberId),
  });
  next = notice(
    next,
    'event',
    `The ${member.role.toLowerCase()}’s objection is met`,
    `${capitalise(member.need.concession)}: their need for ${member.need.text} is met another way, and the objection is lifted.`
  );
  // Lifting an objection can carry the change before the assembly.
  if (next.governance.proposal) {
    const adopted = adoptProposal(next);
    if (adopted.state !== next) return adopted;
  }
  return { state: next, commands: [] };
}

/** 29. The brief the AI partner works to. Free to set; it changes how it rules, not what it may do. */
export function setBrief(state: ChronicleState, brief: BriefId): Step {
  if (state.status !== 'active' || state.governance.brief === brief) return { state, commands: [] };
  const definition = BRIEFS.find((b) => b.id === brief);
  const next = notice(
    withGovernance(state, { brief }),
    'initiative',
    `The AI partner’s brief: ${briefLabel(brief).toLowerCase()}`,
    `It ${definition?.rule ?? 'rules as briefed'}.`
  );
  return unlockTrigger({ state: next, commands: [] }, 'brief_set');
}

/**
 * The shift the engine prices a timed modifier and an incident against: the
 * plant as the Chronicle probe measured it (item 4.1, measuredPlant.ts). Was
 * 2,200 and 220, from the 2026-10-24 measurement at the 180x pace.
 */
export const REFERENCE_SHIFT_NET = MEASURED_PLANT.shiftNet;
export const REFERENCE_SHIFT_ENERGY_COST = MEASURED_PLANT.shiftEnergyCost;

/**
 * What one point of forecast chance is worth, at the price the engine itself
 * charges for relief: the mean of each forecast's mitigation cost over the
 * chance it takes off.
 */
export const FORECAST_CHANCE_PRICE =
  Object.values(FORECASTS).reduce((sum, f) => sum + f.mitigationCost / f.mitigationRelief, 0) /
  Object.values(FORECASTS).length;

/**
 * The shifts an incident is priced over. Nothing in `INCIDENT_DEFINITIONS`
 * gives a duration: an incident runs until someone acknowledges and mitigates
 * it. One shift at its full effect is what an attentive player pays; an absent
 * one pays more, so this is the lower bound (report 07, F6).
 */
export const INCIDENT_PRICED_SHIFTS = 1;

/**
 * What an incident costs in fund, from what it does in the plant: the share of
 * the shift's output it stops (its production multiplier, the trucks' speed
 * where it slows them, all of it where it blocks dispatch) and its energy
 * multiplier, through the reinvested reference shift as a timed modifier is.
 * Its quality points have no fund rate and are not priced.
 */
export function incidentFundCost(kind: IncidentKind): number {
  const effect = INCIDENT_DEFINITIONS[kind].effect;
  const output = effect.dispatchBlocked
    ? 0
    : Math.min(effect.productionMultiplier, effect.vehicleSpeedMultiplier);
  const net = REFERENCE_SHIFT_NET * CURRENCY_TO_FUND;
  return (
    ((1 - output) * net +
      (effect.energyMultiplier - 1) * REFERENCE_SHIFT_ENERGY_COST * CURRENCY_TO_FUND) *
    REINVESTMENT_SHARE *
    INCIDENT_PRICED_SHIFTS
  );
}

/**
 * An answer's worth in fund, by the engine's own rates: fund at its price,
 * know-how at the forced-maintenance rate, a timed modifier through the shift
 * it would change (production and energy through the reinvested net,
 * reinvestment through the net, forecast chance at the price of relief), and an
 * incident it raises at `incidentFundCost`. Wear, quality, standing,
 * relationships and marks have no fund rate in the engine, so they are not
 * priced here; the deck test compares them as they are
 * (`__tests__/eventValue.test.ts`).
 */
export function choiceFundValue(state: ChronicleState, choice: ChronicleEventChoice): number {
  const { effect } = effectiveChoice(state, choice);
  const net = REFERENCE_SHIFT_NET * CURRENCY_TO_FUND;
  let value =
    (effect.fund ?? 0) -
    price(state, choice.cost?.fund ?? 0) +
    ((effect.knowHow ?? 0) - (choice.cost?.knowHow ?? 0)) * FORCED_FUND_PER_KNOW_HOW;
  if (effect.incident) value -= incidentFundCost(effect.incident);
  const modifier = effect.modifier;
  if (modifier) {
    const shifts = Math.max(1, modifier.shifts);
    value += ((modifier.production ?? 1) - 1) * net * REINVESTMENT_SHARE * shifts;
    value +=
      (1 - (modifier.energy ?? 1)) *
      REFERENCE_SHIFT_ENERGY_COST *
      CURRENCY_TO_FUND *
      REINVESTMENT_SHARE *
      shifts;
    value +=
      ((modifier.reinvestment ?? 0) / AUTHORED_REINVESTMENT_SHARE) *
      net *
      REINVESTMENT_SHARE *
      shifts;
    value -=
      (modifier.forecastChance ?? 0) * FORECAST_ISSUE_CHANCE * shifts * FORECAST_CHANCE_PRICE;
    value -= ((modifier.upkeep ?? 1) - 1) * BASE_UPKEEP * shifts;
    // The temper card's drying (plan item 7.7): what it keeps off the books is
    // credited to the fund in full, as a plan's avoided cost is ('drying'), so
    // it is valued at the full rate, not the share (review 2, finding 2).
    value +=
      (1 - (modifier.dryingEnergy ?? 1)) *
      REFERENCE_DRYING_COST *
      CURRENCY_TO_FUND *
      AVOIDED_COST_RATE *
      shifts;
  }
  return Math.round(value);
}

/** What an answer offers, as the briefs weigh it. */
function weighChoice(state: ChronicleState, choice: ChronicleEventChoice) {
  const { effect } = effectiveChoice(state, choice);
  const deltas = relationshipDeltas(effect);
  return {
    // The fund as it stands after the answer: "Thrift" leaves the most in it.
    fundNet: (effect.fund ?? 0) - price(state, choice.cost?.fund ?? 0),
    knowHowCost: choice.cost?.knowHow ?? 0,
    standing: (effect.standing ?? 0) - (effect.suspend ? 500 : 0) + (effect.reinstate ? 200 : 0),
    neighbourly: deltas
      .filter(
        (d) => d.customer === 'growers' || d.customer === 'village' || d.customer === 'haulier'
      )
      .reduce((sum, d) => sum + d.delta, 0),
    leanings: (effect.marks ?? []).flatMap((id) =>
      MARKS[id]?.leaning ? [MARKS[id].leaning!] : []
    ),
  };
}

/**
 * The answer the AI partner takes on a routine event under its brief. The
 * conventional brief takes the cheapest recommended answer; the others weigh
 * the answers it can take and fall back to that when they have no view.
 */
export function partnerChoice(
  state: ChronicleState,
  event: ChronicleEventDefinition
): ChronicleEventChoice | null {
  const conventional =
    event.choices
      .filter((c) => c.aiRecommended && choiceAvailable(state, c))
      .sort((a, b) => (a.cost?.fund ?? 0) - (b.cost?.fund ?? 0))[0] ??
    event.choices.find((c) => c.id === event.defaultChoiceId) ??
    null;
  const brief = state.governance.brief;
  if (brief === 'conventional') return conventional;
  let best: ChronicleEventChoice | null = null;
  let bestScore = -Infinity;
  const options = event.choices.filter(
    (c) => choiceAvailable(state, c) && canAfford(state, c.cost)
  );
  // The conventional answer wins ties, so a brief only departs from it for a reason.
  const ordered =
    conventional && options.includes(conventional)
      ? [conventional, ...options.filter((c) => c !== conventional)]
      : options;
  for (const choice of ordered) {
    const score = briefScore(brief, weighChoice(state, choice));
    if (score === null || score <= bestScore) continue;
    best = choice;
    bestScore = score;
  }
  return best ?? conventional;
}

/** 31. Autofill on or off. */
export function setReserveAutofill(state: ChronicleState, autofill: boolean): ChronicleState {
  if (state.status !== 'active' || state.governance.reserve.autofill === autofill) return state;
  return notice(
    withGovernance(state, { reserve: { ...state.governance.reserve, autofill } }),
    'ledger',
    autofill ? 'Reserve autofill on' : 'Reserve autofill off',
    autofill
      ? `${Math.round(RESERVE_AUTOFILL_SHARE * 100)}% of each shift’s reinvestment goes to the co-op reserve.`
      : 'Reinvestment stays in the fund.'
  );
}

/** 31. Put fund into the indivisible reserve. It comes back only to cover upkeep. */
export function depositReserve(state: ChronicleState): ChronicleState {
  if (state.status !== 'active' || fundOf(state) < RESERVE_DEPOSIT) return state;
  return withGovernance(
    { ...state, ledger: recordFund(state.ledger, 'reserve', -RESERVE_DEPOSIT) },
    {
      reserve: {
        ...state.governance.reserve,
        balance: state.governance.reserve.balance + RESERVE_DEPOSIT,
      },
    }
  );
}

export { IMPROVEMENTS, CUSTOMERS, trialById };
