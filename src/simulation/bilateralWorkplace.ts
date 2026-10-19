import type {
  ObjectionKind,
  PracticeId,
  SurplusDestination,
  WorkplaceActions,
  WorkplaceComparison,
  WorkplaceMode,
  WorkplacePlan,
  WorkplaceReadiness,
  WorkplaceState,
  WorkplaceTransitionResult,
  WorkplaceMission,
  WorkplaceMissionObservation,
} from '../types/workplace';
import {
  CAMPAIGN_SHIFTS,
  WORKPLACE_PROFILES,
  WORKPLACE_CHECKS,
  campaignRecord,
  campaignTotals,
  campaignComplete,
  checksPassed,
  requiredChecks,
  campaignOutcomes,
  campaignStory,
  validWorkplaceMission,
  MANAGEMENT_APPROACHES,
  CAMPAIGN_PRESSURES,
  campaignRelationship,
  validRelationshipEvents,
  restoreRelationshipEvents,
  shiftResumable,
} from './workplaceCampaign';

import {
  HANDOFF_ARRANGEMENTS,
  IMPROVEMENT_CHALLENGES,
  IMPROVEMENT_VERDICTS,
  MAX_IMPROVEMENT_CYCLES,
  freshImprovementTerms,
  improvementTerms,
  improvementArrangement,
  improvementCost,
  improvementCapacity,
  improvementForecast,
  improvementReviewWinner,
  improvementObligations,
  improvementSummary,
  workplaceMission,
  HANDOFF_EPISODES,
  HANDOFF_EPISODE_CHOICES,
  validImprovementEpisode,
} from './workplaceImprovement';
import { validPackingAdvice } from './workplaceAdvice';
import {
  LOCALES,
  createTranslator,
  formatFixed,
  formatGrouped,
  getLocale,
  translate,
  type Translator,
} from '../i18n';
import { bilateralWorkplaceMessages } from './bilateralWorkplace.messages';

// Copy resolves on read (getters), so a language change reaches every importer.
const wm = bilateralWorkplaceMessages;
// Record sentinels stay English in state: workplaceImprovement.ts and
// workplaceFairness.ts match their prefixes. displayEventDetail() renders them
// in the active language.
const BALLOT_DECLINED_DETAIL = wm.en.evBallotDeclined;
const RELOAD_SAFETY_DETAIL = wm.en.evReloadSafety;

/** Render-time event detail: translates the English sentinels, returns all else unchanged. */
export function displayEventDetail(detail: string): string {
  if (detail === BALLOT_DECLINED_DETAIL) return translate(wm, 'evBallotDeclined');
  if (detail === RELOAD_SAFETY_DETAIL) return translate(wm, 'evReloadSafety');
  return detail;
}
export const PRACTICES: { id: PracticeId; title: string; detail: string }[] = [
  {
    id: 'information',
    get title() {
      return translate(wm, 'practiceInformationTitle');
    },
    get detail() {
      return translate(wm, 'practiceInformationDetail');
    },
  },
  {
    id: 'work-choice',
    get title() {
      return translate(wm, 'practiceWorkChoiceTitle');
    },
    get detail() {
      return translate(wm, 'practiceWorkChoiceDetail');
    },
  },
  {
    id: 'rest',
    get title() {
      return translate(wm, 'practiceRestTitle');
    },
    get detail() {
      return translate(wm, 'practiceRestDetail');
    },
  },
  {
    id: 'remedy',
    get title() {
      return translate(wm, 'practiceRemedyTitle');
    },
    get detail() {
      return translate(wm, 'practiceRemedyDetail');
    },
  },
  {
    id: 'budget',
    get title() {
      return translate(wm, 'practiceBudgetTitle');
    },
    get detail() {
      return translate(wm, 'practiceBudgetDetail');
    },
  },
  {
    id: 'gainsharing',
    get title() {
      return translate(wm, 'practiceGainsharingTitle');
    },
    get detail() {
      return translate(wm, 'practiceGainsharingDetail');
    },
  },
  {
    id: 'cooperative',
    get title() {
      return translate(wm, 'practiceCooperativeTitle');
    },
    get detail() {
      return translate(wm, 'practiceCooperativeDetail');
    },
  },
];

export const WORKPLACE_PLANS: WorkplacePlan[] = [
  {
    id: 'steady',
    get title() {
      return translate(wm, 'planSteadyTitle');
    },
    get explanation() {
      return translate(wm, 'planSteadyExplanation');
    },
    capacity: 0.78,
    budgetCost: 0,
    optionalCoverMinutes: 0,
    compensationPerMinute: 0,
    recoveryMinutes: 0,
    protectedRestMinutes: 15,
    requiredPractices: [],
    illegalReason: null,
  },
  {
    id: 'resequence',
    get title() {
      return translate(wm, 'planResequenceTitle');
    },
    get explanation() {
      return translate(wm, 'planResequenceExplanation');
    },
    capacity: 0.9,
    budgetCost: 40,
    optionalCoverMinutes: 0,
    compensationPerMinute: 0,
    recoveryMinutes: 0,
    protectedRestMinutes: 15,
    requiredPractices: ['budget'],
    illegalReason: null,
  },
  {
    id: 'cover',
    get title() {
      return translate(wm, 'planCoverTitle');
    },
    get explanation() {
      return translate(wm, 'planCoverExplanation');
    },
    capacity: 0.98,
    budgetCost: 0,
    optionalCoverMinutes: 10,
    compensationPerMinute: 0.8,
    recoveryMinutes: 10,
    protectedRestMinutes: 15,
    requiredPractices: ['rest', 'remedy'],
    illegalReason: null,
  },
  {
    id: 'rush',
    get title() {
      return translate(wm, 'planRushTitle');
    },
    get explanation() {
      return translate(wm, 'planRushExplanation');
    },
    capacity: 1.1,
    budgetCost: 0,
    optionalCoverMinutes: 15,
    compensationPerMinute: 0,
    recoveryMinutes: 0,
    protectedRestMinutes: 0,
    requiredPractices: [],
    get illegalReason() {
      return translate(wm, 'planRushIllegal');
    },
  },
];
const MODES: WorkplaceMode[] = ['game', 'workshop', 'pilot'];
const KINDS: ObjectionKind[] = ['rest', 'burden', 'privacy', 'authority'];
const DESTINATIONS: SurplusDestination[] = ['members', 'reserve', 'community'];
const WAGE = 0.3;
const REVENUE_PER_KG = 0.5;
const COST_PER_KG = 0.2;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const validSeed = (n: unknown): n is number =>
  finite(n) && Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff;
const planOf = (s: WorkplaceState) => WORKPLACE_PLANS.find((p) => p.id === s.planId)!;
/** A non-integer interpolated as `${n}`: English keeps String(n) exactly. */
const plainNumber = (n: number) =>
  getLocale() === 'en' ? String(n) : formatGrouped(n, { maximumFractionDigits: 20 });

type WorkplaceTranslator = Translator<(typeof bilateralWorkplaceMessages)['en']>;
/** Public member copy, in member order. Restore accepts either language's copy. */
const memberCopy = (t: WorkplaceTranslator) => [
  {
    role: t('rolePacking'),
    publicBoundary: t('boundaryPacking'),
    preference: t('preferencePacking'),
  },
  {
    role: t('roleQuality'),
    publicBoundary: t('boundaryQuality'),
    preference: t('preferenceQuality'),
  },
  {
    role: t('roleMaintenance'),
    publicBoundary: t('boundaryMaintenance'),
    preference: t('preferenceMaintenance'),
  },
  {
    role: t('roleCoordinator'),
    publicBoundary: t('boundaryCoordinator'),
    preference: t('preferenceCoordinator'),
  },
];

/** All identities and preference explanations below are authored fiction. */
export function createWorkplace(mode: WorkplaceMode = 'game', seed = 1): WorkplaceState {
  const copy = memberCopy(createTranslator(bilateralWorkplaceMessages, getLocale()));
  // Task names are logic (eligibility checks, restore comparison) and stay English.
  const roles = [
    {
      id: 'packing',
      ...copy[0],
      willingToCover: true,
      eligibleTasks: ['Packing', 'Pallet checks'],
    },
    {
      id: 'quality',
      ...copy[1],
      willingToCover: false,
      eligibleTasks: ['Quality release', 'Sampling'],
    },
    {
      id: 'maintenance',
      ...copy[2],
      willingToCover: true,
      eligibleTasks: ['Maintenance planning', 'Pallet checks'],
    },
    {
      id: 'coordinator',
      ...copy[3],
      willingToCover: false,
      eligibleTasks: ['Coordination', 'Packing'],
    },
  ];
  return {
    schemaVersion: 1,
    revision: 1,
    mode: MODES.includes(mode) ? mode : 'game',
    phase: 'idle',
    seed: validSeed(seed) ? seed : 1,
    minute: 0,
    durationMinutes: 90,
    targetKg: 600,
    shippedKg: 0,
    planId: 'steady',
    practices: PRACTICES.map((p) => p.id),
    workerAutonomy: 'team',
    governance: 'member-vote',
    aiAuthority: 'bounded',
    members: roles.map((m) => ({
      ...m,
      sharing: false,
      shareUntilMinute: null,
      understood: false,
      ballot: null,
      coverConsent: null,
      refusalRespected: false,
      extraMinutes: 0,
      restMinutes: 0,
      earnedPay: 0,
      compensationPaid: 0,
      recoveryMinutes: 0,
      recoveryOwedMinutes: 0,
      chosenTask: m.eligibleTasks[0],
    })),
    objections: [],
    events: [],
    finance: {
      cash: 400,
      initialCapital: 400,
      wageReserve: 0,
      compensationReserve: 0,
      operatingRevenue: 0,
      operatingCost: 0,
      wagesPaid: 0,
      compensationPaid: 0,
      improvementSpend: 0,
      distributed: 0,
      communityAllocation: 0,
    },
    chairBallots: {},
    surplusBallots: {},
    electedChair: null,
    distributionComplete: false,
    activeCoverMemberId: null,
    coverRemainingMinutes: 0,
    refusalsRespected: 0,
    promisesKept: 0,
    aiActions: 0,
    reviewReason: null,
    campaign: null,
  };
}

export function workplaceReadiness(s: WorkplaceState): WorkplaceReadiness {
  const p = planOf(s);
  const reasons: string[] = [];
  if (s.mode === 'pilot') reasons.push(translate(wm, 'readyPilot'));
  if (s.mode === 'game' && s.aiAuthority !== 'bounded')
    reasons.push(translate(wm, 'readyAdviceOnly'));
  if (s.improvement) {
    if (!s.improvement.proposalId) reasons.push(translate(wm, 'readyChooseProposal'));
    if (!s.improvement.acknowledged) reasons.push(translate(wm, 'readyHearAdviser'));
    if (workplaceMission(s)?.evidence !== undefined && workplaceMission(s)?.evidence !== 'current')
      reasons.push(translate(wm, 'readyMissionEvidence'));
    if (s.planId !== 'steady') reasons.push(translate(wm, 'readyNoStacking'));
  }
  if (s.phase !== 'deliberating') reasons.push(translate(wm, 'readyBeginScenario'));
  if (s.minute >= s.durationMinutes) reasons.push(translate(wm, 'readyConsentExpired'));
  if (!p || p.illegalReason) reasons.push(p?.illegalReason ?? translate(wm, 'readyUnknownPlan'));
  if (p?.requiredPractices.some((id) => !s.practices.includes(id)))
    reasons.push(translate(wm, 'readyEnablePractices'));
  if (s.objections.some((o) => o.status === 'open'))
    reasons.push(translate(wm, 'readyOpenObjections'));
  if (s.campaign) {
    if (s.campaign.mission && s.campaign.mission.evidence !== 'current')
      reasons.push(translate(wm, 'readyCampaignMission'));
    if (!s.campaign.adviserAcknowledged || !checksPassed(s.campaign, 'mind'))
      reasons.push(translate(wm, 'readyAdviserBoundaries'));
    if (s.members.some((m) => !checksPassed(s.campaign!, m.id)))
      reasons.push(translate(wm, 'readyRoleChecks'));
    if (s.campaign.shift !== 1 && s.campaign.decision === null)
      reasons.push(translate(wm, 'readyEpisodeResponse'));
  }
  if (s.members.some((m) => !m.understood || m.ballot === null))
    reasons.push(translate(wm, 'readyUnderstandBallot'));
  const yes = s.members.filter((m) => m.ballot === true).length;
  if (
    s.governance === 'team-consent'
      ? yes !== s.members.length
      : s.governance === 'member-vote' && yes < 3
  )
    reasons.push(
      s.governance === 'team-consent'
        ? translate(wm, 'readyTeamConsent')
        : translate(wm, 'readyMajority')
    );
  if (
    p?.optionalCoverMinutes &&
    !s.members.some((m) => m.coverConsent === true && eligibleCover(m))
  )
    reasons.push(translate(wm, 'readyCoverConsent'));
  const wages = WAGE * s.durationMinutes * s.members.length;
  const compensation = (p?.optionalCoverMinutes ?? 0) * (p?.compensationPerMinute ?? 0);
  if (
    !finite(s.finance.cash) ||
    s.finance.cash + 1e-8 < wages + (p?.budgetCost ?? 0) + compensation + improvementCost(s)
  )
    reasons.push(translate(wm, 'readyFunds'));
  return { allowed: reasons.length === 0, reasons };
}
const eligibleCover = (m: WorkplaceState['members'][number]) =>
  m.eligibleTasks.includes('Packing') || m.eligibleTasks.includes('Pallet checks');

export function workplaceCapacity(s: WorkplaceState): number {
  if (s.mode !== 'game' || s.phase !== 'active') return 1;
  const improvement = improvementCapacity(s);
  if (improvement !== null) return improvement;
  const p = planOf(s);
  if (!p || p.illegalReason) return 1;
  if (s.campaign?.shift === 1 && s.minute >= 25 && !s.campaign.inspectionComplete) return 0;
  return p.id === 'cover' && (!s.activeCoverMemberId || s.coverRemainingMinutes <= 0)
    ? WORKPLACE_PLANS[0].capacity
    : p.capacity;
}

/** Time-weighted pacing across cover expiry, inspection and authority expiry.
 * This is a physical pacing input, never permission to release a quality batch.
 * Working if a coarse clock tick gives no production time to a held interval.
 */
export function workplaceTickCapacity(s: WorkplaceState, deltaMinutes: number): number {
  if (s.mode !== 'game' || s.phase !== 'active' || !finite(deltaMinutes) || deltaMinutes <= 0)
    return workplaceCapacity(s);
  const p = planOf(s);
  if (!p || p.illegalReason) return 1;
  const end = Math.min(s.minute + deltaMinutes, s.durationMinutes);
  const boundaries = [s.minute, end];
  const coverEnd = s.minute + s.coverRemainingMinutes;
  const inspectionEnd = s.campaign?.inspectionUntilMinute ?? Infinity;
  for (const point of [
    coverEnd,
    25,
    inspectionEnd,
    improvementArrangement(s)?.briefingMinutes ?? Infinity,
  ])
    if (point > s.minute && point < end) boundaries.push(point);
  boundaries.sort((a, b) => a - b);
  let pacedMinutes = Math.max(0, s.minute + deltaMinutes - s.durationMinutes);
  for (let i = 0; i < boundaries.length - 1; i++) {
    const time = (boundaries[i] + boundaries[i + 1]) / 2;
    const held =
      s.campaign?.shift === 1 &&
      time >= 25 &&
      !s.campaign.inspectionComplete &&
      time < inspectionEnd;
    if (held) continue;
    const factor =
      improvementCapacity(s, time) ??
      (p.id === 'cover' && (!s.activeCoverMemberId || time >= coverEnd)
        ? WORKPLACE_PLANS[0].capacity
        : p.capacity);
    pacedMinutes += (boundaries[i + 1] - boundaries[i]) * factor;
  }
  return pacedMinutes / deltaMinutes;
}

export function projectWorkplace(s: WorkplaceState) {
  return {
    schemaVersion: s.schemaVersion,
    improvement: improvementSummary(s),
    synthetic: true,
    mode: s.mode,
    phase: s.phase,
    revision: s.revision,
    minute: s.minute,
    durationMinutes: s.durationMinutes,
    targetKg: s.targetKg,
    shippedKg: s.shippedKg,
    planId: s.planId,
    capacityMultiplier: workplaceCapacity(s),
    practices: [...s.practices],
    workerAutonomy: s.workerAutonomy,
    governance: s.governance,
    aiAuthority: s.aiAuthority,
    members: s.members.map(({ preference, willingToCover: _privateWillingness, ...m }) => ({
      ...m,
      eligibleTasks: [...m.eligibleTasks],
      preference:
        m.sharing &&
        m.shareUntilMinute !== null &&
        m.shareUntilMinute > s.minute &&
        s.phase !== 'review' &&
        s.phase !== 'idle'
          ? preference
          : null,
    })),
    finance: { ...s.finance },
    objections: s.objections.map((o) => ({ ...o })),
    events: s.events.map((e) => ({ ...e })),
    electedChair: s.electedChair,
    distributionComplete: s.distributionComplete,
    relationshipEvidence: {
      refusalsRespected: s.refusalsRespected,
      promisesKept: s.promisesKept,
      objectionsRaised: s.objections.length,
      objectionsResolved: s.objections.filter((o) => o.status === 'resolved').length,
    },
    reviewReason: s.reviewReason,
    campaign: s.campaign
      ? {
          ...structuredClone(s.campaign),
          title: CAMPAIGN_SHIFTS[s.campaign.shift].title,
          totals: campaignTotals(s),
          complete: campaignComplete(s),
          outcomes: campaignOutcomes(s),
          story: campaignStory(s),
          relationship: campaignRelationship(s),
        }
      : null,
    readiness: workplaceReadiness(s),
  };
}

/** Forecast only: same deterministic demand and supply for every arm, no governance multiplier. */
export function compareWorkplacePlans(seed: number): WorkplaceComparison[] {
  const n = validSeed(seed) ? seed : 1;
  const supply = 430 + (((Math.imul(n, 1664525) + 1013904223) >>> 0) % 281);
  return WORKPLACE_PLANS.map((p) => {
    const capacityMinutes =
      p.id === 'cover' ? p.capacity * 10 + WORKPLACE_PLANS[0].capacity * 80 : p.capacity * 90;
    const kg = Math.min(600, supply, capacityMinutes * 8);
    return {
      planId: p.id,
      title: p.title,
      forecastKg: kg,
      netCredits:
        kg * (REVENUE_PER_KG - COST_PER_KG) -
        108 -
        p.budgetCost -
        p.optionalCoverMinutes * p.compensationPerMinute,
      extraMinutes: p.optionalCoverMinutes,
      restMinutes: p.protectedRestMinutes,
      permitted: !p.illegalReason,
    };
  });
}

/** Current public tradeoffs, without guessing willingness or promising dispatch. */
export function workplaceAlternatives(s: WorkplaceState) {
  const totals = campaignTotals(s);
  return WORKPLACE_PLANS.filter((p) => !p.illegalReason).map((p) => {
    const reserve = WAGE * s.durationMinutes * s.members.length;
    const maximumCompensation = p.optionalCoverMinutes * p.compensationPerMinute;
    const missing = p.requiredPractices.filter((id) => !s.practices.includes(id));
    const funded = s.finance.cash + 1e-8 >= reserve + p.budgetCost + maximumCompensation;
    const volunteers = s.members
      .filter((m) => m.coverConsent === true && eligibleCover(m))
      .map((m) => ({
        role: m.role,
        extraMinutes: totals.members.find((t) => t.id === m.id)!.extraMinutes,
      }));
    return {
      ...p,
      reserve,
      maximumCompensation,
      cashAfterReservations: s.finance.cash - reserve - p.budgetCost - maximumCompensation,
      available: missing.length === 0 && funded,
      constraint: missing.length
        ? translate(wm, 'altEnableBudget')
        : !funded
          ? translate(wm, 'altUnfunded')
          : null,
      volunteers,
    };
  });
}

/** Working if governance changes permissions, while identical plans retain identical forecasts. */
export function compareManagementApproaches(seed: number, planId: WorkplaceState['planId']) {
  const plan = WORKPLACE_PLANS.find((item) => item.id === planId)!;
  const forecast = compareWorkplacePlans(seed).find((item) => item.planId === planId)!;
  return MANAGEMENT_APPROACHES.map((approach) => ({
    id: approach.id,
    title: approach.title,
    detail: approach.detail,
    forecastKg: forecast.forecastKg,
    netCredits: forecast.netCredits,
    permitted:
      forecast.permitted &&
      plan.requiredPractices.every((id) => approach.settings.practices.includes(id)),
    missingPractices: plan.requiredPractices.filter(
      (id) => !approach.settings.practices.includes(id)
    ),
  }));
}

export function exportWorkplace(s: WorkplaceState) {
  const projection = projectWorkplace(s);
  return {
    kind: 'synthetic-workplace-pilot-preparation',
    version: 1,
    practiceProposal: exportPracticeProposal(s),
    scope: translate(wm, 'exScope'),
    charter: {
      practices: [...s.practices],
      minimumProtections: [
        translate(wm, 'exProtRest'),
        translate(wm, 'exProtQualified'),
        translate(wm, 'exProtRefusal'),
        translate(wm, 'exProtCoverConsent'),
        translate(wm, 'exProtObjection'),
      ],
      workerAutonomy: s.workerAutonomy,
      governance: s.governance,
      aiAuthority: s.aiAuthority,
    },
    dataConsent: {
      purpose: translate(wm, 'exDataPurpose'),
      expires: translate(wm, 'exDataExpires'),
      collect: translate(wm, 'exDataCollect'),
      revocation: translate(wm, 'exDataRevocation'),
    },
    boundedAuthority: {
      liveControl: false,
      pilotActivation: false,
      planningOnly: true,
      budgetCeilingCredits: 40,
      maximumCoverMinutes: 10,
      minimumRestMinutes: 15,
    },
    compensation: {
      units: translate(wm, 'exCompUnits'),
      perCoverMinute: 0.8,
      protectedRecoveryMinutes: 10,
      restSchedule: translate(wm, 'exCompRestSchedule'),
      wagesPerMinutePerMember: WAGE,
      terms: translate(wm, 'exCompTerms'),
    },
    acceptanceReview: [
      translate(wm, 'exReviewAgreement'),
      translate(wm, 'exReviewRequirements'),
      translate(wm, 'exReviewMeasures'),
      translate(wm, 'exReviewConsent'),
      translate(wm, 'exReviewRecord'),
      translate(wm, 'exReviewExpansion'),
    ],
    evidence: {
      ...projection,
      members: projection.members.map((m) => ({ ...m, preference: null })),
    },
    forecasts: compareWorkplacePlans(s.seed),
    forecastLabel: translate(wm, 'exForecastLabel'),
  };
}

/** Public planning draft only. No present vote, private reason or live grant. */
export function exportPracticeProposal(s: WorkplaceState) {
  const cover = WORKPLACE_PLANS.find((plan) => plan.id === 'cover')!;
  return {
    kind: 'reversible-working-agreement-draft',
    version: 1,
    status: 'draft',
    liveControl: false,
    localApprovals: translate(wm, 'prLocalApprovals'),
    purpose: translate(wm, 'prPurpose'),
    scope: translate(wm, 'prScope'),
    authority: translate(wm, 'prAuthority'),
    decisions: [
      translate(wm, 'prDecisionUnderstand'),
      translate(wm, 'prDecisionPolicy'),
      translate(wm, 'prDecisionCover'),
    ],
    data: translate(wm, 'prData'),
    limits: {
      minimumRestMinutes: cover.protectedRestMinutes,
      maximumCoverMinutes: cover.optionalCoverMinutes,
      improvementBudgetCredits: 40,
      units: translate(wm, 'prUnits'),
    },
    repayment: {
      compensationPerMinuteCredits: cover.compensationPerMinute,
      recoveryMinutes: cover.recoveryMinutes,
      funding: translate(wm, 'prFunding'),
      withdrawal: translate(wm, 'prWithdrawal'),
    },
    stopConditions: [
      translate(wm, 'prStopWithdrawal'),
      translate(wm, 'prStopHold'),
      translate(wm, 'prStopUnfunded'),
      translate(wm, 'prStopChangedTerms'),
      translate(wm, 'prStopObjection'),
    ],
    rollback: translate(wm, 'prRollback'),
    review: [
      translate(wm, 'prReviewExplicit'),
      translate(wm, 'prReviewReceipts'),
      translate(wm, 'prReviewRepaid'),
      translate(wm, 'prReviewOwed'),
    ],
    sourceExercise: { profile: s.campaign?.profile ?? null, plan: s.planId, revision: s.revision },
  };
}

export type WorkplaceCommand =
  | {
      [K in Exclude<keyof WorkplaceActions, 'tick'>]: {
        type: K;
        args: Parameters<WorkplaceActions[K]>;
      };
    }[Exclude<keyof WorkplaceActions, 'tick'>]
  | { type: 'tick'; args: Parameters<WorkplaceActions['tick']> };
export interface WorkplaceReduction extends WorkplaceTransitionResult {
  state: WorkplaceState;
}

function record(s: WorkplaceState, actorId: string, kind: string, detail: string) {
  const last = s.events.at(-1);
  const id = last ? Number(last.id.slice(2)) + 1 : 1;
  s.events.push({ id: `e-${id}`, minute: s.minute, actorId, kind, detail });
  if (s.events.length > 120) s.events.splice(0, s.events.length - 120);
}
function invalidate(s: WorkplaceState) {
  s.revision += 1;
  for (const m of s.members) {
    m.understood = false;
    m.ballot = null;
    m.coverConsent = null;
  }
  if (s.improvement) {
    s.improvement.acknowledged = false;
    if (s.phase === 'deliberating') delete s.improvement.advice;
  }
  if (s.campaign) {
    s.campaign.checks = {};
    s.campaign.adviserAcknowledged = false;
    s.campaign.agreementProved = false;
  }
}
function releaseCover(s: WorkplaceState) {
  s.finance.compensationReserve = 0;
  s.coverRemainingMinutes = 0;
  s.activeCoverMemberId = null;
}
/** Recovery is delivered by model time, never by settlement or a promise alone. */
function deliverRecovery(
  s: WorkplaceState,
  minutes: number,
  coverMemberId: string | null = null,
  coveredMinutes = 0
) {
  for (const m of s.members) {
    if (m.recoveryOwedMinutes <= 0 || s.activeCoverMemberId === m.id) continue;
    const available = Math.max(0, minutes - (m.id === coverMemberId ? coveredMinutes : 0));
    const recovery = Math.min(available, m.recoveryOwedMinutes);
    m.recoveryMinutes += recovery;
    m.recoveryOwedMinutes = Math.max(0, m.recoveryOwedMinutes - recovery);
    if (recovery > 0 && m.recoveryOwedMinutes <= 1e-8) {
      m.recoveryOwedMinutes = 0;
      m.recoveryMinutes = 10;
      s.promisesKept += 1;
      record(s, m.id, 'recovery-delivered', translate(wm, 'evRecoveryDelivered'));
    }
  }
}
function settle(s: WorkplaceState, reason: string) {
  releaseCover(s);
  if (s.improvement && s.minute < s.durationMinutes) s.improvement.stopped = true;
  s.finance.wageReserve = 0;
  for (const m of s.members) {
    m.sharing = false;
    m.shareUntilMinute = null;
    m.coverConsent = null;
    m.understood = false;
    m.ballot = null;
  }
  if (s.campaign) {
    s.campaign.checks = {};
    s.campaign.adviserAcknowledged = false;
  }
  s.phase = 'review';
  s.reviewReason = reason;
  record(s, 'system', 'settled', reason);
}

/** Working if unrelated orders, duplicate receipts and a reset material session earn no mission credit. */
function observeMission(s: WorkplaceState, observation?: WorkplaceMissionObservation): number {
  return observeLink(workplaceMission(s), observation);
}
function observeLink(
  m: WorkplaceMission | undefined,
  observation?: WorkplaceMissionObservation
): number {
  if (!m) return 0;
  if (!observation || observation.orderId !== m.orderId || observation.cancelled) {
    m.evidence = 'missing';
    return 0;
  }
  if (
    observation.materialSessionId !== m.materialSessionId ||
    !finite(observation.shippedKg) ||
    observation.shippedKg < m.observedShippedKg ||
    !Array.isArray(observation.manifestIds) ||
    observation.manifestIds.length > 1000 ||
    observation.manifestIds.some((id) => typeof id !== 'string' || !id || id.length > 500)
  ) {
    m.evidence = 'stale';
    return 0;
  }
  if (!finite(observation.qualityFailureKg) || observation.qualityFailureKg !== 0) {
    m.evidence = 'quality-failed';
    return 0;
  }
  const delta = observation.shippedKg - m.observedShippedKg;
  if (delta > 1e-6 && !observation.manifestIds.some((id) => !m.manifestIds.includes(id))) {
    m.evidence = 'stale';
    return 0;
  }
  m.evidence = 'current';
  m.observedShippedKg = observation.shippedKg;
  m.creditedKg = observation.shippedKg - m.startingShippedKg;
  m.manifestIds = [...new Set(observation.manifestIds)];
  return delta;
}

/** A rejected command returns the original object, so callers never publish rejected writes. */
export function transitionWorkplace(
  previous: WorkplaceState,
  command: WorkplaceCommand
): WorkplaceReduction {
  const reject = (reason: string): WorkplaceReduction => ({
    changed: false,
    reason,
    state: previous,
  });
  if (
    previous.mode === 'pilot' &&
    !['start', 'configure', 'selectPlan', 'stop'].includes(command.type)
  )
    return reject(translate(wm, 'rejPilot'));
  const s = structuredClone(previous);
  const member = (id: string) => s.members.find((m) => m.id === id);
  const deliberating = s.phase === 'deliberating';
  switch (command.type) {
    case 'beginImprovement': {
      const [profile, revision, mission, mode = s.mode] = command.args;
      if (
        revision !== s.revision ||
        !Number.isSafeInteger(revision) ||
        s.improvement ||
        !['idle', 'review'].includes(s.phase) ||
        !WORKPLACE_PROFILES.includes(profile) ||
        !['game', 'workshop'].includes(mode) ||
        (mode !== s.mode && s.phase !== 'idle') ||
        improvementObligations(s).length ||
        (mission && !validWorkplaceMission(mission))
      )
        return reject(translate(wm, 'rejBeginImprovement'));
      const fresh = createWorkplace(mode, s.seed);
      fresh.phase = 'deliberating';
      fresh.revision = s.revision + 1;
      Object.assign(
        fresh,
        s.phase === 'idle'
          ? structuredClone(MANAGEMENT_APPROACHES.find((a) => a.id === profile)!.settings)
          : {
              practices: [...s.practices],
              workerAutonomy: s.workerAutonomy,
              governance: s.governance,
              aiAuthority: s.aiAuthority,
            }
      );
      fresh.finance.cash = s.finance.cash;
      fresh.finance.initialCapital = s.finance.cash;
      const linked = mission ?? workplaceMission(s);
      fresh.improvement = {
        version: 1,
        origin: saveWorkplace(
          mode === s.mode ? s : createWorkplace(mode, s.seed)
        ) as WorkplaceState,
        history: [],
        ...freshImprovementTerms(),
        ...(linked ? { mission: structuredClone(linked) } : {}),
      };
      record(fresh, 'packing', 'improvement-opened', translate(wm, 'evImprovementOpened'));
      return { state: fresh, changed: true, reason: null };
    }
    case 'cancelImprovement': {
      // Before funding nothing has been bought or worked, so the honest exit
      // is the origin review exactly as it was. Later cycles carry trial pay
      // and are left through their review. Working if a cancelled first shift
      // restores the origin with a newer revision and spends nothing.
      const [revision] = command.args;
      const i = s.improvement;
      if (
        !i ||
        revision !== s.revision ||
        !Number.isSafeInteger(revision) ||
        i.funded ||
        i.history.length > 0 ||
        !['deliberating', 'review'].includes(s.phase) ||
        improvementObligations(s).length
      )
        return reject(translate(wm, 'rejCancelImprovement'));
      const origin = restoreWorkplace(i.origin);
      origin.revision = s.revision + 1;
      record(origin, 'members', 'improvement-cancelled', translate(wm, 'evImprovementCancelled'));
      return { state: origin, changed: true, reason: null };
    }
    case 'proposeImprovement': {
      const [id, actor] = command.args;
      const a = HANDOFF_ARRANGEMENTS.find((item) => item.id === id);
      const i = s.improvement;
      if (
        !i ||
        !deliberating ||
        i.funded ||
        !a ||
        a.author !== actor ||
        !member(actor) ||
        (i.proposalId === id && !i.stopped)
      )
        return reject(translate(wm, 'rejPropose'));
      Object.assign(i, freshImprovementTerms(), { proposalId: id, proposerId: actor });
      invalidate(s);
      i.forecastKg = improvementForecast(s).kg;
      record(s, actor, 'improvement-proposed', translate(wm, 'evProposed', { id }));
      break;
    }
    case 'challengeImprovement': {
      const [actor, kind] = command.args;
      const i = s.improvement;
      if (
        !i ||
        !deliberating ||
        !i.proposalId ||
        (!member(actor) && actor !== 'mind') ||
        !IMPROVEMENT_CHALLENGES.includes(kind) ||
        i.challenges.some((c) => c.actorId === actor && c.kind === kind)
      )
        return reject(translate(wm, 'rejChallenge'));
      i.challenges.push({ actorId: actor, kind });
      invalidate(s);
      record(s, actor, 'improvement-challenged', translate(wm, 'evChallenged', { kind }));
      break;
    }
    case 'acknowledgeImprovement': {
      const i = s.improvement;
      if (!i || !deliberating || !i.proposalId) return reject(translate(wm, 'rejAckChooseTerms'));
      const advice = command.args[0];
      const validated = advice === undefined ? undefined : validPackingAdvice(advice);
      if (
        advice !== undefined &&
        (!validated || validated.arrangement !== (i.stopped ? 'steady' : i.proposalId))
      )
        return reject(translate(wm, 'rejAckInvalidAdvice'));
      if (i.acknowledged && (!validated || validated.fingerprint === i.advice?.fingerprint))
        return reject(translate(wm, 'rejAckAlready'));
      const changedAdvice =
        !!i.advice && !!validated && i.advice.fingerprint !== validated.fingerprint;
      invalidate(s);
      if (validated) i.advice = validated;
      i.acknowledged = true;
      if (changedAdvice)
        record(s, 'mind', 'improvement-advice-changed', translate(wm, 'evAdviceChanged'));
      record(
        s,
        'mind',
        'improvement-response',
        validated
          ? translate(wm, 'evResponse', {
              head: validated.reasonToAbstain
                ? translate(wm, 'evResponseAbstain', { reason: validated.reasonToAbstain })
                : translate(wm, 'evResponseStock', {
                    released: formatFixed(validated.evidence.releasedPackedKg, 0),
                    held: formatFixed(validated.evidence.heldPackedKg, 0),
                    upper: formatFixed(validated.dispatchUpperKg, 0),
                  }),
              cost: formatFixed(improvementCost(s), 0),
            })
          : translate(wm, 'evResponseFacilitated')
      );
      break;
    }
    case 'setImprovementEpisode': {
      const [id] = command.args;
      const i = s.improvement;
      if (
        !i ||
        !deliberating ||
        (id !== null && !HANDOFF_EPISODES.some((e) => e.id === id)) ||
        (i.episode?.id ?? null) === id
      )
        return reject(translate(wm, 'rejEpisode'));
      if (id === null) delete i.episode;
      else i.episode = { id, actorId: null, choice: null };
      invalidate(s);
      record(
        s,
        'team',
        'improvement-episode',
        translate(wm, 'evEpisode', { episode: id ?? 'ordinary' })
      );
      break;
    }
    case 'respondImprovementEpisode': {
      const [actor, choice] = command.args;
      const i = s.improvement;
      if (
        !i?.episode ||
        !deliberating ||
        !member(actor) ||
        !HANDOFF_EPISODE_CHOICES.some((c) => c.id === choice) ||
        (i.episode.actorId === actor && i.episode.choice === choice)
      )
        return reject(translate(wm, 'rejEpisodeResponse'));
      i.episode = { ...i.episode, actorId: actor, choice };
      invalidate(s);
      record(
        s,
        actor,
        'improvement-episode-response',
        translate(wm, 'evEpisodeResponse', { episode: i.episode.id, choice })
      );
      break;
    }
    case 'stopImprovement': {
      const [actor] = command.args;
      const i = s.improvement;
      if (
        !i ||
        !['deliberating', 'active'].includes(s.phase) ||
        i.stopped ||
        !i.proposalId ||
        (!member(actor) && actor !== 'mind')
      )
        return reject(translate(wm, 'rejStopImprovement'));
      i.stopped = true;
      if (deliberating) invalidate(s);
      record(s, actor, 'improvement-stopped', translate(wm, 'evImprovementStopped'));
      break;
    }
    case 'acknowledgeImprovementReview': {
      const i = s.improvement;
      if (!i || s.phase !== 'review' || i.reviewAcknowledged)
        return reject(translate(wm, 'rejAckReview'));
      i.reviewAcknowledged = true;
      record(
        s,
        'mind',
        'improvement-forecast-review',
        i.advice
          ? i.advice.reasonToAbstain
            ? translate(wm, 'evReviewAbstained', {
                reason: i.advice.reasonToAbstain,
                shipped: plainNumber(s.shippedKg),
              })
            : translate(wm, 'evReviewBound', {
                upper: plainNumber(i.advice.dispatchUpperKg),
                shipped: plainNumber(s.shippedKg),
              })
          : translate(wm, 'evReviewLegacy', {
              forecast: plainNumber(i.forecastKg ?? 0),
              shipped: plainNumber(s.shippedKg),
            })
      );
      break;
    }
    case 'voteImprovementReview': {
      const [actor, verdict] = command.args;
      const i = s.improvement;
      if (
        !i ||
        s.phase !== 'review' ||
        !i.reviewAcknowledged ||
        i.verdict ||
        !member(actor) ||
        !IMPROVEMENT_VERDICTS.includes(verdict) ||
        i.ballots[actor] === verdict ||
        (verdict === 'adopt' && (!i.funded || i.stopped || s.minute !== s.durationMinutes))
      )
        return reject(translate(wm, 'rejVoteReview'));
      i.ballots[actor] = verdict;
      s.revision += 1;
      record(s, actor, 'improvement-review-ballot', translate(wm, 'evReviewBallot', { verdict }));
      break;
    }
    case 'finishImprovementReview': {
      const i = s.improvement;
      const winner = improvementReviewWinner(s);
      if (
        !i ||
        s.phase !== 'review' ||
        !i.reviewAcknowledged ||
        i.verdict ||
        command.args[0] !== s.revision ||
        !Number.isSafeInteger(command.args[0]) ||
        !winner ||
        improvementObligations(s).length ||
        (winner === 'adopt' && (!i.funded || i.stopped || s.minute !== s.durationMinutes))
      )
        return reject(translate(wm, 'rejFinishReview'));
      i.verdict = winner;
      s.revision += 1;
      record(s, 'members', 'improvement-reviewed', translate(wm, 'evReviewed', { winner }));
      break;
    }
    case 'continueImprovement': {
      const [revision, mission] = command.args;
      const i = s.improvement;
      if (
        !i ||
        s.phase !== 'review' ||
        !i.verdict ||
        revision !== s.revision ||
        !Number.isSafeInteger(revision) ||
        improvementObligations(s).length ||
        i.history.length + 1 >= MAX_IMPROVEMENT_CYCLES ||
        (mission && !validWorkplaceMission(mission))
      )
        return reject(translate(wm, 'rejContinue'));
      const { improvement: _improvement, ...snapshot } = saveWorkplace(s) as WorkplaceState;
      const history = [...i.history, { ...improvementTerms(s), snapshot }];
      const fresh = createWorkplace(s.mode, s.seed === 0xffffffff ? 1 : s.seed + 1);
      Object.assign(fresh, {
        phase: 'deliberating',
        revision: s.revision + 1,
        practices: [...s.practices],
        workerAutonomy: s.workerAutonomy,
        governance: s.governance,
        aiAuthority: s.aiAuthority,
      });
      fresh.finance.cash = s.finance.cash;
      fresh.finance.initialCapital = s.finance.cash;
      const linked = mission ?? i.mission;
      fresh.improvement = {
        version: 1,
        origin: structuredClone(i.origin),
        history,
        ...freshImprovementTerms(),
        ...(linked ? { mission: structuredClone(linked) } : {}),
      };
      const next =
        i.verdict === 'adopt'
          ? i.proposalId
          : i.verdict === 'amend'
            ? i.proposalId === 'briefing'
              ? 'buffer'
              : 'briefing'
            : null;
      if (next) {
        fresh.improvement.proposalId = next;
        fresh.improvement.proposerId = HANDOFF_ARRANGEMENTS.find((a) => a.id === next)!.author;
        fresh.improvement.forecastKg = improvementForecast(fresh).kg;
      }
      record(fresh, 'members', 'improvement-continued', translate(wm, 'evContinued'));
      return { state: fresh, changed: true, reason: null };
    }
    case 'resumeShift': {
      if (!Number.isSafeInteger(command.args[0]) || command.args[0] !== s.revision)
        return reject(translate(wm, 'rejStaleRevision'));
      if (!shiftResumable(s)) return reject(translate(wm, 'rejResumeShift'));
      // Back to deliberation at the minute reached. invalidate() keeps every
      // understanding, ballot and proof expired; checks and cover consent were
      // cleared by the reload's settle, so nothing runs without fresh consent.
      s.phase = 'deliberating';
      s.reviewReason = null;
      invalidate(s);
      record(s, 'team', 'shift-resumed', translate(wm, 'evShiftResumed', { minute: s.minute }));
      break;
    }
    case 'closeImprovement': {
      // Every handoff shift's honest exit once decided, the first included:
      // nothing owed is dropped and no new shift opens. Cancelling restores the
      // origin only before funding; afterwards pay was paid, so the experiment
      // ends at idle, as leaving a season does. Working if a verdict on any
      // shift, the eighth too, can end the experiment without another shift.
      const [revision] = command.args;
      const i = s.improvement;
      if (
        !i ||
        s.phase !== 'review' ||
        !i.verdict ||
        revision !== s.revision ||
        !Number.isSafeInteger(revision) ||
        improvementObligations(s).length
      )
        return reject(translate(wm, 'rejCloseImprovement'));
      const fresh = createWorkplace(s.mode, s.seed === 0xffffffff ? 1 : s.seed + 1);
      fresh.revision = s.revision + 1;
      return { state: fresh, changed: true, reason: null };
    }
    case 'startCampaign': {
      const [profile, seed = 1, mission] = command.args;
      if (
        s.phase !== 'idle' ||
        s.campaign ||
        !WORKPLACE_PROFILES.includes(profile) ||
        !validSeed(seed) ||
        (mission !== undefined &&
          (!validWorkplaceMission(mission) ||
            mission.creditedKg !== 0 ||
            mission.evidence !== 'current'))
      )
        return reject(translate(wm, 'rejStartCampaign'));
      const fresh = createWorkplace('game', seed);
      fresh.phase = 'deliberating';
      fresh.revision = s.revision + 1;
      fresh.campaign = {
        version: 1,
        profile,
        shift: 0,
        history: [],
        checks: {},
        decision: null,
        inspectionUntilMinute: null,
        inspectionComplete: false,
        adviserAcknowledged: false,
        repairs: 0,
        agreementProved: false,
        ...(mission ? { mission: structuredClone(mission) } : {}),
      };
      Object.assign(
        fresh,
        structuredClone(MANAGEMENT_APPROACHES.find((item) => item.id === profile)!.settings)
      );
      record(fresh, 'system', 'campaign-started', translate(wm, 'evCampaignStarted'));
      return { state: fresh, changed: true, reason: null };
    }
    case 'nextCampaignShift': {
      const [followOn] = command.args;
      // The next order is linked only once the current link is met, so a
      // commitment is never swapped for easier credit. Working if the season's
      // delivery stays the commitment's and later receipts still earn.
      const link = s.campaign?.followOn ?? s.campaign?.mission;
      if (
        !s.campaign ||
        s.campaign.shift >= 2 ||
        s.phase !== 'review' ||
        s.members.some((m) => m.recoveryOwedMinutes > 0) ||
        s.objections.some((o) => o.status === 'open') ||
        (followOn !== undefined &&
          (!s.campaign.mission ||
            s.campaign.mission.evidence !== 'current' ||
            s.campaign.mission.creditedKg + 1e-6 < s.campaign.mission.targetKg ||
            !link ||
            (link.evidence === 'current' && link.creditedKg + 1e-6 < link.targetKg) ||
            !validWorkplaceMission(followOn) ||
            followOn.creditedKg !== 0 ||
            followOn.evidence !== 'current' ||
            followOn.orderId === s.campaign.mission.orderId))
      )
        return reject(translate(wm, 'rejNextShift'));
      const history = [...s.campaign.history, campaignRecord(s)];
      const fresh = createWorkplace('game', (s.seed + 1) >>> 0);
      fresh.phase = 'deliberating';
      fresh.revision = s.revision + 1;
      fresh.practices = [...s.practices];
      fresh.workerAutonomy = s.workerAutonomy;
      fresh.governance = s.governance;
      fresh.aiAuthority = s.aiAuthority;
      fresh.finance.cash = s.finance.cash;
      fresh.finance.initialCapital = s.finance.cash;
      fresh.campaign = {
        version: 1,
        profile: s.campaign.profile,
        shift: s.campaign.shift + 1,
        history,
        checks: {},
        decision: null,
        inspectionUntilMinute: null,
        inspectionComplete: false,
        adviserAcknowledged: false,
        repairs: 0,
        agreementProved: false,
        ...(s.campaign.mission ? { mission: structuredClone(s.campaign.mission) } : {}),
      };
      const nextLink = followOn ?? s.campaign.followOn;
      if (nextLink) fresh.campaign.followOn = structuredClone(nextLink);
      record(fresh, 'system', 'campaign-shift-opened', translate(wm, 'evShiftOpened'));
      return { state: fresh, changed: true, reason: null };
    }
    case 'leaveCampaign': {
      // An honest exit: nothing owed is dropped and nothing is presented as a
      // completed review. The store keeps the stopped season as left early.
      // Working if leaving needs a settled, debt-free shift and ends at idle.
      const [revision] = command.args;
      const c = s.campaign;
      if (
        s.mode !== 'game' ||
        !c ||
        s.improvement ||
        revision !== s.revision ||
        !Number.isSafeInteger(revision) ||
        !['deliberating', 'review'].includes(s.phase) ||
        (s.phase === 'review' && c.shift === 2) ||
        improvementObligations(s).length ||
        c.history.some((h) => h.members.some((m) => m.recoveryOwedMinutes > 0))
      )
        return reject(translate(wm, 'rejLeaveCampaign'));
      const fresh = createWorkplace('game', s.seed === 0xffffffff ? 1 : s.seed + 1);
      fresh.revision = s.revision + 1;
      return { state: fresh, changed: true, reason: null };
    }
    case 'answerCheck': {
      const [actor, question, answer] = command.args;
      const check = WORKPLACE_CHECKS.find((q) => q.id === question);
      if (
        !s.campaign ||
        !deliberating ||
        (!member(actor) && actor !== 'mind') ||
        !check ||
        !requiredChecks(actor).includes(question) ||
        !check.options.some((option) => option.value === answer)
      )
        return reject(translate(wm, 'rejAnswerCheck'));
      const answers = s.campaign.checks[actor] ?? {};
      if (answers[question] === answer) return reject(translate(wm, 'rejAnswerUnchanged'));
      s.campaign.checks[actor] = { ...answers, [question]: answer };
      if (actor === 'mind') s.campaign.adviserAcknowledged = checksPassed(s.campaign, actor);
      else {
        const m = member(actor)!;
        m.understood = false;
        m.ballot = null;
        m.coverConsent = null;
      }
      record(
        s,
        actor,
        answer === check.correct ? 'understanding-demonstrated' : 'clarification-needed',
        answer === check.correct
          ? translate(wm, 'evCheckCorrect', { question })
          : check.clarification
      );
      return {
        state: s,
        changed: true,
        reason: answer === check.correct ? null : check.clarification,
      };
    }
    case 'campaignDecision': {
      const [decision, actor] = command.args;
      const c = s.campaign;
      const choice = c && CAMPAIGN_SHIFTS[c.shift]?.choices.find((item) => item.id === decision);
      if (!c || !choice || choice.actorId !== actor || !member(actor))
        return reject(translate(wm, 'rejDecisionRole'));
      if (decision === 'penalize-refusal') return reject(translate(wm, 'rejPenalizeRefusal'));
      if (decision === 'skip-inspection') return reject(translate(wm, 'rejSkipInspection'));
      if (c.shift === 1) {
        if (s.phase !== 'active' || s.minute < 25 || c.decision !== null)
          return reject(translate(wm, 'rejInspectionTiming'));
        c.decision = decision;
        c.inspectionUntilMinute = s.minute + 5;
        record(s, actor, 'inspection-started', translate(wm, 'evInspectionStarted'));
      } else {
        if (!deliberating || c.decision === decision)
          return reject(translate(wm, 'rejDifferentResponse'));
        c.decision = decision;
        if (c.shift === 0 || c.shift === 2) {
          s.targetKg = decision === 'renegotiate' ? 480 : 600;
          if (c.mission)
            c.mission.targetKg =
              c.mission.originalTargetKg *
              (decision === 'renegotiate' ||
              (c.shift === 2 && c.history[0]?.decision === 'renegotiate')
                ? 0.8
                : 1);
        }
        if (c.shift === 2 && c.repairs === 0) {
          c.repairs = 1;
          record(s, 'mind', 'adviser-correction', translate(wm, 'evAdviserCorrection'));
        }
        invalidate(s);
        record(s, actor, 'episode-decision', translate(wm, 'evEpisodeDecision', { decision }));
      }
      break;
    }
    case 'respondToPressure': {
      const [id, response] = command.args;
      const pressure = s.campaign && CAMPAIGN_PRESSURES[s.campaign.shift];
      const reviewRepair =
        response === 'protect-boundary' &&
        s.phase === 'review' &&
        pressure &&
        s.objections.some((o) => o.statement === pressure.objection && o.status === 'open');
      if (
        (!deliberating && !reviewRepair) ||
        !pressure ||
        pressure.id !== id ||
        !['accept-demand', 'protect-boundary'].includes(response)
      )
        return reject(translate(wm, 'rejPressureCard'));
      const prefix = `${id}: `;
      const protectedTerms = s.events.some(
        (event) => event.kind === 'pressure-protected' && event.detail.startsWith(prefix)
      );
      if (
        protectedTerms ||
        (response === 'accept-demand' &&
          s.objections.some((o) => o.statement === pressure.objection))
      )
        return reject(translate(wm, 'rejPressureReviewed'));
      if (response === 'accept-demand') {
        if (s.objections.length >= 32) return reject(translate(wm, 'rejObjectionRecordFull'));
        s.objections.push({
          id: `o-${s.objections.length + 1}`,
          actorId: pressure.challenger,
          kind: pressure.kind,
          statement: pressure.objection,
          status: 'open',
          resolution: null,
        });
        record(s, pressure.challenger, 'pressure-challenged', `${prefix}${pressure.objection}`);
        invalidate(s);
        return {
          state: s,
          changed: true,
          reason: translate(wm, 'reasonDemandBlocked'),
        };
      }
      record(s, 'coordinator', 'pressure-protected', `${prefix}${pressure.repair}`);
      invalidate(s);
      return {
        state: s,
        changed: true,
        reason: translate(wm, 'reasonTermsRestated'),
      };
    }
    case 'start': {
      if (s.improvement) return reject(translate(wm, 'rejStartDuringImprovement'));
      const [mode, seed = 1] = command.args;
      if (!MODES.includes(mode) || !validSeed(seed))
        return reject(translate(wm, 'rejInvalidModeSeed'));
      if (s.campaign) return reject(translate(wm, 'rejCampaignReset'));
      if (s.phase === 'active' || s.members.some((m) => m.recoveryOwedMinutes > 0))
        return reject(translate(wm, 'rejStopActiveFirst'));
      const fresh = createWorkplace(mode, seed);
      fresh.phase = 'deliberating';
      fresh.revision = s.revision + 1;
      record(fresh, 'system', 'started', translate(wm, 'evStarted'));
      return { state: fresh, changed: true, reason: null };
    }
    case 'configure': {
      if (!deliberating) return reject(translate(wm, 'rejConfigureOnly'));
      const [settings] = command.args;
      if (
        !settings ||
        typeof settings !== 'object' ||
        Object.keys(settings).some(
          (k) => !['practices', 'workerAutonomy', 'governance', 'aiAuthority'].includes(k)
        )
      )
        return reject(translate(wm, 'rejUnknownField'));
      const { practices, workerAutonomy, governance, aiAuthority } = settings;
      if (
        practices !== undefined &&
        (!Array.isArray(practices) ||
          practices.some((p) => !PRACTICES.some((known) => known.id === p)) ||
          new Set(practices).size !== practices.length)
      )
        return reject(translate(wm, 'rejUnknownPractice'));
      if (
        workerAutonomy !== undefined &&
        !['directed', 'individual', 'team'].includes(workerAutonomy)
      )
        return reject(translate(wm, 'rejInvalidAutonomy'));
      if (
        governance !== undefined &&
        !['consultative', 'team-consent', 'member-vote'].includes(governance)
      )
        return reject(translate(wm, 'rejInvalidGovernance'));
      if (aiAuthority !== undefined && !['advice', 'bounded'].includes(aiAuthority))
        return reject(translate(wm, 'rejInvalidAuthority'));
      const next = {
        practices: [...(practices ?? s.practices)],
        workerAutonomy: workerAutonomy ?? s.workerAutonomy,
        governance: governance ?? s.governance,
        aiAuthority: aiAuthority ?? s.aiAuthority,
      };
      if (
        JSON.stringify(next) ===
        JSON.stringify({
          practices: s.practices,
          workerAutonomy: s.workerAutonomy,
          governance: s.governance,
          aiAuthority: s.aiAuthority,
        })
      )
        return reject(translate(wm, 'rejConfigUnchanged'));
      if (
        s.objections.some((o) => o.status === 'open') &&
        s.practices.some((p) => !next.practices.includes(p))
      )
        return reject(translate(wm, 'rejResolveBeforeRemoving'));
      Object.assign(s, next);
      invalidate(s);
      s.chairBallots = {};
      s.electedChair = null;
      record(s, 'team', 'terms-revised', translate(wm, 'evTermsRevised'));
      break;
    }
    case 'selectPlan': {
      const [id] = command.args;
      if (s.improvement && id !== 'steady') return reject(translate(wm, 'rejNoStacking'));
      if (!deliberating || !WORKPLACE_PLANS.some((p) => p.id === id))
        return reject(translate(wm, 'rejKnownPlan'));
      if (s.planId === id) return reject(translate(wm, 'rejPlanUnchanged'));
      s.planId = id;
      invalidate(s);
      record(s, 'team', 'plan-revised', translate(wm, 'evPlanRevised'));
      break;
    }
    case 'understand': {
      const m = member(command.args[0]);
      if (!deliberating || !m || m.understood) return reject(translate(wm, 'rejUnderstand'));
      if (s.campaign && !checksPassed(s.campaign, m.id))
        return reject(translate(wm, 'rejUnderstandChecks'));
      m.understood = true;
      record(s, m.id, 'understood', translate(wm, 'evUnderstood'));
      break;
    }
    case 'vote': {
      const [id, approve] = command.args;
      const m = member(id);
      if (!deliberating || !m?.understood || typeof approve !== 'boolean' || m.ballot === approve)
        return reject(translate(wm, 'rejVote'));
      m.ballot = approve;
      record(
        s,
        id,
        'ballot',
        approve
          ? translate(wm, 'evBallotApproved')
          : // Kept English: workplaceImprovement.ts and workplaceFairness.ts match this text.
            BALLOT_DECLINED_DETAIL
      );
      break;
    }
    case 'consentToCover': {
      const [id, accept] = command.args;
      const m = member(id);
      if (
        !deliberating ||
        !m?.understood ||
        typeof accept !== 'boolean' ||
        s.planId !== 'cover' ||
        m.coverConsent === accept
      )
        return reject(translate(wm, 'rejCoverConsent'));
      if (accept && !eligibleCover(m)) return reject(translate(wm, 'rejNotQualified'));
      m.coverConsent = accept;
      record(
        s,
        id,
        'cover-consent',
        accept ? translate(wm, 'evCoverAccepted') : translate(wm, 'evCoverDeclined')
      );
      break;
    }
    case 'sharePreference': {
      const [id, share] = command.args;
      const m = member(id);
      if (
        !m ||
        typeof share !== 'boolean' ||
        !['deliberating', 'active'].includes(s.phase) ||
        m.sharing === share
      )
        return reject(translate(wm, 'rejShare'));
      m.sharing = share;
      m.shareUntilMinute = share ? s.durationMinutes : null;
      record(
        s,
        id,
        'privacy-consent',
        share ? translate(wm, 'evPreferenceShared') : translate(wm, 'evPreferenceHidden')
      );
      break;
    }
    case 'chooseTask': {
      const [id, task] = command.args;
      const m = member(id);
      if (
        !deliberating ||
        !s.practices.includes('work-choice') ||
        s.workerAutonomy === 'directed' ||
        !m ||
        !m.eligibleTasks.includes(task) ||
        m.chosenTask === task
      )
        return reject(translate(wm, 'rejChooseTask'));
      m.chosenTask = task;
      invalidate(s);
      record(s, id, 'work-choice', translate(wm, 'evTaskChanged'));
      break;
    }
    case 'simulateResponses': {
      if (!deliberating || s.mode !== 'game') return reject(translate(wm, 'rejSimulateMode'));
      let changed = false;
      for (const m of s.members) {
        if (s.campaign) {
          // Working if peer simulation never fills any playable Packing decision,
          // even after correct answers or explicit confirmation. Comprehension
          // grants neither a ballot nor individual extra-duty consent.
          if (m.id === 'packing') continue;
          if (m.id !== 'packing') {
            for (const question of requiredChecks(m.id)) {
              if (s.campaign.checks[m.id]?.[question] !== undefined) continue;
              s.campaign.checks[m.id] = {
                ...s.campaign.checks[m.id],
                [question]: WORKPLACE_CHECKS.find((q) => q.id === question)!.correct,
              };
              changed = true;
            }
            if (!checksPassed(s.campaign, m.id)) continue;
          }
        }
        const ballot = s.planId !== 'rush';
        const cover = s.planId === 'cover' ? m.willingToCover && eligibleCover(m) : null;
        if (!m.understood) {
          m.understood = true;
          changed = true;
        }
        if (m.ballot === null) {
          m.ballot = ballot;
          changed = true;
        }
        if (m.coverConsent === null && cover !== null) {
          m.coverConsent = cover;
          changed = true;
        }
      }
      if (!changed) return reject(translate(wm, 'rejAuthoredAlready'));
      record(
        s,
        'simulation',
        'authored-responses',
        s.campaign ? translate(wm, 'evAuthoredCampaign') : translate(wm, 'evAuthoredRoles')
      );
      break;
    }
    case 'object': {
      const [id, kind] = command.args;
      if (
        (!member(id) && id !== 'mind') ||
        !KINDS.includes(kind) ||
        !['deliberating', 'active'].includes(s.phase)
      )
        return reject(translate(wm, 'rejObjectRole'));
      if (s.objections.some((o) => o.actorId === id && o.kind === kind && o.status === 'open'))
        return reject(translate(wm, 'rejObjectionOpen'));
      if (s.objections.length >= 32) return reject(translate(wm, 'rejObjectionFull'));
      s.objections.push({
        id: `o-${s.objections.length + 1}`,
        actorId: id,
        kind,
        statement: translate(wm, 'objectionStatement', { kind }),
        status: 'open',
        resolution: null,
      });
      record(s, id, 'objection', translate(wm, 'evObjection', { kind }));
      if (s.phase === 'active') settle(s, translate(wm, 'settleObjection'));
      break;
    }
    case 'resolveObjection': {
      const [id, actor] = command.args;
      const o = s.objections.find((o) => o.id === id);
      if (
        !['deliberating', 'review'].includes(s.phase) ||
        !o ||
        o.status !== 'open' ||
        o.actorId !== actor
      )
        return reject(translate(wm, 'rejResolveRaiser'));
      const pressure = CAMPAIGN_PRESSURES.find((item) => item.objection === o.statement);
      if (
        pressure &&
        !s.events.some(
          (event) =>
            event.kind === 'pressure-protected' && event.detail.startsWith(`${pressure.id}: `)
        )
      )
        return reject(translate(wm, 'rejRestateFirst'));
      o.status = 'resolved';
      o.resolution = translate(wm, 'objectionResolution', { actor, kind: o.kind });
      record(s, actor, 'objection-resolved', o.resolution);
      break;
    }
    case 'activate': {
      if (!Number.isSafeInteger(command.args[0]) || command.args[0] !== s.revision)
        return reject(translate(wm, 'rejStaleRevision'));
      const readiness = workplaceReadiness(s);
      if (!readiness.allowed) return reject(readiness.reasons.join(' '));
      const p = planOf(s);
      // Every shift deliberates from minute 0, so deliberating later means a
      // shift resumed after a reload: it was funded when it first activated.
      // It reserves wages and cover only for what is left, and buys nothing again.
      const resumed = s.minute > 0;
      const coverDelivered = resumed ? s.members.reduce((n, m) => n + m.extraMinutes, 0) : 0;
      const coverLeft = Math.max(0, p.optionalCoverMinutes - coverDelivered);
      s.finance.wageReserve = WAGE * (s.durationMinutes - s.minute) * s.members.length;
      s.finance.compensationReserve = coverLeft * p.compensationPerMinute;
      if (!resumed) {
        const improvementPurchase = improvementCost(s);
        s.finance.cash -= p.budgetCost + improvementPurchase;
        s.finance.improvementSpend += p.budgetCost + improvementPurchase;
      }
      // A cancelled proposal authorizes paid steady work, without purchasing
      // the abandoned arrangement. Keep that distinction in its saved receipt.
      if (s.improvement && !s.improvement.stopped) s.improvement.funded = true;
      if (coverLeft > 0) {
        const totals = campaignTotals(s);
        const burden = (id: string) => totals.members.find((m) => m.id === id)!.extraMinutes;
        // One member covers a shift: a resumed shift continues with whoever
        // already began, if they consent again; otherwise it has no cover.
        const began = resumed ? s.members.find((m) => m.extraMinutes > 0) : undefined;
        const chosen = began
          ? began.coverConsent === true && eligibleCover(began)
            ? began
            : undefined
          : s.members
              .filter((m) => m.coverConsent === true && eligibleCover(m))
              .sort((a, b) => burden(a.id) - burden(b.id) || a.id.localeCompare(b.id))[0];
        if (chosen) {
          s.activeCoverMemberId = chosen.id;
          s.coverRemainingMinutes = coverLeft;
        } else s.finance.compensationReserve = 0;
      }
      for (const m of s.members)
        if (m.coverConsent === false && !m.refusalRespected) {
          m.refusalRespected = true;
          s.refusalsRespected += 1;
        }
      // One bounded AI action per shift; resuming is the same shift's action.
      if (s.mode === 'game' && s.aiAuthority === 'bounded' && !resumed) s.aiActions += 1;
      s.phase = 'active';
      if (s.campaign) s.campaign.agreementProved = true;
      record(s, 'team', 'activated', translate(wm, 'evActivated'));
      break;
    }
    case 'withdraw': {
      const m = member(command.args[0]);
      if (
        !m ||
        !['deliberating', 'active'].includes(s.phase) ||
        (m.coverConsent !== true && !m.sharing)
      )
        return reject(translate(wm, 'rejNoConsentToWithdraw'));
      const withdrawingCover = m.coverConsent === true;
      m.sharing = false;
      m.shareUntilMinute = null;
      m.coverConsent = false;
      if (s.activeCoverMemberId === m.id) releaseCover(s);
      if (withdrawingCover && !m.refusalRespected) {
        m.refusalRespected = true;
        s.refusalsRespected += 1;
      }
      record(s, m.id, 'withdrawn', translate(wm, 'evWithdrawn'));
      break;
    }
    case 'stop': {
      if (!['deliberating', 'active'].includes(s.phase))
        return reject(translate(wm, 'rejNoScenario'));
      settle(s, translate(wm, 'settleStopped'));
      break;
    }
    case 'tick': {
      const [delta, shipped, emergency, observation, followOnObservation] = command.args;
      if (
        (!['active', 'review'].includes(s.phase) &&
          !(s.phase === 'deliberating' && workplaceMission(s))) ||
        s.mode === 'pilot' ||
        !finite(delta) ||
        delta <= 0 ||
        delta > 1e6 ||
        !finite(shipped) ||
        shipped < 0 ||
        shipped > 1e9 ||
        typeof emergency !== 'boolean'
      )
        return reject(translate(wm, 'rejNoTick'));
      const links = () => JSON.stringify([workplaceMission(s), s.campaign?.followOn]);
      const beforeMission = links();
      const observing = !(s.phase === 'review' && (s.campaign?.shift === 2 || s.improvement));
      const missionDelivered = observing ? observeMission(s, observation) : 0;
      // The follow-on order earns only from fresh receipts in active work; bad
      // evidence there stops its credit but never settles the commitment.
      const followOnDelivered =
        observing && s.campaign?.followOn && followOnObservation
          ? observeLink(s.campaign.followOn, followOnObservation)
          : 0;
      if (s.phase === 'deliberating') {
        if (links() === beforeMission) return reject(translate(wm, 'rejNoMissionReceipt'));
        break;
      }
      if (
        s.phase === 'active' &&
        workplaceMission(s) &&
        workplaceMission(s)!.evidence !== 'current'
      ) {
        settle(s, translate(wm, 'settleMissionChanged'));
        break;
      }
      if (s.phase === 'review') {
        if (emergency || !s.members.some((m) => m.recoveryOwedMinutes > 0)) {
          if (links() !== beforeMission) break;
          return reject(translate(wm, 'rejNoRecovery'));
        }
        deliverRecovery(s, delta);
        break;
      }
      if (emergency) {
        settle(s, translate(wm, 'settleEmergency'));
        break;
      }
      const elapsed = Math.min(delta, s.durationMinutes - s.minute);
      const delivered =
        s.mode === 'game'
          ? (workplaceMission(s) ? missionDelivered + followOnDelivered : shipped) *
            (elapsed / delta)
          : 0;
      const ordinaryRest = Math.max(0, Math.min(s.minute + elapsed, 90) - Math.max(s.minute, 75));
      for (const m of s.members) m.restMinutes += ordinaryRest;
      s.minute += elapsed;
      if (
        s.campaign?.shift === 1 &&
        s.minute >= 25 &&
        s.campaign.inspectionUntilMinute !== null &&
        s.minute >= s.campaign.inspectionUntilMinute &&
        !s.campaign.inspectionComplete
      ) {
        s.campaign.inspectionComplete = true;
        record(s, 'quality', 'inspection-completed', translate(wm, 'evInspectionCompleted'));
      }
      s.shippedKg += delivered;
      s.finance.operatingRevenue += delivered * REVENUE_PER_KG;
      s.finance.operatingCost += delivered * COST_PER_KG;
      s.finance.cash += delivered * (REVENUE_PER_KG - COST_PER_KG);
      const pay = elapsed * WAGE;
      for (const m of s.members) m.earnedPay += pay;
      s.finance.cash -= pay * s.members.length;
      s.finance.wagesPaid += pay * s.members.length;
      s.finance.wageReserve = Math.max(0, s.finance.wageReserve - pay * s.members.length);
      const coverMemberId = s.activeCoverMemberId;
      let coveredMinutes = 0;
      const m = member(coverMemberId ?? '');
      if (m && m.coverConsent === true) {
        const cover = Math.min(elapsed, s.coverRemainingMinutes);
        coveredMinutes = cover;
        if (cover > 0 && m.extraMinutes === 0) m.recoveryOwedMinutes = planOf(s).recoveryMinutes;
        const earned = cover * planOf(s).compensationPerMinute;
        m.extraMinutes += cover;
        m.compensationPaid += earned;
        s.finance.compensationPaid += earned;
        s.finance.cash -= earned;
        s.finance.compensationReserve = Math.max(0, s.finance.compensationReserve - earned);
        s.coverRemainingMinutes -= cover;
        if (s.coverRemainingMinutes <= 1e-8) releaseCover(s);
      }
      deliverRecovery(s, elapsed, coverMemberId, coveredMinutes);
      for (const m of s.members)
        if (m.shareUntilMinute !== null && m.shareUntilMinute <= s.minute) {
          m.sharing = false;
          m.shareUntilMinute = null;
        }
      if (s.minute >= s.durationMinutes) settle(s, translate(wm, 'settleEnded'));
      break;
    }
    case 'elect': {
      const [voter, candidate] = command.args;
      if (
        !deliberating ||
        s.governance !== 'member-vote' ||
        !s.practices.includes('cooperative') ||
        !member(voter) ||
        !member(candidate) ||
        s.chairBallots[voter] === candidate
      )
        return reject(translate(wm, 'rejElect'));
      s.chairBallots[voter] = candidate;
      s.electedChair =
        s.members.find((m) => Object.values(s.chairBallots).filter((v) => v === m.id).length >= 3)
          ?.id ?? null;
      record(s, voter, 'chair-ballot', translate(wm, 'evChairBallot', { candidate }));
      break;
    }
    case 'voteSurplus': {
      const [voter, destination] = command.args;
      if (
        s.phase !== 'review' ||
        s.distributionComplete ||
        !s.practices.includes('gainsharing') ||
        !member(voter) ||
        !DESTINATIONS.includes(destination) ||
        s.surplusBallots[voter] === destination
      )
        return reject(translate(wm, 'rejSurplusVote'));
      s.surplusBallots[voter] = destination;
      record(s, voter, 'surplus-ballot', translate(wm, 'evSurplusBallot', { destination }));
      break;
    }
    case 'distributeSurplus': {
      if (
        s.phase !== 'review' ||
        s.distributionComplete ||
        !s.practices.includes('gainsharing') ||
        s.finance.wageReserve > 0 ||
        s.finance.compensationReserve > 0 ||
        s.members.some((m) => m.recoveryOwedMinutes > 0) ||
        s.objections.some((o) => o.status === 'open')
      )
        return reject(translate(wm, 'rejSettleFirst'));
      const destination = DESTINATIONS.find(
        (d) => Object.values(s.surplusBallots).filter((v) => v === d).length >= 3
      );
      if (!destination) return reject(translate(wm, 'rejSurplusAgree'));
      const surplus = Math.min(
        s.finance.cash,
        Math.max(
          0,
          s.finance.operatingRevenue -
            s.finance.operatingCost -
            s.finance.wagesPaid -
            s.finance.compensationPaid -
            s.finance.improvementSpend
        )
      );
      if (surplus <= 1e-8) return reject(translate(wm, 'rejNoSurplus'));
      if (destination === 'members') {
        s.finance.cash -= surplus;
        s.finance.distributed += surplus;
        for (const m of s.members) m.earnedPay += surplus / s.members.length;
      }
      if (destination === 'community') {
        s.finance.cash -= surplus;
        s.finance.communityAllocation += surplus;
      }
      s.distributionComplete = true;
      record(
        s,
        'members',
        'surplus-decided',
        translate(wm, 'evSurplusDecided', { destination, amount: formatFixed(surplus, 2) })
      );
      break;
    }
    default:
      return reject(translate(wm, 'rejUnknownAction'));
  }
  return { changed: true, reason: null, state: s };
}

/** Persist a settled, privacy-redacted snapshot, never live authority. */
export function saveWorkplace(s: WorkplaceState): unknown {
  const saved = structuredClone(s);
  if (saved.phase === 'active' || saved.phase === 'deliberating')
    // Kept English: workplaceFairness.ts matches the 'Reload safety' prefix.
    settle(saved, RELOAD_SAFETY_DETAIL);
  for (const m of saved.members) {
    m.preference = '';
    m.willingToCover = false;
  }
  return saved;
}

/** Canonical shape validation rejects unknown identity/authority fields and non-finite money. */
export function restoreWorkplace(input: unknown): WorkplaceState {
  if (input && typeof input === 'object' && 'improvement' in input)
    return restoreImprovementSnapshot(input);
  return restoreWorkplaceSnapshot(input);
}

/** Optional continuation decoder: each monetary anchor is independently checked.
 * Working if changed canonical cost, nested private data or erased origin rejects
 * the entire save, while old campaign bytes continue through their old decoder.
 */
function restoreImprovementSnapshot(input: object): WorkplaceState {
  const fallback = createWorkplace();
  const raw = input as WorkplaceState;
  const i = raw.improvement;
  if (
    !i ||
    typeof i !== 'object' ||
    Array.isArray(i) ||
    i.version !== 1 ||
    raw.campaign !== null ||
    !Array.isArray(i.history) ||
    i.history.length >= MAX_IMPROVEMENT_CYCLES ||
    !i.origin ||
    typeof i.origin !== 'object' ||
    'improvement' in i.origin ||
    (i.mission !== undefined && !validWorkplaceMission(i.mission))
  )
    return fallback;
  const {
    origin: _origin,
    history: _history,
    mission: _mission,
    version: _version,
    ...rawCurrentTerms
  } = i;
  // Optional planning evidence has no monetary authority. Quarantine malformed
  // evidence independently, preserving the valid wage and recovery ledger.
  // Working if a corrupt optional forecast cannot turn paid work into fresh capital.
  const cleanTerms = (rawTerms: ReturnType<typeof improvementTerms>) => {
    const { advice, episode, ...core } = rawTerms;
    const safeAdvice = validPackingAdvice(advice);
    const safeEpisode = validImprovementEpisode(episode);
    return {
      ...core,
      ...(safeAdvice ? { advice: safeAdvice } : {}),
      ...(safeEpisode ? { episode: safeEpisode } : {}),
    };
  };
  const currentTerms = cleanTerms(rawCurrentTerms);
  const termsKeys = Object.keys(freshImprovementTerms()).sort().join(',');
  const ids = ['packing', 'quality', 'maintenance', 'coordinator'];
  const validTerms = (terms: unknown): terms is ReturnType<typeof improvementTerms> => {
    if (!terms || typeof terms !== 'object' || Array.isArray(terms)) return false;
    const t = terms as ReturnType<typeof improvementTerms>;
    const a = HANDOFF_ARRANGEMENTS.find((a) => a.id === t.proposalId);
    return (
      Object.keys(t)
        .filter((k) => k !== 'advice' && k !== 'episode')
        .sort()
        .join(',') === termsKeys &&
      (t.proposalId === null
        ? t.proposerId === null && t.forecastKg === null && !t.funded
        : !!a && t.proposerId === a.author && finite(t.forecastKg) && t.forecastKg >= 0) &&
      ['acknowledged', 'funded', 'stopped', 'reviewAcknowledged'].every(
        (k) => typeof t[k as keyof typeof t] === 'boolean'
      ) &&
      Array.isArray(t.challenges) &&
      t.challenges.length <= 15 &&
      t.challenges.every(
        (c) =>
          c &&
          Object.keys(c).sort().join(',') === 'actorId,kind' &&
          [...ids, 'mind'].includes(c.actorId) &&
          IMPROVEMENT_CHALLENGES.includes(c.kind)
      ) &&
      new Set(t.challenges.map((c) => `${c.actorId}-${c.kind}`)).size === t.challenges.length &&
      !!t.ballots &&
      typeof t.ballots === 'object' &&
      !Array.isArray(t.ballots) &&
      Object.entries(t.ballots).every(
        ([id, v]) => ids.includes(id) && IMPROVEMENT_VERDICTS.includes(v)
      ) &&
      (t.verdict === null || IMPROVEMENT_VERDICTS.includes(t.verdict)) &&
      (!t.verdict || t.reviewAcknowledged)
    );
  };
  if (!validTerms(currentTerms)) return fallback;
  const origin = restoreWorkplaceSnapshot(i.origin);
  if (
    origin.mode !== raw.mode ||
    !['idle', 'review'].includes(origin.phase) ||
    origin.seed !== i.origin.seed ||
    origin.phase !== i.origin.phase ||
    improvementObligations(origin).length ||
    origin.finance.cash !== i.origin.finance.cash
  )
    return fallback;
  const redactedOrigin = saveWorkplace(origin) as WorkplaceState;
  redactedOrigin.revision = i.origin.revision;
  const history: NonNullable<WorkplaceState['improvement']>['history'] = [];
  let openingCash = origin.finance.cash;
  let expectedSeed = origin.seed;
  const decodeShift = (
    snapshot: Omit<WorkplaceState, 'improvement'>,
    terms: ReturnType<typeof improvementTerms>
  ) => {
    if (
      !snapshot ||
      typeof snapshot !== 'object' ||
      'improvement' in snapshot ||
      snapshot.campaign !== null ||
      snapshot.seed !== expectedSeed ||
      snapshot.mode !== raw.mode ||
      snapshot.planId !== 'steady'
    )
      return null;
    const restored = restoreWorkplaceSnapshot(snapshot, openingCash);
    if (
      restored.phase !== 'review' ||
      restored.seed !== expectedSeed ||
      restored.finance.cash !== snapshot.finance.cash
    )
      return null;
    const shaped: WorkplaceState = {
      ...restored,
      improvement: { version: 1, origin: redactedOrigin, history, ...terms },
    };
    const expectedForecast = improvementForecast({
      ...shaped,
      improvement: { ...shaped.improvement!, forecastKg: null, stopped: false },
    }).kg;
    if (
      (terms.proposalId && Math.abs(terms.forecastKg! - expectedForecast) > 1e-6) ||
      Math.abs(restored.finance.improvementSpend - (terms.funded ? improvementCost(shaped) : 0)) >
        1e-6 ||
      (terms.verdict && improvementReviewWinner(shaped) !== terms.verdict) ||
      (terms.verdict === 'adopt' && (!terms.funded || terms.stopped || restored.minute !== 90)) ||
      (terms.verdict && improvementObligations(restored).length) ||
      (!terms.funded && !terms.stopped && (restored.minute !== 0 || restored.shippedKg !== 0)) ||
      (restored.minute < 90 && !terms.stopped)
    )
      return null;
    return restored;
  };
  for (const entry of i.history) {
    if (!entry || typeof entry !== 'object') return fallback;
    const { snapshot, ...rawTerms } = entry;
    const terms = cleanTerms(rawTerms);
    if (!validTerms(terms) || !terms.verdict) return fallback;
    const restored = decodeShift(snapshot, terms);
    if (!restored) return fallback;
    const redacted = saveWorkplace(restored) as WorkplaceState;
    redacted.revision = snapshot.revision;
    history.push({ ...structuredClone(terms), snapshot: redacted });
    openingCash = restored.finance.cash;
    expectedSeed = expectedSeed === 0xffffffff ? 1 : expectedSeed + 1;
  }
  const { improvement: _improvement, ...snapshot } = raw;
  const restored = decodeShift(snapshot, currentTerms);
  if (!restored) return fallback;
  const originalMission = origin.campaign?.mission;
  if (
    originalMission &&
    (!i.mission ||
      ['orderId', 'materialSessionId', 'startingShippedKg', 'originalTargetKg', 'targetKg'].some(
        (key) =>
          i.mission![key as keyof typeof i.mission] !==
          originalMission[key as keyof typeof originalMission]
      ))
  )
    return fallback;
  restored.improvement = {
    version: 1,
    origin: redactedOrigin,
    history,
    ...structuredClone(currentTerms),
    ...(i.mission ? { mission: structuredClone(i.mission) } : {}),
  };
  return restored;
}

function restoreWorkplaceSnapshot(
  input: unknown,
  openingCash = 400,
  historicalRenegotiated = false
): WorkplaceState {
  const fallback = createWorkplace();
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fallback;
  // Version-one standalone saves predate the optional campaign field.
  const raw = input as Record<string, unknown>;
  const r: Record<string, unknown> = { ...raw, campaign: raw.campaign ?? null };
  if (!MODES.includes(r.mode as WorkplaceMode) || !validSeed(r.seed)) return fallback;
  const canonical = createWorkplace(r.mode as WorkplaceMode, r.seed);
  // Validate the entire structure before using the type assertion, then reconstruct private fields.
  const validShape = (value: unknown, sample: unknown): boolean => {
    if (typeof sample === 'number') return finite(value) && value >= 0 && value <= 1e12;
    if (typeof sample === 'boolean') return typeof value === 'boolean';
    if (typeof sample === 'string') return typeof value === 'string' && value.length <= 500;
    if (sample === null) return value === null;
    if (Array.isArray(sample)) return Array.isArray(value);
    if (sample && typeof sample === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const o = value as Record<string, unknown>;
      const t = sample as Record<string, unknown>;
      return (
        Object.keys(o).length === Object.keys(t).length &&
        Object.keys(t).every((key) => key in o && validShape(o[key], t[key]))
      );
    }
    return false;
  };
  // Variable records and nullable fields are verified separately, rather than trusted by a cast.
  const template: Record<string, unknown> = {
    ...canonical,
    phase: '',
    electedChair: '',
    reviewReason: '',
    members: [],
    objections: [],
    events: [],
    chairBallots: {},
    surplusBallots: {},
    campaign: null,
  };
  const checked = {
    ...r,
    electedChair: r.electedChair ?? '',
    reviewReason: r.reviewReason ?? '',
    chairBallots: {},
    surplusBallots: {},
    campaign: null,
  };
  if (
    !validShape(checked, template) ||
    r.schemaVersion !== 1 ||
    !Number.isSafeInteger(r.revision) ||
    !['idle', 'review'].includes(String(r.phase)) ||
    r.durationMinutes !== 90 ||
    ![480, 600].includes(Number(r.targetKg)) ||
    !finite(r.minute) ||
    r.minute > 90 ||
    r.activeCoverMemberId !== null ||
    r.coverRemainingMinutes !== 0
  )
    return fallback;
  if (r.campaign !== null) {
    if (!r.campaign || typeof r.campaign !== 'object' || Array.isArray(r.campaign)) return fallback;
    const c = r.campaign as WorkplaceState['campaign'] & Record<string, unknown>;
    if (c.mission !== undefined && !validWorkplaceMission(c.mission)) return fallback;
    if (
      c.followOn !== undefined &&
      (!c.mission || !validWorkplaceMission(c.followOn) || c.followOn.orderId === c.mission.orderId)
    )
      return fallback;
    const { mission: _mission, followOn: _followOn, ...campaignShape } = c;
    if (
      !validShape(
        {
          ...campaignShape,
          decision: c.decision ?? '',
          inspectionUntilMinute: c.inspectionUntilMinute ?? 0,
        },
        {
          version: 1,
          profile: '',
          shift: 0,
          history: [],
          checks: {},
          decision: '',
          inspectionUntilMinute: 0,
          inspectionComplete: false,
          adviserAcknowledged: false,
          repairs: 0,
          agreementProved: false,
        }
      ) ||
      c.version !== 1 ||
      !WORKPLACE_PROFILES.includes(c.profile) ||
      !Number.isSafeInteger(c.shift) ||
      c.shift < 0 ||
      c.shift > 2 ||
      !Array.isArray(c.history) ||
      c.history.length !== c.shift ||
      r.mode !== 'game' ||
      c.adviserAcknowledged ||
      Object.keys(c.checks).length !== 0 ||
      (c.decision !== null &&
        !CAMPAIGN_SHIFTS[c.shift].choices.some(
          (d) => d.id === c.decision && !['penalize-refusal', 'skip-inspection'].includes(d.id)
        )) ||
      c.repairs !==
        (c.shift === 2 && ['protect-refusal', 'renegotiate'].includes(c.decision ?? '') ? 1 : 0) ||
      (c.shift !== 1 && (c.inspectionUntilMinute !== null || c.inspectionComplete)) ||
      (c.shift === 1 &&
        (c.decision === null
          ? c.inspectionUntilMinute !== null || c.inspectionComplete
          : !finite(c.inspectionUntilMinute) ||
            c.inspectionUntilMinute < 30 ||
            c.inspectionUntilMinute > 95 ||
            c.inspectionComplete !== Number(r.minute) >= c.inspectionUntilMinute))
    )
      return fallback;
    let cash = 400;
    let previousSeed: number | null = null;
    for (let i = 0; i < c.history.length; i++) {
      const h = c.history[i];
      const recordTemplate = campaignRecord({
        ...canonical,
        campaign: { ...c, shift: i, history: [] },
      });
      if (!h) return fallback;
      const { relationshipEvents: remembered, ...historyShape } = h;
      const { relationshipEvents: _templateEvents, ...historyTemplate } = recordTemplate;
      if (
        (remembered !== undefined && !validRelationshipEvents(remembered)) ||
        !validShape(
          { ...historyShape, decision: h.decision ?? '' },
          { ...historyTemplate, decision: '' }
        ) ||
        h.shift !== i ||
        !validSeed(h.seed) ||
        !Array.isArray(h.members) ||
        h.members.length !== 4 ||
        h.members.some(
          (m, index) =>
            !validShape(m, recordTemplate.members[index]) ||
            m.id !== canonical.members[index].id ||
            m.recoveryOwedMinutes !== 0
        ) ||
        !Number.isSafeInteger(h.objectionsRaised) ||
        h.objectionsRaised > 32 ||
        h.objectionsResolved !== h.objectionsRaised ||
        (h.decision !== null &&
          !CAMPAIGN_SHIFTS[i].choices.some(
            (d) => d.id === h.decision && !['penalize-refusal', 'skip-inspection'].includes(d.id)
          )) ||
        h.repairs !== 0 ||
        (i !== 1 && h.inspectionComplete) ||
        (h.inspectionComplete && (h.decision !== 'inspect' || h.minute < 30)) ||
        (previousSeed !== null && h.seed !== (previousSeed + 1) >>> 0)
      )
        return fallback;
      const prior = createWorkplace('game', h.seed);
      Object.assign(prior, {
        phase: 'review',
        minute: h.minute,
        targetKg: h.targetKg,
        shippedKg: h.shippedKg,
        planId: h.planId,
        finance: h.finance,
        refusalsRespected: h.refusalsRespected,
        promisesKept: h.promisesKept,
        distributionComplete: h.finance.distributed > 0 || h.finance.communityAllocation > 0,
        practices: h.practices,
        workerAutonomy: h.workerAutonomy,
        governance: h.governance,
        aiAuthority: h.aiAuthority,
        events: remembered ?? [],
      });
      prior.members = prior.members.map((m, index) => ({
        ...m,
        ...h.members[index],
        preference: '',
        willingToCover: false,
      }));
      prior.objections = Array.from({ length: h.objectionsRaised }, (_, n) => ({
        id: `o-${n + 1}`,
        actorId: 'mind',
        kind: 'authority',
        statement: '',
        status: 'resolved',
        resolution: '',
      }));
      const decoded = restoreWorkplaceSnapshot(
        prior,
        cash,
        i === 0 && h.decision === 'renegotiate'
      );
      if (decoded.phase !== 'review') return fallback;
      cash = decoded.finance.cash;
      previousSeed = h.seed;
    }
    if (previousSeed !== null && r.seed !== (previousSeed + 1) >>> 0) return fallback;
    openingCash = cash;
  }
  const c = r.campaign as WorkplaceState['campaign'];
  if (
    r.targetKg !==
    (historicalRenegotiated || (c?.shift !== 1 && c?.decision === 'renegotiate') ? 480 : 600)
  )
    return fallback;
  if (
    !['directed', 'individual', 'team'].includes(String(r.workerAutonomy)) ||
    !['consultative', 'team-consent', 'member-vote'].includes(String(r.governance)) ||
    !['advice', 'bounded'].includes(String(r.aiAuthority)) ||
    !WORKPLACE_PLANS.some((p) => p.id === r.planId)
  )
    return fallback;
  if (
    !Array.isArray(r.practices) ||
    r.practices.some((p) => !PRACTICES.some((known) => known.id === p)) ||
    new Set(r.practices).size !== r.practices.length ||
    !Array.isArray(r.members) ||
    r.members.length !== 4
  )
    return fallback;
  for (let i = 0; i < canonical.members.length; i++) {
    const expected = { ...canonical.members[i], preference: '', willingToCover: false };
    const value: unknown = r.members[i];
    if (!validShape(value, expected)) return fallback;
    const m = value as typeof expected;
    if (
      m.id !== expected.id ||
      // A save written in either language restores; the copy is regenerated below.
      !LOCALES.some((locale) => {
        const known = memberCopy(createTranslator(bilateralWorkplaceMessages, locale))[i];
        return m.role === known.role && m.publicBoundary === known.publicBoundary;
      }) ||
      m.preference !== '' ||
      m.willingToCover ||
      m.sharing ||
      m.understood ||
      !expected.eligibleTasks.includes(m.chosenTask) ||
      JSON.stringify(m.eligibleTasks) !== JSON.stringify(expected.eligibleTasks) ||
      m.extraMinutes > 10 ||
      Math.abs(m.restMinutes - Math.max(0, Number(r.minute) - 75)) > 1e-6 ||
      m.recoveryMinutes > 10 ||
      m.recoveryOwedMinutes > 10 ||
      Math.abs(m.recoveryMinutes + m.recoveryOwedMinutes - (m.extraMinutes > 0 ? 10 : 0)) > 1e-6 ||
      Math.abs(m.compensationPaid - m.extraMinutes * 0.8) > 1e-6
    )
      return fallback;
  }
  const knownId = (v: unknown) =>
    typeof v === 'string' && canonical.members.some((m) => m.id === v);
  const validRecord = (v: unknown, check: (value: unknown) => boolean) =>
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.entries(v).every(([k, val]) => knownId(k) && check(val));
  if (
    !validRecord(r.chairBallots, knownId) ||
    !validRecord(r.surplusBallots, (v) => DESTINATIONS.includes(v as SurplusDestination)) ||
    (r.electedChair !== null && !knownId(r.electedChair))
  )
    return fallback;
  if (
    !Array.isArray(r.events) ||
    r.events.length > 120 ||
    !r.events.every((v) => validShape(v, { id: '', minute: 0, actorId: '', kind: '', detail: '' }))
  )
    return fallback;
  if (
    !Array.isArray(r.objections) ||
    r.objections.length > 32 ||
    !r.objections.every((v: unknown) => {
      if (!v || typeof v !== 'object') return false;
      const o = v as Record<string, unknown>;
      return (
        validShape(
          { ...o, resolution: o.resolution ?? '' },
          { id: '', actorId: '', kind: '', statement: '', status: '', resolution: '' }
        ) &&
        (knownId(o.actorId) || o.actorId === 'mind') &&
        KINDS.includes(o.kind as ObjectionKind) &&
        ['open', 'resolved'].includes(String(o.status))
      );
    })
  )
    return fallback;
  const s = structuredClone(r) as unknown as WorkplaceState;
  const f = s.finance;
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  if (
    !near(f.initialCapital, openingCash) ||
    f.wageReserve !== 0 ||
    f.compensationReserve !== 0 ||
    f.improvementSpend > 40 ||
    !near(f.wagesPaid, s.minute * WAGE * 4) ||
    !near(f.operatingRevenue, s.shippedKg * REVENUE_PER_KG) ||
    !near(f.operatingCost, s.shippedKg * COST_PER_KG) ||
    !near(
      f.compensationPaid,
      s.members.reduce((n, m) => n + m.compensationPaid, 0)
    ) ||
    !near(
      f.cash,
      f.initialCapital +
        f.operatingRevenue -
        f.operatingCost -
        f.wagesPaid -
        f.compensationPaid -
        f.improvementSpend -
        f.distributed -
        f.communityAllocation
    ) ||
    s.refusalsRespected !== s.members.filter((m) => m.refusalRespected).length ||
    s.aiActions > 1 ||
    s.promisesKept !== s.members.filter((m) => m.recoveryMinutes === 10).length ||
    s.members.filter((m) => m.extraMinutes > 0).length > 1 ||
    s.members.some((m) => !near(m.earnedPay, s.minute * WAGE + f.distributed / 4))
  )
    return fallback;
  const earnedSurplus = Math.max(
    0,
    f.operatingRevenue - f.operatingCost - f.wagesPaid - f.compensationPaid - f.improvementSpend
  );
  if (
    f.distributed + f.communityAllocation > earnedSurplus + 1e-6 ||
    ((f.distributed > 0 || f.communityAllocation > 0) && !s.distributionComplete)
  )
    return fallback;
  const elected =
    s.members.find((m) => Object.values(s.chairBallots).filter((v) => v === m.id).length >= 3)
      ?.id ?? null;
  if (s.electedChair !== elected) return fallback;
  // Persisted prose is not authoritative. Regenerate identities and known public receipts.
  s.members = s.members.map((m, i) => ({
    ...m,
    role: canonical.members[i].role,
    publicBoundary: canonical.members[i].publicBoundary,
    preference: canonical.members[i].preference,
    willingToCover: canonical.members[i].willingToCover,
  }));
  s.events = restoreRelationshipEvents(s.events);
  for (const history of s.campaign?.history ?? [])
    if (history.relationshipEvents)
      history.relationshipEvents = restoreRelationshipEvents(history.relationshipEvents);
  s.objections = s.objections.map((o) => {
    const pressure = CAMPAIGN_PRESSURES.find(
      (item) =>
        item.objection === o.statement && item.challenger === o.actorId && item.kind === o.kind
    );
    return {
      ...o,
      statement: pressure?.objection ?? translate(wm, 'objectionStatement', { kind: o.kind }),
      resolution:
        o.status === 'resolved' ? translate(wm, 'restoredResolution', { actor: o.actorId }) : null,
    };
  });
  // Imported prose never survives a restore; only the exact reload-safety
  // sentinel does, so a shift a reload paused stays resumable (shiftResumable).
  s.reviewReason =
    s.phase !== 'review'
      ? null
      : s.reviewReason === RELOAD_SAFETY_DETAIL
        ? RELOAD_SAFETY_DETAIL
        : translate(wm, 'reasonReloaded');
  s.revision += 1;
  return s;
}
