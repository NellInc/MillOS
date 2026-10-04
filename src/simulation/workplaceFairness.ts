import type { WorkplaceState, WorkplaceShiftRecord } from '../types/workplace';
import { saveWorkplace, restoreWorkplace, WORKPLACE_PLANS } from './bilateralWorkplace';
import { workplaceMission } from './workplaceImprovement';

/** Public ledger traversal. Historical absent qualitative facts remain unknown. */
export function fairnessReceipt(state: WorkplaceState) {
  const snapshots: (WorkplaceState | WorkplaceShiftRecord)[] = [];
  const collect = (s: WorkplaceState) => {
    if (s.improvement) {
      collect(s.improvement.origin);
      for (const h of s.improvement.history) collect(h.snapshot);
    }
    snapshots.push(...(s.campaign?.history ?? []), s);
  };
  collect(state);
  return state.members.map((m) => {
    const records = snapshots
      .map((s) => s.members.find((p) => p.id === m.id))
      .filter((p) => p !== undefined);
    const sum = (
      key:
        | 'extraMinutes'
        | 'restMinutes'
        | 'earnedPay'
        | 'compensationPaid'
        | 'recoveryMinutes'
        | 'recoveryOwedMinutes'
    ) => records.reduce((n, p) => n + p[key], 0);
    const wagesReserved = state.finance.wageReserve / state.members.length;
    return {
      id: m.id,
      role: m.role,
      qualifiedTasks: [...m.eligibleTasks],
      currentTask: m.chosenTask,
      currentCoverConsent: m.coverConsent,
      extraMinutes: sum('extraMinutes'),
      earlierExtraMinutes: sum('extraMinutes') - m.extraMinutes,
      shiftsWithExtraDuty: records.filter((p) => p.extraMinutes > 0).length,
      earnedPayAndMemberDistributions: sum('earnedPay'),
      compensationPaid: sum('compensationPaid'),
      wagesReserved,
      compensationReserved:
        state.activeCoverMemberId === m.id ? state.finance.compensationReserve : 0,
      restMinutes: sum('restMinutes'),
      recoveryDelivered: sum('recoveryMinutes'),
      recoveryOwed: sum('recoveryOwedMinutes'),
      openObjections: snapshots.flatMap((s) =>
        'objections' in s
          ? s.objections
              .filter((o) => o.actorId === m.id && o.status === 'open')
              .map((o) => ({ kind: o.kind, statement: o.statement }))
          : []
      ),
      historicalObjectionDetail: snapshots.some((s) => !('objections' in s))
        ? 'Some earlier objection detail was not recorded; aggregate counts remain in campaign history.'
        : 'Public raiser-owned records retained.',
    };
  });
}

/** Guidance observes evidence, and cannot click, grant authority or advance time. */
export function demonstrationBeats(state: WorkplaceState) {
  const events = [
    ...(state.campaign?.history.flatMap((h) => h.relationshipEvents ?? []) ?? []),
    ...state.events,
  ];
  const records = fairnessReceipt(state);
  return [
    {
      title: 'Hear the current mandate (1 minute)',
      section: 'Agreement / Voices',
      observed: state.members.some((m) => m.understood),
      detail:
        'Read the bounded mandate and answer the role checks. Advice changes require fresh understanding.',
    },
    {
      title: 'Exercise a protected no (1 minute)',
      section: 'Agreement / Voices',
      observed:
        events.some((e) => e.kind === 'ballot' && e.detail.includes('declined')) ||
        records.some((r) => r.currentCoverConsent === false),
      detail:
        'Decline a policy or optional duty. Observe ordinary pay unchanged. Choose a defensible shared plan before operating.',
    },
    {
      title: 'Keep disclosure optional (1 minute)',
      section: 'Agreement / Voices',
      observed: events.some((e) => e.kind === 'privacy-consent'),
      detail:
        'Leave sharing off, or share and revoke the fictional explanation. No private reason is required. Skipping disclosure is a valid choice.',
    },
    {
      title: 'Challenge and hear a correction (2 minutes)',
      section: state.improvement ? 'Handoff' : 'Shift',
      observed:
        events.some((e) => e.kind === 'adviser-correction') ||
        (state.improvement?.acknowledged === true &&
          events.some((e) => e.kind === 'improvement-challenged')),
      detail:
        'Challenge a forecast in Handoff, or protect Thursday refusal in the season. Scripted adviser dialogue is identified separately in the receipt.',
    },
    {
      title: 'Run bounded work (2 minutes)',
      section: 'Review',
      observed: state.aiActions > 0 || state.campaign?.history.some((h) => h.minute > 0) === true,
      detail:
        'End turns, approve the current agreement, then run or pause the actual plant. Quality release and physical customer departures remain separate.',
    },
    {
      title: 'Settle money and recovery (2 minutes)',
      section: 'Review',
      observed:
        records.some((r) => r.earnedPayAndMemberDistributions > 0) &&
        records.every((r) => r.recoveryOwed === 0),
      detail:
        'Read every role receipt. Compensation is separate from earned pay and member distributions. Owed recovery remains visible until model time delivers it.',
    },
    {
      title: 'Rehearse safe reload (1 minute)',
      section: 'Review',
      observed: state.events.some(
        (e) => e.kind === 'settled' && e.detail.startsWith('Reload safety')
      ),
      detail:
        'Use Save and safely reload workplace. It expires future grants, settles earned money and retains recovery debt. It leaves the physical plant untouched.',
    },
  ] as const;
}
export function participationReceipt(state: WorkplaceState, mode: 'solo' | 'separate-turns') {
  const mission = workplaceMission(state);
  const reload = restoreWorkplace(saveWorkplace(state));
  return {
    kind: 'synthetic-cooperative-rehearsal',
    version: 1,
    reproduction: {
      seed: state.seed,
      revision: state.revision,
      mode: state.mode,
      profile: state.campaign?.profile ?? null,
      planId: state.planId,
      practices: [...state.practices],
      governance: state.governance,
      aiAuthority: state.aiAuthority,
    },
    participation: {
      mode,
      authentication: false,
      coercionAssessment: false,
      scope:
        'Shared-device fictional role turns. The local runtime checks turn ownership; same-origin code and device possession are outside identity security.',
    },
    actual: {
      minute: state.minute,
      cash: state.finance.cash,
      physicalDispatch: mission ? { ...mission } : null,
      modeledScenarioOutputKg: mission ? null : state.shippedKg,
      roles: fairnessReceipt(state),
      openAdviserObjections: state.objections
        .filter((o) => o.actorId === 'mind' && o.status === 'open')
        .map((o) => ({ kind: o.kind, statement: o.statement })),
    },
    modeled: {
      capacityMultiplier: WORKPLACE_PLANS.find((p) => p.id === state.planId)?.capacity,
      packingAdvice: state.improvement?.advice ?? null,
      statements: state.events
        .filter((e) => e.kind === 'adviser-correction')
        .map((e) => ({ source: 'authored-scenario-dialogue', minute: e.minute, detail: e.detail })),
    },
    publicConduct: state.events
      .filter((e) =>
        [
          'ballot',
          'understood',
          'objection',
          'objection-resolved',
          'improvement-challenged',
          'pressure-protected',
        ].includes(e.kind)
      )
      .map((e) => ({ ...e })),
    reloadPreview: {
      phase: reload.phase,
      futureCoverRemaining: reload.coverRemainingMinutes,
      roles: fairnessReceipt(reload),
    },
    efficacy:
      'No measured worker wellbeing, real-cooperative effectiveness or authenticated participant consent is claimed.',
  };
}
