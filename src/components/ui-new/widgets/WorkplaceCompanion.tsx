import { improvementSummary, workplaceMission } from '../../../simulation/workplaceImprovement';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { WORKPLACE_PLANS } from '../../../simulation/bilateralWorkplace';
import { deriveWorkplaceGuidance } from './WorkplacePressureChapter';
import { thursdayNegotiation } from '../../../simulation/workplaceCampaign';
import { CAMERA_PRESETS, useCameraStore } from '../../CameraController';

/** A read-only reminder in the game's existing quiet guidance slot. */
export function WorkplaceCompanion({ onOpen }: { onOpen: () => void }) {
  const state = useWorkplaceStore((store) => store.workplace);
  if (state.mode !== 'game' || state.phase === 'idle') return null;
  const guide = deriveWorkplaceGuidance(state);
  const negotiation = thursdayNegotiation(state);
  const improvement = improvementSummary(state);
  const plan = WORKPLACE_PLANS.find((item) => item.id === state.planId);
  const paid = guide.totals.members.reduce((sum, member) => sum + member.compensationPaid, 0);
  const recovered = guide.totals.members.reduce((sum, member) => sum + member.recoveryMinutes, 0);
  const owed = guide.totals.members.reduce((sum, member) => sum + member.recoveryOwedMinutes, 0);
  const cover = state.members.find((member) => member.id === state.activeCoverMemberId);
  const delivery = state.campaign
    ? guide.outcomes.delivery
    : {
        deliveredKg: state.shippedKg,
        targetKg: state.targetKg,
        remainingKg: Math.max(0, state.targetKg - state.shippedKg),
        status: 'pending',
      };
  const title = improvement
    ? `Handoff shift ${improvement.cycle}`
    : guide.needsRemedy
      ? 'An objection needs its raiser'
      : guide.beat;

  return (
    <aside
      aria-label="Working agreement companion"
      className="pointer-events-auto fixed bottom-[11.5rem] left-3 right-3 z-40 max-h-[calc(100dvh-15.5rem)] overflow-y-auto overscroll-contain rounded-xl border border-cyan-400/30 bg-slate-950/95 p-4 text-sm leading-6 text-slate-200 selection:bg-cyan-800 selection:text-cyan-100 sm:left-auto sm:right-4 sm:w-[360px]"
    >
      <h2 className="font-semibold text-white">Working agreement</h2>
      <p className="mt-1 text-xs text-cyan-200">
        {plan?.title ?? state.planId}, revision {state.revision}
      </p>
      {state.improvement?.advice && (
        <p className="mt-2 text-xs text-slate-300">
          {state.improvement.advice.reasonToAbstain
            ? 'The adviser abstained. Missing plant evidence remains visible in Handoff.'
            : `Frozen conditional departure bound: 0 to ${state.improvement.advice.dispatchUpperKg.toFixed(0)} kg. Actual receipts remain separate.`}
        </p>
      )}
      <h3 aria-live="polite" className="mt-3 font-semibold text-white">
        {title}
      </h3>
      <p className="mt-1">
        {state.phase === 'review'
          ? 'Future authority has ended. Earned pay and recovery remain owed until delivered.'
          : state.phase === 'active'
            ? 'Current bounded agreement is active. Refusal remains available.'
            : guide.readiness.allowed
              ? 'Current terms are ready for your explicit approval.'
              : 'These terms still need a fresh agreement.'}
      </p>
      <p className="mt-2 text-xs leading-5 text-cyan-100">
        {improvement
          ? improvement.next
          : negotiation
            ? negotiation.next
            : `Next: ${guide.destination} controls.`}
      </p>
      {guide.needsRemedy && (
        <p className="mt-2 text-amber-100">
          {guide.openObjections
            .map(
              (item) =>
                state.members.find((member) => member.id === item.actorId)?.role ?? 'Adviser'
            )
            .join(', ')}
          : open objection. Only its raiser can confirm resolution.
        </p>
      )}
      {state.phase === 'active' && cover && state.coverRemainingMinutes > 0 && (
        <p className="mt-2">
          Current cover: {cover.role}, {state.coverRemainingMinutes.toFixed(1)} min remaining.
        </p>
      )}
      <dl className="mt-3 space-y-1 border-t border-slate-700 pt-3 text-xs tabular-nums">
        <div>
          <dt className="inline text-slate-300">Dispatch receipts: </dt>
          <dd className="inline">
            {(improvement?.actualKg ?? delivery.deliveredKg).toFixed(0)} /{' '}
            {delivery.targetKg.toFixed(0)} kg
            {delivery.status === 'blocked' && '; evidence blocked'}.
          </dd>
        </div>
        {workplaceMission(state) && (
          <div>
            <dt className="inline text-slate-300">Full customer commitment remaining: </dt>
            <dd className="inline">
              {(improvement?.remainingKg ?? delivery.remainingKg).toFixed(0)} kg.
            </dd>
          </div>
        )}
        <div>
          <dt className="inline text-slate-300">Compensation paid: </dt>
          <dd className="inline">{paid.toFixed(2)} illustrative credits.</dd>
        </div>
        <div>
          <dt className="inline text-slate-300">Recovery: </dt>
          <dd className={`inline ${owed > 0 ? 'text-amber-100' : ''}`}>
            {recovered.toFixed(1)} min delivered; {owed.toFixed(1)} min owed.
          </dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 min-h-11 rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
      >
        Open agreement controls
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
          View packing floor
        </button>
      )}
    </aside>
  );
}
