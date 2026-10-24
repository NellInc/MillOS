import type { WorkplaceReplayRun } from '../types/workplaceReplay';
import type { WorkplaceState, WorkplaceShiftRecord } from '../types/workplace';
import { saveWorkplace, restoreWorkplace, WORKPLACE_PLANS } from './bilateralWorkplace';
import { workplaceMission } from './workplaceImprovement';
import { translate } from '../i18n';
import { workplaceFairnessMessages as msg } from './workplaceFairness.messages';

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
        ? translate(msg, 'objectionDetailPartial')
        : translate(msg, 'objectionDetailRetained'),
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
      title: translate(msg, 'beatMandateTitle'),
      section: 'Agreement / Voices',
      observed: state.members.some((m) => m.understood),
      detail: translate(msg, 'beatMandateDetail'),
    },
    {
      title: translate(msg, 'beatRefusalTitle'),
      section: 'Agreement / Voices',
      observed:
        events.some((e) => e.kind === 'ballot' && e.detail.includes('declined')) ||
        records.some((r) => r.currentCoverConsent === false),
      detail: translate(msg, 'beatRefusalDetail'),
    },
    {
      title: translate(msg, 'beatDisclosureTitle'),
      section: 'Agreement / Voices',
      observed: events.some((e) => e.kind === 'privacy-consent'),
      detail: translate(msg, 'beatDisclosureDetail'),
    },
    {
      title: translate(msg, 'beatChallengeTitle'),
      section: state.improvement ? 'Handoff' : 'Shift',
      observed:
        events.some((e) => e.kind === 'adviser-correction') ||
        (state.improvement?.acknowledged === true &&
          events.some((e) => e.kind === 'improvement-challenged')),
      detail: translate(msg, 'beatChallengeDetail'),
    },
    {
      title: translate(msg, 'beatWorkTitle'),
      section: 'Review',
      observed: state.aiActions > 0 || state.campaign?.history.some((h) => h.minute > 0) === true,
      detail: translate(msg, 'beatWorkDetail'),
    },
    {
      title: translate(msg, 'beatSettleTitle'),
      section: 'Review',
      observed:
        records.some((r) => r.earnedPayAndMemberDistributions > 0) &&
        records.every((r) => r.recoveryOwed === 0),
      detail: translate(msg, 'beatSettleDetail'),
    },
    {
      title: translate(msg, 'beatReloadTitle'),
      section: 'Review',
      observed: state.events.some(
        (e) => e.kind === 'settled' && e.detail.startsWith('Reload safety')
      ),
      detail: translate(msg, 'beatReloadDetail'),
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
      scope: translate(msg, 'receiptScope'),
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
    efficacy: translate(msg, 'receiptEfficacy'),
  };
}

/** Read-only discussion of actual retained runs, never a causal or wellbeing score.
 * Working if changed horizons and conditions stay visible without changing a record.
 */
export function replayLearningReview(runs: readonly WorkplaceReplayRun[]) {
  if (runs.length < 2) return null;
  const horizonsDiffer =
    new Set(runs.map((run) => `${run.elapsedMinutes}:${run.agreementMinutes}:${run.shiftCount}`))
      .size > 1;
  const sameCheckpoint = runs.every(
    (run) => !!run.checkpointId && run.checkpointId === runs[0].checkpointId
  );
  const balanceUncertain = runs.some((run) =>
    [run.materialErrorKg, run.genealogyErrorKg].some(
      (error) => !Number.isFinite(error) || Math.abs(error) > 0.01
    )
  );
  const targetsDiffer = new Set(runs.map((run) => `${run.targetKg}:${run.deferredKg}`)).size > 1;
  const chartersDiffer =
    new Set(
      runs.map((run) =>
        JSON.stringify([
          run.charter.workerAutonomy,
          run.charter.governance,
          run.charter.aiAuthority,
          [...run.charter.practices].sort(),
        ])
      )
    ).size > 1;
  const plansDiffer = new Set(runs.map((run) => JSON.stringify(run.shiftPlans))).size > 1;
  const caveats: string[] = [];
  if (!sameCheckpoint) caveats.push(translate(msg, 'caveatCheckpoint'));
  if (balanceUncertain) caveats.push(translate(msg, 'caveatBalance'));
  if (targetsDiffer) caveats.push(translate(msg, 'caveatTargets'));
  if (chartersDiffer && plansDiffer) caveats.push(translate(msg, 'caveatConfounded'));
  const question =
    !sameCheckpoint || balanceUncertain
      ? translate(msg, 'questionCheckpoint')
      : horizonsDiffer
        ? translate(msg, 'questionHorizons')
        : targetsDiffer
          ? translate(msg, 'questionTargets')
          : chartersDiffer && plansDiffer
            ? translate(msg, 'questionConfounded')
            : plansDiffer
              ? translate(msg, 'questionPlans')
              : chartersDiffer
                ? translate(msg, 'questionCharters')
                : translate(msg, 'questionMatched');
  return { horizonsDiffer, caveats, question };
}
