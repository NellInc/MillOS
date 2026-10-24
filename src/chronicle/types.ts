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

export interface Charter {
  grain: GrainSupply;
  plant: PlantCondition;
  customers: CustomerTemper;
  fortune: Fortune;
  mode: ChronicleMode;
  /** Seed for every Chronicle draw. Fixed at signing. */
  seed: number;
}

// ---------------------------------------------------------------------------
// Currencies and ledger
// ---------------------------------------------------------------------------

export type ChronicleResource = 'fund' | 'knowHow';
/** Castles II's administrative, military and political points (docs/CHRONICLE.md, system 24). */
export type Desk = 'works' | 'trade' | 'council';
export type Cost = Partial<Record<ChronicleResource, number>> & {
  attention?: Partial<Record<Desk, number>>;
};

export interface DeskState {
  points: number;
  room: number;
  spent: number;
}

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
  | 'suppression';

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
  | 'event_costs';

export interface ChronicleLedger {
  fund: Record<FundSource, number>;
  knowHow: Record<KnowHowSource, number>;
  /** Totals for the most recently closed shift, for the "last shift" column. */
  lastShiftFund: Partial<Record<FundSource, number>>;
  lastShiftKnowHow: Partial<Record<KnowHowSource, number>>;
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
  /** Shift index at which the trial starts; it is telegraphed two shifts earlier. */
  startShift: number;
  durationShifts: number;
  goldSpare: number;
  silverSpare: number;
  goal: TrialGoal;
  introNoteId: string;
  outroNoteId: string;
  briefing: string;
  pressureBeat: string;
}

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
  cleanCloses: number;
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
  | 'chronicle_end';

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
  | { type: 'resolve_incident'; incidentId: string }
  | { type: 'start_fire' }
  | { type: 'resolve_fire' }
  | { type: 'unlock_note'; noteId: string }
  | { type: 'clear_weather' };
