import type {
  ImprovementId,
  ImprovementTerms,
  WorkplaceMission,
  WorkplaceState,
  ImprovementEpisode,
} from '../types/workplace';
import { campaignTotals } from './workplaceCampaign';
import { formatFixed, translate } from '../i18n';
import { workplaceImprovementMessages as msg } from './workplaceImprovement.messages';

/** Paid ordinary work only; no new individual duty, qualification or release authority. */
export const HANDOFF_ARRANGEMENTS = [
  {
    id: 'briefing' as const,
    author: 'packing',
    get title() {
      return translate(msg, 'briefingTitle');
    },
    get detail() {
      return translate(msg, 'briefingDetail');
    },
    cost: 8,
    capacity: 0.9,
    briefingMinutes: 5,
  },
  {
    id: 'buffer' as const,
    author: 'maintenance',
    get title() {
      return translate(msg, 'bufferTitle');
    },
    get detail() {
      return translate(msg, 'bufferDetail');
    },
    cost: 32,
    capacity: 1.02,
    briefingMinutes: 0,
  },
];
export const IMPROVEMENT_VERDICTS = ['adopt', 'amend', 'stop'] as const;
export const IMPROVEMENT_CHALLENGES = ['forecast', 'cost', 'qualification'] as const;
export const MAX_IMPROVEMENT_CYCLES = 8;
export const HANDOFF_EPISODES = [
  {
    id: 'late-truck' as const,
    get title() {
      return translate(msg, 'lateTruckTitle');
    },
    get premise() {
      return translate(msg, 'lateTruckPremise');
    },
    get recommendation() {
      return translate(msg, 'lateTruckRecommendation');
    },
  },
  {
    id: 'quality-hold' as const,
    get title() {
      return translate(msg, 'qualityHoldTitle');
    },
    get premise() {
      return translate(msg, 'qualityHoldPremise');
    },
    get recommendation() {
      return translate(msg, 'qualityHoldRecommendation');
    },
  },
  {
    id: 'tight-cash' as const,
    get title() {
      return translate(msg, 'tightCashTitle');
    },
    get premise() {
      return translate(msg, 'tightCashPremise');
    },
    get recommendation() {
      return translate(msg, 'tightCashRecommendation');
    },
  },
];
export const HANDOFF_EPISODE_CHOICES = [
  {
    id: 'ordinary' as const,
    get label() {
      return translate(msg, 'choiceOrdinary');
    },
  },
  {
    id: 'smaller-delivery' as const,
    get label() {
      return translate(msg, 'choiceSmallerDelivery');
    },
  },
  {
    id: 'defer' as const,
    get label() {
      return translate(msg, 'choiceDefer');
    },
  },
  {
    id: 'decline' as const,
    get label() {
      return translate(msg, 'choiceDecline');
    },
  },
];

/** Scenario choices retain public learning only, without changing physical or financial facts. */
export function validImprovementEpisode(input: unknown): ImprovementEpisode | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const e = input as ImprovementEpisode;
  if (
    Object.keys(e).sort().join(',') !== 'actorId,choice,id' ||
    !HANDOFF_EPISODES.some((item) => item.id === e.id) ||
    (e.actorId !== null &&
      !['packing', 'quality', 'maintenance', 'coordinator'].includes(e.actorId)) ||
    (e.choice !== null && !HANDOFF_EPISODE_CHOICES.some((item) => item.id === e.choice)) ||
    (e.choice === null) !== (e.actorId === null)
  )
    return undefined;
  return { id: e.id, actorId: e.actorId, choice: e.choice };
}

export function improvementEpisodeOutcome(s: WorkplaceState, releasedKg: number | null = null) {
  const e = s.improvement?.episode;
  if (!e?.choice) return null;
  if (e.choice === 'decline') return translate(msg, 'outcomeDecline');
  if (e.choice === 'defer') return translate(msg, 'outcomeDefer');
  if (e.id === 'quality-hold') return translate(msg, 'outcomeQualityHold');
  if (e.id === 'tight-cash') return translate(msg, 'outcomeTightCash');
  if (e.choice === 'smaller-delivery') {
    const remaining = s.improvement?.mission
      ? Math.max(0, s.improvement.mission.originalTargetKg - s.improvement.mission.creditedKg)
      : null;
    return remaining !== null && releasedKg !== null
      ? translate(msg, 'outcomeSmallerKnown', {
          kg: formatFixed(Math.min(remaining / 2, releasedKg), 0),
        })
      : translate(msg, 'outcomeSmallerUnknown');
  }
  return translate(msg, 'outcomeOrdinary');
}

/** A public account of conduct, never a numerical relationship or wellbeing score. */
export function improvementConduct(s: WorkplaceState) {
  const declined = [
    ...new Set(
      s.events
        .filter((e) => e.kind === 'ballot' && e.detail.startsWith('Plan declined'))
        .map((e) => e.actorId)
    ),
  ];
  return {
    challenges: s.improvement?.challenges.length ?? 0,
    adviceChanges: s.events.filter((e) => e.kind === 'improvement-advice-changed').length,
    declined,
    stopped: s.events.some((e) => ['improvement-stopped', 'withdrawn', 'stopped'].includes(e.kind)),
    roles: s.members.map((m) => ({
      id: m.id,
      role: m.role,
      earnedPay: m.earnedPay,
      restMinutes: m.restMinutes,
      extraMinutes: m.extraMinutes,
      compensationPaid: m.compensationPaid,
      recoveryMinutes: m.recoveryMinutes,
      recoveryOwedMinutes: m.recoveryOwedMinutes,
    })),
    openObjections: s.objections.filter((o) => o.status === 'open'),
    receipts: s.events.filter(
      (e) =>
        e.kind.startsWith('improvement-') ||
        ['ballot', 'withdrawn', 'objection', 'objection-resolved'].includes(e.kind)
    ),
  };
}
export const workplaceMission = (s: WorkplaceState): WorkplaceMission | undefined =>
  s.campaign?.mission ?? s.improvement?.mission;
export const improvementArrangement = (s: WorkplaceState) =>
  HANDOFF_ARRANGEMENTS.find((a) => a.id === s.improvement?.proposalId);
export function improvementTerms(s: WorkplaceState): ImprovementTerms {
  const i = s.improvement!;
  return {
    proposalId: i.proposalId,
    proposerId: i.proposerId,
    challenges: structuredClone(i.challenges),
    acknowledged: i.acknowledged,
    forecastKg: i.forecastKg,
    funded: i.funded,
    stopped: i.stopped,
    reviewAcknowledged: i.reviewAcknowledged,
    ballots: { ...i.ballots },
    verdict: i.verdict,
    ...(i.advice ? { advice: structuredClone(i.advice) } : {}),
    ...(i.episode ? { episode: { ...i.episode } } : {}),
  };
}
export const freshImprovementTerms = (): ImprovementTerms => ({
  proposalId: null,
  proposerId: null,
  challenges: [],
  acknowledged: false,
  forecastKg: null,
  funded: false,
  stopped: false,
  reviewAcknowledged: false,
  ballots: {},
  verdict: null,
});
export function retainedImprovement(s: WorkplaceState): ImprovementId | null {
  const previous = s.improvement?.history.at(-1);
  return previous?.verdict === 'adopt' ? previous.proposalId : null;
}
export function improvementCost(s: WorkplaceState): number {
  const a = improvementArrangement(s);
  if (!a || (s.improvement?.stopped && !s.improvement.funded)) return 0;
  return retainedImprovement(s) === a.id ? 0 : a.cost;
}
/** Sampled by the existing unified physical tick, never a shipment generator. */
export function improvementCapacity(s: WorkplaceState, minute = s.minute): number | null {
  if (!s.improvement || s.phase !== 'active' || s.mode !== 'game') return null;
  const a = improvementArrangement(s);
  if (!a || s.improvement.stopped) return 0.78;
  return minute < a.briefingMinutes ? 0 : a.capacity;
}
export function improvementForecast(s: WorkplaceState) {
  const a = improvementArrangement(s);
  const supply = 430 + (((Math.imul(s.seed, 1664525) + 1013904223) >>> 0) % 281);
  const nominal =
    a && !s.improvement?.stopped
      ? Math.min(600, supply, (90 - a.briefingMinutes) * a.capacity * 8)
      : Math.min(600, supply, 90 * 0.78 * 8);
  const previous = s.improvement?.history.at(-1);
  // A bounded correction to a teaching forecast, derived from the last actual
  // shift. It never fabricates an outcome or claims a causal improvement.
  const adjustment =
    previous && s.mode === 'game'
      ? Math.max(
          -100,
          Math.min(100, previous.snapshot.shippedKg - (previous.forecastKg ?? nominal))
        ) * 0.25
      : 0;
  return {
    kg: s.improvement?.forecastKg ?? Math.max(0, nominal + adjustment),
    adjustment,
    uncertainty: 'Supply, quality holds and truck timing can dominate this illustrative forecast.',
  };
}
export function improvementReviewWinner(s: WorkplaceState) {
  const i = s.improvement;
  if (!i || s.members.some((m) => !i.ballots[m.id])) return null;
  if (s.governance === 'consultative') return i.ballots.coordinator ?? null;
  const threshold = s.governance === 'team-consent' ? s.members.length : 3;
  return (
    IMPROVEMENT_VERDICTS.find(
      (v) => Object.values(i.ballots).filter((b) => b === v).length >= threshold
    ) ?? null
  );
}
export function improvementObligations(s: WorkplaceState): string[] {
  const reasons: string[] = [];
  if (s.members.some((m) => m.recoveryOwedMinutes > 0))
    reasons.push(translate(msg, 'obligationRecovery'));
  if (s.objections.some((o) => o.status === 'open'))
    reasons.push(translate(msg, 'obligationObjections'));
  if (
    s.finance.wageReserve > 0 ||
    s.finance.compensationReserve > 0 ||
    s.activeCoverMemberId ||
    s.coverRemainingMinutes > 0
  )
    reasons.push(translate(msg, 'obligationSettle'));
  return reasons;
}
/**
 * The handoff experiment holds the plant clock while it is being decided: its
 * adviser forecast is frozen on the current plant inputs. The trial itself
 * runs, owed recovery runs on an explicit resume, and a verdict releases it.
 * Working if the clock is held exactly when the tick grants a handoff no time.
 */
export function handoffHoldsClock(s: WorkplaceState): boolean {
  const i = s.improvement;
  return (
    s.mode === 'game' &&
    !!i &&
    (s.phase === 'deliberating' ||
      (s.phase === 'review' && !i.verdict && !s.members.some((m) => m.recoveryOwedMinutes > 0)))
  );
}
/**
 * Whether the cooperative agreement owns the HUD guidance slot (companion)
 * instead of the daily production target. A review that owes nothing, and is
 * not an undecided handoff, hands the slot back.
 * Working if a finished season no longer hides the daily target for good.
 */
export function workplaceOwnsGuidance(s: WorkplaceState): boolean {
  if (s.mode !== 'game' || s.phase === 'idle') return false;
  if (s.phase !== 'review') return true;
  return improvementObligations(s).length > 0 || (!!s.improvement && !s.improvement.verdict);
}
export function improvementSummary(s: WorkplaceState) {
  const i = s.improvement;
  if (!i) return null;
  const origin = campaignTotals(i.origin);
  const records = [...i.history.map((h) => h.snapshot), s];
  return {
    cycle: i.history.length + 1,
    ...improvementTerms(s),
    arrangement: improvementArrangement(s)?.title ?? null,
    forecast: improvementForecast(s),
    actualKg: s.shippedKg,
    cost: improvementCost(s),
    retained: retainedImprovement(s),
    mission: i.mission ? structuredClone(i.mission) : null,
    remainingKg: i.mission ? Math.max(0, i.mission.originalTargetKg - i.mission.creditedKg) : null,
    lifetimeWages:
      origin.members.reduce((n, m) => n + m.earnedPay, 0) +
      records.reduce((n, r) => n + r.finance.wagesPaid + r.finance.distributed, 0),
    lifetimeCompensation:
      origin.members.reduce((n, m) => n + m.compensationPaid, 0) +
      records.reduce((n, r) => n + r.finance.compensationPaid, 0),
    lifetimeRecoveryMinutes:
      origin.members.reduce((n, m) => n + m.recoveryMinutes, 0) +
      records.reduce((n, r) => n + r.members.reduce((sum, m) => sum + m.recoveryMinutes, 0), 0),
    currentRecoveryOwedMinutes: s.members.reduce((n, m) => n + m.recoveryOwedMinutes, 0),
    history: i.history.map((h, n) => ({
      cycle: n + 1,
      proposalId: h.proposalId,
      verdict: h.verdict,
      shippedKg: h.snapshot.shippedKg,
      closingCash: h.snapshot.finance.cash,
      wages: h.snapshot.finance.wagesPaid,
      spend: h.snapshot.finance.improvementSpend,
    })),
    next:
      s.phase === 'deliberating'
        ? !i.proposalId
          ? translate(msg, 'nextChooseProposal')
          : !i.acknowledged
            ? translate(msg, 'nextChallenge')
            : translate(msg, 'nextConfirm')
        : s.phase === 'active'
          ? translate(msg, 'nextWatch')
          : !i.reviewAcknowledged
            ? translate(msg, 'nextHearComparison')
            : !i.verdict
              ? translate(msg, 'nextVerdicts')
              : translate(msg, 'nextOpenShift'),
  };
}

/** Public review prompts, never a score, causal verdict or new permission.
 * Working if the finished horizon and evidence gaps stay visible without changing state.
 */
export function improvementLearningReview(s: WorkplaceState) {
  if (!s.improvement || s.phase !== 'review') return null;
  const summary = improvementSummary(s)!;
  const mission = workplaceMission(s);
  const open = s.objections.filter((o) => o.status === 'open');
  const early = s.minute < 90;
  const evidence = [
    translate(msg, 'evidenceHorizon', {
      prefix: translate(msg, early ? 'evidenceEndedAfter' : 'evidenceCompleted'),
      minute: formatFixed(s.minute, 1),
      status: translate(msg, s.improvement.stopped ? 'evidenceStopped' : 'evidenceAvailable'),
    }),
    s.mode === 'game'
      ? translate(msg, 'evidenceDispatch', {
          kg: formatFixed(s.shippedKg, 1),
          receipts: mission
            ? translate(msg, 'evidenceReceipts', {
                credited: formatFixed(mission.creditedKg, 1),
                owed: formatFixed(Math.max(0, mission.originalTargetKg - mission.creditedKg), 1),
                evidence: mission.evidence,
              })
            : translate(msg, 'evidenceTeachingCounter'),
        })
      : translate(msg, 'evidenceWorkshop'),
  ];
  const advice = s.improvement.advice;
  evidence.push(
    advice
      ? advice.reasonToAbstain
        ? translate(msg, 'evidenceAbstained', { reason: advice.reasonToAbstain })
        : translate(msg, 'evidenceBound', { kg: formatFixed(advice.dispatchUpperKg, 1) })
      : translate(msg, 'evidenceNoForecast')
  );
  const focus = open.length
    ? 'remedy'
    : summary.currentRecoveryOwedMinutes > 0
      ? 'recovery'
      : mission && mission.evidence !== 'current'
        ? 'evidence'
        : early || s.improvement.stopped
          ? 'trial'
          : summary.remainingKg !== null && summary.remainingKg > 0
            ? 'delivery'
            : 'comparison';
  const questions = {
    remedy: translate(msg, 'questionRemedy', { count: formatFixed(open.length, 0) }),
    recovery: translate(msg, 'questionRecovery', {
      minutes: formatFixed(summary.currentRecoveryOwedMinutes, 1),
    }),
    evidence: translate(msg, 'questionEvidence'),
    trial: translate(msg, 'questionTrial'),
    delivery: translate(msg, 'questionDelivery'),
    comparison: translate(msg, 'questionComparison'),
  };
  return {
    evidence,
    focus,
    question: questions[focus],
    limitation: early ? translate(msg, 'limitationEarly') : translate(msg, 'limitationComplete'),
  };
}
