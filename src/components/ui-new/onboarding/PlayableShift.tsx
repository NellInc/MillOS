import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { X } from 'lucide-react';
import { useUIStore } from '../../../stores/uiStore';
import { useMobileControlStore } from '../../../stores/mobileControlStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { campaignOutcomes, campaignTotals } from '../../../simulation/workplaceCampaign';
import type { WorkplaceProfile, WorkplaceState } from '../../../types/workplace';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import {
  deriveOperationsPlay,
  RECOVERY_CHALLENGE_TARGET_KG,
  RECOVERY_CHALLENGE_WINDOW_MINUTES,
} from '../../../simulation/operationsPlay';
import { LearningNote } from '../../knowledge/LearningNote';
import { deriveDeliveryJourney } from './deliveryJourney';
import { MachineType, type MachineData } from '../../../types';

const BUTTON =
  'min-h-11 rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10 disabled:opacity-40';
const CARD = 'rounded-xl border border-cyan-400/20 bg-slate-900/90 p-3 text-sm text-slate-200';

export function TeachingPace() {
  const speed = useGameSimulationStore((s) => s.gameSpeed);
  const setSpeed = useGameSimulationStore((s) => s.setGameSpeed);
  return (
    <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
      Shift pace
      <select
        aria-label="Shift pace"
        value={[0, 30, 180].includes(speed) ? speed : 'custom'}
        onChange={(e) => setSpeed(Number(e.target.value))}
        className="min-h-11 rounded bg-slate-800 px-2 text-white"
      >
        <option value={0}>Paused, inspect freely</option>
        <option value={30}>Relaxed, 1/6 speed</option>
        <option value={180}>Standard, 1x</option>
        {![0, 30, 180].includes(speed) && <option value="custom">Current custom pace</option>}
      </select>
    </label>
  );
}

export function FirstDeliveryJourney({
  selectedMachine,
  onOpenWorkspace,
}: {
  selectedMachine: MachineData | null;
  onOpenWorkspace: (mode: 'scada' | 'overview') => void;
}) {
  const ui = useUIStore(
    useShallow((s) => ({
      orderId: s.journeyOrderId,
      inspected: s.inspectedMachineIds.length > 0,
      record: s.recordMachineInspection,
      close: s.setJourneyVisible,
    }))
  );
  const campaign = useOperationsCampaignStore(
    useShallow((s) => ({ orders: s.orders, execution: s.execution }))
  );
  const order = campaign.orders.find((item) => item.id === ui.orderId) ?? null;
  const guide = deriveDeliveryJourney(order, campaign.execution, ui.inspected);
  useEffect(() => {
    if (
      selectedMachine &&
      [
        MachineType.SILO,
        MachineType.ROLLER_MILL,
        MachineType.PLANSIFTER,
        MachineType.PACKER,
      ].includes(selectedMachine.type)
    )
      ui.record(selectedMachine.id);
  }, [selectedMachine, ui.record]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[role="dialog"], [role="menu"]'))
        return;
      event.preventDefault();
      event.stopPropagation();
      ui.close(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [ui.close]);
  return (
    <section
      aria-label="Guided delivery"
      className="pointer-events-auto fixed bottom-[11.5rem] left-3 right-3 z-40 max-h-[calc(100dvh-15.5rem)] overflow-y-auto overscroll-contain rounded-xl border border-cyan-400/40 bg-slate-950/95 p-4 shadow-xl sm:left-5 sm:right-auto sm:w-[360px]"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-white">Your first delivery</h2>
        <button
          className={BUTTON}
          aria-label="Close guided delivery"
          onClick={() => ui.close(false)}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-2 text-xs text-cyan-200">
        {order
          ? `${order.customer}: ${order.requiredKg.toFixed(0)} kg ${order.recipe.label}`
          : 'Awaiting an order'}
      </p>
      <h3 aria-live="polite" className="mt-3 font-semibold text-white">
        {guide.title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-200">{guide.detail}</p>
      <p className="mt-2 text-xs text-slate-300">
        Inspection: {ui.inspected ? 'recorded' : 'waiting'} · Delivery:{' '}
        {order?.status === 'fulfilled'
          ? 'fulfilled'
          : `${order?.shippedKg.toFixed(0) ?? 0} kg dispatched`}
      </p>
      {guide.workspace && (
        <button className={`${BUTTON} mt-3`} onClick={() => onOpenWorkspace(guide.workspace!)}>
          Open {guide.workspace === 'scada' ? 'operations' : 'Overview and QC'}
        </button>
      )}
      <TeachingPace />
      <LearningNote entryId={guide.entryId} />
      <button className={`${BUTTON} mt-3`} onClick={() => ui.close(false)}>
        Skip guided delivery
      </button>
    </section>
  );
}

function linkedReviewPending(state: WorkplaceState) {
  return (
    !!state.campaign?.mission &&
    (state.campaign.shift !== 2 ||
      state.phase !== 'review' ||
      state.members.some((member) => member.recoveryOwedMinutes > 0) ||
      state.objections.some((objection) => objection.status === 'open'))
  );
}

function WorkingAgreementSummary({ state }: { state: WorkplaceState }) {
  if (!state.campaign?.mission) return null;
  const outcome = campaignOutcomes(state);
  const totals = campaignTotals(state);
  return (
    <div className="mt-3 space-y-2 border-t border-slate-700 pt-3 text-xs leading-5">
      <h4 className="font-semibold text-white">Linked working agreement</h4>
      <p>
        Delivery: {outcome.delivery.status}, {outcome.delivery.deliveredKg.toFixed(0)} /{' '}
        {outcome.delivery.targetKg.toFixed(0)} kg for {outcome.delivery.customer}.
      </p>
      {outcome.delivery.deferredKg > 0 && (
        <p>Agreed deferral: {outcome.delivery.deferredKg.toFixed(0)} kg.</p>
      )}
      <p>
        Remaining full customer commitment: {outcome.delivery.remainingKg.toFixed(0)} kg.
        {outcome.delivery.remainingKg === 0 && ' Full customer commitment dispatched.'}
      </p>
      <p>
        Working agreement: {outcome.agreement.status}. Combined outcome:{' '}
        {outcome.complete ? 'complete' : 'unfinished'}.
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-cyan-200">
          Individual obligations
        </summary>
        {state.members.map((member) => (
          <p key={member.id}>
            {member.role}: current rest {member.restMinutes.toFixed(1)} min; recovery owed{' '}
            {member.recoveryOwedMinutes.toFixed(1)} min.
          </p>
        ))}
        {totals.members.map((member) => (
          <p key={member.id}>
            {member.role}, cumulative: extra duty {member.extraMinutes.toFixed(1)} min; rest{' '}
            {member.restMinutes.toFixed(1)} min; recovery owed{' '}
            {member.recoveryOwedMinutes.toFixed(1)} min.
          </p>
        ))}
      </details>
      <p>
        Illustrative workplace credits, separate from main mill revenue and pounds: closing cash{' '}
        {outcome.accounts.closingCash.toFixed(2)}; wages {outcome.accounts.wages.toFixed(2)};
        compensation {outcome.accounts.compensation.toFixed(2)}; improvements{' '}
        {outcome.accounts.improvements.toFixed(2)}; allocations{' '}
        {outcome.accounts.allocations.toFixed(2)}.
      </p>

      <button
        className={BUTTON}
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent('millos:open-operations-workspace', { detail: 'autonomy' })
          )
        }
      >
        Review working agreement
      </button>
    </div>
  );
}

export function OperationsPlayCard() {
  // Project only changing campaign references; the panel host never subscribes to ticks.
  const snapshot = useOperationsCampaignStore(
    useShallow((s) => ({
      orders: s.orders,
      activeOrderId: s.activeOrderId,
      execution: s.execution,
      constraints: s.constraints,
      incidents: s.incidents,
      elapsedMinutes: s.elapsedMinutes,
      activeChallenge: s.activeChallenge,
      challengeHistory: s.challengeHistory,
    }))
  );
  const workplace = useWorkplaceStore((s) => s.workplace);
  const [profile, setProfile] = useState<WorkplaceProfile>('toe-dip');
  const [missionFeedback, setMissionFeedback] = useState<string | null>(null);
  const reviewPending = linkedReviewPending(workplace);
  const play = deriveOperationsPlay(snapshot);
  const canStartMission =
    workplace.phase === 'idle' &&
    !!play.activeOrder &&
    !snapshot.activeChallenge &&
    play.activeOrder.qualityFailureKg === 0 &&
    play.activeOrder.requiredKg > play.activeOrder.shippedKg;
  const startJourney = useUIStore((s) => s.startDeliveryJourney);
  const performNext = () => {
    const state = useOperationsCampaignStore.getState();
    const action = deriveOperationsPlay(state).nextAction;
    if (action.kind === 'acknowledge' && action.targetId)
      state.acknowledgeIncident(action.targetId);
    if (action.kind === 'mitigate' && action.targetId) state.mitigateIncident(action.targetId);
    if (action.kind === 'resolve') state.finishChallengeRecovery();
    if (action.kind === 'programme' && !linkedReviewPending(useWorkplaceStore.getState().workplace))
      state.acceptNextProgramme();
    if (['quality', 'receiving', 'dispatch', 'production'].includes(action.kind)) {
      window.dispatchEvent(
        new CustomEvent('millos:open-operations-workspace', {
          detail: action.kind === 'quality' ? 'overview' : 'scada',
        })
      );
    }
  };
  return (
    <section aria-label="Your shift commitment" className={CARD}>
      <h3 className="font-semibold text-white">Your shift commitment</h3>
      {snapshot.orders.some(
        (order) => order.status !== 'fulfilled' && order.status !== 'cancelled'
      ) && (
        <label className="mt-2 block text-xs text-slate-300">
          Active customer commitment
          <select
            value={snapshot.activeOrderId ?? ''}
            disabled={snapshot.activeChallenge !== null || reviewPending}
            onChange={(event) => {
              const current = useOperationsCampaignStore.getState();
              if (
                !current.activeChallenge &&
                !linkedReviewPending(useWorkplaceStore.getState().workplace)
              )
                current.activateOrder(event.target.value);
            }}
            className="mt-1 min-h-11 w-full rounded border border-slate-600 bg-slate-800 px-2 text-white disabled:opacity-50"
          >
            <option value="" disabled>
              Choose a customer
            </option>
            {snapshot.orders
              .filter((order) => order.status !== 'fulfilled' && order.status !== 'cancelled')
              .map((order) => (
                <option key={order.id} value={order.id}>
                  {order.customer}: {order.recipe.label}
                </option>
              ))}
          </select>
          <span className="mt-1 block leading-5">
            {snapshot.activeChallenge
              ? 'Finish or abandon the challenge before switching customers.'
              : reviewPending
                ? 'Finish the linked working agreement review and owed recovery before switching customers.'
                : 'Changing customer changes the scheduled recipe. Existing stock and shipping receipts remain unchanged.'}
          </span>
        </label>
      )}
      <p className="mt-2">
        {play.activeOrder
          ? `${play.activeOrder.customer}: ${play.activeOrder.shippedKg.toFixed(0)} / ${play.activeOrder.requiredKg.toFixed(0)} kg dispatched`
          : 'Current programme complete'}
      </p>
      {play.blockers[0] && (
        <p className="mt-2 text-amber-200">
          Blocked: {play.blockers[0].label}. {play.blockers[0].detail}
        </p>
      )}
      <p className="mt-2 text-cyan-200">Next: {play.nextAction.label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-300">{play.nextAction.consequence}</p>
      <button
        className={`${BUTTON} mt-2`}
        disabled={play.nextAction.kind === 'programme' && reviewPending}
        onClick={performNext}
      >
        {play.nextAction.label}
      </button>
      <button
        className={`${BUTTON} mt-2`}
        onClick={() => {
          startJourney(play.activeOrder?.id ?? null);
          useMobileControlStore.getState().closeMobilePanel();
        }}
      >
        Replay guided delivery
      </button>
      {snapshot.challengeHistory.at(-1) && (
        <p className="mt-2 text-xs text-slate-300">
          Last challenge: {snapshot.challengeHistory.at(-1)!.status}. The delivery manifests and
          quality checks remain the result record.
        </p>
      )}
      <WorkingAgreementSummary state={workplace} />
      {workplace.phase === 'idle' && (
        <div className="mt-3 space-y-2 border-t border-slate-700 pt-3">
          <label className="block text-xs text-slate-300">
            Working agreement profile
            <select
              aria-label="Working agreement profile"
              value={profile}
              onChange={(event) => setProfile(event.target.value as WorkplaceProfile)}
              className="mt-1 min-h-11 w-full rounded border border-slate-600 bg-slate-800 px-2 text-white"
            >
              <option value="toe-dip">Toe dip: protected practice set</option>
              <option value="team">Team: shared work and consent</option>
              <option value="cooperative">Cooperative: member governance</option>
            </select>
          </label>
          <button
            className={BUTTON}
            disabled={!canStartMission}
            onClick={() => {
              const result = useWorkplaceStore.getState().startMission(profile);
              setMissionFeedback(result.reason ?? null);
              if (result.changed) {
                useGameSimulationStore.getState().setGameSpeed(30);
                window.dispatchEvent(
                  new CustomEvent('millos:open-operations-workspace', { detail: 'autonomy' })
                );
              }
            }}
          >
            Start linked cooperative campaign
          </button>
          <p className="text-xs leading-5 text-slate-300">
            Opt in to three shifts with this customer delivery and a separate working agreement.
            Starting sets relaxed shift pace. Fictional roles only.
          </p>
        </div>
      )}
      {missionFeedback && (
        <p role="status" className="mt-2 text-xs text-amber-200">
          {missionFeedback}
        </p>
      )}
      <TeachingPace />
      <details className="mt-3">
        <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-cyan-200">
          Adjust the challenge
        </summary>
        <p className="mb-2 text-xs leading-5">
          New challenges allow {RECOVERY_CHALLENGE_WINDOW_MINUTES / 60} simulated hours to recover
          and dispatch up to {RECOVERY_CHALLENGE_TARGET_KG.toLocaleString()} kg of fresh,
          quality-released goods. Relaxed pace gives you more real time. Abandoning a challenge
          leaves its incident to recover; customer deadlines still apply.
        </p>
        {play.challenges.map((challenge) => (
          <div key={challenge.id} className="mb-2">
            <button
              className={BUTTON}
              disabled={!challenge.available}
              onClick={() => useOperationsCampaignStore.getState().startChallenge(challenge.id)}
            >
              {challenge.label}
            </button>
            {challenge.blockedReason && (
              <p className="mt-1 text-xs text-slate-300">{challenge.blockedReason}</p>
            )}
          </div>
        ))}
        {play.challengeProgress && (
          <div>
            <p className="text-xs">
              {play.challengeProgress.label}: {play.challengeProgress.dispatchedKg.toFixed(0)} /{' '}
              {play.challengeProgress.targetKg.toFixed(0)} kg,{' '}
              {Math.max(0, play.challengeProgress.remainingMinutes).toFixed(0)} simulation minutes
              left
            </p>
            <button
              className={`${BUTTON} mt-2`}
              onClick={() => useOperationsCampaignStore.getState().abandonChallenge()}
            >
              Abandon challenge
            </button>
          </div>
        )}
      </details>
      <LearningNote entryId="resource-tradeoffs" />
    </section>
  );
}

export function ShiftDebrief() {
  const workplace = useWorkplaceStore((s) => s.workplace);
  const reviewPending = linkedReviewPending(workplace);
  const reports = useOperationsCampaignStore((s) => s.reports);
  const canNext = useOperationsCampaignStore((s) => deriveOperationsPlay(s).canAcceptNextProgramme);
  return (
    <section aria-label="Saved shift reports" className={CARD}>
      <h3 className="font-semibold text-white">Shift debrief</h3>
      {reports.length === 0 ? (
        <p className="mt-2 text-xs text-slate-300">
          Your report is saved when the run window changes. Keep operating, or inspect freely at a
          slower pace.
        </p>
      ) : (
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-3 text-cyan-200">
            Read {reports.length} saved {reports.length === 1 ? 'report' : 'reports'}
          </summary>
          {reports
            .slice()
            .reverse()
            .map((report) => (
              <article key={report.id} className="mb-3 border-t border-slate-700 pt-3">
                <h4 className="font-semibold">
                  {report.shiftLabel}: grade {report.grade}
                </h4>
                <p className="mt-1 text-xs leading-5">{report.summary}</p>
                <ul className="mt-2 list-inside list-disc text-xs leading-5">
                  {report.gradeReasons?.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
                <details className="mt-2">
                  <summary className="min-h-11 cursor-pointer py-3 text-xs text-cyan-200">
                    Decisions during this shift
                  </summary>
                  {report.decisions?.length ? (
                    <ul className="list-inside list-disc text-xs leading-5">
                      {report.decisions.map((decision, index) => (
                        <li key={index}>{decision}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs">
                      {report.decisions
                        ? 'No recorded operational choices in this saved window.'
                        : 'Decisions were not saved with this report.'}
                    </p>
                  )}
                </details>
                {report.openRisks.length > 0 && (
                  <p className="text-xs text-amber-200">
                    Carry forward: {report.openRisks.join('; ')}
                  </p>
                )}
              </article>
            ))}
        </details>
      )}
      <WorkingAgreementSummary state={workplace} />
      <button
        className={`${BUTTON} mt-3`}
        disabled={!canNext || reviewPending}
        onClick={() => {
          if (!linkedReviewPending(useWorkplaceStore.getState().workplace))
            useOperationsCampaignStore.getState().acceptNextProgramme();
        }}
      >
        Accept next delivery programme
      </button>
      {(!canNext || reviewPending) && (
        <p className="mt-1 text-xs text-slate-300">
          Finish current customer commitments, any challenge and the linked final review with
          recovery and objections resolved first. A new programme continues this world without
          resetting it.
        </p>
      )}
    </section>
  );
}
