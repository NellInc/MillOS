import type {
  ImprovementId,
  ImprovementTerms,
  WorkplaceMission,
  WorkplaceState,
  ImprovementEpisode,
} from '../types/workplace';
import { campaignTotals } from './workplaceCampaign';

/** Paid ordinary work only; no new individual duty, qualification or release authority. */
export const HANDOFF_ARRANGEMENTS = [
  {
    id: 'briefing' as const,
    author: 'packing',
    title: 'Packing proposes a paid handoff briefing',
    detail:
      'Pause line pacing for five paid minutes, then use a clearer handoff sequence. All work stays within current qualifications.',
    cost: 8,
    capacity: 0.9,
    briefingMinutes: 5,
  },
  {
    id: 'buffer' as const,
    author: 'maintenance',
    title: 'Maintenance proposes a small packing buffer',
    detail:
      'Fund a reusable staging arrangement. Higher modeled line capacity costs more upfront; quality release and machine safety remain unchanged.',
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
    title: 'The collection truck is late',
    premise: 'Assume collection loses the first 45 minutes of this 90-minute window.',
    recommendation:
      'Recommend deferral if collection cannot be confirmed. Packed stock can wait; extra work cannot make a truck arrive.',
  },
  {
    id: 'quality-hold' as const,
    title: 'Quality asks the line to wait',
    premise: 'Assume the finished stock is held pending a qualified quality review.',
    recommendation:
      'Recommend a quality review or deferral. A deadline grants no release authority.',
  },
  {
    id: 'tight-cash' as const,
    title: 'The team has little cash to spare',
    premise:
      'Assume only 116 credits are available: 108 reserved for ordinary wages, 8 for an arrangement.',
    recommendation:
      'Recommend ordinary pacing or the 8-credit paid briefing. A new 32-credit buffer would invade the wage reserve.',
  },
];
export const HANDOFF_EPISODE_CHOICES = [
  { id: 'ordinary' as const, label: 'Keep qualified ordinary work' },
  { id: 'smaller-delivery' as const, label: 'Discuss a smaller delivery' },
  { id: 'defer' as const, label: 'Defer this trial' },
  { id: 'decline' as const, label: 'Decline extra duty' },
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
  if (e.choice === 'decline')
    return 'Extra duty is declined in this rehearsal. Ordinary pay and rest stay protected. No live role ballot or consent has been recorded.';
  if (e.choice === 'defer')
    return 'The rehearsal trial is deferred. No purchase is made. The customer commitment remains outstanding; a conversation does not renegotiate an order.';
  if (e.id === 'quality-hold')
    return 'Conditional departure is 0 kg while this assumed hold remains. Qualified review or a new collection window is needed; this choice cannot release a real batch.';
  if (e.id === 'tight-cash')
    return 'After the 108-credit wage reserve, 8 credits remain in this scenario. Ordinary pacing costs 0; a new paid briefing costs 8; a new buffer costs 32 and is unaffordable. Actual cash is unchanged.';
  if (e.choice === 'smaller-delivery') {
    const remaining = s.improvement?.mission
      ? Math.max(0, s.improvement.mission.originalTargetKg - s.improvement.mission.creditedKg)
      : null;
    return remaining !== null && releasedKg !== null
      ? `Discuss at most ${Math.min(remaining / 2, releasedKg).toFixed(0)} kg from known released stock, subject to collection and quality. The rest stays owed. No delivery or customer acceptance is assumed.`
      : 'Discuss a smaller delivery once released stock and the remaining commitment are known. The customer must still accept any change; no credit is created.';
  }
  return '45 minutes remain for collection in this scenario. Packing can continue within qualified ordinary work; departure remains unverified and rest is retained.';
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
    reasons.push('Deliver owed recovery before continuing.');
  if (s.objections.some((o) => o.status === 'open'))
    reasons.push('Each objection must be resolved by its original raiser.');
  if (
    s.finance.wageReserve > 0 ||
    s.finance.compensationReserve > 0 ||
    s.activeCoverMemberId ||
    s.coverRemainingMinutes > 0
  )
    reasons.push('Settle reserved pay and optional work first.');
  return reasons;
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
          ? 'Choose a worker proposal.'
          : !i.acknowledged
            ? 'Challenge the forecast or hear the adviser response.'
            : 'Confirm each role’s understanding and current policy ballot in Fresh role decisions here in Handoff.'
        : s.phase === 'active'
          ? 'Watch the packing floor. Any role may stop the arrangement immediately.'
          : !i.reviewAcknowledged
            ? 'Hear the adviser compare its forecast with actual dispatch.'
            : !i.verdict
              ? 'Each member records adopt, amend or stop, then finalise the review.'
              : 'Open the next shift with carried cash and a fresh agreement.',
  };
}
