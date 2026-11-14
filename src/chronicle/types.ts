/**
 * The Mill Chronicle: a long-arc campaign layer above the operations campaign.
 * See docs/CHRONICLE.md. Nothing here moves material or credits shipments; the
 * Chronicle reads recorded evidence and answers with bounded modifiers, a fund,
 * decisions and history.
 */
import type { IncidentKind } from '../stores/operationsCampaignStore';

// ---------------------------------------------------------------------------
// Charter (start options)
// ---------------------------------------------------------------------------

export type CharterTier = 'beginner' | 'historical' | 'hard';
export type GrainSupply = 'cooperative' | 'open_market' | 'marginal';
export type PlantCondition = 'overhauled' | 'working' | 'tired';
export type CustomerTemper = 'loyal' | 'mixed' | 'demanding';
export type Fortune = 'kind' | 'even' | 'hard';
export type ChronicleMode = 'historical' | 'no_trials' | 'sandbox';
/** 63 shifts (full) or 27 (short), D3. See `schedule.ts`. */
export type ChronicleLength = 'full' | 'short';

export interface Charter {
  grain: GrainSupply;
  plant: PlantCondition;
  customers: CustomerTemper;
  fortune: Fortune;
  mode: ChronicleMode;
  /**
   * Stored only for a short chronicle. Absent is the full one: every save from
   * before lengths existed, and every full chronicle since, so a full chronicle's
   * state is unchanged by the option (plan item 4.2).
   */
  length?: ChronicleLength;
  /** Seed for every Chronicle draw. Fixed at signing. */
  seed: number;
}

// ---------------------------------------------------------------------------
// Currencies and ledger
// ---------------------------------------------------------------------------

export type ChronicleResource = 'fund' | 'knowHow';
/**
 * What a choice costs. Castles II's desks of attention (works, trade and
 * council points) were cut on 2026-11-13 (D10): over 63 shifts they never
 * bound, and a slower refill that made them bind only forced lapses.
 */
export type Cost = Partial<Record<ChronicleResource, number>>;

export type FundSource =
  | 'charter'
  | 'reinvestment'
  | 'loyalty'
  | 'events'
  | 'upkeep'
  | 'mitigation'
  | 'installs'
  | 'contractors'
  | 'refunds'
  | 'suppression'
  | 'treatment'
  | 'federation'
  | 'reserve'
  | 'concessions'
  // Plan item 4.3: plant cost an installed plan avoided, at the full rate.
  | 'avoided'
  // Drying a Chronicle answer (the hired dryer, blending) kept off the plant's
  // books, at the same full rate (review 2, finding 2).
  | 'drying';

export type KnowHowSource =
  | 'grades'
  | 'qc'
  | 'notes'
  | 'quiz'
  | 'medals'
  | 'events'
  | 'plans'
  | 'forced_maintenance'
  | 'library'
  | 'event_costs'
  | 'policies';

export interface ChronicleLedger {
  fund: Record<FundSource, number>;
  knowHow: Record<KnowHowSource, number>;
  /** What the most recent shift close itself moved, and nothing after it. */
  lastShiftFund: Partial<Record<FundSource, number>>;
  lastShiftKnowHow: Partial<Record<KnowHowSource, number>>;
  /** What has moved since that close (decisions, installs, refunds), until the next one. */
  sinceCloseFund: Partial<Record<FundSource, number>>;
  sinceCloseKnowHow: Partial<Record<KnowHowSource, number>>;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

/** One combined answer the central tick multiplies into the plant. */
export interface ChronicleEffect {
  productionMultiplier: number;
  energyMultiplier: number;
  wearMultiplier: number;
  /** Quality points subtracted from the quality KPI. */
  qualityPenalty: number;
  /**
   * Multiplier on the energy the temper card's "dry first" books (plan item
   * 7.7), 0 to 1: a hired mobile dryer makes it 0, blending halves it.
   */
  dryingEnergyMultiplier: number;
}

export interface ModifierValues {
  production?: number;
  energy?: number;
  wear?: number;
  qualityPenalty?: number;
  /** Added to the reinvestment share (0.05 = five percentage points). */
  reinvestment?: number;
  /** Added to every forecast probability (-0.1 = ten points less likely). */
  forecastChance?: number;
  /** Upkeep multiplier. */
  upkeep?: number;
  /**
   * Multiplier on the energy the temper card's "dry first" books (plan item
   * 7.7): 0 while a hired mobile dryer stands.
   */
  dryingEnergy?: number;
  /**
   * A ceiling on the production multiplier (Mao's Legacy: "Industry does not
   * rise above 50.0"). It costs nothing until the plant would run above it.
   */
  productionCeiling?: number;
}

export interface TimedModifier extends ModifierValues {
  id: string;
  sourceId: string;
  label: string;
  remainingShifts: number;
}

// ---------------------------------------------------------------------------
// Eras and improvement plans
// ---------------------------------------------------------------------------

export type EraId = 'village' | 'cooperative' | 'district' | 'regional' | 'federated';

export interface EraDefinition {
  id: EraId;
  label: string;
  order: number;
  requires: { improvements: number; knowHowEarned: number; trialsPassed: number };
  bonus: ModifierValues;
  /** History note unlocked on reaching this era. */
  noteId: string | null;
  /** Certifier standing the era also needs (docs/CHRONICLE.md, system 23). */
  minStanding?: number;
}

export type ImprovementId = string;

export interface ImprovementDefinition {
  id: ImprovementId;
  label: string;
  /** Grid column (era order, 0-based) and row for the plan tree. */
  column: number;
  row: number;
  era: EraId;
  requires: ImprovementId[];
  planCost: number; // know-how
  installCost: number; // fund
  installShifts: number;
  upkeep: number; // fund per shift once installed
  effect: ModifierValues;
  /** Forecast kinds whose base chance this plan reduces, with the reduction. */
  forecastRelief?: Partial<Record<ForecastKind, number>>;
  /** Removes the crop-year quality penalty from these crop kinds. */
  cropRelief?: CropKind[];
  /** Extra know-how per closed shift. */
  knowHowPerShift?: number;
  noteId?: string;
}

export type ImprovementPhase = 'planned' | 'installing' | 'installed';

export interface ImprovementProgress {
  id: ImprovementId;
  phase: ImprovementPhase;
  contractorId: string | null;
  startedShift: number | null;
  completesShift: number | null;
  /** Fund actually paid for the install, refunded in full on cancellation. */
  paidFund: number;
  /** Effect scale from the contractor's Diligent/Neglectful trait. */
  effectScale: number;
  initiatedBy: Actor;
}

// ---------------------------------------------------------------------------
// Contractors (Old Kingdom architects)
// ---------------------------------------------------------------------------

export type TraitGroup = 'cost' | 'effect' | 'risk' | 'speed';
export type TraitId =
  | 'thrifty'
  | 'wasteful'
  | 'diligent'
  | 'neglectful'
  | 'careful'
  | 'reckless'
  | 'expeditious'
  | 'passive';

export interface ContractorTrait {
  id: TraitId;
  group: TraitGroup;
  positive: boolean;
  /** Percentage magnitude, rolled within the Old Kingdom range. */
  magnitude: number;
}

export interface Contractor {
  id: string;
  name: string;
  strength: ContractorTrait;
  weakness: ContractorTrait;
  retainer: number;
  cropYear: number;
}

// ---------------------------------------------------------------------------
// Crop years
// ---------------------------------------------------------------------------

export type CropKind = 'typical' | 'bountiful' | 'wet' | 'dry' | 'sprouted';

export interface CropYearDefinition {
  kind: CropKind;
  label: string;
  moisture: { mean: number; spread: number };
  protein: { mean: number; spread: number };
  fallingNumber: { mean: number; spread: number };
  /** Quality penalty while wheat recipes run on this year's unconditioned grain. */
  wheatPenalty: number;
  /** Penalty that remains after conditioning or blending. */
  treatedPenalty: number;
  reinvestment?: number;
  noteId: string | null;
}

export interface CropAttributes {
  cropYear: number;
  kind: CropKind;
  moisturePct: number;
  proteinPct: number;
  fallingNumberS: number;
}

export interface CropYearState {
  index: number;
  kind: CropKind;
  treated: boolean;
  /**
   * How the line's wet grain is tempered this crop year (plan item 7.7,
   * chronicle/temper.ts). Absent on a save from before it, and on any year
   * no temper card has answered: the standard temper.
   */
  temper?: TemperState;
}

/** A temper answer (chronicle/temper.ts): the standard temper, or drying the wheat first. */
export type TemperOptionId = 'standard' | 'dry-first';

/** One shift's wheat tempered one way, at the rolls from `fromMinute` (campaign game minutes). */
export interface TemperEntry {
  option: TemperOptionId;
  fromMinute: number;
  untilMinute: number;
}

export interface TemperState {
  /** The temper of the grain at the rolls now. */
  inForce: TemperOptionId;
  /** Answers given, latest last, until each has passed. */
  schedule: TemperEntry[];
}

// ---------------------------------------------------------------------------
// Forecasts (Old Kingdom flood with paid mitigation)
// ---------------------------------------------------------------------------

export type ForecastKind = Extract<
  IncidentKind,
  'severe_rain' | 'power_sag' | 'dust_filter_pressure' | 'delayed_truck'
>;

export interface ForecastDefinition {
  kind: ForecastKind;
  title: string;
  text: string;
  baseChance: number;
  mitigationLabel: string;
  mitigationCost: number;
  mitigationRelief: number;
  leadShifts: number;
}

export interface ForecastState {
  id: string;
  kind: ForecastKind;
  issuedShift: number;
  dueShift: number;
  chance: number;
  mitigated: boolean;
  mitigatedBy: Actor | null;
  /** Fund actually paid for the mitigation, refunded exactly on reversal. */
  paidFund: number;
  status: 'pending' | 'struck' | 'passed' | 'postponed';
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type EventPolarity = 'positive' | 'negative' | 'neutral';
export type CustomerId = 'riverside' | 'pasta' | 'school';
/** Organisations that are not customers (docs/CHRONICLE.md, system 18). */
export type StakeholderId = 'growers' | 'haulier' | 'village' | 'federation';
export type PartyId = CustomerId | StakeholderId;

export interface RelationshipDelta {
  /** A customer, an organisation, or 'all' for every customer. */
  customer: PartyId | 'all';
  delta: number;
}

// ---------------------------------------------------------------------------
// The record (docs/CHRONICLE.md, systems 16-24)
// ---------------------------------------------------------------------------

export type MarkId = string;

/**
 * A finished cooperative season on the floor, as the shift-close evidence
 * carries it (plan item 5.10): facts only, no kilograms, no credits and
 * nothing about a person.
 */
export interface CooperativeSeasonFact {
  seasonId: string;
  profile: 'toe-dip' | 'team' | 'cooperative';
  delivery: 'met' | 'shortfall' | 'blocked' | 'pending';
  agreement: 'honoured' | 'incomplete' | 'pending';
  sobrasDestination: 'members' | 'reserve' | 'community' | null;
}

/** A season the Chronicle has written into its record, and the shift it closed in. */
export interface CooperativeSeasonRecord extends CooperativeSeasonFact {
  shift: number;
}

export type FrontId = 'intake' | 'floor';
export type Leaning = 'growers' | 'customers' | 'ledger' | 'standards' | 'valley';

export interface DecisionMark {
  id: MarkId;
  shift: number;
  eventId: string;
  choiceId: string;
  actor: Actor;
}

export interface MarkCondition {
  all?: MarkId[];
  any?: MarkId[];
  none?: MarkId[];
}

/** One condition vocabulary for choice requirements, echoes, variants and epilogue slides. */
export interface ChronicleCondition {
  marks?: MarkCondition;
  /** An installed improvement plan. */
  plan?: ImprovementId;
  /** A history note the player has read. */
  note?: string;
  party?: { id: PartyId; tier?: RelationshipTier; notTier?: RelationshipTier };
  minStanding?: number;
  suspended?: boolean;
  anyOf?: ChronicleCondition[];
  /**
   * This long-night front has less preparation than the other (a tie is the
   * roller floor's). Read where the engine picks a choice's variant
   * (`effectiveChoice`), since preparation lives in longNight.ts.
   */
  weakerFront?: FrontId;
}

export interface FollowUp {
  eventId: string;
  afterShifts: number;
}

export interface ScheduledFollowUp {
  id: string;
  eventId: string;
  dueShift: number;
  sourceEventId: string;
}

export interface CertifierState {
  /** Standing in hundredths, 100 to 999; standing is the hundreds digit. */
  score: number;
  suspended: boolean;
  /**
   * Batches that passed QC since the certifier last read the record, and the
   * hundredths they will bring at its review at the crop year's turn. Absent in
   * saves from before the review; absent reads as none.
   */
  review?: { batches: number; hundredths: number };
}

export interface ChronicleEventEffect {
  fund?: number;
  knowHow?: number;
  modifier?: ModifierValues & { label: string; shifts: number };
  relationship?: RelationshipDelta | RelationshipDelta[];
  /** Marks left in the record. */
  marks?: MarkId[];
  /** Marks removed from the record (a repaid debt). */
  clearMarks?: MarkId[];
  /** Events scheduled to appear later. */
  followUp?: FollowUp | FollowUp[];
  /** Events the AI partner rules at once with their defaults, in order. */
  resolveChain?: string[];
  /** Certifier standing in hundredths. */
  standing?: number;
  suspend?: boolean;
  reinstate?: boolean;
  /** The long night: the front the mill holds with its own hands. */
  holdFront?: FrontId;
  /** Raise a real operations incident, owned and recoverable by the Chronicle. */
  incident?: Extract<IncidentKind, ForecastKind | 'supplier_contamination' | 'packaging_shortage'>;
  /** Treat the current crop year (conditioning, drying or blending). */
  treatCrop?: boolean;
  /** Close an open food-safety inspection. */
  closeInspection?: boolean;
  /** The assembly accepts the federation's administrator (system 32). */
  administration?: boolean;
  unlockNote?: string;
  /** Result text shown in the notes feed. */
  result: string;
}

export interface ChronicleEventChoice {
  id: string;
  label: string;
  cost?: Cost;
  effect: ChronicleEventEffect;
  /** The choice the AI partner takes when delegated routine events. */
  aiRecommended?: boolean;
  /** The choice is available only when this holds; the button says what it needs. */
  requires?: ChronicleCondition;
  /** The first variant whose condition holds replaces the effect. */
  variants?: Array<{ when: ChronicleCondition; effect: ChronicleEventEffect; because: string }>;
  /** The ruling is handed to the AI partner: its marks are the partner's. */
  delegates?: boolean;
}

export interface ChronicleEventRequirements {
  minEra?: EraId;
  cropKinds?: CropKind[];
  minShift?: number;
  /** The last shift the event can appear on. */
  maxShift?: number;
  /** Requires at least one customer at this tier. */
  customerTier?: RelationshipTier;
  /** Requires a fulfilled commitment for this customer since signing. */
  deliveredTo?: CustomerId;
  modes?: ChronicleMode[];
  marks?: MarkCondition;
  /** Requires the food-standards approval to be suspended (true) or in force (false). */
  suspended?: boolean;
}

export interface ChronicleEventDefinition {
  id: string;
  title: string;
  text: string;
  polarity: EventPolarity;
  weight: number;
  /** Routine events may be answered by the AI partner at delegation level 1+. */
  routine: boolean;
  requires?: ChronicleEventRequirements;
  /** Effect applied the moment the event appears, before any choice. */
  onAppear?: { inspection?: boolean };
  choices: ChronicleEventChoice[];
  /** Applied if "Think it over" runs out. Must name a choice with no cost. */
  defaultChoiceId: string;
  lapseShifts: number;
  noteId?: string;
  /** Placed at this shift instead of drawn. */
  scheduled?: { shift: number };
  /** Appears only as another choice's follow-up; never drawn. */
  chained?: boolean;
  /** The first echo whose condition holds replaces the text when the event appears. */
  echoes?: Array<{ when: ChronicleCondition; text: string; because: string }>;
}

export interface PendingEvent {
  instanceId: string;
  eventId: string;
  appearedShift: number;
  lapsesShift: number;
  /** The echo chosen when the event appeared. */
  echo?: { text: string; because: string };
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export type RelationshipTier = 'cool' | 'neutral' | 'warm';

export interface CustomerRelationship {
  id: CustomerId;
  name: string;
  value: number;
}

export interface StakeholderRelationship {
  id: StakeholderId;
  name: string;
  value: number;
}

// ---------------------------------------------------------------------------
// Trials
// ---------------------------------------------------------------------------

export type TrialId =
  | 'wet_harvest'
  | 'inspection'
  | 'bakers_rush'
  | 'grid_winter'
  | 'great_programme';
export type Medal = 'gold' | 'silver' | 'bronze';

export interface TrialDefinition {
  id: TrialId;
  title: string;
  /** Shift index at which the trial starts; it is telegraphed `telegraphShifts` earlier. */
  startShift: number;
  /** Shifts of warning before the start; absent is TRIAL_TELEGRAPH_SHIFTS (2). */
  telegraphShifts?: number;
  durationShifts: number;
  goldSpare: number;
  silverSpare: number;
  goal: TrialGoal;
  introNoteId: string;
  outroNoteId: string;
  briefing: string;
  /**
   * The briefing with its goal's figures as `{kg}` and `{cap}` (item 4.1): the
   * English `briefing` is it filled; the trial in another language fills its
   * translation. Absent where the briefing names no figure.
   */
  briefingTemplate?: string;
  /**
   * What the trial tested on the plant floor, as announcements from item 4.5
   * until D14 cut it as advice carried it after the briefing. Shown nowhere
   * now; kept so a saved announcement is still recognised and translated.
   */
  floor: string;
  pressureBeat: string;
}

/** A condition of a clean close that a close failed (item 4.5). */
export type CleanCloseBreak = 'qc' | 'quality' | 'incident';

export type TrialGoal =
  | {
      kind: 'dispatch';
      kg: number;
      noQualityFailure?: boolean;
      maxEnergyPerKg?: number;
      minAverageGrade?: 'A' | 'B' | 'C';
    }
  | { kind: 'clean_closes'; closes: number };

export interface TrialProgress {
  id: TrialId;
  phase: 'scheduled' | 'telegraphed' | 'active' | 'passed' | 'failed' | 'skipped';
  startedShift: number | null;
  shiftsUsed: number;
  dispatchedKg: number;
  qualityFailureKg: number;
  energyCost: number;
  gradePoints: number;
  /**
   * Shifts that carried a grade. An idle window (no commitment, nothing
   * shipped) has none. Absent in saves from before it; read as shiftsUsed.
   */
  gradedShifts?: number;
  cleanCloses: number;
  /**
   * The last close that broke a run of clean closes, and what it lacked, so the
   * failure can say so. Absent in saves from before it, and until a run breaks.
   */
  brokenAt?: { shift: number; causes: CleanCloseBreak[] };
  medal: Medal | null;
  pressureShown: boolean;
  failureReason: string | null;
}

// ---------------------------------------------------------------------------
// Delegation (Old Kingdom decentralization)
// ---------------------------------------------------------------------------

export type DelegationLevel = 0 | 1 | 2 | 3;
export type Actor = 'player' | 'ai-partner' | 'chronicle';

export interface Initiative {
  id: string;
  shift: number;
  kind: 'event' | 'mitigation' | 'install' | 'suppression' | 'restore';
  targetId: string;
  summary: string;
  reason: string;
  reversible: boolean;
  reversed: boolean;
}

// ---------------------------------------------------------------------------
// History notes and quiz
// ---------------------------------------------------------------------------

export type HistoryTrigger =
  | 'charter_signed'
  | 'first_receiving'
  | 'first_qc_test'
  | 'first_shift_report'
  | 'first_forecast'
  | `crop:${CropKind}`
  | `incident:${IncidentKind}`
  | `era:${EraId}`
  | `improvement:${string}`
  | `trial_intro:${TrialId}`
  | `trial_outro:${TrialId}`
  | 'fire'
  | 'delegation'
  | 'contractor_hired'
  | 'chronicle_end'
  | 'first_return'
  | 'quota_raised'
  | 'brief_set'
  | 'assembly_vote';

export interface HistoryNote {
  id: string;
  title: string;
  /** One sentence for the notes feed. */
  brief: string;
  /** Markdown article for Datalinks. */
  article: string;
  triggers: HistoryTrigger[];
  relatedEntries: string[];
}

export interface QuizQuestion {
  id: string;
  noteId: string;
  prompt: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
}

// ---------------------------------------------------------------------------
// Notes feed
// ---------------------------------------------------------------------------

export type NoticeKind =
  | 'history'
  | 'event'
  | 'forecast'
  | 'trial'
  | 'era'
  | 'ledger'
  | 'initiative';

export interface ChronicleNotice {
  id: string;
  shift: number;
  kind: NoticeKind;
  title: string;
  body: string;
  relatedId: string | null;
}

// ---------------------------------------------------------------------------
// Commands the store performs on other stores after a reducer step
// ---------------------------------------------------------------------------

export type ChronicleCommand =
  | { type: 'raise_incident'; kind: IncidentKind; reason: string }
  /** `actor: 'operator'` when the player chose it, so the shift review counts it. */
  | { type: 'resolve_incident'; incidentId: string; actor?: 'operator' }
  | { type: 'start_fire' }
  | { type: 'resolve_fire' }
  | { type: 'unlock_note'; noteId: string }
  | { type: 'clear_weather' };

// ---------------------------------------------------------------------------
// Part three: standing orders (docs/CHRONICLE.md, systems 25-32), after
// Kremlingames' Crisis in the Kremlin, Ostalgie and Mao's Legacy
// ---------------------------------------------------------------------------

/** The mill's policy ladders (CiK doctrines; ML `Doctr_en`). */
export type PolicyLadder = 'maintenance' | 'intake' | 'stock' | 'orders';
/** A step on a ladder: 0 and 2 are the ends, 1 the middle every chronicle starts on. */
export type PolicyRung = 0 | 1 | 2;
export type Policies = Record<PolicyLadder, PolicyRung>;

/** The AI partner's declared priorities (CiK: "views ... help to predict their actions"). */
export type BriefId = 'conventional' | 'standards' | 'thrift' | 'neighbour';

export type StandingConditionId =
  | 'tired-machinery'
  | 'deferred-maintenance'
  | 'worn-rolls'
  | 'thin-stocks'
  | 'behind-plan'
  | 'administration';

/** An ongoing condition that names its own way out (ML `old_modify_opis_en`: "To deactivate:"). */
export interface StandingCondition {
  id: StandingConditionId;
  sinceShift: number;
}

/** Counts the conditions read: how long each policy or state has held. */
export interface GovernanceStreaks {
  outOfAusterity: number;
  runToFailure: number;
  offRunToFailure: number;
  stockedUp: number;
}

/** An organisation's warning that a policy crosses its red line (ML: "In {0} months..."). */
export interface Countdown {
  id: string;
  party: StakeholderId;
  ladder: PolicyLadder;
  rung: PolicyRung;
  dueShift: number;
}

export type CrewRoleId =
  | 'head-miller'
  | 'roll-fitter'
  | 'intake-grader'
  | 'lab'
  | 'packing'
  | 'yard';
export type Temperament = 'cautious' | 'eager' | 'even';

/**
 * A member of the crew: an anonymous role with a temperament, a value, a
 * preference and a need. None of it is a score. Their values predict their
 * votes and objections; nothing rises or falls with how they are treated.
 */
export interface CrewMember {
  id: CrewRoleId;
  role: string;
  temperament: Temperament;
  value: string;
  prefers: { ladder: PolicyLadder; rung: PolicyRung };
  need: {
    text: string;
    /** The step that would cut against the need. */
    ladder: PolicyLadder;
    rung: PolicyRung;
    /** What meeting the need another way costs, and what it is. */
    concession: string;
    fund: number;
  };
}

export type CrewVote = 'for' | 'against' | 'abstain';

export interface CrewBallot {
  memberId: CrewRoleId;
  vote: CrewVote;
  reason: string;
}

/** A change to one policy, put to the members' assembly. */
export interface PolicyProposal {
  ladder: PolicyLadder;
  from: PolicyRung;
  to: PolicyRung;
  proposedShift: number;
  /** Members whose need the steward has met another way. */
  concessions: CrewRoleId[];
}

/**
 * A member's standing objection, met through their concession. Either they
 * were outvoted on a need (the step, lifted when the policy moves off), or a
 * ruling in the record cut against what they value (`ruling`, item 4.10).
 */
export type CrewObjection =
  | { memberId: CrewRoleId; ladder: PolicyLadder; rung: PolicyRung; raisedShift: number }
  | { memberId: CrewRoleId; ruling: MarkId; raisedShift: number; ladder?: never; rung?: never };

/** One crop year's return to the federation, drawn from recorded evidence only. */
export interface CropYearReturn {
  year: number;
  shifts: number;
  dispatchedKg: number;
  quotaKg: number | null;
  met: boolean | null;
  nextQuotaKg: number | null;
  qualityFailureKg: number;
  energyCost: number;
  averageGrade: number | null;
  fundReinvested: number;
  knowHowEarned: number;
  policies: Policies;
  conditions: StandingConditionId[];
}

export interface CropYearTally {
  year: number;
  shifts: number;
  dispatchedKg: number;
  qualityFailureKg: number;
  energyCost: number;
  gradePoints: number[];
  fundReinvested: number;
  /** Know-how earned since signing when the year began; the return counts from here. */
  knowHowStart: number;
}

/** The co-op's indivisible reserve (CiK gold reserve, "ON/OFF Autofill reserve"). */
export interface ReserveState {
  balance: number;
  autofill: boolean;
  drawn: number;
}

export interface GovernanceState {
  policies: Policies;
  /** Shift each ladder last changed, for its lock. */
  changedShift: Record<PolicyLadder, number | null>;
  streaks: GovernanceStreaks;
  crew: CrewMember[];
  proposal: PolicyProposal | null;
  objections: CrewObjection[];
  conditions: StandingCondition[];
  countdowns: Countdown[];
  /** Red lines already acted on, by `${party}:${ladder}:${rung}`, so each is crossed once. */
  brokenOff: string[];
  brief: BriefId;
  tally: CropYearTally;
  returns: CropYearReturn[];
  quotaKg: number | null;
  missedInRow: number;
  reserve: ReserveState;
  /** The federation's administrator: shift it leaves, and the delegation it found. */
  administration: { untilShift: number; previousDelegation: DelegationLevel } | null;
  /** The charter's tired machinery has been renewed. */
  machineryRenewed: boolean;
  /**
   * Organisations moved outside a ruling, oldest first and bounded. Rulings
   * are read back from the event history; these have none. Absent in saves
   * from before it was kept.
   */
  partyChanges?: PartyChangeRecord[];
}

/** What moved an organisation when no ruling did (systems 25, 28, 30). */
export type PartyChangeCause =
  /** A standing policy's effect at a crop year's turn. */
  | { kind: 'policy'; ladder: PolicyLadder; rung: PolicyRung }
  /** A red line's countdown ran out with the policy still on it. */
  | { kind: 'red-line'; ladder: PolicyLadder; rung: PolicyRung }
  /** A crop-year return met or missed its quota; `year` is the return's own. */
  | { kind: 'quota'; met: boolean; year: number };

export interface PartyChangeRecord {
  party: StakeholderId;
  shift: number;
  delta: number;
  cause: PartyChangeCause;
}
