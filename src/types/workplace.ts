import type { PackingAdvice } from './workplaceAdvice';
import type { KeyedLine } from '../i18n/alertCopy';

/** Local, synthetic workplace laboratory. No identity or health information. */
export type WorkplaceMode = 'game' | 'workshop' | 'pilot';
export type WorkplacePhase = 'idle' | 'deliberating' | 'active' | 'review';
export type PracticeId =
  | 'information'
  | 'work-choice'
  | 'rest'
  | 'remedy'
  | 'budget'
  | 'gainsharing'
  | 'cooperative';
export type WorkplacePlanId = 'steady' | 'resequence' | 'cover' | 'rush';
export type ObjectionKind = 'rest' | 'burden' | 'privacy' | 'authority';
export type SurplusDestination = 'members' | 'reserve' | 'community';
export type WorkplaceProfile = 'toe-dip' | 'team' | 'cooperative';
export type WorkplacePressureId = 'disclosure' | 'blind-override' | 'repeat-cover';
export type WorkplacePressureResponse = 'accept-demand' | 'protect-boundary';
export type WorkplaceCheckId = 'refusal' | 'privacy' | 'repayment' | 'authority';
export type WorkplaceAnswer =
  | 'individual'
  | 'majority'
  | 'optional'
  | 'required'
  | 'retained'
  | 'forfeit'
  | 'bounded'
  | 'unlimited';
export type WorkplaceDecision =
  | 'keep-target'
  | 'renegotiate'
  | 'inspect'
  | 'protect-refusal'
  | 'penalize-refusal'
  | 'skip-inspection';

/** A commitment linked to existing, quality-qualified customer dispatch credit. */
export interface WorkplaceMission {
  orderId: string;
  customer: string;
  materialSessionId: string;
  startingShippedKg: number;
  originalTargetKg: number;
  targetKg: number;
  observedShippedKg: number;
  creditedKg: number;
  manifestIds: string[];
  evidence: 'current' | 'stale' | 'quality-failed' | 'missing';
}

export interface WorkplaceMissionObservation {
  orderId: string | null;
  materialSessionId: string;
  shippedKg: number;
  qualityFailureKg: number;
  manifestIds: string[];
  cancelled: boolean;
  /**
   * 5.7: a batch of the order the season works awaiting its bench test now,
   * null when none does. Absent when the caller does not read the bench.
   */
  pendingSampleBatchId?: string | null;
  /** 5.7: what the bench made of Monday's held sample, once it has left the queue. */
  sampleReading?: WorkplaceSampleReading | null;
}

/** 5.7: the lab's reading of Monday's sample: its real stamp against the order's minimum. */
export interface WorkplaceSampleReading {
  batchId: string;
  /** False when the batch left the bench untested (shipped, recalled or held). */
  tested: boolean;
  passed: boolean;
  quality: number | null;
  minimum: number | null;
}

/**
 * 5.7: Monday's real sample. Null once the bench is read and no sample has
 * held the line; absent in a season that has not read the bench (older saves,
 * engine-only callers), which keep the scripted minute.
 */
export type WorkplaceMondaySample = { batchId: string; heldAtMinute: number } | null;

export interface WorkplaceShiftRecord {
  shift: number;
  seed: number;
  planId: WorkplacePlanId;
  targetKg: number;
  shippedKg: number;
  minute: number;
  finance: WorkplaceFinance;
  members: Pick<
    WorkplaceMember,
    | 'id'
    | 'extraMinutes'
    | 'restMinutes'
    | 'earnedPay'
    | 'compensationPaid'
    | 'recoveryMinutes'
    | 'recoveryOwedMinutes'
    | 'refusalRespected'
  >[];
  refusalsRespected: number;
  promisesKept: number;
  objectionsRaised: number;
  objectionsResolved: number;
  decision: WorkplaceDecision | null;
  inspectionComplete: boolean;
  repairs: number;
  practices: PracticeId[];
  workerAutonomy: WorkplaceState['workerAutonomy'];
  governance: WorkplaceState['governance'];
  aiAuthority: WorkplaceState['aiAuthority'];
  agreementProved: boolean;
  /** Public, bounded receipts only. Absent in older version-one saves. */
  relationshipEvents?: WorkplaceEvent[];
  /** 5.7: Monday's sample as the shift ended; absent on other shifts and older saves. */
  mondaySample?: WorkplaceMondaySample;
}

export interface WorkplaceCampaign {
  version: 1;
  profile: WorkplaceProfile;
  shift: number;
  history: WorkplaceShiftRecord[];
  checks: Record<string, Partial<Record<WorkplaceCheckId, WorkplaceAnswer>>>;
  decision: WorkplaceDecision | null;
  inspectionUntilMinute: number | null;
  inspectionComplete: boolean;
  adviserAcknowledged: boolean;
  repairs: number;
  agreementProved: boolean;
  mission?: WorkplaceMission;
  /**
   * The mill's next order, linked at a shift boundary once the commitment's
   * order is fulfilled. Its fresh receipts credit the cooperative's books;
   * the season's delivery outcome stays the commitment's.
   */
  followOn?: WorkplaceMission;
  /**
   * What the season's seed drew when it started (5.10). Absent in a season
   * begun before draws existed, which keeps the fixed order (legacy draw).
   */
  draw?: WorkplaceSeasonDraw;
  /**
   * The Fundo de Reserva brought forward from the previous season (Lei
   * 5.764/71, art. 28 I). Opening cash includes it. Absent means none.
   */
  reserveBrought?: number;
  /**
   * 5.2: the checks each role has answered correctly under the current terms.
   * They are put back whenever consent expires and forgotten when the terms
   * change, so a check is asked again only then. Absent in older saves.
   */
  understoodChecks?: Partial<Record<string, WorkplaceCheckId[]>>;
  /** 5.7: Monday's real sample (see WorkplaceMondaySample); Monday's shift only. */
  mondaySample?: WorkplaceMondaySample;
  /**
   * Review 2: the season's place in the order seasons began (1, 2, 3 ...), so
   * the Reserve Fund is carried from the season before, once. Absent in older saves.
   */
  season?: number;
  /**
   * Review 2: the order a resequenced shift made active, linked from its
   * shipped weight at activation, when the season does not link it already.
   * Its fresh receipts credit the season; it lasts the shift.
   */
  sequenced?: WorkplaceMission;
}

/** A season's seeded variation: the order of pressures, who declines cover, Monday's minute. */
export interface WorkplaceSeasonDraw {
  pressures: WorkplacePressureId[];
  /** The authored cover-qualified member who will not cover this season. */
  decliner: 'maintenance' | 'coordinator';
  /** The minute of Monday's disputed sample. */
  mondayMinute: number;
}

/**
 * Sobras settled at a season's end (Lei 5.764/71, arts. 4 VII, 28, 44 II):
 * the statutory funds first, then the assembly's destination for the rest,
 * returned to members in proportion to minutes worked. Amounts, never a rating.
 */
export interface WorkplaceSobras {
  /** The season's net result after every cost and loss, never below zero. */
  pool: number;
  /** Fundo de Reserva, 10% of the pool. */
  reserve: number;
  /** Fundo de Assistência Técnica, Educacional e Social, 5% of the pool. */
  fates: number;
  destination: SurplusDestination;
  /** What the assembly sent to its destination: the pool less both funds. */
  remainder: number;
  /** Each member's return, in member order; zero unless the destination is members. */
  shares: Record<string, number>;
}

export interface WorkplaceMember {
  id: string;
  role: string;
  publicBoundary: string;
  preference: string;
  willingToCover: boolean;
  sharing: boolean;
  shareUntilMinute: number | null;
  understood: boolean;
  ballot: boolean | null;
  coverConsent: boolean | null;
  refusalRespected: boolean;
  extraMinutes: number;
  restMinutes: number;
  earnedPay: number;
  compensationPaid: number;
  recoveryMinutes: number;
  recoveryOwedMinutes: number;
  chosenTask: string;
  eligibleTasks: string[];
}

export interface WorkplacePlan {
  id: WorkplacePlanId;
  title: string;
  explanation: string;
  capacity: number;
  budgetCost: number;
  optionalCoverMinutes: number;
  compensationPerMinute: number;
  recoveryMinutes: number;
  protectedRestMinutes: number;
  requiredPractices: PracticeId[];
  illegalReason: string | null;
}

export interface WorkplaceObjection {
  id: string;
  actorId: string;
  kind: ObjectionKind;
  statement: string;
  status: 'open' | 'resolved';
  resolution: string | null;
}

export interface WorkplaceEvent {
  id: string;
  minute: number;
  actorId: string;
  kind: string;
  detail: string;
}

export interface WorkplaceFinance {
  cash: number;
  initialCapital: number;
  wageReserve: number;
  compensationReserve: number;
  operatingRevenue: number;
  operatingCost: number;
  wagesPaid: number;
  compensationPaid: number;
  improvementSpend: number;
  distributed: number;
  communityAllocation: number;
}

export interface WorkplaceState {
  schemaVersion: 1;
  revision: number;
  mode: WorkplaceMode;
  phase: WorkplacePhase;
  seed: number;
  minute: number;
  durationMinutes: number;
  targetKg: number;
  shippedKg: number;
  planId: WorkplacePlanId;
  practices: PracticeId[];
  workerAutonomy: 'directed' | 'individual' | 'team';
  governance: 'consultative' | 'team-consent' | 'member-vote';
  aiAuthority: 'advice' | 'bounded';
  members: WorkplaceMember[];
  objections: WorkplaceObjection[];
  events: WorkplaceEvent[];
  finance: WorkplaceFinance;
  chairBallots: Record<string, string>;
  surplusBallots: Record<string, SurplusDestination>;
  electedChair: string | null;
  distributionComplete: boolean;
  activeCoverMemberId: string | null;
  coverRemainingMinutes: number;
  refusalsRespected: number;
  promisesKept: number;
  aiActions: number;
  reviewReason: string | null;
  campaign: WorkplaceCampaign | null;
  /** Optional continuation. Legacy version-one campaign saves remain valid. */
  improvement?: WorkplaceImprovement;
  /**
   * 5.9: handoff arrangements adopted in an experiment since closed. They
   * stay in place, bought once, until a later cycle that runs one ends with
   * another verdict. Absent means none (and in every save before 5b).
   */
  arrangementsInPlace?: ImprovementId[];
  /** The season's settled sobras; absent until they are settled. */
  sobras?: WorkplaceSobras;
}

export type ImprovementId = 'briefing' | 'buffer';
export type ImprovementVerdict = 'adopt' | 'amend' | 'stop';
export type ImprovementChallenge = 'forecast' | 'cost' | 'qualification';
export type ImprovementEpisodeId = 'late-truck' | 'quality-hold' | 'tight-cash';
export type ImprovementEpisodeChoice = 'ordinary' | 'smaller-delivery' | 'defer' | 'decline';
export interface ImprovementEpisode {
  id: ImprovementEpisodeId;
  actorId: string | null;
  choice: ImprovementEpisodeChoice | null;
}
export interface ImprovementTerms {
  proposalId: ImprovementId | null;
  proposerId: string | null;
  challenges: { actorId: string; kind: ImprovementChallenge }[];
  acknowledged: boolean;
  forecastKg: number | null;
  funded: boolean;
  stopped: boolean;
  reviewAcknowledged: boolean;
  ballots: Record<string, ImprovementVerdict>;
  verdict: ImprovementVerdict | null;
  /** Public evidence only. Optional for historical version-one records. */
  advice?: PackingAdvice;
  episode?: ImprovementEpisode;
}
export interface WorkplaceImprovement extends ImprovementTerms {
  version: 1;
  origin: Omit<WorkplaceState, 'improvement'>;
  history: (ImprovementTerms & { snapshot: Omit<WorkplaceState, 'improvement'> })[];
  mission?: WorkplaceMission;
}

export interface WorkplaceReadiness {
  allowed: boolean;
  /** Each reason as text in the language active when it was computed. */
  reasons: string[];
  /** The same reasons, one keyed line each, for a reader that renders them later (keyedText). */
  reasonsCopy: KeyedLine[];
}

/** Which catalogue a transition's reason key belongs to: the workplace store's, the engine's or the replay store's. */
export type WorkplaceReasonCatalog =
  | 'store'
  | 'engine'
  | 'replay'
  | 'campaign'
  | 'participation'
  | 'improvementPanel'
  | 'packingEvidence';

/**
 * A reason as a catalogue key with raw params (numbers unformatted). A type,
 * not an interface, so a result stays a plain JSON value for agent replies.
 */
export type WorkplaceReasonCopy = {
  catalog: WorkplaceReasonCatalog;
  key: string;
  params?: Record<string, string | number>;
};

export interface WorkplaceTransitionResult {
  changed: boolean;
  /** The reason resolved when the transition ran; the fallback for `reasonCopy`. */
  reason: string | null;
  /**
   * The same reason as a key, so a status line that keeps it re-renders it in
   * the language chosen later (workplaceReasonText in the workplace store).
   */
  reasonCopy?: WorkplaceReasonCopy;
}

export interface WorkplaceComparison {
  planId: WorkplacePlanId;
  title: string;
  forecastKg: number;
  netCredits: number;
  extraMinutes: number;
  restMinutes: number;
  permitted: boolean;
}

export interface WorkplaceActions {
  beginImprovement: (
    profile: WorkplaceProfile,
    expectedRevision: number,
    mission?: WorkplaceMission,
    mode?: WorkplaceMode
  ) => WorkplaceTransitionResult;
  /** Before funding, the first handoff shift can be cancelled back to its origin. */
  cancelImprovement: (expectedRevision: number) => WorkplaceTransitionResult;
  proposeImprovement: (id: ImprovementId, actorId: string) => WorkplaceTransitionResult;
  challengeImprovement: (actorId: string, kind: ImprovementChallenge) => WorkplaceTransitionResult;
  acknowledgeImprovement: (advice?: PackingAdvice) => WorkplaceTransitionResult;
  setImprovementEpisode: (id: ImprovementEpisodeId | null) => WorkplaceTransitionResult;
  respondImprovementEpisode: (
    actorId: string,
    choice: ImprovementEpisodeChoice
  ) => WorkplaceTransitionResult;
  stopImprovement: (actorId: string) => WorkplaceTransitionResult;
  acknowledgeImprovementReview: () => WorkplaceTransitionResult;
  voteImprovementReview: (
    actorId: string,
    verdict: ImprovementVerdict
  ) => WorkplaceTransitionResult;
  finishImprovementReview: (expectedRevision: number) => WorkplaceTransitionResult;
  continueImprovement: (
    expectedRevision: number,
    mission?: WorkplaceMission
  ) => WorkplaceTransitionResult;
  /**
   * After any shift's verdict, end the experiment without opening another
   * shift. Nothing may be owed; the workplace returns to idle.
   */
  closeImprovement: (expectedRevision: number) => WorkplaceTransitionResult;
  /**
   * After a reload settled a campaign shift before its end (reload safety),
   * return it to deliberation at the minute it reached. Every grant stays
   * expired: it continues only after fresh checks, ballots and consent.
   */
  resumeShift: (expectedRevision: number) => WorkplaceTransitionResult;
  startCampaign: (
    profile: WorkplaceProfile,
    seed?: number,
    mission?: WorkplaceMission,
    /** A reserve brought forward from the previous season; opening cash includes it. */
    reserveBrought?: number,
    /** The season's place in the order seasons began (review 2). */
    season?: number
  ) => WorkplaceTransitionResult;
  nextCampaignShift: (followOn?: WorkplaceMission) => WorkplaceTransitionResult;
  /**
   * End an unfinished season with nothing owed. The season is kept as left
   * early, never as a completed review, and the workplace returns to idle.
   */
  leaveCampaign: (expectedRevision: number) => WorkplaceTransitionResult;
  /**
   * Close a settled standalone exercise (no season, no handoff) that owes
   * nothing and return to the idle setup form, where a mode, seed or season
   * can be chosen. Nothing is retained: there was no season to keep.
   */
  endExercise: (expectedRevision: number) => WorkplaceTransitionResult;
  answerCheck: (
    actorId: string,
    question: WorkplaceCheckId,
    answer: WorkplaceAnswer
  ) => WorkplaceTransitionResult;
  campaignDecision: (decision: WorkplaceDecision, actorId: string) => WorkplaceTransitionResult;
  respondToPressure: (
    pressure: WorkplacePressureId,
    response: WorkplacePressureResponse
  ) => WorkplaceTransitionResult;
  start: (mode: WorkplaceMode, seed?: number) => WorkplaceTransitionResult;
  configure: (
    settings: Partial<
      Pick<WorkplaceState, 'practices' | 'workerAutonomy' | 'governance' | 'aiAuthority'>
    >
  ) => WorkplaceTransitionResult;
  selectPlan: (id: WorkplacePlanId) => WorkplaceTransitionResult;
  understand: (memberId: string) => WorkplaceTransitionResult;
  vote: (memberId: string, approve: boolean) => WorkplaceTransitionResult;
  consentToCover: (memberId: string, accept: boolean) => WorkplaceTransitionResult;
  sharePreference: (memberId: string, share: boolean) => WorkplaceTransitionResult;
  chooseTask: (memberId: string, task: string) => WorkplaceTransitionResult;
  /**
   * The authored roles answer from their stated values. `plant` carries what
   * they read from the plant (a quality investigation open on the line).
   */
  simulateResponses: (plant?: { inspectionOpen?: boolean }) => WorkplaceTransitionResult;
  object: (actorId: string, kind: ObjectionKind) => WorkplaceTransitionResult;
  resolveObjection: (id: string, actorId: string) => WorkplaceTransitionResult;
  activate: (
    expectedRevision: number,
    /** Review 2: the order a resequenced shift makes active, linked by the store. */
    sequenced?: WorkplaceMission
  ) => WorkplaceTransitionResult;
  withdraw: (memberId: string) => WorkplaceTransitionResult;
  stop: () => WorkplaceTransitionResult;
  tick: (
    deltaMinutes: number,
    shippedKg: number,
    emergency: boolean,
    missionObservation?: WorkplaceMissionObservation,
    followOnObservation?: WorkplaceMissionObservation,
    sequencedObservation?: WorkplaceMissionObservation
  ) => void;
  elect: (voterId: string, candidateId: string) => WorkplaceTransitionResult;
  voteSurplus: (voterId: string, destination: SurplusDestination) => WorkplaceTransitionResult;
  /**
   * `'left'` (review 2): a season left early settles what it earned by the
   * statutory default, the Reserve Fund and the Assistance Fund first, the rest
   * kept in the Reserve Fund.
   */
  distributeSurplus: (settle?: 'left') => WorkplaceTransitionResult;
}
