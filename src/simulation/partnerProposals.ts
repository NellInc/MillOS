/**
 * The partner proposes; the player decides; the record shows who was right
 * (plan item 3.0, "The card is the lever").
 *
 * A floor decision arrives as the AI partner's proposal: two or more answers,
 * each priced, one marked as the partner's choice, and a window on the game
 * clock. An answer the player gives runs. A window that closes unanswered
 * runs the partner's choice. An hour later the record prices every answer
 * again, with the same function that priced the buttons, on what the plant
 * did meanwhile.
 *
 * This file is pure: no store reads, no clock, no Math.random. The plant is
 * handed in as plain facts (`PlantWorld`); what an answer does is returned as
 * data (`ProposalEffect`) for the runtime (systems/partnerProposalRuntime.ts)
 * to carry out. A new kind is one entry in `PROPOSAL_KINDS`: its facts type in
 * `ProposalFactsByKind`, how it is raised, its options, its pricing, what each
 * option does, how the plant answers it without the card, and what an hour
 * later measures. Any chance a kind needs is seeded through `seededUnit`.
 */

import { dispatchKind, sanitizeDispatchFacts, type DispatchFacts } from './dispatchProposal';
import type { CropAttributes } from '../chronicle/types';
import { intakeKind, sanitizeIntakeFacts, type IntakeFacts } from './intakeProposal';
import { sanitizeTemperFacts, temperKind, type TemperFacts } from './temperProposal';
import type { TemperOptionId } from '../chronicle/types';
import {
  incidentKind,
  sanitizeIncidentFacts,
  type IncidentFacts,
  type IncidentWorldEntry,
} from './incidentProposal';

/** Parts named as breakdownStore's PartsInventory names them. */
export type PartName = 'bearings' | 'belts' | 'filters' | 'motors' | 'sensors';

/**
 * What one answer costs. Only what the plant books or measures today: money
 * the tick charges (a work order's hours), parts, kilograms, minutes and the
 * product stamp. Line time is not priced: measured, it costs this plant
 * nothing (plan, "Which levers bind").
 */
export interface OptionPrice {
  /** Money the plant would book for this answer; never negative. */
  currency: number;
  /** Spare parts this answer uses. */
  parts: Partial<Record<PartName, number>>;
  /** Kilograms this answer commits (programme) or leaves waiting at the dock (hold). */
  kg: number;
  /**
   * Game minutes this answer holds the plant's commitments back. The dock sets
   * this plant's tonnes, so a programme held an hour ships an hour later.
   */
  minutes: number | null;
  /** The lowest product stamp this answer leads to; null where it changes none. */
  quality: number | null;
  /** True when that stamp falls below the strictest open order's minimum. */
  gradeRisk: boolean;
  /**
   * Game minutes this answer takes a unit offline (a service, a repair). The
   * plant has spare capacity, so they are shown and never ranked: measured,
   * an outage of any unit costs no tonnes (plan, "Which levers bind").
   */
  offlineMinutes?: number;
  /** Game minutes before this answer starts (a service at the next quiet spell). */
  waitMinutes?: number;
  /** The open orders' minimums the stamp falls below, strictest first. */
  belowMinimums?: number[];
  /** Orders this answer would make late (the early programme, plan wave 3d). */
  lateOrders?: number;
  /**
   * Late deliveries its own schedule projects (the early programme): the
   * shift's grade allows none for an A, one for a B, two for a C.
   */
  lateDeliveries?: number;
  /**
   * What this answer nets, signed, in the ledger's money: the measured margin
   * on the kilograms it adds less the late charges and forfeits it brings.
   */
  net?: number;
  /**
   * Why this answer cannot run as things stand, in the refusal's own terms:
   * 'no-part' for a service with no free part (it is refused, and offered
   * again when a part arrives).
   */
  held?: 'no-part';
  /**
   * A seeded chance that this answer delays the next grain truck (intake's
   * refusal): the chance and the minutes. Its expected minutes are in
   * `minutes` where the plant is short of wheat until that truck.
   */
  truckDelay?: { chance: number; minutes: number };
}

export type ProposalDecider = 'operator' | 'agent' | 'partner';
export type ProposalStatus = 'open' | 'resolved' | 'withdrawn';
export type Delegation = 'ask' | 'decide';

// ---------------------------------------------------------------------------
// Windows, in game minutes. The campaign clock is game time: P holds it and
// pace scales it, so a window is the same game minutes at every pace.
// ---------------------------------------------------------------------------

/**
 * A programme offer waits 24 game minutes: 48 real seconds at the standard
 * pace (30 game seconds a second). Due times are set when it is accepted, so
 * a window closed unanswered never makes an order late.
 */
export const PROGRAMME_WINDOW_MINUTES = 24;
/** A held programme is offered again an hour later: about one truck's turn at the dock. */
export const PROGRAMME_HOLD_MINUTES = 60;
/**
 * A wear prediction's service waits 30 game minutes (60 real seconds at the
 * standard pace). A unit takes about 13 game hours from its warning to its
 * failure (roller mill, 60 to 90 wear at 0.0005 a game second and full load),
 * so the window costs nothing. The service itself takes the unit offline
 * (D7), which this plant's spare capacity absorbs.
 */
export const SERVICE_WINDOW_MINUTES = 30;
/** One game hour after an answer the record prices both answers again. */
export const COMPARISON_DELAY_MINUTES = 60;
/**
 * Settled proposals kept once their record is written (compared or withdrawn):
 * the record lives in the campaign log and the shift review, so the store keeps
 * only a short tail. A resolved proposal still waiting for its comparison is
 * never dropped. Each weighs about 0.9 K characters in the save.
 */
export const MAX_RESOLVED_PROPOSALS = 12;
/**
 * Subjects (`kind:subject`) of settled proposals that left that tail, kept so a
 * prediction answered "run on" is never asked again. About 30 characters each.
 */
export const MAX_SETTLED_SUBJECTS = 100;

// ---------------------------------------------------------------------------
// Facts each kind is raised on (a plain snapshot, saved with the proposal)
// ---------------------------------------------------------------------------

export interface ProgrammeFacts {
  /** The programme accepting it would start (2 for the first after the guided one). */
  programmeNumber: number;
  /** The programme count when offered; acceptance anywhere advances it. */
  programmeCount: number;
  /** The ask: 1 for the first offer, one more each time it is held and offered again. */
  ask: number;
  committedKg: number;
  /** Revenue its orders pay in full, on time and in spec. */
  revenue: number;
  /** Game minutes from acceptance to its first due time. */
  firstDueMinutes: number;
  /** Released finished stock on hand that its orders would take. */
  stockReadyKg: number;
  holdMinutes: number;
}

export interface ServiceFacts {
  machineId: string;
  machineName: string;
  /** The wear prediction this answers (breakdownStore predictive alert id). */
  alertId: string;
  wear: number;
  breakdownWear: number;
  /** Wear a game minute at the unit's present load (the tick's own rate). */
  wearPerMinute: number;
  /** The part Maintain takes (breakdownStore servicePart); null when none is free. */
  servicePart: PartName | null;
  /** The parts the predicted failure's work order requires. */
  failureParts: PartName[];
  /** Game minutes a work order stays open for the failure's repair. */
  repairMinutes: number;
  /** What an open work order costs a game hour (MAINTENANCE_COST_PER_WORK_ORDER_HOUR). */
  workOrderRatePerHour: number;
  /** The product stamp with this unit serviced (the tick's productPathQuality). */
  qualityServiced: number;
  /** The product stamp with this unit just short of its failure. */
  qualityAtFailure: number;
  /** The highest recipe minimum among open orders; null with none open. */
  strictestMinimum: number | null;
  /** Each open order's recipe minimum, strictest first (absent on a proposal from before it). */
  openMinimums?: number[];
  /** What the service part costs to replace (breakdownStore PART_PRICE). */
  servicePartPrice?: number;
  /** What the failure's parts cost to replace. */
  failurePartsPrice?: number;
  /** Game minutes the service takes the unit offline (productionStore serviceMinutes). */
  serviceMinutes?: number;
  /**
   * Game minutes to the next quiet spell (the line idle, everything owed
   * packed): 0 when quiet now, null when nothing is packing to finish.
   */
  minutesToQuiet?: number | null;
  /** Offered again because a part arrived after it could not run for want of one. */
  reoffered?: boolean;
  /** What the earlier ask could not run for, when it was offered again: absent reads 'no-part'. */
  reofferedAfter?: 'stopped' | 'no-part';
}

/** An order of the offered programme, due relative to taking it (plan item 3.7). */
export interface CommitmentOrder {
  kg: number;
  dueInMinutes: number;
  priority: 'normal' | 'high' | 'critical';
  product: 'flour' | 'semolina';
  /** Its late rate, money a kilogram a game hour (the ledger's); absent before plan wave 3d. */
  latePerKgHour?: number;
}

/**
 * The next programme offered while one is still open (plan item 3.7): take it
 * now, beside the running one, or wait until every order of it has closed.
 */
export interface CommitmentFacts {
  programmeNumber: number;
  /** The programme count when offered; acceptance anywhere advances it. */
  programmeCount: number;
  ask: number;
  committedKg: number;
  revenue: number;
  /** The offered programme's orders, due relative to taking it. */
  orders: CommitmentOrder[];
  /**
   * Late order-minutes taking it now adds, projected on the dock as it stands
   * (projectDock): 0 when the dock has the slack to carry it all on time.
   */
  lateMinutes: number;
  holdMinutes: number;
  /**
   * The dock the price is read on, the game minute it was read and the minute
   * the offer counts as taken (plan wave 3d): the take button and the record an
   * hour on both price from these through projectDock. Absent on a proposal
   * from before, which is priced from `lateMinutes` alone.
   */
  dock?: DockState;
  atMinute?: number;
  takenAtMinute?: number;
}

/**
 * An order the line cannot make, now overdue (plan item 3.7): forfeit it now,
 * or keep it open to its lateness bound, when it is forfeited anyway.
 */
export interface ForfeitFacts {
  orderId: string;
  customer: string;
  minimum: number;
  /** The best stamp the line can make on the order's grain. */
  best: number;
  lackingKg: number;
  /** Its late rate, a kilogram a game hour. */
  latePerKgHour: number;
  /** Game minutes to its lateness bound (FORFEIT_LATENESS_MINUTES past due). */
  minutesToBound: number;
  /** The fee a forfeit books, now or at the bound. */
  fee: number;
}

/** Each kind's facts. A new kind adds its key here and an entry to PROPOSAL_KINDS. */
export interface ProposalFactsByKind {
  programme: ProgrammeFacts;
  service: ServiceFacts;
  /** Plan item 3.4: src/simulation/dispatchProposal.ts. */
  dispatch: DispatchFacts;
  /** Plan item 3.7: the next programme taken early. */
  commitment: CommitmentFacts;
  /** Plan item 3.7: an order the line cannot make, forfeited before its bound. */
  forfeit: ForfeitFacts;
  /** Plan item 3.1: a lot at the intake under a charter (src/simulation/intakeProposal.ts). */
  intake: IntakeFacts;
  /** Plan item 3.5: two answers to an incident (src/simulation/incidentProposal.ts). */
  incident: IncidentFacts;
  /** Plan item 7.7: how a wet year's wheat is tempered (src/simulation/temperProposal.ts). */
  temper: TemperFacts;
}
export type ProposalKind = keyof ProposalFactsByKind;
export const PROPOSAL_KIND_IDS: readonly ProposalKind[] = [
  'programme',
  'service',
  'dispatch',
  'commitment',
  'forfeit',
  'intake',
  'incident',
  'temper',
];

/**
 * Which kinds the partner asks about, by the rule (plan, item 2 of the closing
 * brief): a kind's default is "ask me" only if the ten-shift harness has one
 * arm where the answer that is not the partner's came out better and one where
 * it came out worse, by the record's own comparison (`compareProposal`);
 * otherwise "decide and tell me", where the partner acts and says what the
 * other answer would have cost. The player can switch any kind back to "ask".
 * Each entry names the harness arms (plantMeasure.playtest.test.ts, the
 * MILLOS_PLANT_ASK_OUT block, which checks every claim here, the null ones
 * included: null means no arm of that block found it) or null. Labels with
 * 'floor:' are checked in plantFloor.playtest.test.ts; `incident` is read per
 * incident kind (INCIDENT_DELEGATION_EVIDENCE), and its kind-level nulls are
 * not checked.
 *
 * A kind whose record is fixed by arithmetic (`judged` false: programme,
 * service, forfeit) has no record evidence either way, so both labels are
 * null and it is decided. What its other answer costs is measured on arm
 * totals instead (`armWorse`: that arm nets less than `against`, where the
 * partner's answer runs), which can come out either way. Corrected 13
 * November (review 2): the "78 of 78" and "8 of 8" records once cited here
 * were that arithmetic, not a measurement.
 */
export const DELEGATION_EVIDENCE: Record<
  ProposalKind,
  {
    otherBetter: string | null;
    otherWorse: string | null;
    armWorse?: { arm: string; against: string };
  }
> = {
  // Held every time, no programme is taken after the guided one: 8 t shipped
  // and net -1,477 over ten shifts, against arm p's 209.5 t and 42,593.
  programme: {
    otherBetter: null,
    otherWorse: null,
    armWorse: { arm: 'p-programme-hold', against: 'p' },
  },
  // "Run on" every time: four breakdowns, grades AAAABBBBDD, net 25,348
  // against arm p's ten A and 42,593.
  service: { otherBetter: null, otherWorse: null, armWorse: { arm: 'q', against: 'p' } },
  // Raised twice in ten shifts, and only where the line is never serviced
  // (arm q): held both times, the record ranked sending better both times,
  // and never ranked holding better. The arm held (q-dispatch-hold) ships
  // and nets exactly what q does, so neither answer moves the totals.
  dispatch: { otherBetter: null, otherWorse: 'q-dispatch-hold' },
  // Judged as the partner chooses (review 2): nothing late first, then net
  // over waiting. Answering every offer "wait" at demand 1, the record ranked
  // an answer other than the partner's 11 times in 88 (taking best 3, waiting
  // 84, one tie); always taking at demand 2, waiting was better in 14 of 14.
  // On arm totals, taking exactly when its price puts no order at risk nets
  // 44,615 against 38,507 never taking (+16%), none late, ten A. (Judged on
  // net alone, as before, the record called taking better 40 times in 88.)
  commitment: { otherBetter: 'commit-never d1', otherWorse: 'commit-eager d2' },
  // Keeping an order the line cannot make only runs up its late rate: kept
  // every time in the wet year, net 4,646 against 15,822 forfeiting.
  forfeit: {
    otherBetter: null,
    otherWorse: null,
    armWorse: { arm: 'p-wet-keep', against: 'p-wet' },
  },
  // Measured in plantFloor.playtest.test.ts (MILLOS_PLANT_INTAKE_OUT; labels
  // there carry 'floor:', and that file checks them): a sprouted year after a
  // sound one, twenty shifts. The partner reads each lot (intakeKind
  // chooseDefault), and the record ranked another answer above its choice 3
  // times of 84 when left to it ('s-partner'), and its choice best 77 of 77
  // compared when the player accepted every lot ('s-accept'). So intake is
  // asked. Asking has a cost: a lot waits out its 10-minute window, and over
  // twenty shifts that cost 3,035 of net and 3 strong-white orders against
  // the same choices pressed at once ('s-partner-pressed').
  intake: { otherBetter: 'floor:s-partner', otherWorse: 'floor:s-accept' },
  // Read per incident kind (incidentProposal.ts INCIDENT_DELEGATION_EVIDENCE).
  incident: { otherBetter: null, otherWorse: null },
  // Measured in plantFloor.playtest.test.ts (MILLOS_PLANT_TEMPER_OUT; labels
  // there carry 'floor:', and that file checks them), ten shifts each: a wet
  // year from the start, with moisture meters, and after two sound shifts.
  // Priced on the shift's minimums, the partner dries whenever tempering as it
  // comes leaves flour under 95, and the record never ranked the other answer
  // above its choice (0 of 114 compared, 13 arms); tempered as it comes every
  // shift, the record ranked drying best 11 of 11 ('tw-standard'). On net,
  // drying every shift beat tempering as it comes in every arm (41,105 against
  // 15,822 from the start); the one answer that beat it was a single standard
  // temper after the turn (+2,634), which the record did not rank best. So the
  // partner decides and tells: the card has one right answer here.
  temper: { otherBetter: null, otherWorse: 'floor:tw-standard' },
};

/** A kind's default delegation, from DELEGATION_EVIDENCE. */
export function defaultDelegationFor(kind: ProposalKind): Delegation {
  const evidence = DELEGATION_EVIDENCE[kind];
  return evidence.otherBetter !== null && evidence.otherWorse !== null ? 'ask' : 'decide';
}

export interface PricedOption {
  id: string;
  price: OptionPrice;
}

export interface ProposalResolution {
  optionId: string;
  decidedBy: ProposalDecider;
  /** Game minute it resolved: the answer's minute, or raised + window when left to the partner. */
  atMinute: number;
  /** False when the answer was refused by the plant (no free part, a stop, an open fault). */
  ran: boolean;
  /**
   * Why it could not run, where the plant can say and the cause clears:
   * 'no-part' when no part was free, 'stopped' during a stop or a drill.
   */
  refusal?: 'no-part' | 'stopped';
}

export interface ProposalComparison {
  atMinute: number;
  /** Every option priced again on the outcome facts, in option order. */
  prices: PricedOption[];
  chosenOptionId: string;
  /** The cheapest answer by the outcome prices; null when they tie. */
  bestOptionId: string | null;
}

export interface PartnerProposal<K extends ProposalKind = ProposalKind> {
  id: string;
  kind: K;
  /** What it is about, unique per kind: a second proposal on one subject is never raised. */
  subject: string;
  raisedAtMinute: number;
  windowMinutes: number;
  /** The options as priced when raised, in the order they are shown. */
  options: PricedOption[];
  defaultOptionId: string;
  /** The facts it was raised on. */
  facts: ProposalFactsByKind[K];
  /** The plant session it belongs to; another session's proposal is dropped. */
  sessionId: string;
  status: ProposalStatus;
  resolution?: ProposalResolution;
  comparison?: ProposalComparison;
}

/** Where a proposal is about, as copy keys and raw parameters (the UI words them). */
export interface ProposalReason {
  key:
    | 'reasonProgramme'
    | 'reasonService'
    | 'reasonServiceAgain'
    | 'reasonServiceAfterStop'
    | 'reasonDispatch'
    | 'reasonCommitment'
    | 'reasonForfeit'
    | 'reasonIntake'
    | 'reasonIncident'
    | 'reasonTemper';
  params: Record<string, string | number>;
}

// ---------------------------------------------------------------------------
// The plant as plain facts
// ---------------------------------------------------------------------------

export interface PlantUnitFacts extends Omit<ServiceFacts, 'alertId'> {
  /** The unit's open wear prediction; null when none is open. */
  openWearAlertId: string | null;
  /** True while a breakdown holds the unit. */
  brokenDown: boolean;
  /** Least wear at which a service buys anything (productionStore minimumServiceWear). */
  minimumServiceWear: number;
  /**
   * A service asked for on the open prediction was refused for a cause that
   * clears, and how many times (breakdownStore serviceRefused); absent or
   * null when none was.
   */
  serviceRefused?: { reason: 'stopped' | 'no-part'; count: number } | null;
  /** True while a stop or a drill holds the plant (a service is refused). */
  stopped?: boolean;
}

export interface PlantWorld {
  sessionId: string;
  /** Campaign game minutes elapsed. */
  minute: number;
  programme: {
    /** The next programme can be accepted now (operationsPlay canAcceptNextProgramme). */
    canAccept: boolean;
    programmeCount: number;
    /** Who accepted the latest programme, from the campaign log; null when unknown. */
    lastAcceptedBy: ProposalDecider | null;
    /** The programme accepting would start, priced; null when none can be offered. */
    offer: Omit<ProgrammeFacts, 'ask' | 'holdMinutes'> | null;
  };
  units: PlantUnitFacts[];
  /**
   * The dispatch question as it stands (plan item 3.4): the docked truck's
   * active order and the off-spec flour another order takes; null when there
   * is none. Absent where a caller builds a world without it.
   */
  dispatch?: Omit<DispatchFacts, 'holdMinutes'> | null;
  /** The shipping cycle the docked truck is on; null when none is loading. */
  dispatchCycleId?: string | null;
  /**
   * Taking the next programme early (plan item 3.7); absent or null where a
   * caller builds a world without it.
   */
  commitment?: {
    /** One programme is open, none beside it, and nothing else blocks one. */
    canTakeEarly: boolean;
    /** The programme taking it would start, priced on the dock; null when none can be. */
    offer: Omit<CommitmentFacts, 'ask' | 'holdMinutes'> | null;
    /** The dock as it stands, for the hour-later record. */
    dock: DockState;
  } | null;
  /**
   * Open orders past their due time that the line cannot make (plan item
   * 3.7); absent where a caller builds a world without them.
   */
  forfeit?: Omit<ForfeitFacts, never>[];
  /** Every open order's id, so a forfeit proposal knows when its order closed. */
  openOrderIds?: string[];
  /** The quality the line packs now. */
  lineQuality?: number;
  /** A wheat lot at the intake under a charter (plan item 3.1); absent or null when none. */
  intake?: IntakeFacts | null;
  /** What an intake record reads an hour on: the line's stamp base and the open flour minimums. */
  intakeOutcome?: { base: number; openMinimums: number[] } | null;
  /** Open incidents (plan item 3.5), each with the facts to raise it on. */
  incidents?: IncidentWorldEntry[];
  /** What an incident record reads an hour on. */
  incidentOutcome?: { lineStamp: number; openMinimums: number[] } | null;
  /**
   * The temper card (plan item 7.7): what to raise it on this tick, and what
   * its record reads an hour on. Null without an active charter; absent where
   * a caller builds a world without it.
   */
  temper?: {
    raise: TemperFacts | null;
    outcome: { base: number; openMinimums: number[] } | null;
  } | null;
}

/** What an answer does, carried out by the runtime. */
export type ProposalEffect =
  | { type: 'none' }
  | { type: 'accept-programme'; early?: boolean }
  | { type: 'forfeit-order'; orderId: string; best: number }
  | { type: 'service-unit'; machineId: string }
  | { type: 'service-unit-quiet'; machineId: string }
  | {
      type: 'receive-lot';
      siloId: string;
      amountKg: number;
      supplier: string | null;
      crop: CropAttributes;
    }
  | { type: 'refuse-lot'; deliveryIndex: number; fee: number }
  | { type: 'respond-incident'; incidentId: string; response: string }
  | { type: 'temper'; option: TemperOptionId; kwh: number; cost: number; key?: string };

/** An open proposal the plant answered without the card. */
export type ProposalSettlement =
  | { type: 'answered'; optionId: string; decidedBy: ProposalDecider }
  | { type: 'withdrawn' };

export interface ProposalKindDefinition<K extends ProposalKind> {
  kind: K;
  windowMinutes: number;
  /** Option ids in the order they are shown. */
  optionIds: readonly string[];
  defaultOptionId: string;
  /**
   * Proposals that should be raised now, by subject, with their facts.
   * `settled` holds `kind:subject` of proposals already answered whose records
   * have left the store's tail; they are never raised again.
   */
  raise(
    world: PlantWorld,
    history: readonly PartnerProposal[],
    settled: ReadonlySet<string>
  ): { subject: string; facts: ProposalFactsByKind[K] }[];
  price(optionId: string, facts: ProposalFactsByKind[K]): OptionPrice;
  /** The options shown on these facts, in order; absent, `optionIds` (a kind whose answers vary by facts). */
  optionsFor?(facts: ProposalFactsByKind[K]): readonly string[];
  /** Whether an option is a real answer on these facts; absent, every option is. */
  available?(optionId: string, facts: ProposalFactsByKind[K]): boolean;
  effect(optionId: string, facts: ProposalFactsByKind[K]): ProposalEffect;
  /** Null while it is still the player's to answer. */
  settle(proposal: PartnerProposal<K>, world: PlantWorld): ProposalSettlement | null;
  /** The facts an hour later: what the hour measured, from the decision's branch point. */
  outcome(proposal: PartnerProposal<K>, world: PlantWorld): ProposalFactsByKind[K];
  reason(facts: ProposalFactsByKind[K]): ProposalReason;
  /**
   * How the record ranks two answers, lower better; absent, by money and the
   * rest (priceRank). For a kind whose answers trade one thing against
   * another that priceRank does not weigh.
   */
  rank?(optionId: string, price: OptionPrice): number[];
  /**
   * Whether the record may name a better answer for this proposal; absent,
   * always. False leaves `bestOptionId` null: both prices are still written.
   */
  judged?(proposal: PartnerProposal<K>): boolean;
  /**
   * The partner's answer for these priced options; absent, `defaultOptionId`.
   * For a kind whose right answer depends on the facts (intake, incident),
   * so the partner is never a strawman that always takes the same answer.
   */
  chooseDefault?(options: readonly PricedOption[], facts: ProposalFactsByKind[K]): string;
}

const ZERO_PRICE: OptionPrice = {
  currency: 0,
  parts: {},
  kg: 0,
  minutes: null,
  quality: null,
  gradeRisk: false,
};

const finite = (value: number, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const round2 = (value: number) => Math.round(finite(value) * 100) / 100;

const countParts = (parts: readonly PartName[]): Partial<Record<PartName, number>> =>
  parts.reduce<Partial<Record<PartName, number>>>((counts, part) => {
    counts[part] = (counts[part] ?? 0) + 1;
    return counts;
  }, {});

/** Game minutes to the failure at the given rate; null when the unit is not wearing. */
export function minutesToFailure(
  facts: Pick<ServiceFacts, 'wear' | 'breakdownWear' | 'wearPerMinute'>
) {
  if (!(facts.wearPerMinute > 0)) return null;
  return Math.max(0, (facts.breakdownWear - facts.wear) / facts.wearPerMinute);
}

// ---------------------------------------------------------------------------
// The two kinds
// ---------------------------------------------------------------------------

const programmeKind: ProposalKindDefinition<'programme'> = {
  kind: 'programme',
  windowMinutes: PROGRAMME_WINDOW_MINUTES,
  optionIds: ['accept', 'hold'],
  defaultOptionId: 'accept',
  raise(world, history, settled) {
    const { programme } = world;
    if (!programme.canAccept || !programme.offer) return [];
    const asked = history.filter(
      (proposal): proposal is PartnerProposal<'programme'> =>
        proposal.kind === 'programme' &&
        (proposal as PartnerProposal<'programme'>).facts.programmeCount === programme.programmeCount
    );
    if (asked.some((proposal) => proposal.status === 'open')) return [];
    const last = asked.reduce<PartnerProposal<'programme'> | undefined>(
      (latest, proposal) => (!latest || proposal.facts.ask > latest.facts.ask ? proposal : latest),
      undefined
    );
    // Held: asked again once the hold has run. Anything else that closed an
    // ask on this count (a withdrawn ask after a reset) is asked again now.
    if (
      last?.resolution?.optionId === 'hold' &&
      world.minute < last.resolution.atMinute + last.facts.holdMinutes
    )
      return [];
    // An ask whose record left the tail still counts.
    const prefix = `programme:programme-${programme.programmeCount}-ask-`;
    const settledAsk = [...settled].reduce(
      (max, key) =>
        key.startsWith(prefix) ? Math.max(max, Number(key.slice(prefix.length)) || 0) : max,
      0
    );
    const ask = Math.max(last?.facts.ask ?? 0, settledAsk) + 1;
    return [
      {
        subject: `programme-${programme.programmeCount}-ask-${ask}`,
        facts: { ...programme.offer, ask, holdMinutes: PROGRAMME_HOLD_MINUTES },
      },
    ];
  },
  price(optionId, facts) {
    if (optionId === 'accept') return { ...ZERO_PRICE, kg: Math.max(0, finite(facts.committedKg)) };
    // Held: nothing is booked, but every delivery of it starts an hour later,
    // and the stock its orders would take waits at the dock meanwhile.
    const waitingKg = Math.max(0, Math.min(finite(facts.stockReadyKg), finite(facts.committedKg)));
    return {
      ...ZERO_PRICE,
      kg: Math.round(waitingKg),
      minutes: Math.max(0, finite(facts.holdMinutes)),
    };
  },
  effect(optionId) {
    return optionId === 'accept' ? { type: 'accept-programme' } : { type: 'none' };
  },
  settle(proposal, world) {
    if (world.programme.programmeCount !== proposal.facts.programmeCount)
      return {
        type: 'answered',
        optionId: 'accept',
        decidedBy: world.programme.lastAcceptedBy ?? 'operator',
      };
    // Nothing to accept any more (a challenge started, the plant was reset).
    if (!world.programme.canAccept) return { type: 'withdrawn' };
    return null;
  },
  outcome(proposal, world) {
    // An hour on, the stock the plant then had ready is what a hold would
    // have kept waiting; the programme's own terms are as offered.
    const offer = world.programme.offer;
    return {
      ...proposal.facts,
      stockReadyKg: offer ? offer.stockReadyKg : proposal.facts.stockReadyKg,
    };
  },
  reason(facts) {
    return {
      key: 'reasonProgramme',
      params: { number: facts.programmeNumber, kg: facts.committedKg },
    };
  },
  // A hold always carries its hour against none: the record cannot come out
  // the other way, so it states what each answer cost and names no better
  // one (review 2, finding 5). What holding costs is measured on the arms
  // (plantMeasure.playtest.test.ts, p-programme-hold against p).
  judged: () => false,
};

/** The minimums a stamp falls below, strictest first; the strictest alone on an older proposal. */
function minimumsBelow(stamp: number, facts: ServiceFacts): number[] {
  const minimums =
    facts.openMinimums ?? (facts.strictestMinimum !== null ? [facts.strictestMinimum] : []);
  return [...new Set(minimums)].filter((minimum) => stamp < minimum).sort((x, y) => y - x);
}

/**
 * A service's price: its part, its stamp, its minutes offline. With no part
 * free it cannot run (beginUnitService refuses it for want of a part), and its
 * price says so rather than read as free.
 */
function servicePrice(facts: ServiceFacts): OptionPrice {
  const belowMinimums = minimumsBelow(facts.qualityServiced, facts);
  return {
    ...ZERO_PRICE,
    currency: round2(finite(facts.servicePartPrice ?? 0)),
    parts: facts.servicePart ? { [facts.servicePart]: 1 } : {},
    quality: facts.qualityServiced,
    gradeRisk: belowMinimums.length > 0,
    belowMinimums,
    offlineMinutes: Math.max(0, finite(facts.serviceMinutes ?? 0)),
    ...(facts.servicePart ? {} : { held: 'no-part' as const }),
  };
}

/**
 * Running on: the unit fails at its stamp, its work order is open for the
 * repair (an hour's rate), the failure's parts are used, and the repaired unit
 * comes back still worn (productionStore repairedWear), so it still needs its
 * service and that part as well. Line time is not charged: measured, a unit
 * down costs this plant no tonnes.
 */
function runOnPrice(facts: ServiceFacts): OptionPrice {
  const belowMinimums = minimumsBelow(facts.qualityAtFailure, facts);
  const parts = countParts(facts.failureParts);
  if (facts.servicePart) parts[facts.servicePart] = (parts[facts.servicePart] ?? 0) + 1;
  return {
    ...ZERO_PRICE,
    currency: round2(
      (finite(facts.workOrderRatePerHour) * finite(facts.repairMinutes)) / 60 +
        finite(facts.failurePartsPrice ?? 0) +
        finite(facts.servicePartPrice ?? 0)
    ),
    parts,
    quality: facts.qualityAtFailure,
    gradeRisk: belowMinimums.length > 0,
    belowMinimums,
    offlineMinutes: Math.max(0, finite(facts.repairMinutes) + finite(facts.serviceMinutes ?? 0)),
  };
}

/**
 * Whether the service card offers "service at the quiet spell". Off: measured
 * on the ten-shift harness (MILLOS_PLANT_MAINTENANCE_OUT), service now won
 * every comparison in every arm and the quiet answer never beat it, because a
 * unit offline costs this plant nothing (spare capacity) and waiting only
 * leaves the unit worn longer. A choice with a dominant answer is not a
 * decision, so it stays off until line time has a price. The harness turns it
 * on to measure it; the booking it makes is live code either way.
 */
export const SERVICE_CARD = { quietSpellOffered: false };

const serviceKind: ProposalKindDefinition<'service'> = {
  kind: 'service',
  windowMinutes: SERVICE_WINDOW_MINUTES,
  optionIds: ['service', 'quiet', 'run-on'],
  defaultOptionId: 'service',
  raise(world, history) {
    const forAlert = (alertId: string) =>
      history.filter(
        (proposal): proposal is PartnerProposal<'service'> =>
          proposal.kind === 'service' &&
          (proposal as PartnerProposal<'service'>).facts.alertId === alertId
      );
    const raised: { subject: string; facts: ServiceFacts }[] = [];
    for (const unit of world.units) {
      if (unit.openWearAlertId === null || unit.brokenDown || unit.wear < unit.minimumServiceWear)
        continue;
      const {
        openWearAlertId,
        brokenDown: _broken,
        minimumServiceWear: _min,
        serviceRefused,
        stopped,
        ...facts
      } = unit;
      const earlier = forAlert(openWearAlertId);
      if (earlier.length === 0 && !serviceRefused) {
        raised.push({
          subject: `service-${openWearAlertId}`,
          facts: { ...facts, alertId: openWearAlertId },
        });
        continue;
      }
      if (earlier.some((proposal) => proposal.status === 'open')) continue;
      // Asked once. Asked again only when the service asked for could not run
      // for a cause that clears (a stop or a drill, no free part; the
      // prediction keeps it, `serviceRefused`, so a record that has left the
      // store's tail still counts) and that cause has cleared: the partner
      // says so. A proposal from before the prediction kept it is asked again
      // as it was, when every ask wanted a part and a part is free now.
      const cleared = serviceRefused
        ? unit.servicePart !== null && !stopped
        : earlier.every(
            (proposal) =>
              proposal.status === 'resolved' && proposal.resolution?.refusal === 'no-part'
          ) && unit.servicePart !== null;
      if (!cleared) continue;
      raised.push({
        subject: `service-${openWearAlertId}-again-${serviceRefused?.count ?? earlier.length}`,
        facts: {
          ...facts,
          alertId: openWearAlertId,
          reoffered: true,
          reofferedAfter: serviceRefused?.reason ?? 'no-part',
        },
      });
    }
    return raised;
  },
  available(optionId, facts) {
    // The quiet spell is an answer only while the line is busy now and is
    // expected to fall quiet before the unit fails; quiet now, it is "now".
    if (optionId !== 'quiet') return true;
    if (!SERVICE_CARD.quietSpellOffered) return false;
    const wait = facts.minutesToQuiet;
    const toFailure = minutesToFailure(facts);
    return (
      typeof wait === 'number' &&
      Number.isFinite(wait) &&
      wait > 0 &&
      (toFailure === null || wait < toFailure)
    );
  },
  price(optionId, facts) {
    if (optionId === 'service') return servicePrice(facts);
    if (optionId === 'quiet') {
      const wait = Math.max(0, finite(facts.minutesToQuiet ?? 0));
      const toFailure = minutesToFailure(facts);
      // A wait past the failure is running on, with the booking still to do.
      if (toFailure !== null && wait >= toFailure)
        return { ...runOnPrice(facts), waitMinutes: wait };
      return { ...servicePrice(facts), waitMinutes: wait };
    }
    return runOnPrice(facts);
  },
  effect(optionId, facts) {
    return optionId === 'service'
      ? { type: 'service-unit', machineId: facts.machineId }
      : optionId === 'quiet'
        ? { type: 'service-unit-quiet', machineId: facts.machineId }
        : { type: 'none' };
  },
  settle(proposal, world) {
    const unit = world.units.find((candidate) => candidate.machineId === proposal.facts.machineId);
    if (!unit) return { type: 'withdrawn' };
    // The failure came first: nothing is left to decide.
    if (unit.brokenDown) return { type: 'withdrawn' };
    // The prediction closed with the unit running: it was serviced by hand
    // (Maintain, or a booked service completed).
    if (unit.openWearAlertId !== proposal.facts.alertId)
      return { type: 'answered', optionId: 'service', decidedBy: 'operator' };
    return null;
  },
  outcome(proposal, world) {
    // From the decision's branch point (the wear it was raised at), with what
    // the hour measured: the unit's load (its wear rate), the rest of the line
    // (the stamp either way), the orders then open and the part free.
    const unit = world.units.find((candidate) => candidate.machineId === proposal.facts.machineId);
    if (!unit) return proposal.facts;
    return {
      ...proposal.facts,
      wearPerMinute: unit.wearPerMinute > 0 ? unit.wearPerMinute : proposal.facts.wearPerMinute,
      servicePart: unit.servicePart ?? proposal.facts.servicePart,
      qualityServiced: unit.qualityServiced,
      qualityAtFailure: unit.qualityAtFailure,
      strictestMinimum: unit.strictestMinimum,
      ...(unit.openMinimums ? { openMinimums: unit.openMinimums } : {}),
    };
  },
  reason(facts) {
    const toFailure = minutesToFailure(facts);
    return {
      key: !facts.reoffered
        ? 'reasonService'
        : facts.reofferedAfter === 'stopped'
          ? 'reasonServiceAfterStop'
          : 'reasonServiceAgain',
      params: {
        machine: facts.machineName,
        minutes: toFailure === null ? 0 : Math.round(toFailure),
      },
    };
  },
  // Running on always costs the service's part as well as the failure's work
  // order and parts: the record cannot come out the other way, so it states
  // what each answer cost and names no better one (review 2, finding 5).
  // What running on costs is measured on the arms (q against p).
  judged: () => false,
};

// ---------------------------------------------------------------------------
// Commitment: the next programme taken early (plan item 3.7)
// ---------------------------------------------------------------------------

/** A held early offer is offered again an hour later, as a held programme is. */
export const COMMITMENT_HOLD_MINUTES = 60;
/** It waits as long as a programme offer does; unanswered, the partner waits. */
export const COMMITMENT_WINDOW_MINUTES = 24;
/**
 * The plant's net a kilogram shipped, measured: 38,507 over 189,500 kg in the
 * ten-shift no-input run (MILLOS_PLANT_ASK_OUT arm p, plan wave 3c), every
 * cost line in, grain the largest. Taking a programme early is credited at it
 * on the kilograms it ships sooner (commitmentImpact), never on the whole
 * programme: waiting would take it too.
 */
export const MEASURED_MARGIN_PER_KG = 0.2;

/** An open order as the dock will carry it. */
export interface DockOrder {
  remainingKg: number;
  dueAtMinute: number;
  priority: 'normal' | 'high' | 'critical';
  product: 'flour' | 'semolina';
  /** The programme it belongs to (operationsCampaignStore programmeOfOrder). */
  programme: string;
  /** False when the line cannot make it at all: it never ships, so it is not projected. */
  reachable: boolean;
  /** The order the line and the dock are working now. */
  active: boolean;
  /** Its late rate, money a kilogram still owed a game hour past due; absent before plan wave 3d. */
  latePerKgHour?: number;
}

/** Packed, released stock of one product: tested, and on the lab's bench or in its queue. */
export interface DockStock {
  tested: number;
  bench: number;
}

/** The dock as it stands: its open orders, when the next truck leaves, and how often. */
export interface DockState {
  orders: DockOrder[];
  /** Game minutes until the next truck leaves loaded, read from where it is in the yard. */
  nextTruckInMinutes: number;
  /** Game minutes from one departure to the next when the stock is there (DOCK_PROJECTION). */
  cycleMinutes: number;
  /** What a truck carries (the dispatch load's capacity). */
  capacityKg: number;
  /** The programme taken most recently; null when no order is open. */
  latestProgramme: string | null;
  /**
   * What binds besides the yard (plan wave 3d), each absent on a dock read
   * before it, which then projects as if stock were always there: packed
   * stock by product, the line's rate while it runs, the product it is on,
   * and the lateness at which an order is forfeited.
   */
  stock?: Record<'flour' | 'semolina', DockStock>;
  lineKgPerMinute?: number;
  lineProduct?: 'flour' | 'semolina' | null;
  forfeitAfterMinutes?: number;
}

/**
 * The yard and the line as the projection carries them, fitted on the ten-shift
 * harness (plan wave 3d, MILLOS_PLANT_COMMIT_DEBUG: 1,425 order completions
 * forecast from every 20 game minutes of three arms, never early, early on the
 * old price and always early). A truck in the yard leaves about 62 minutes
 * after it arrives (41 approaching, docking and loading, 12 leaving), so the
 * next departure is read from its phase, and departures follow every 81
 * minutes while the stock is there. The line packs about 90 kg a game minute
 * at the boot rate (0.8) while it runs, loses 15 minutes changing product, and
 * a packed kilogram is loadable about 12 minutes later (a batch fills, then
 * the bench tests it); a truck that waited for stock leaves 8 minutes after it
 * is loaded. Forecast minus actual completion, median: -1 to 0 minutes in the
 * three arms (the old projection: -32 to -37, always early), and it missed 8
 * of 370 late completions (the old one, 185).
 */
export const DOCK_PROJECTION = {
  cycleMinutes: 81,
  arrivalToDepartureMinutes: 62,
  approachingToDepartureMinutes: 41,
  dockedToDepartureMinutes: 15,
  leavingToDepartureMinutes: 6,
  lineKgPerMinuteAtFullRate: 112.5,
  changeoverMinutes: 15,
  benchLagMinutes: 12,
  loadedToDepartureMinutes: 8,
  /**
   * An order projected to leave less than this before its due counts among
   * the orders a take makes late (at risk): the forecast's own error, one
   * forecast in ten leaving 20 minutes or more later than projected in each
   * of the four arms measured. Added after the gate arm, taking on the
   * projection alone, ran 9 orders late in ten shifts at demand 1. Late
   * minutes and the ledger's charge are still read at the due minute.
   */
  lateMarginMinutes: 30,
  /** Trucks projected at most, and the longest one waits: a horizon, so a dock that cannot clear still ends. */
  maxTrucks: 120,
  maxWaitMinutes: 600,
} as const;

const PRIORITY_ORDER = { critical: 0, high: 1, normal: 2 } as const;
type Product = DockOrder['product'];
type ProjectedOrder = Pick<
  DockOrder,
  'remainingKg' | 'dueAtMinute' | 'priority' | 'product' | 'reachable' | 'active' | 'latePerKgHour'
> & {
  /** Not yet taken: neither packed for nor loaded before this minute (a programme accepted later). */
  availableFromMinute?: number;
};

export interface DockProjection {
  /** Per order, in the order given: the minute its last kilogram leaves; null when it does not in the horizon or cannot be made. */
  completesAt: (number | null)[];
  /** Orders that leave later than their due less the margin (lateMarginMinutes, at risk), or are forfeited. */
  lateOrders: number;
  /** Late order-minutes past the due, each order's capped at its forfeit. */
  lateMinutes: number;
  /** What the ledger charges: the late rate on what is still owed past due, and each forfeit's fee. */
  lateCost: number;
  /** Kilograms still owed by orders forfeited at their bound. */
  forfeitKg: number;
  /** Orders that leave after their due, or are forfeited: what the shift's grade counts. */
  lateDeliveries: number;
  /** Per order, in the order given: each truck's kilograms and the minute it leaves. */
  shipments: { at: number; kg: number }[][];
  /** The minute the last order leaves or is forfeited; `minute` with nothing to carry. */
  finishAt: number;
}

/**
 * The dock and the line carrying these orders from `minute` (plan wave 3d),
 * as the plant does it. Pure.
 *
 * - The line works the queue in the dispatch order (the active order, then
 *   priority and due time): packed stock covers each order in turn and the
 *   rest is packed at the line's rate, one product at a time.
 * - Each truck carries one product, the active order's (it stays active until
 *   fulfilled; then the queue's first), loading every owed order of it by due
 *   time up to its capacity (the `fill` policy). It leaves on its turn, or, if
 *   stock is still being packed for it, once loaded; if no more is coming it
 *   leaves with what there is.
 * - Lateness is charged as the ledger charges it: the order's late rate on its
 *   unshipped kilograms for every hour past due, and at `forfeitAfterMinutes`
 *   past due the forfeit fee (that many hours of the rate on what it lacks).
 */
export function projectDock(
  orders: readonly ProjectedOrder[],
  dock: Pick<
    DockState,
    | 'nextTruckInMinutes'
    | 'cycleMinutes'
    | 'capacityKg'
    | 'stock'
    | 'lineKgPerMinute'
    | 'lineProduct'
    | 'forfeitAfterMinutes'
  >,
  minute: number
): DockProjection {
  const P = DOCK_PROJECTION;
  const capacity = Math.max(1, finite(dock.capacityKg, 5000));
  const cycle = Math.max(1, finite(dock.cycleMinutes, P.cycleMinutes));
  const forfeitAfter = Math.max(0, finite(dock.forfeitAfterMinutes ?? Infinity, Infinity));
  const left = orders.map((order) =>
    order.reachable ? Math.max(0, finite(order.remainingKg)) : 0
  );
  const completesAt: (number | null)[] = orders.map(() => null);
  const shipments: { at: number; kg: number }[][] = orders.map(() => []);
  const open = (i: number) => left[i] > 1e-6;
  const queueOrder = (a: number, b: number) =>
    PRIORITY_ORDER[orders[a].priority] - PRIORITY_ORDER[orders[b].priority] ||
    orders[a].dueAtMinute - orders[b].dueAtMinute;
  const indices = orders.map((_, i) => i).filter(open);
  const from = (i: number) => finite(orders[i].availableFromMinute ?? -Infinity, -Infinity);
  // The line's schedule: stock covers the queue in order, the rest is packed.
  const rate = finite(dock.lineKgPerMinute ?? 0, 0);
  const unlimited = !dock.stock || !(rate > 0);
  const tested = { flour: 0, semolina: 0 } as Record<Product, number>;
  const bench = { flour: 0, semolina: 0 } as Record<Product, number>;
  for (const product of ['flour', 'semolina'] as const) {
    tested[product] = Math.max(0, finite(dock.stock?.[product]?.tested ?? 0));
    bench[product] = Math.max(0, finite(dock.stock?.[product]?.bench ?? 0));
  }
  const segments: { product: Product; start: number; end: number; kg: number }[] = [];
  if (!unlimited) {
    const cover = { flour: tested.flour + bench.flour, semolina: tested.semolina + bench.semolina };
    // Orders taken later are packed after the ones open now.
    const queue = [
      ...indices.filter((i) => orders[i].active),
      ...indices
        .filter((i) => !orders[i].active)
        .sort((a, b) => from(a) - from(b) || queueOrder(a, b)),
    ];
    let t = minute;
    let product = dock.lineProduct ?? null;
    for (const i of queue) {
      const p = orders[i].product;
      const covered = from(i) > minute ? 0 : Math.min(left[i], cover[p]);
      cover[p] -= covered;
      const need = left[i] - covered;
      if (need <= 1e-6) continue;
      t = Math.max(t, from(i));
      if (product !== null && product !== p) t += P.changeoverMinutes;
      product = p;
      segments.push({ product: p, start: t, end: t + need / rate, kg: need });
      t += need / rate;
    }
  }
  const lag = P.benchLagMinutes;
  const available = (product: Product, at: number) => {
    if (unlimited) return Infinity;
    let kg = tested[product] + (at >= minute + lag ? bench[product] : 0);
    for (const s of segments) {
      if (s.product !== product || at <= s.start + lag) continue;
      kg += at >= s.end + lag ? s.kg : (s.kg * (at - s.start - lag)) / (s.end - s.start);
    }
    return kg;
  };
  /** The first minute from `from` at which `kg` of the product is loadable, or null. */
  const loadableAt = (product: Product, kg: number, from: number): number | null => {
    if (available(product, from) >= kg - 1e-6) return from;
    let kgSoFar = tested[product] + bench[product];
    let at: number | null = null;
    for (const s of segments) {
      if (s.product !== product) continue;
      if (kgSoFar + s.kg >= kg - 1e-6) {
        at = s.start + lag + ((kg - kgSoFar) / s.kg) * (s.end - s.start);
        break;
      }
      kgSoFar += s.kg;
    }
    return at === null ? null : Math.max(from, at);
  };
  const shipped = { flour: 0, semolina: 0 } as Record<Product, number>;
  let active = indices.find((i) => orders[i].active) ?? null;
  let slot = minute + Math.max(0, finite(dock.nextTruckInMinutes));
  for (let truck = 0; truck < P.maxTrucks; truck++) {
    const unfilled = indices.filter(open);
    if (unfilled.length === 0) break;
    const owed = unfilled.filter((i) => from(i) <= slot);
    if (owed.length === 0) {
      // Nothing taken yet to carry: the next truck comes once it is.
      slot = Math.min(...unfilled.map(from));
      continue;
    }
    if (active === null || !open(active)) active = [...owed].sort(queueOrder)[0];
    const product = orders[active].product;
    const ofProduct = owed
      .filter((i) => orders[i].product === product)
      .sort(
        (a, b) =>
          orders[a].dueAtMinute - orders[b].dueAtMinute ||
          PRIORITY_ORDER[orders[a].priority] - PRIORITY_ORDER[orders[b].priority]
      );
    const payload = Math.min(
      capacity,
      ofProduct.reduce((sum, i) => sum + left[i], 0)
    );
    // It leaves once loaded; while more of its product is still to be packed
    // it waits for it, and once none is coming it leaves with what there is.
    const full = loadableAt(product, shipped[product] + payload, slot);
    const lastPacked = segments.reduce(
      (last, s) => (s.product === product ? Math.max(last, s.end + lag) : last),
      -Infinity
    );
    const ready = Math.min(full ?? Math.max(slot, lastPacked), slot + P.maxWaitMinutes);
    const departs = ready > slot ? ready + P.loadedToDepartureMinutes : slot;
    const carried = Math.min(payload, Math.max(0, available(product, ready) - shipped[product]));
    if (carried <= 1e-6) break;
    shipped[product] += carried;
    let room = carried;
    for (const i of ofProduct) {
      if (room <= 1e-6) break;
      const take = Math.min(left[i], room);
      left[i] -= take;
      room -= take;
      shipments[i].push({ at: departs, kg: take });
      if (!open(i)) completesAt[i] = departs;
    }
    slot = departs + cycle;
  }
  let lateOrders = 0;
  let lateDeliveries = 0;
  let lateMinutes = 0;
  let lateCost = 0;
  let forfeitKg = 0;
  let finishAt = minute;
  orders.forEach((order, i) => {
    if (!order.reachable || Math.max(0, finite(order.remainingKg)) <= 1e-6) return;
    const due = order.dueAtMinute;
    const bound = due + forfeitAfter;
    const ratePerHour = Math.max(0, finite(order.latePerKgHour ?? 0));
    const done = completesAt[i];
    const forfeited = done === null ? Number.isFinite(bound) : done > bound;
    if (done === null && !forfeited) return;
    finishAt = Math.max(finishAt, forfeited ? bound : (done ?? minute));
    if ((done ?? Infinity) > due - P.lateMarginMinutes + 1e-6 || forfeited) lateOrders += 1;
    if ((done ?? Infinity) > due + 1e-6 || forfeited) lateDeliveries += 1;
    lateMinutes += Math.max(0, Math.min(done ?? bound, bound) - due);
    // The ledger's accrual: what is still owed, hour by hour, past due.
    let owed = Math.max(0, finite(order.remainingKg));
    let at = due;
    for (const shipment of shipments[i]) {
      const until = Math.min(shipment.at, bound);
      if (until > at) {
        lateCost += (owed * ratePerHour * (until - at)) / 60;
        at = until;
      }
      if (shipment.at > bound) break;
      owed -= shipment.kg;
    }
    if (forfeited) {
      if (bound > at) lateCost += (owed * ratePerHour * (bound - at)) / 60;
      lateCost += (owed * ratePerHour * forfeitAfter) / 60;
      forfeitKg += owed;
    }
  });
  return {
    completesAt,
    lateOrders,
    lateMinutes: Math.round(lateMinutes * 10) / 10,
    lateCost: round2(lateCost),
    forfeitKg: Math.round(forfeitKg),
    lateDeliveries,
    shipments,
    finishAt,
  };
}

/** Late order-minutes the dock would run up carrying these orders (projectDock). */
export function projectLateMinutes(
  orders: readonly ProjectedOrder[],
  dock: Parameters<typeof projectDock>[1],
  minute: number
): number {
  return projectDock(orders, dock, minute).lateMinutes;
}

/** The offered programme's orders on the dock, as if taken at `takenAt`. */
const offeredOnDock = (orders: readonly CommitmentOrder[], takenAt: number): DockOrder[] =>
  orders.map((order) => ({
    remainingKg: order.kg,
    dueAtMinute: takenAt + order.dueInMinutes,
    priority: order.priority,
    product: order.product,
    programme: 'offer',
    reachable: true,
    active: false,
    ...(order.latePerKgHour !== undefined ? { latePerKgHour: order.latePerKgHour } : {}),
  }));

/**
 * Taking the offer now against waiting for it (plan wave 3d, the follow-up):
 * what it makes late, and what bringing it forward is worth.
 *
 * Taking now does not create a programme, it brings one forward. Waited for,
 * the offer is taken when the running programme closes (its last order
 * leaves, or is forfeited), after that truck, and is due from then. Both
 * schedules are projected (projectDock). The horizon is the take-now
 * schedule's last truck, not counted: on it both schedules catch up, and
 * whatever room it has left goes to the next programme either way. The gain
 * is the margin on the extra kilograms the take-now schedule has shipped by
 * then (trucks that would have left part-empty leave full), less the extra
 * late charges and forfeit fees it runs up. Waiting nets nothing against it.
 */
export interface CommitmentImpact {
  /** Orders the take makes late or puts at risk, beyond the dock as it stands. */
  lateOrders: number;
  lateMinutes: number;
  /** Late charges and forfeit fees taking adds over waiting; never negative. */
  lateCost: number;
  forfeitKg: number;
  /** Kilograms more shipped by the take-now schedule's finish than by waiting's. */
  gainKg: number;
  /** Taking's net over waiting: the margin on gainKg less the late charges difference. */
  net: number;
  /** Late deliveries in each schedule: what the shift's grade would count. */
  lateDeliveries: { take: number; wait: number };
}

const kgShippedBy = (projection: DockProjection, at: number) =>
  projection.shipments.reduce(
    (sum, list) => sum + list.reduce((kg, s) => (s.at <= at + 1e-6 ? kg + s.kg : kg), 0),
    0
  );

/** Taking the offer at `takenAt` against waiting for the running programme to close. */
export function commitmentImpact(
  offer: readonly CommitmentOrder[],
  dock: DockState,
  minute: number,
  takenAt = minute
): CommitmentImpact {
  const before = projectDock(dock.orders, dock, minute);
  const take = projectDock([...dock.orders, ...offeredOnDock(offer, takenAt)], dock, minute);
  // After the closing truck: the offer cannot ride on it.
  const closesAt = Math.max(minute, before.finishAt) + 1e-3;
  const wait = projectDock(
    [
      ...dock.orders,
      ...offeredOnDock(offer, closesAt).map((order) => ({
        ...order,
        availableFromMinute: closesAt,
      })),
    ],
    dock,
    minute
  );
  const horizon = take.finishAt - 1e-3;
  const gainKg = Math.max(0, kgShippedBy(take, horizon) - kgShippedBy(wait, horizon));
  const extraCost = take.lateCost - wait.lateCost;
  return {
    lateOrders: Math.max(0, take.lateOrders - before.lateOrders),
    lateMinutes: Math.max(0, Math.round((take.lateMinutes - before.lateMinutes) * 10) / 10),
    lateCost: Math.max(0, round2(extraCost)),
    forfeitKg: Math.max(0, take.forfeitKg - before.forfeitKg),
    gainKg: Math.round(gainKg),
    net: round2(MEASURED_MARGIN_PER_KG * gainKg - extraCost),
    lateDeliveries: { take: take.lateDeliveries, wait: wait.lateDeliveries },
  };
}

/** Late order-minutes the offered programme adds to the dock, taken at `takenAt`. */
export function commitmentLateMinutes(
  offer: readonly CommitmentOrder[],
  dock: DockState,
  minute: number,
  takenAt = minute
): number {
  return commitmentImpact(offer, dock, minute, takenAt).lateMinutes;
}

/**
 * Both answers priced on one projection (commitmentImpact): taking, the
 * kilograms it brings forward, the orders it makes late and by how many
 * minutes, and its net over waiting (one currency, the ledger's); waiting,
 * nothing added and a net of nothing. Each carries the late deliveries its
 * own schedule projects, which the shift's grade counts. A proposal from
 * before the dock was carried in its facts is priced from `lateMinutes`
 * alone, as it was.
 */
function commitmentPrice(optionId: string, facts: CommitmentFacts): OptionPrice {
  const kg = Math.max(0, finite(facts.committedKg));
  if (!facts.dock)
    return optionId === 'take'
      ? { ...ZERO_PRICE, kg, minutes: Math.max(0, finite(facts.lateMinutes)) }
      : { ...ZERO_PRICE };
  const at = finite(facts.atMinute ?? 0);
  const impact = commitmentImpact(facts.orders, facts.dock, at, finite(facts.takenAtMinute ?? at));
  if (optionId !== 'take')
    return { ...ZERO_PRICE, lateOrders: 0, net: 0, lateDeliveries: impact.lateDeliveries.wait };
  return {
    ...ZERO_PRICE,
    currency: impact.lateCost,
    kg,
    minutes: impact.lateMinutes,
    lateOrders: impact.lateOrders,
    net: impact.net,
    lateDeliveries: impact.lateDeliveries.take,
  };
}

const commitmentKind: ProposalKindDefinition<'commitment'> = {
  kind: 'commitment',
  windowMinutes: COMMITMENT_WINDOW_MINUTES,
  optionIds: ['take', 'wait'],
  // The cautious answer where the dock cannot say: a programme taken early can
  // make the running one late.
  defaultOptionId: 'wait',
  // The partner takes it when its price puts no order at risk and nets more
  // than waiting; otherwise it waits (plan wave 3d, measured: where no order
  // was at risk the record judged taking better 11 times in 22 and waiting 3;
  // taking on that rule ran none late in ten shifts at demand 1 and 1.5,
  // graded A throughout, and took nothing at demand 2).
  chooseDefault(options, facts) {
    if (!facts.dock) return 'wait';
    const take = options.find((option) => option.id === 'take')?.price;
    return take && (take.lateOrders ?? 1) === 0 && (take.net ?? 0) > 0 ? 'take' : 'wait';
  },
  raise(world, history, settled) {
    const commitment = world.commitment;
    if (!commitment?.canTakeEarly || !commitment.offer) return [];
    const count = commitment.offer.programmeCount;
    const asked = history.filter(
      (proposal): proposal is PartnerProposal<'commitment'> =>
        proposal.kind === 'commitment' &&
        (proposal as PartnerProposal<'commitment'>).facts.programmeCount === count
    );
    if (asked.some((proposal) => proposal.status === 'open')) return [];
    const last = asked.reduce<PartnerProposal<'commitment'> | undefined>(
      (latest, proposal) => (!latest || proposal.facts.ask > latest.facts.ask ? proposal : latest),
      undefined
    );
    if (last?.resolution && world.minute < last.resolution.atMinute + last.facts.holdMinutes)
      return [];
    const prefix = `commitment:commitment-${count}-ask-`;
    const settledAsk = [...settled].reduce(
      (max, key) =>
        key.startsWith(prefix) ? Math.max(max, Number(key.slice(prefix.length)) || 0) : max,
      0
    );
    const ask = Math.max(last?.facts.ask ?? 0, settledAsk) + 1;
    return [
      {
        subject: `commitment-${count}-ask-${ask}`,
        facts: {
          ...commitment.offer,
          ask,
          holdMinutes: COMMITMENT_HOLD_MINUTES,
          dock: commitment.dock,
          atMinute: world.minute,
          takenAtMinute: world.minute,
        },
      },
    ];
  },
  price(optionId, facts) {
    return commitmentPrice(optionId, facts);
  },
  effect(optionId) {
    return optionId === 'take' ? { type: 'accept-programme', early: true } : { type: 'none' };
  },
  settle(proposal, world) {
    // Taken by other means, or the running programme closed (the next one is
    // then the ordinary offer): nothing is left to decide here.
    if (
      !world.commitment?.offer ||
      world.commitment.offer.programmeCount !== proposal.facts.programmeCount ||
      !world.commitment.canTakeEarly
    )
      return { type: 'withdrawn' };
    return null;
  },
  outcome(proposal, world) {
    // An hour on, on the dock as it then stood, priced by the same function.
    const dock = world.commitment?.dock;
    if (!dock || !proposal.resolution) return proposal.facts;
    const at = proposal.resolution.atMinute;
    if (proposal.resolution.optionId === 'take' && proposal.resolution.ran) {
      // Taken: the programme taken (the latest on the dock) as it now stands,
      // against the dock without it.
      const taken = dock.latestProgramme;
      const without = dock.orders.filter((order) => order.programme !== taken);
      const orders: CommitmentOrder[] = dock.orders
        .filter((order) => order.programme === taken)
        .map((order) => ({
          kg: order.remainingKg,
          dueInMinutes: order.dueAtMinute - world.minute,
          priority: order.priority,
          product: order.product,
          ...(order.latePerKgHour !== undefined ? { latePerKgHour: order.latePerKgHour } : {}),
        }));
      const facts: CommitmentFacts = {
        ...proposal.facts,
        orders,
        dock: { ...dock, orders: without },
        atMinute: world.minute,
        takenAtMinute: world.minute,
      };
      return {
        ...facts,
        lateMinutes: commitmentImpact(orders, facts.dock!, world.minute).lateMinutes,
      };
    }
    // Waited: what taking it at the decision would have earned on the dock an
    // hour on. A programme accepted since (the ordinary offer, once the
    // running one closed) is this one taken later, so it leaves the dock.
    const accepted = world.commitment?.offer
      ? world.commitment.offer.programmeCount > proposal.facts.programmeCount
      : dock.latestProgramme !== null;
    const base = accepted
      ? { ...dock, orders: dock.orders.filter((order) => order.programme !== dock.latestProgramme) }
      : dock;
    const facts: CommitmentFacts = {
      ...proposal.facts,
      dock: base,
      atMinute: world.minute,
      takenAtMinute: at,
    };
    return {
      ...facts,
      lateMinutes: commitmentImpact(proposal.facts.orders, base, world.minute, at).lateMinutes,
    };
  },
  reason(facts) {
    return {
      key: 'reasonCommitment',
      params: { number: facts.programmeNumber, kg: facts.committedKg, late: facts.lateMinutes },
    };
  },
  // The partner's own rule (chooseDefault): nothing late first, then net in
  // the ledger's one currency (plan wave 3d). An answer that puts an order at
  // risk of lateness is worse than one that puts none, whatever it nets:
  // ranked on net alone, the record called taking better 19 times in the
  // no-input run (--suite=partner, arm p), each time with its own hour-later
  // price putting orders at risk (review 2, 13 November). Taking nets the measured margin on what it adds
  // less the late charges and forfeits it brings; waiting nets nothing. A
  // proposal from before nets were priced is ranked as it was: taking is
  // better only with no lateness.
  rank(optionId, price) {
    if (price.net !== undefined) return [(price.lateOrders ?? 0) > 0 ? 1 : 0, -price.net];
    if (optionId === 'take') return [(price.minutes ?? 0) > 0.5 ? 2 : 0];
    return [1];
  },
};

// ---------------------------------------------------------------------------
// Forfeit early: an order the line cannot make (plan item 3.7)
// ---------------------------------------------------------------------------

/** It waits as a service does; unanswered, the partner forfeits. */
export const FORFEIT_WINDOW_MINUTES = 30;

const forfeitKind: ProposalKindDefinition<'forfeit'> = {
  kind: 'forfeit',
  windowMinutes: FORFEIT_WINDOW_MINUTES,
  optionIds: ['forfeit', 'keep'],
  defaultOptionId: 'forfeit',
  raise(world) {
    return (world.forfeit ?? []).map((facts) => ({ subject: `forfeit-${facts.orderId}`, facts }));
  },
  price(optionId, facts) {
    const lacking = Math.max(0, finite(facts.lackingKg));
    const fee = Math.max(0, finite(facts.fee));
    if (optionId === 'forfeit') return { ...ZERO_PRICE, currency: round2(fee), kg: lacking };
    // Kept, it stays late to its bound, when it is forfeited with the same
    // fee. Made after all (the stamp recovered), it costs only the lateness.
    const late = lacking * Math.max(0, finite(facts.latePerKgHour)) * (facts.minutesToBound / 60);
    const reachable = meetsMinimumFigure(facts.best, facts.minimum);
    return {
      ...ZERO_PRICE,
      currency: round2(late + (reachable ? 0 : fee)),
      kg: reachable ? 0 : lacking,
      minutes: Math.max(0, finite(facts.minutesToBound)),
    };
  },
  effect(optionId, facts) {
    return optionId === 'forfeit'
      ? { type: 'forfeit-order', orderId: facts.orderId, best: facts.best }
      : { type: 'none' };
  },
  settle(proposal, world) {
    // The order closed meanwhile (shipped after all, or forfeited at its bound).
    if (world.openOrderIds && !world.openOrderIds.includes(proposal.facts.orderId))
      return { type: 'withdrawn' };
    // The line can make it again, or an answer already given will before its
    // bound (a drying answer in its rest): nothing is left to forfeit.
    if (world.forfeit && !world.forfeit.some((facts) => facts.orderId === proposal.facts.orderId))
      return { type: 'withdrawn' };
    return null;
  },
  outcome(proposal, world) {
    // An hour on, the best stamp then, for the order as it was raised.
    const now = (world.forfeit ?? []).find((facts) => facts.orderId === proposal.facts.orderId);
    return now ? { ...proposal.facts, best: now.best } : proposal.facts;
  },
  reason(facts) {
    return {
      key: 'reasonForfeit',
      params: { customer: facts.customer, minimum: facts.minimum, best: facts.best },
    };
  },
  // Raised only on an order the line cannot make, keeping it always adds the
  // late charge to the same fee: the record cannot come out the other way, so
  // it states what each answer cost and names no better one (review 2,
  // finding 5). What keeping costs is measured on the arms (p-wet-keep
  // against p-wet).
  judged: () => false,
};

/** The plan's tolerance (shipmentPlan meetsMinimum): a figure within 1e-6 of a minimum meets it. */
const meetsMinimumFigure = (figure: number, minimum: number) =>
  Number.isFinite(figure) && figure >= minimum - 1e-6;

/** One entry per kind. */
export const PROPOSAL_KINDS: { [K in ProposalKind]: ProposalKindDefinition<K> } = {
  programme: programmeKind,
  service: serviceKind,
  dispatch: dispatchKind,
  commitment: commitmentKind,
  forfeit: forfeitKind,
  intake: intakeKind,
  incident: incidentKind,
  temper: temperKind,
};

const definition = <K extends ProposalKind>(kind: K) =>
  PROPOSAL_KINDS[kind] as unknown as ProposalKindDefinition<K>;

// ---------------------------------------------------------------------------
// Pricing, raising, resolving, comparing
// ---------------------------------------------------------------------------

/** The one function that prices an answer. Buttons and the record both read it. */
export function priceOption<K extends ProposalKind>(
  kind: K,
  optionId: string,
  facts: ProposalFactsByKind[K]
): OptionPrice {
  const def = definition(kind);
  if (!def.optionIds.includes(optionId)) return { ...ZERO_PRICE };
  return def.price(optionId, facts);
}

export function priceAll<K extends ProposalKind>(
  kind: K,
  facts: ProposalFactsByKind[K]
): PricedOption[] {
  const def = definition(kind);
  return (def.optionsFor?.(facts) ?? def.optionIds)
    .filter((id) => def.available?.(id, facts) ?? true)
    .map((id) => ({ id, price: priceOption(kind, id, facts) }));
}

export function proposalReason<K extends ProposalKind>(
  kind: K,
  facts: ProposalFactsByKind[K]
): ProposalReason {
  return definition(kind).reason(facts);
}

export function proposalEffect<K extends ProposalKind>(
  kind: K,
  optionId: string,
  facts: ProposalFactsByKind[K]
): ProposalEffect {
  return definition(kind).effect(optionId, facts);
}

export function settleProposal(
  proposal: PartnerProposal,
  world: PlantWorld
): ProposalSettlement | null {
  return (definition(proposal.kind) as unknown as ProposalKindDefinition<ProposalKind>).settle(
    proposal as PartnerProposal<ProposalKind>,
    world
  );
}

/** New proposals the plant calls for now, given every proposal already raised. */
export function raiseProposals(
  world: PlantWorld,
  history: readonly PartnerProposal[],
  nextId: (index: number) => string,
  settledSubjects: readonly string[] = []
): PartnerProposal[] {
  const settled = new Set(settledSubjects);
  const subjects = new Set([
    ...settled,
    ...history.map((proposal) => `${proposal.kind}:${proposal.subject}`),
  ]);
  const raised: PartnerProposal[] = [];
  for (const kind of PROPOSAL_KIND_IDS) {
    const def = definition(kind) as unknown as ProposalKindDefinition<ProposalKind>;
    for (const { subject, facts } of def.raise(world, history, settled)) {
      if (subjects.has(`${kind}:${subject}`)) continue;
      subjects.add(`${kind}:${subject}`);
      const options = priceAll(kind, facts);
      raised.push({
        id: nextId(raised.length),
        kind,
        subject,
        raisedAtMinute: world.minute,
        windowMinutes: def.windowMinutes,
        options,
        defaultOptionId: def.chooseDefault?.(options, facts) ?? def.defaultOptionId,
        facts,
        sessionId: world.sessionId,
        status: 'open',
      });
    }
  }
  return raised;
}

/** The game minute an unanswered proposal resolves at. */
export const closesAtMinute = (
  proposal: Pick<PartnerProposal, 'raisedAtMinute' | 'windowMinutes'>
) => proposal.raisedAtMinute + proposal.windowMinutes;

/** Game minutes left to answer, never negative. */
export const minutesLeft = (
  proposal: Pick<PartnerProposal, 'raisedAtMinute' | 'windowMinutes'>,
  minute: number
) => Math.max(0, closesAtMinute(proposal) - minute);

export const isExpired = (
  proposal: Pick<PartnerProposal, 'raisedAtMinute' | 'windowMinutes' | 'status'>,
  minute: number
) => proposal.status === 'open' && minute >= closesAtMinute(proposal);

/** The proposal resolved with `optionId`. Pure: the caller has already run (or tried) its effect. */
export function resolveProposal<P extends PartnerProposal>(
  proposal: P,
  optionId: string,
  decidedBy: ProposalDecider,
  atMinute: number,
  ran: boolean
): P {
  if (proposal.status !== 'open') return proposal;
  return {
    ...proposal,
    status: 'resolved',
    resolution: { optionId, decidedBy, atMinute, ran },
  };
}

export function withdrawProposal<P extends PartnerProposal>(proposal: P): P {
  return proposal.status === 'open' ? { ...proposal, status: 'withdrawn' } : proposal;
}

/**
 * Whether a proposal's record may say which answer was better: false for a
 * kind whose comparison is fixed by arithmetic (`judged`), so a record saved
 * with a verdict before that was known reads without one.
 */
export function recordNamesBest(proposal: Pick<PartnerProposal, 'kind' | 'facts'>): boolean {
  const def = (PROPOSAL_KINDS as Record<string, ProposalKindDefinition<ProposalKind>>)[
    proposal.kind
  ];
  return def?.judged?.(proposal as PartnerProposal<ProposalKind>) ?? true;
}

/** True once an hour has passed since it resolved and it has no comparison yet. */
export const comparisonDue = (proposal: PartnerProposal, minute: number) =>
  proposal.status === 'resolved' &&
  !proposal.comparison &&
  !!proposal.resolution &&
  minute >= proposal.resolution.atMinute + COMPARISON_DELAY_MINUTES;

/**
 * Lower is better: a grade risk first, then money, then parts, then minutes
 * held back, then minutes waited (the unit stays worn while a booking waits).
 * Minutes offline are not ranked: they cost this plant nothing measurable.
 */
function priceRank(price: OptionPrice): [number, number, number, number, number] {
  const parts = Object.values(price.parts).reduce((sum, count) => sum + (count ?? 0), 0);
  return [
    price.gradeRisk ? 1 : 0,
    round2(price.currency),
    parts,
    price.minutes ?? 0,
    round2(price.waitMinutes ?? 0),
  ];
}

function cheaper(a: OptionPrice, b: OptionPrice): number {
  const [x, y] = [priceRank(a), priceRank(b)];
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

/**
 * The record an hour on: every answer priced again, with priceOption, on the
 * facts the hour measured. Never a second, separately invented number.
 */
export function compareProposal<P extends PartnerProposal>(
  proposal: P,
  world: PlantWorld,
  atMinute: number
): P {
  if (!proposal.resolution || proposal.comparison) return proposal;
  const def = definition(proposal.kind) as unknown as ProposalKindDefinition<ProposalKind>;
  const outcome = def.outcome(proposal as PartnerProposal<ProposalKind>, world);
  const prices = priceAll(proposal.kind, outcome as ProposalFactsByKind[typeof proposal.kind]);
  const order = (a: PricedOption, b: PricedOption) => {
    if (!def.rank) return cheaper(a.price, b.price);
    const [x, y] = [def.rank(a.id, a.price), def.rank(b.id, b.price)];
    for (let i = 0; i < Math.max(x.length, y.length); i++)
      if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  };
  const sorted = [...prices].sort(order);
  const judged = def.judged?.(proposal as PartnerProposal<ProposalKind>) ?? true;
  const best = judged && sorted.length > 1 && order(sorted[0], sorted[1]) < 0 ? sorted[0].id : null;
  return {
    ...proposal,
    comparison: {
      atMinute,
      prices,
      chosenOptionId: proposal.resolution.optionId,
      bestOptionId: best,
    },
  };
}

// ---------------------------------------------------------------------------
// Saved proposals: tolerant reading
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function sanitizePrice(value: unknown): OptionPrice | null {
  if (!isRecord(value) || !isNumber(value.currency) || !isNumber(value.kg)) return null;
  const parts: Partial<Record<PartName, number>> = {};
  if (isRecord(value.parts))
    for (const [part, count] of Object.entries(value.parts))
      if (['bearings', 'belts', 'filters', 'motors', 'sensors'].includes(part) && isNumber(count))
        parts[part as PartName] = count;
  const price: OptionPrice = {
    currency: value.currency,
    parts,
    kg: value.kg,
    minutes: isNumber(value.minutes) ? value.minutes : null,
    quality: isNumber(value.quality) ? value.quality : null,
    gradeRisk: value.gradeRisk === true,
  };
  if (isNumber(value.offlineMinutes)) price.offlineMinutes = value.offlineMinutes;
  if (isNumber(value.waitMinutes)) price.waitMinutes = value.waitMinutes;
  if (Array.isArray(value.belowMinimums) && value.belowMinimums.every(isNumber))
    price.belowMinimums = [...value.belowMinimums];
  if (isNumber(value.lateOrders)) price.lateOrders = value.lateOrders;
  if (isNumber(value.net)) price.net = value.net;
  if (isNumber(value.lateDeliveries)) price.lateDeliveries = value.lateDeliveries;
  if (value.held === 'no-part') price.held = 'no-part';
  if (
    isRecord(value.truckDelay) &&
    isNumber(value.truckDelay.chance) &&
    isNumber(value.truckDelay.minutes)
  )
    price.truckDelay = { chance: value.truckDelay.chance, minutes: value.truckDelay.minutes };
  return price;
}

function sanitizePriced(value: unknown): PricedOption[] | null {
  if (!Array.isArray(value)) return null;
  const priced: PricedOption[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.id !== 'string') return null;
    const price = sanitizePrice(entry.price);
    if (!price) return null;
    priced.push({ id: entry.id, price });
  }
  return priced;
}

/**
 * A saved proposal, or null when this build cannot read it (an unknown kind,
 * a missing field). Facts are re-read field by field against the kind's own
 * shape, so a save cannot hand the runtime something that is not a number.
 */
export function sanitizeProposal(value: unknown): PartnerProposal | null {
  if (!isRecord(value)) return null;
  const kind = value.kind;
  if (typeof kind !== 'string' || !(PROPOSAL_KIND_IDS as readonly string[]).includes(kind))
    return null;
  const def = definition(kind as ProposalKind);
  if (
    typeof value.id !== 'string' ||
    typeof value.subject !== 'string' ||
    typeof value.sessionId !== 'string' ||
    !isNumber(value.raisedAtMinute) ||
    !isNumber(value.windowMinutes) ||
    typeof value.defaultOptionId !== 'string' ||
    !def.optionIds.includes(value.defaultOptionId) ||
    !['open', 'resolved', 'withdrawn'].includes(value.status as string)
  )
    return null;
  const options = sanitizePriced(value.options);
  const facts = sanitizeFacts(kind as ProposalKind, value.facts);
  if (!options || !facts) return null;
  const proposal: PartnerProposal = {
    id: value.id,
    kind: kind as ProposalKind,
    subject: value.subject,
    raisedAtMinute: value.raisedAtMinute,
    windowMinutes: value.windowMinutes,
    options,
    defaultOptionId: value.defaultOptionId,
    facts,
    sessionId: value.sessionId,
    status: value.status as ProposalStatus,
  };
  const resolution = value.resolution;
  if (
    isRecord(resolution) &&
    typeof resolution.optionId === 'string' &&
    def.optionIds.includes(resolution.optionId) &&
    ['operator', 'agent', 'partner'].includes(resolution.decidedBy as string) &&
    isNumber(resolution.atMinute)
  )
    proposal.resolution = {
      optionId: resolution.optionId,
      decidedBy: resolution.decidedBy as ProposalDecider,
      atMinute: resolution.atMinute,
      ran: resolution.ran !== false,
      ...(resolution.refusal === 'no-part' || resolution.refusal === 'stopped'
        ? { refusal: resolution.refusal }
        : {}),
    };
  // A resolved proposal without a readable resolution cannot be compared.
  if (proposal.status === 'resolved' && !proposal.resolution) return null;
  const comparison = value.comparison;
  if (isRecord(comparison) && isNumber(comparison.atMinute)) {
    const prices = sanitizePriced(comparison.prices);
    if (prices && typeof comparison.chosenOptionId === 'string')
      proposal.comparison = {
        atMinute: comparison.atMinute,
        prices,
        chosenOptionId: comparison.chosenOptionId,
        bestOptionId: typeof comparison.bestOptionId === 'string' ? comparison.bestOptionId : null,
      };
  }
  return proposal;
}

const PART_NAMES: readonly PartName[] = ['bearings', 'belts', 'filters', 'motors', 'sensors'];

/** A saved dock, field by field, or null when any part of it is not one. */
function sanitizeDock(value: unknown): DockState | null {
  if (!isRecord(value) || !Array.isArray(value.orders)) return null;
  if (
    !isNumber(value.nextTruckInMinutes) ||
    !isNumber(value.cycleMinutes) ||
    !isNumber(value.capacityKg)
  )
    return null;
  const orders: DockOrder[] = [];
  for (const entry of value.orders) {
    if (
      !isRecord(entry) ||
      !isNumber(entry.remainingKg) ||
      !isNumber(entry.dueAtMinute) ||
      !['normal', 'high', 'critical'].includes(entry.priority as string) ||
      (entry.product !== 'flour' && entry.product !== 'semolina') ||
      typeof entry.programme !== 'string' ||
      typeof entry.reachable !== 'boolean' ||
      typeof entry.active !== 'boolean'
    )
      return null;
    orders.push({
      remainingKg: entry.remainingKg,
      dueAtMinute: entry.dueAtMinute,
      priority: entry.priority as DockOrder['priority'],
      product: entry.product,
      programme: entry.programme,
      reachable: entry.reachable,
      active: entry.active,
      ...(isNumber(entry.latePerKgHour) ? { latePerKgHour: entry.latePerKgHour } : {}),
    });
  }
  const dock: DockState = {
    orders,
    nextTruckInMinutes: value.nextTruckInMinutes,
    cycleMinutes: value.cycleMinutes,
    capacityKg: value.capacityKg,
    latestProgramme: typeof value.latestProgramme === 'string' ? value.latestProgramme : null,
  };
  const stock = value.stock;
  if (
    isRecord(stock) &&
    (['flour', 'semolina'] as const).every(
      (product) =>
        isRecord(stock[product]) &&
        isNumber((stock[product] as Record<string, unknown>).tested) &&
        isNumber((stock[product] as Record<string, unknown>).bench)
    )
  ) {
    const read = (product: 'flour' | 'semolina') => {
      const entry = stock[product] as Record<string, number>;
      return { tested: entry.tested, bench: entry.bench };
    };
    dock.stock = { flour: read('flour'), semolina: read('semolina') };
  }
  if (isNumber(value.lineKgPerMinute)) dock.lineKgPerMinute = value.lineKgPerMinute;
  if (
    value.lineProduct === 'flour' ||
    value.lineProduct === 'semolina' ||
    value.lineProduct === null
  )
    dock.lineProduct = value.lineProduct;
  if (isNumber(value.forfeitAfterMinutes)) dock.forfeitAfterMinutes = value.forfeitAfterMinutes;
  return dock;
}

function sanitizeFacts<K extends ProposalKind>(
  kind: K,
  value: unknown
): ProposalFactsByKind[K] | null {
  if (!isRecord(value)) return null;
  const numbers = (keys: string[]) => keys.every((key) => isNumber(value[key]));
  if (kind === 'dispatch') return sanitizeDispatchFacts(value) as ProposalFactsByKind[K] | null;
  if (kind === 'intake') return sanitizeIntakeFacts(value) as ProposalFactsByKind[K] | null;
  if (kind === 'incident') return sanitizeIncidentFacts(value) as ProposalFactsByKind[K] | null;
  if (kind === 'temper') return sanitizeTemperFacts(value) as ProposalFactsByKind[K] | null;
  if (kind === 'forfeit') {
    if (
      typeof value.orderId !== 'string' ||
      typeof value.customer !== 'string' ||
      !numbers(['minimum', 'best', 'lackingKg', 'latePerKgHour', 'minutesToBound', 'fee'])
    )
      return null;
    const facts: ForfeitFacts = {
      orderId: value.orderId,
      customer: value.customer,
      minimum: value.minimum as number,
      best: value.best as number,
      lackingKg: value.lackingKg as number,
      latePerKgHour: value.latePerKgHour as number,
      minutesToBound: value.minutesToBound as number,
      fee: value.fee as number,
    };
    return facts as ProposalFactsByKind[K];
  }
  if (kind === 'commitment') {
    if (
      !numbers([
        'programmeNumber',
        'programmeCount',
        'ask',
        'committedKg',
        'revenue',
        'lateMinutes',
        'holdMinutes',
      ]) ||
      !Array.isArray(value.orders)
    )
      return null;
    const orders: CommitmentOrder[] = [];
    for (const entry of value.orders) {
      if (!isRecord(entry) || !isNumber(entry.kg) || !isNumber(entry.dueInMinutes)) return null;
      if (!['normal', 'high', 'critical'].includes(entry.priority as string)) return null;
      if (entry.product !== 'flour' && entry.product !== 'semolina') return null;
      orders.push({
        kg: entry.kg,
        dueInMinutes: entry.dueInMinutes,
        priority: entry.priority as CommitmentOrder['priority'],
        product: entry.product as CommitmentOrder['product'],
        ...(isNumber(entry.latePerKgHour) ? { latePerKgHour: entry.latePerKgHour } : {}),
      });
    }
    const facts: CommitmentFacts = {
      programmeNumber: value.programmeNumber as number,
      programmeCount: value.programmeCount as number,
      ask: value.ask as number,
      committedKg: value.committedKg as number,
      revenue: value.revenue as number,
      orders,
      lateMinutes: value.lateMinutes as number,
      holdMinutes: value.holdMinutes as number,
    };
    // Plan wave 3d; a proposal from before carries none and is priced as it was.
    const dock = sanitizeDock(value.dock);
    if (dock && isNumber(value.atMinute) && isNumber(value.takenAtMinute)) {
      facts.dock = dock;
      facts.atMinute = value.atMinute;
      facts.takenAtMinute = value.takenAtMinute;
    }
    return facts as ProposalFactsByKind[K];
  }
  if (kind === 'programme') {
    if (
      !numbers([
        'programmeNumber',
        'programmeCount',
        'ask',
        'committedKg',
        'revenue',
        'firstDueMinutes',
        'stockReadyKg',
        'holdMinutes',
      ])
    )
      return null;
    const facts: ProgrammeFacts = {
      programmeNumber: value.programmeNumber as number,
      programmeCount: value.programmeCount as number,
      ask: value.ask as number,
      committedKg: value.committedKg as number,
      revenue: value.revenue as number,
      firstDueMinutes: value.firstDueMinutes as number,
      stockReadyKg: value.stockReadyKg as number,
      holdMinutes: value.holdMinutes as number,
    };
    return facts as ProposalFactsByKind[K];
  }
  if (
    typeof value.machineId !== 'string' ||
    typeof value.machineName !== 'string' ||
    typeof value.alertId !== 'string' ||
    !numbers([
      'wear',
      'breakdownWear',
      'wearPerMinute',
      'repairMinutes',
      'workOrderRatePerHour',
      'qualityServiced',
      'qualityAtFailure',
    ]) ||
    !Array.isArray(value.failureParts) ||
    !value.failureParts.every((part) => PART_NAMES.includes(part as PartName))
  )
    return null;
  const facts: ServiceFacts = {
    machineId: value.machineId,
    machineName: value.machineName,
    alertId: value.alertId,
    wear: value.wear as number,
    breakdownWear: value.breakdownWear as number,
    wearPerMinute: value.wearPerMinute as number,
    servicePart: PART_NAMES.includes(value.servicePart as PartName)
      ? (value.servicePart as PartName)
      : null,
    failureParts: value.failureParts as PartName[],
    repairMinutes: value.repairMinutes as number,
    workOrderRatePerHour: value.workOrderRatePerHour as number,
    qualityServiced: value.qualityServiced as number,
    qualityAtFailure: value.qualityAtFailure as number,
    strictestMinimum: isNumber(value.strictestMinimum) ? value.strictestMinimum : null,
  };
  // Added with the timed service (plan item 3.3); a proposal from before has none.
  if (Array.isArray(value.openMinimums) && value.openMinimums.every(isNumber))
    facts.openMinimums = [...value.openMinimums];
  for (const key of ['servicePartPrice', 'failurePartsPrice', 'serviceMinutes'] as const)
    if (isNumber(value[key])) facts[key] = value[key] as number;
  if (isNumber(value.minutesToQuiet) || value.minutesToQuiet === null)
    facts.minutesToQuiet = value.minutesToQuiet as number | null;
  if (value.reoffered === true) facts.reoffered = true;
  if (value.reofferedAfter === 'stopped' || value.reofferedAfter === 'no-part')
    facts.reofferedAfter = value.reofferedAfter;
  return facts as ProposalFactsByKind[K];
}

/**
 * A number in [0, 1) from a seed and an index (mulberry32 over their mix), for
 * any kind whose raising needs chance. Same seed and index, same number.
 */
export function seededUnit(seed: number, index: number): number {
  let t = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(index | 0, 0x85ebca6b)) >>> 0;
  t = (t + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), t | 1);
  r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
  return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
}
