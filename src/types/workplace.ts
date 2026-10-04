import type { PackingAdvice } from './workplaceAdvice';

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
}

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
  reasons: string[];
}

export interface WorkplaceTransitionResult {
  changed: boolean;
  reason: string | null;
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
  startCampaign: (
    profile: WorkplaceProfile,
    seed?: number,
    mission?: WorkplaceMission
  ) => WorkplaceTransitionResult;
  nextCampaignShift: () => WorkplaceTransitionResult;
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
  simulateResponses: () => WorkplaceTransitionResult;
  object: (actorId: string, kind: ObjectionKind) => WorkplaceTransitionResult;
  resolveObjection: (id: string, actorId: string) => WorkplaceTransitionResult;
  activate: (expectedRevision: number) => WorkplaceTransitionResult;
  withdraw: (memberId: string) => WorkplaceTransitionResult;
  stop: () => WorkplaceTransitionResult;
  tick: (
    deltaMinutes: number,
    shippedKg: number,
    emergency: boolean,
    missionObservation?: WorkplaceMissionObservation
  ) => void;
  elect: (voterId: string, candidateId: string) => WorkplaceTransitionResult;
  voteSurplus: (voterId: string, destination: SurplusDestination) => WorkplaceTransitionResult;
  distributeSurplus: () => WorkplaceTransitionResult;
}
