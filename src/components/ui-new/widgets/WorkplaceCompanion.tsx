import { improvementSummary, workplaceMission } from '../../../simulation/workplaceImprovement';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { WORKPLACE_PLANS } from '../../../simulation/bilateralWorkplace';
import { deriveWorkplaceGuidance } from './WorkplacePressureChapter';
import { thursdayNegotiation } from '../../../simulation/workplaceCampaign';
import { CAMERA_PRESETS, useCameraStore } from '../../CameraController';
import { formatFixed, useT } from '../../../i18n';
import { workplaceCompanionMessages } from './WorkplaceCompanion.messages';

/** A read-only reminder in the game's existing quiet guidance slot. */
export function WorkplaceCompanion({ onOpen }: { onOpen: () => void }) {
  const state = useWorkplaceStore((store) => store.workplace);
  const t = useT(workplaceCompanionMessages);
  if (state.mode !== 'game' || state.phase === 'idle') return null;
  const guide = deriveWorkplaceGuidance(state);
  const negotiation = thursdayNegotiation(state);
  const improvement = improvementSummary(state);
  const plan = WORKPLACE_PLANS.find((item) => item.id === state.planId);
  const paid =
    improvement?.lifetimeCompensation ??
    guide.totals.members.reduce((sum, member) => sum + member.compensationPaid, 0);
  const recovered =
    improvement?.lifetimeRecoveryMinutes ??
    guide.totals.members.reduce((sum, member) => sum + member.recoveryMinutes, 0);
  const owed =
    improvement?.currentRecoveryOwedMinutes ??
    guide.totals.members.reduce((sum, member) => sum + member.recoveryOwedMinutes, 0);
  const mission = workplaceMission(state);
  const cover = state.members.find((member) => member.id === state.activeCoverMemberId);
  const delivery = state.campaign
    ? guide.outcomes.delivery
    : {
        deliveredKg: state.shippedKg,
        targetKg: state.targetKg,
        remainingKg: Math.max(0, state.targetKg - state.shippedKg),
        status: 'pending',
      };
  const deliveredKg = mission?.creditedKg ?? delivery.deliveredKg;
  const targetKg = mission?.targetKg ?? delivery.targetKg;
  const remainingKg = mission
    ? Math.max(0, mission.originalTargetKg - mission.creditedKg)
    : delivery.remainingKg;
  // A renegotiated installment is the denominator here, not the order. Working
  // if the receipts row names the installment and the deferral stays visible.
  const deferredKg = mission ? Math.max(0, mission.originalTargetKg - mission.targetKg) : 0;
  const evidenceBlocked = mission ? mission.evidence !== 'current' : delivery.status === 'blocked';
  const title = improvement
    ? t('handoffShift', { cycle: formatFixed(improvement.cycle, 0) })
    : guide.needsRemedy
      ? t('objectionNeedsRaiser')
      : guide.beat;

  return (
    <aside
      aria-label={t('regionLabel')}
      className="pointer-events-auto fixed bottom-[11.5rem] left-3 right-3 z-40 max-h-[calc(100dvh-15.5rem)] overflow-y-auto overscroll-contain rounded-xl border border-cyan-400/30 bg-slate-950/95 p-4 text-sm leading-6 text-slate-200 selection:bg-cyan-800 selection:text-cyan-100 sm:left-auto sm:right-4 sm:w-[360px]"
    >
      <h2 className="font-semibold text-white">{t('heading')}</h2>
      <p className="mt-1 text-xs text-cyan-200">
        {t('revisionLine', {
          name: improvement?.arrangement ?? plan?.title ?? state.planId,
          revision: formatFixed(state.revision, 0),
        })}
      </p>
      {state.improvement?.advice && (
        <p className="mt-2 text-xs text-slate-300">
          {state.improvement.advice.reasonToAbstain
            ? t('adviserAbstained')
            : t('frozenBound', {
                upper: formatFixed(state.improvement.advice.dispatchUpperKg, 0),
              })}
        </p>
      )}
      <h3 aria-live="polite" className="mt-3 font-semibold text-white">
        {title}
      </h3>
      <p className="mt-1">
        {state.phase === 'review'
          ? t('reviewPhase')
          : state.phase === 'active'
            ? t('activePhase')
            : guide.readiness.allowed
              ? t('readyForApproval')
              : t('needsFreshAgreement')}
      </p>
      <p className="mt-2 text-xs leading-5 text-cyan-100">
        {improvement
          ? improvement.next
          : negotiation
            ? negotiation.next
            : t('nextControls', { destination: guide.destination })}
      </p>
      {guide.needsRemedy && (
        <p className="mt-2 text-amber-100">
          {t('openObjection', {
            roles: guide.openObjections
              .map(
                (item) =>
                  state.members.find((member) => member.id === item.actorId)?.role ?? t('adviser')
              )
              .join(', '),
          })}
        </p>
      )}
      {state.phase === 'active' && cover && state.coverRemainingMinutes > 0 && (
        <p className="mt-2">
          {t('currentCover', {
            role: cover.role,
            minutes: formatFixed(state.coverRemainingMinutes, 1),
          })}
        </p>
      )}
      <dl className="mt-3 space-y-1 border-t border-slate-700 pt-3 text-xs tabular-nums">
        <div>
          <dt className="inline text-slate-300">
            {mission
              ? deferredKg > 0
                ? t('installmentReceipts')
                : t('dispatchReceipts')
              : t('teachingOutput')}
          </dt>
          <dd className="inline">
            {t('receiptsValue', {
              delivered: formatFixed(deliveredKg, 0),
              target: formatFixed(targetKg, 0),
              blocked: Boolean(evidenceBlocked),
            })}
          </dd>
        </div>
        {deferredKg > 0 && (
          <div>
            <dt className="inline text-slate-300">{t('agreedDeferral')}</dt>
            <dd className="inline">{t('deferralValue', { kg: formatFixed(deferredKg, 0) })}</dd>
          </div>
        )}
        {improvement && mission && (
          <div>
            <dt className="inline text-slate-300">{t('handoffDispatch')}</dt>
            <dd className="inline">{t('kgValue', { kg: formatFixed(improvement.actualKg, 0) })}</dd>
          </div>
        )}
        {mission && (
          <div>
            <dt className="inline text-slate-300">{t('commitmentRemaining')}</dt>
            <dd className="inline">{t('kgValue', { kg: formatFixed(remainingKg, 0) })}</dd>
          </div>
        )}
        <div>
          <dt className="inline text-slate-300">
            {improvement ? t('retainedCompensation') : t('compensationPaid')}
          </dt>
          <dd className="inline">{t('creditsValue', { amount: formatFixed(paid, 2) })}</dd>
        </div>
        <div>
          <dt className="inline text-slate-300">
            {improvement ? t('retainedRecovery') : t('recovery')}
          </dt>
          <dd className={`inline ${owed > 0 ? 'text-amber-100' : ''}`}>
            {t('recoveryValue', {
              recovered: formatFixed(recovered, 1),
              owed: formatFixed(owed, 1),
            })}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 min-h-11 rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
      >
        {t('openControls')}
      </button>
      {(negotiation || improvement) && (
        <button
          type="button"
          onClick={() =>
            useCameraStore
              .getState()
              .setPreset(CAMERA_PRESETS.findIndex((preset) => preset.name === 'Packing'))
          }
          className="mt-2 min-h-11 rounded-lg border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
        >
          {t('viewPacking')}
        </button>
      )}
    </aside>
  );
}
