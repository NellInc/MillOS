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

export const PRACTICES: { id: PracticeId; title: string; detail: string }[] = [
  {
    id: 'information',
    title: 'Open information',
    detail:
      'Shared demand, capacity and illustrative accounts; private explanations stay optional.',
  },
  {
    id: 'work-choice',
    title: 'Qualified work choice',
    detail: 'Members choose only tasks they are trained to do.',
  },
  {
    id: 'rest',
    title: 'Protected rest',
    detail: 'A minimum 15 minutes of rest remains protected in every configuration.',
  },
  {
    id: 'remedy',
    title: 'Voice and remedy',
    detail: 'Any person or the advisory mind may raise an objection; only its raiser resolves it.',
  },
  {
    id: 'budget',
    title: 'Team budget',
    detail: 'A bounded 40-credit improvement budget, separate from campaign money.',
  },
  {
    id: 'gainsharing',
    title: 'Shared surplus',
    detail: 'Members direct only positive operating surplus after obligations.',
  },
  {
    id: 'cooperative',
    title: 'Member governance',
    detail: 'One fictional member, one vote. Capital and the advisory mind have no ballot.',
  },
];

export const WORKPLACE_PLANS: WorkplacePlan[] = [
  {
    id: 'steady',
    title: 'Protect the rhythm',
    explanation: 'Keep the ordinary sequence and all protected rest.',
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
    title: 'Resequence together',
    explanation:
      'Spend 40 illustrative credits on a shared handoff improvement without changing rest.',
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
    title: 'Invite voluntary cover',
    explanation:
      'One eligible volunteer may shift up to 10 minutes of timing, earning 0.8 credits per minute and 10 minutes protected recovery. Minimum rest stays intact. Capacity returns to the protected rhythm after cover.',
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
    title: 'Rush through rest (blocked)',
    explanation: 'A tempting throughput proposal that breaches the non-negotiable rest floor.',
    capacity: 1.1,
    budgetCost: 0,
    optionalCoverMinutes: 15,
    compensationPerMinute: 0,
    recoveryMinutes: 0,
    protectedRestMinutes: 0,
    requiredPractices: [],
    illegalReason: 'Protected minimum rest cannot be waived, even by a unanimous ballot.',
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

/** All identities and preference explanations below are authored fiction. */
export function createWorkplace(mode: WorkplaceMode = 'game', seed = 1): WorkplaceState {
  const roles = [
    {
      id: 'packing',
      role: 'Packing',
      publicBoundary: 'At least 15 minutes protected rest; qualified packing work only.',
      preference:
        'I prefer a predictable packing handoff and can volunteer for a short, compensated timing change.',
      willingToCover: true,
      eligibleTasks: ['Packing', 'Pallet checks'],
    },
    {
      id: 'quality',
      role: 'Quality',
      publicBoundary: 'Quality release stays with qualified quality staff; rest remains protected.',
      preference: 'I decline cover to keep my current rhythm. No explanation is owed.',
      willingToCover: false,
      eligibleTasks: ['Quality release', 'Sampling'],
    },
    {
      id: 'maintenance',
      role: 'Maintenance',
      publicBoundary: 'No maintenance on running equipment; rest remains protected.',
      preference:
        'I can accept a bounded handoff change when compensation and recovery are reserved.',
      willingToCover: true,
      eligibleTasks: ['Maintenance planning', 'Pallet checks'],
    },
    {
      id: 'coordinator',
      role: 'Coordinator',
      publicBoundary: 'Coordination grants no power to waive another member’s boundary.',
      preference: 'I prefer the stable sequence and decline optional cover.',
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
  if (s.mode === 'pilot')
    reasons.push('Pilot preparation has no live authority or simulation activation.');
  if (s.mode === 'game' && s.aiAuthority !== 'bounded')
    reasons.push(
      'Advice-only mode grants no delegated execution; choose bounded authority to activate a Game plan.'
    );
  if (s.improvement) {
    if (!s.improvement.proposalId) reasons.push('Choose a worker-authored handoff proposal first.');
    if (!s.improvement.acknowledged)
      reasons.push('Hear the adviser response to the current public terms first.');
    if (workplaceMission(s)?.evidence !== undefined && workplaceMission(s)?.evidence !== 'current')
      reasons.push('The customer commitment requires current quality-qualified evidence.');
    if (s.planId !== 'steady')
      reasons.push(
        'Handoff trials use ordinary qualified work, without stacking optional-duty plans.'
      );
  }
  if (s.phase !== 'deliberating')
    reasons.push('Begin a scenario and deliberate before activation.');
  if (s.minute >= s.durationMinutes) reasons.push('Scenario consent has expired.');
  if (!p || p.illegalReason) reasons.push(p?.illegalReason ?? 'Unknown plan.');
  if (p?.requiredPractices.some((id) => !s.practices.includes(id)))
    reasons.push('Enable the practices required by this plan.');
  if (s.objections.some((o) => o.status === 'open'))
    reasons.push('Open objections must be resolved by their raisers.');
  if (s.campaign) {
    if (s.campaign.mission && s.campaign.mission.evidence !== 'current')
      reasons.push(
        'The linked customer commitment requires current, quality-qualified dispatch evidence.'
      );
    if (!s.campaign.adviserAcknowledged || !checksPassed(s.campaign, 'mind'))
      reasons.push(
        'The adviser must demonstrate the current consent, privacy and authority boundaries.'
      );
    if (s.members.some((m) => !checksPassed(s.campaign!, m.id)))
      reasons.push(
        'Every role must answer the current refusal, privacy and repayment checks correctly.'
      );
    if (s.campaign.shift !== 1 && s.campaign.decision === null)
      reasons.push('Choose the episode response before seeking a fresh agreement.');
  }
  if (s.members.some((m) => !m.understood || m.ballot === null))
    reasons.push(
      'Every role must confirm understanding and record a ballot for the current terms.'
    );
  const yes = s.members.filter((m) => m.ballot === true).length;
  if (
    s.governance === 'team-consent'
      ? yes !== s.members.length
      : s.governance === 'member-vote' && yes < 3
  )
    reasons.push(
      s.governance === 'team-consent'
        ? 'Team consent requires every approval.'
        : 'A majority of fictional members must approve.'
    );
  if (
    p?.optionalCoverMinutes &&
    !s.members.some((m) => m.coverConsent === true && eligibleCover(m))
  )
    reasons.push('At least one eligible member must separately consent to this bounded cover.');
  const wages = WAGE * s.durationMinutes * s.members.length;
  const compensation = (p?.optionalCoverMinutes ?? 0) * (p?.compensationPerMinute ?? 0);
  if (
    !finite(s.finance.cash) ||
    s.finance.cash + 1e-8 < wages + (p?.budgetCost ?? 0) + compensation + improvementCost(s)
  )
    reasons.push(
      'Funds cannot cover all reserved wages, improvement costs and optional compensation.'
    );
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
        ? 'Enable the shared budget practice first.'
        : !funded
          ? 'Current cash cannot fund wages and these terms.'
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
    scope:
      'A fictional local learning exercise. No live workplace control, worker data collection, measured efficacy or legal certification.',
    charter: {
      practices: [...s.practices],
      minimumProtections: [
        '15 minutes minimum rest',
        'Qualified tasks only',
        'Refusal without penalty',
        'Individual revocable cover consent',
        'Raiser-owned objection resolution',
      ],
      workerAutonomy: s.workerAutonomy,
      governance: s.governance,
      aiAuthority: s.aiAuthority,
    },
    dataConsent: {
      purpose: 'Optional fictional preference explanation for planning this scenario only.',
      expires: 'Scenario end or revocation, whichever comes first.',
      collect: 'No real-person identity, health information or free-text reasons.',
      revocation:
        'Immediately hides the explanation from future projections and exports. Previously downloaded copies cannot be recalled.',
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
      units: 'Illustrative team credits, separate from campaign finances.',
      perCoverMinute: 0.8,
      protectedRecoveryMinutes: 10,
      restSchedule:
        'Ordinary protected rest accrues in scenario minutes 75 to 90. Additional recovery accrues only after optional cover ends, including review time. Unmet recovery survives stop and reload.',
      wagesPerMinutePerMember: WAGE,
      terms:
        'Reserve full wages and optional compensation before activation. Pay earned obligations on withdrawal, stop, expiry and reload.',
    },
    acceptanceReview: [
      'Obtain local worker and representative agreement before any real pilot.',
      'Check applicable employment, safety and privacy requirements with qualified local reviewers.',
      'Agree measures, stop conditions, data purpose and retention before collection.',
      'Verify accessible understanding and individual consent without coercion.',
      'Record workload, rest, refusals respected, earned compensation and unresolved objections.',
      'Review with participants before any expansion; forecasts are not measured outcomes.',
    ],
    evidence: {
      ...projection,
      members: projection.members.map((m) => ({ ...m, preference: null })),
    },
    forecasts: compareWorkplacePlans(s.seed),
    forecastLabel:
      'Deterministic illustrative forecasts from equal demand, supply and physical capacity assumptions; not measured outcomes.',
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
    localApprovals: 'Not collected or granted by MillOS.',
    purpose: 'Try separate understanding, policy decisions and individual optional-duty consent.',
    scope: 'One work group, one agreed shift, reviewed before any extension.',
    authority:
      'Adviser offers reasons; people retain qualified decisions and individual boundaries. Overrides require a public explanation and review.',
    decisions: [
      'Confirm understanding',
      'Choose policy yes or no',
      'Accept or decline optional cover separately',
    ],
    data: 'Use aggregate operational receipts only. No identity, health information, free-text private reasons or inferred willingness. Sharing remains optional and revocable.',
    limits: {
      minimumRestMinutes: cover.protectedRestMinutes,
      maximumCoverMinutes: cover.optionalCoverMinutes,
      improvementBudgetCredits: 40,
      units:
        'Illustrative MillOS credits and modeled minutes; local terms require separate agreement.',
    },
    repayment: {
      compensationPerMinuteCredits: cover.compensationPerMinute,
      recoveryMinutes: cover.recoveryMinutes,
      funding: 'Reserve compensation and protected recovery before any optional duty.',
      withdrawal: 'Stop new extra duty; retain earned pay and delivered or owed recovery.',
    },
    stopConditions: [
      'Withdrawal',
      'Safety or qualification hold',
      'Unfunded pay or recovery',
      'Changed terms without new agreement',
      'Open worker or adviser objection',
    ],
    rollback:
      'Return future work to an agreed steady plan. Settle earned pay and owed recovery; let each raiser review their remedy. Never erase obligations or reuse old consent.',
    review: [
      'Were each role’s choices explicit?',
      'Was delivery supported by actual receipts?',
      'Was compensation paid and recovery delivered?',
      'What remains owed or disputed?',
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
      record(
        s,
        m.id,
        'recovery-delivered',
        'Ten minutes of promised protected recovery delivered in the local model.'
      );
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
  const m = workplaceMission(s);
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
    return reject(
      'Pilot preparation permits planning configuration only; no role decisions or live authority.'
    );
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
        return reject(
          'Read the current settled review, retain all obligations and choose a known profile before opening a trial.'
        );
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
      record(
        fresh,
        'packing',
        'improvement-opened',
        'The team opens a bounded handoff trial. Earlier cash, pay and customer obligations remain in the origin review.'
      );
      return { state: fresh, changed: true, reason: null };
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
        return reject(
          'The qualified proposing role may offer a different canonical arrangement before activation.'
        );
      Object.assign(i, freshImprovementTerms(), { proposalId: id, proposerId: actor });
      invalidate(s);
      i.forecastKg = improvementForecast(s).kg;
      record(
        s,
        actor,
        'improvement-proposed',
        `${id}: a one-shift trial with no extra duty, ordinary wages and immediate steady fallback.`
      );
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
        return reject('A current role or adviser may record each public proposal challenge once.');
      i.challenges.push({ actorId: actor, kind });
      invalidate(s);
      record(
        s,
        actor,
        'improvement-challenged',
        `${kind}: assumptions challenged; existing individual objection rights remain available.`
      );
      break;
    }
    case 'acknowledgeImprovement': {
      const i = s.improvement;
      if (!i || !deliberating || !i.proposalId)
        return reject('Choose current terms before recording an adviser response.');
      const advice = command.args[0];
      const validated = advice === undefined ? undefined : validPackingAdvice(advice);
      if (
        advice !== undefined &&
        (!validated || validated.arrangement !== (i.stopped ? 'steady' : i.proposalId))
      )
        return reject('Read valid advice for the current arrangement before recording it.');
      if (i.acknowledged && (!validated || validated.fingerprint === i.advice?.fingerprint))
        return reject('The current adviser response is already recorded.');
      const changedAdvice =
        !!i.advice && !!validated && i.advice.fingerprint !== validated.fingerprint;
      invalidate(s);
      if (validated) i.advice = validated;
      i.acknowledged = true;
      if (changedAdvice)
        record(
          s,
          'mind',
          'improvement-advice-changed',
          'Plant evidence changed. I refreshed my assumptions and cleared earlier role decisions; fresh understanding and ballots are required.'
        );
      record(
        s,
        'mind',
        'improvement-response',
        validated
          ? `${validated.reasonToAbstain ? `I abstain: ${validated.reasonToAbstain}` : `Known released stock ${validated.evidence.releasedPackedKg.toFixed(0)} kg; held stock ${validated.evidence.heldPackedKg.toFixed(0)} kg. Conditional departure 0 to ${validated.dispatchUpperKg.toFixed(0)} kg, with no truck departure simulated.`} Cost response: reserve 108 credits for wages first, then ${improvementCost(s)} for this arrangement. Qualification response: whole-line pacing grants no new duty or quality release. Every role may stop the arrangement; only an objection's raiser may close it.`
          : 'Facilitated terms have no plant forecast. Funding is bounded, work remains qualified and every role may stop the arrangement. I cannot close another role’s objection.'
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
        return reject('Choose a different planning episode before activation.');
      if (id === null) delete i.episode;
      else i.episode = { id, actorId: null, choice: null };
      invalidate(s);
      record(
        s,
        'team',
        'improvement-episode',
        `${id ?? 'ordinary'}: planning rehearsal only. No plant, cash, stock, release or customer commitment is changed.`
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
        return reject(
          'A current synthetic role may choose a different planning response before activation.'
        );
      i.episode = { ...i.episode, actorId: actor, choice };
      invalidate(s);
      record(
        s,
        actor,
        'improvement-episode-response',
        `${i.episode.id}: ${choice}. Rehearsed choice only; ordinary pay, rest, private reasons and live decisions are unchanged.`
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
        return reject('A current role or adviser may stop an open arrangement.');
      i.stopped = true;
      if (deliberating) invalidate(s);
      record(
        s,
        actor,
        'improvement-stopped',
        'Arrangement stopped immediately. Steady pacing continues only under the current agreement; earned pay and incurred spending remain.'
      );
      break;
    }
    case 'acknowledgeImprovementReview': {
      const i = s.improvement;
      if (!i || s.phase !== 'review' || i.reviewAcknowledged)
        return reject('Review a settled trial before recording forecast correction.');
      i.reviewAcknowledged = true;
      record(
        s,
        'mind',
        'improvement-forecast-review',
        i.advice
          ? i.advice.reasonToAbstain
            ? `I abstained: ${i.advice.reasonToAbstain} Qualifying shift receipts: ${s.shippedKg} kg. Unknown evidence supplies no prediction.`
            : `Conditional departure bound 0 to ${i.advice.dispatchUpperKg} kg; qualifying shift receipts ${s.shippedKg} kg. Packing rehearsal and actual dispatch are separate; changed assumptions and truck timing can explain the difference.`
          : `Historical teaching forecast ${i.forecastKg ?? 0} kg; qualifying shift receipts ${s.shippedKg} kg. This legacy forecast was illustrative and does not establish causality.`
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
        return reject(
          'Each member records a current review decision. An unfinished or stopped trial cannot be adopted.'
        );
      i.ballots[actor] = verdict;
      s.revision += 1;
      record(
        s,
        actor,
        'improvement-review-ballot',
        `${verdict}: one replaceable member review ballot, without individual-duty permission.`
      );
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
        return reject(
          'Settle individual remedies and obtain the current charter’s member review decision first.'
        );
      i.verdict = winner;
      s.revision += 1;
      record(
        s,
        'members',
        'improvement-reviewed',
        `${winner}: retain this review and all obligations; future work needs fresh agreement.`
      );
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
        return reject(
          'Finalise this review and settle obligations before continuing. Eight shifts is the retained-record limit; no receipts are discarded.'
        );
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
      record(
        fresh,
        'members',
        'improvement-continued',
        'Opening cash equals the previous closing balance. History and customer work remain; prior consent is expired.'
      );
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
        return reject(
          'Start a known fictional campaign from the idle laboratory with a valid seed.'
        );
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
      record(
        fresh,
        'system',
        'campaign-started',
        'Three fictional shifts. Fairness and closing cash carry forward; every shift needs fresh consent.'
      );
      return { state: fresh, changed: true, reason: null };
    }
    case 'nextCampaignShift': {
      if (
        !s.campaign ||
        s.campaign.shift >= 2 ||
        s.phase !== 'review' ||
        s.members.some((m) => m.recoveryOwedMinutes > 0) ||
        s.objections.some((o) => o.status === 'open')
      )
        return reject(
          'Review this shift, deliver owed recovery and resolve objections before the next of three shifts.'
        );
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
      record(
        fresh,
        'system',
        'campaign-shift-opened',
        'Previous burden, pay, rest and closing cash retained. Private explanations and past consent are not reused.'
      );
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
        return reject('Choose a known answer for a current role or adviser understanding check.');
      const answers = s.campaign.checks[actor] ?? {};
      if (answers[question] === answer) return reject('Answer unchanged.');
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
          ? `${question}: correct boundary identified in this fictional role exercise.`
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
        return reject("Use the episode's qualified fictional decision role.");
      if (decision === 'penalize-refusal')
        return reject(
          'Refusal cannot reduce pay or qualification access. A manager or majority cannot impose extra duty.'
        );
      if (decision === 'skip-inspection')
        return reject(
          'Deadline pressure cannot waive qualified inspection or release a held batch.'
        );
      if (c.shift === 1) {
        if (s.phase !== 'active' || s.minute < 25 || c.decision !== null)
          return reject(
            'Qualified Quality may initiate inspection once the minute-25 pacing hold begins.'
          );
        c.decision = decision;
        c.inspectionUntilMinute = s.minute + 5;
        record(
          s,
          actor,
          'inspection-started',
          'Five modeled minutes of line pacing hold initiated; batch quality authority remains unchanged.'
        );
      } else {
        if (!deliberating || c.decision === decision)
          return reject('Choose a different episode response during deliberation.');
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
          record(
            s,
            'mind',
            'adviser-correction',
            'I treated previous consent as current permission. That was wrong. New duty requires new consent; earned pay stays intact. Offer rotation now uses retained workload.'
          );
        }
        invalidate(s);
        record(
          s,
          actor,
          'episode-decision',
          `${decision}: renew understanding and agreement under the revised terms.`
        );
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
        return reject('Use the current fictional pressure card during deliberation.');
      const prefix = `${id}: `;
      const protectedTerms = s.events.some(
        (event) => event.kind === 'pressure-protected' && event.detail.startsWith(prefix)
      );
      if (
        protectedTerms ||
        (response === 'accept-demand' &&
          s.objections.some((o) => o.statement === pressure.objection))
      )
        return reject(
          'This demand was already reviewed. Resolve any remaining objection with its raiser.'
        );
      if (response === 'accept-demand') {
        if (s.objections.length >= 32) return reject('Objection record is full.');
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
          reason:
            'Demand blocked and challenged. Restate protected terms, let the raiser review the remedy, then earn a fresh agreement. No disclosure, extra duty or pay penalty was imposed.',
        };
      }
      record(s, 'coordinator', 'pressure-protected', `${prefix}${pressure.repair}`);
      invalidate(s);
      return {
        state: s,
        changed: true,
        reason:
          'Protected terms restated. An open objection remains with its raiser; renewed understanding and consent are required.',
      };
    }
    case 'start': {
      if (s.improvement)
        return reject(
          'Retain the handoff receipts. Continue through its member review instead of resetting earned history.'
        );
      const [mode, seed = 1] = command.args;
      if (!MODES.includes(mode) || !validSeed(seed)) return reject('Invalid mode or seed.');
      if (s.campaign)
        return reject(
          'Campaign history cannot be reset through standalone start. Use the next campaign shift after review.'
        );
      if (s.phase === 'active' || s.members.some((m) => m.recoveryOwedMinutes > 0))
        return reject(
          'Stop active work and deliver all owed recovery before starting another scenario.'
        );
      const fresh = createWorkplace(mode, seed);
      fresh.phase = 'deliberating';
      fresh.revision = s.revision + 1;
      record(
        fresh,
        'system',
        'started',
        'Fictional local scenario opened; no live workplace authority.'
      );
      return { state: fresh, changed: true, reason: null };
    }
    case 'configure': {
      if (!deliberating) return reject('Configure only while deliberating.');
      const [settings] = command.args;
      if (
        !settings ||
        typeof settings !== 'object' ||
        Object.keys(settings).some(
          (k) => !['practices', 'workerAutonomy', 'governance', 'aiAuthority'].includes(k)
        )
      )
        return reject('Unknown configuration field.');
      const { practices, workerAutonomy, governance, aiAuthority } = settings;
      if (
        practices !== undefined &&
        (!Array.isArray(practices) ||
          practices.some((p) => !PRACTICES.some((known) => known.id === p)) ||
          new Set(practices).size !== practices.length)
      )
        return reject('Unknown or duplicate practice.');
      if (
        workerAutonomy !== undefined &&
        !['directed', 'individual', 'team'].includes(workerAutonomy)
      )
        return reject('Invalid autonomy.');
      if (
        governance !== undefined &&
        !['consultative', 'team-consent', 'member-vote'].includes(governance)
      )
        return reject('Invalid governance.');
      if (aiAuthority !== undefined && !['advice', 'bounded'].includes(aiAuthority))
        return reject('Invalid advisory authority.');
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
        return reject('Configuration unchanged.');
      if (
        s.objections.some((o) => o.status === 'open') &&
        s.practices.some((p) => !next.practices.includes(p))
      )
        return reject('Resolve objections before removing any practice.');
      Object.assign(s, next);
      invalidate(s);
      s.chairBallots = {};
      s.electedChair = null;
      record(
        s,
        'team',
        'terms-revised',
        'Configuration revised; understanding, ballots and cover consent invalidated. Minimum protections remain.'
      );
      break;
    }
    case 'selectPlan': {
      const [id] = command.args;
      if (s.improvement && id !== 'steady')
        return reject('Handoff trials cannot stack cover or other improvement costs.');
      if (!deliberating || !WORKPLACE_PLANS.some((p) => p.id === id))
        return reject('Choose a known plan while deliberating.');
      if (s.planId === id) return reject('Plan unchanged.');
      s.planId = id;
      invalidate(s);
      record(
        s,
        'team',
        'plan-revised',
        'Plan revised; fresh understanding, ballots and individual cover consent required.'
      );
      break;
    }
    case 'understand': {
      const m = member(command.args[0]);
      if (!deliberating || !m || m.understood)
        return reject('Only an unconfirmed role can confirm current terms while deliberating.');
      if (s.campaign && !checksPassed(s.campaign, m.id))
        return reject(
          "Answer this role's refusal, privacy and repayment checks correctly before confirming."
        );
      m.understood = true;
      record(
        s,
        m.id,
        'understood',
        'Role confirmed the current plan, boundaries, compensation and right to refuse.'
      );
      break;
    }
    case 'vote': {
      const [id, approve] = command.args;
      const m = member(id);
      if (!deliberating || !m?.understood || typeof approve !== 'boolean' || m.ballot === approve)
        return reject('A role must understand current terms before recording a changed ballot.');
      m.ballot = approve;
      record(
        s,
        id,
        'ballot',
        approve
          ? 'Plan approved; this ballot grants no individual cover consent.'
          : 'Plan declined without penalty.'
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
        return reject(
          'Record distinct cover consent only after understanding the current cover plan.'
        );
      if (accept && !eligibleCover(m)) return reject('This role is not qualified for cover.');
      m.coverConsent = accept;
      record(
        s,
        id,
        'cover-consent',
        accept
          ? 'Accepted up to 10 minutes, 0.8 credits/minute and 10 minutes recovery; revocable immediately.'
          : 'Declined cover; no extra work or lost pay.'
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
        return reject('Preference sharing can change only during this scenario.');
      m.sharing = share;
      m.shareUntilMinute = share ? s.durationMinutes : null;
      record(
        s,
        id,
        'privacy-consent',
        share
          ? 'Optional fictional explanation shared for scenario planning only, until expiry or withdrawal.'
          : 'Optional explanation hidden immediately.'
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
        return reject(
          'Choose a different qualified task under enabled work choice while deliberating.'
        );
      m.chosenTask = task;
      invalidate(s);
      record(
        s,
        id,
        'work-choice',
        'Qualified task choice changed; plan responses must be renewed.'
      );
      break;
    }
    case 'simulateResponses': {
      if (!deliberating || s.mode !== 'game')
        return reject(
          'Authored response simulation is available only in Game mode. Workshop requires manual role input; Pilot is planning-only.'
        );
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
      if (!changed) return reject('Authored responses already recorded.');
      record(
        s,
        'simulation',
        'authored-responses',
        s.campaign
          ? 'Authored peer answers and choices recorded. Packing understanding, ballot and cover consent require separate explicit input. Adviser checks remain explicit; existing declines remain intact.'
          : 'Fictional role responses recorded from authored preferences; declines carry no penalty.'
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
        return reject(
          'Only a known role or advisory mind may raise a known objection during a scenario.'
        );
      if (s.objections.some((o) => o.actorId === id && o.kind === kind && o.status === 'open'))
        return reject('That objection is already open.');
      if (s.objections.length >= 32)
        return reject('Objection record is full; finish this scenario before starting another.');
      s.objections.push({
        id: `o-${s.objections.length + 1}`,
        actorId: id,
        kind,
        statement: `Review the ${kind} boundary before proceeding.`,
        status: 'open',
        resolution: null,
      });
      record(
        s,
        id,
        'objection',
        `Raised a ${kind} objection; activation is blocked until the raiser resolves it.`
      );
      if (s.phase === 'active')
        settle(s, 'Stopped safely after an objection; earned obligations retained.');
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
        return reject('Only the original raiser may resolve their open objection.');
      const pressure = CAMPAIGN_PRESSURES.find((item) => item.objection === o.statement);
      if (
        pressure &&
        !s.events.some(
          (event) =>
            event.kind === 'pressure-protected' && event.detail.startsWith(`${pressure.id}: `)
        )
      )
        return reject('Restate the protected terms before the raiser reviews this remedy.');
      o.status = 'resolved';
      o.resolution = `The ${actor} role reviewed the ${o.kind} boundary and retained minimum rest, qualified work, privacy withdrawal and refusal without penalty.`;
      record(s, actor, 'objection-resolved', o.resolution);
      break;
    }
    case 'activate': {
      if (!Number.isSafeInteger(command.args[0]) || command.args[0] !== s.revision)
        return reject('Stale plan revision; review the current terms.');
      const readiness = workplaceReadiness(s);
      if (!readiness.allowed) return reject(readiness.reasons.join(' '));
      const p = planOf(s);
      s.finance.wageReserve = WAGE * s.durationMinutes * s.members.length;
      s.finance.compensationReserve = p.optionalCoverMinutes * p.compensationPerMinute;
      const improvementPurchase = improvementCost(s);
      s.finance.cash -= p.budgetCost + improvementPurchase;
      s.finance.improvementSpend += p.budgetCost + improvementPurchase;
      // A cancelled proposal authorizes paid steady work, without purchasing
      // the abandoned arrangement. Keep that distinction in its saved receipt.
      if (s.improvement && !s.improvement.stopped) s.improvement.funded = true;
      if (p.optionalCoverMinutes) {
        const totals = campaignTotals(s);
        const burden = (id: string) => totals.members.find((m) => m.id === id)!.extraMinutes;
        const chosen = s.members
          .filter((m) => m.coverConsent === true && eligibleCover(m))
          .sort((a, b) => burden(a.id) - burden(b.id) || a.id.localeCompare(b.id))[0];
        s.activeCoverMemberId = chosen.id;
        s.coverRemainingMinutes = p.optionalCoverMinutes;
      }
      for (const m of s.members)
        if (m.coverConsent === false && !m.refusalRespected) {
          m.refusalRespected = true;
          s.refusalsRespected += 1;
        }
      if (s.mode === 'game' && s.aiAuthority === 'bounded') s.aiActions += 1;
      s.phase = 'active';
      if (s.campaign) s.campaign.agreementProved = true;
      record(
        s,
        'team',
        'activated',
        'Revision, objections, ballots, individual consent and funds checked atomically. Full wage and compensation obligations reserved.'
      );
      break;
    }
    case 'withdraw': {
      const m = member(command.args[0]);
      if (
        !m ||
        !['deliberating', 'active'].includes(s.phase) ||
        (m.coverConsent !== true && !m.sharing)
      )
        return reject('No current optional consent to withdraw.');
      const withdrawingCover = m.coverConsent === true;
      m.sharing = false;
      m.shareUntilMinute = null;
      m.coverConsent = false;
      if (s.activeCoverMemberId === m.id) releaseCover(s);
      if (withdrawingCover && !m.refusalRespected) {
        m.refusalRespected = true;
        s.refusalsRespected += 1;
      }
      record(
        s,
        m.id,
        'withdrawn',
        'Optional burden stopped and explanation hidden; earned compensation retained, unused earmark released.'
      );
      break;
    }
    case 'stop': {
      if (!['deliberating', 'active'].includes(s.phase))
        return reject('No running scenario to stop.');
      settle(
        s,
        'Stopped locally; earned money settled, owed recovery retained and future authority revoked.'
      );
      break;
    }
    case 'tick': {
      const [delta, shipped, emergency, observation] = command.args;
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
        return reject('No valid active tick.');
      const beforeMission = JSON.stringify(workplaceMission(s));
      const missionDelivered =
        s.phase === 'review' && (s.campaign?.shift === 2 || s.improvement)
          ? 0
          : observeMission(s, observation);
      if (s.phase === 'deliberating') {
        if (JSON.stringify(workplaceMission(s)) === beforeMission)
          return reject('No new mission receipt.');
        break;
      }
      if (
        s.phase === 'active' &&
        workplaceMission(s) &&
        workplaceMission(s)!.evidence !== 'current'
      ) {
        settle(
          s,
          'Linked dispatch evidence changed or failed quality. Future optional authority stopped; earned obligations retained.'
        );
        break;
      }
      if (s.phase === 'review') {
        if (emergency || !s.members.some((m) => m.recoveryOwedMinutes > 0)) {
          if (JSON.stringify(workplaceMission(s)) !== beforeMission) break;
          return reject('No recovery time to deliver.');
        }
        deliverRecovery(s, delta);
        break;
      }
      if (emergency) {
        settle(s, 'Emergency stop: optional work halted immediately.');
        break;
      }
      const elapsed = Math.min(delta, s.durationMinutes - s.minute);
      const delivered =
        s.mode === 'game'
          ? (workplaceMission(s) ? missionDelivered : shipped) * (elapsed / delta)
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
        record(
          s,
          'quality',
          'inspection-completed',
          'Five modeled inspection minutes completed. Actual batch certification and release checks remain separate.'
        );
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
      if (s.minute >= s.durationMinutes)
        settle(
          s,
          'Scenario ended; future consent expired, earned money settled and any owed recovery retained.'
        );
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
        return reject(
          'A fictional member may vote for a known member under enabled member governance.'
        );
      s.chairBallots[voter] = candidate;
      s.electedChair =
        s.members.find((m) => Object.values(s.chairBallots).filter((v) => v === m.id).length >= 3)
          ?.id ?? null;
      record(s, voter, 'chair-ballot', `Recorded one replaceable member ballot for ${candidate}.`);
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
        return reject('An eligible member may direct surplus once review begins.');
      s.surplusBallots[voter] = destination;
      record(s, voter, 'surplus-ballot', `Member chose ${destination}; no capital-weighted votes.`);
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
        return reject('Settle obligations and objections before a one-time surplus decision.');
      const destination = DESTINATIONS.find(
        (d) => Object.values(s.surplusBallots).filter((v) => v === d).length >= 3
      );
      if (!destination)
        return reject('At least three members must agree on a surplus destination.');
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
      if (surplus <= 1e-8)
        return reject(
          'No positive operating surplus; starting capital cannot be shared as profit.'
        );
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
        `${destination}: ${surplus.toFixed(2)} illustrative credits; equal shares if distributed to members.`
      );
      break;
    }
    default:
      return reject('Unknown workplace action.');
  }
  return { changed: true, reason: null, state: s };
}

/** Persist a settled, privacy-redacted snapshot, never live authority. */
export function saveWorkplace(s: WorkplaceState): unknown {
  const saved = structuredClone(s);
  if (saved.phase === 'active' || saved.phase === 'deliberating')
    settle(saved, 'Reload safety: future authority and consent revoked; earned pay retained.');
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
    const { mission: _mission, ...campaignShape } = c;
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
      m.role !== expected.role ||
      m.publicBoundary !== expected.publicBoundary ||
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
      statement: pressure?.objection ?? `Review the ${o.kind} boundary before proceeding.`,
      resolution:
        o.status === 'resolved' ? `The ${o.actorId} role recorded resolution before reload.` : null,
    };
  });
  s.reviewReason =
    s.phase === 'review'
      ? 'Reloaded a settled synthetic snapshot. Consent and future authority remain revoked.'
      : null;
  s.revision += 1;
  return s;
}
