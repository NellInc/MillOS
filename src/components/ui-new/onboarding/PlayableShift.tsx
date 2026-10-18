import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Minimize2, X } from 'lucide-react';
import { useUIStore } from '../../../stores/uiStore';
import { useMobileControlStore } from '../../../stores/mobileControlStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import {
  improvementSummary,
  improvementObligations,
} from '../../../simulation/workplaceImprovement';
import { campaignOutcomes, campaignTotals } from '../../../simulation/workplaceCampaign';
import type { WorkplaceProfile, WorkplaceState } from '../../../types/workplace';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import {
  deriveOperationsPlay,
  RECOVERY_CHALLENGE_TARGET_KG,
  RECOVERY_CHALLENGE_WINDOW_MINUTES,
} from '../../../simulation/operationsPlay';
import { LearningNote } from '../../knowledge/LearningNote';
import { CAMERA_PRESETS, useCameraStore } from '../../CameraController';
import { deriveDeliveryDeadline, deriveDeliveryJourney } from './deliveryJourney';
import { MachineType, type MachineData } from '../../../types';
import type { CustomerOrder } from '../../../stores/operationsCampaignStore';
import { formatFixed, formatGrouped, useT } from '../../../i18n';
import { playableShiftMessages } from './PlayableShift.messages';

const BUTTON =
  'min-h-11 rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300';
const CARD = 'rounded-xl border border-cyan-400/20 bg-slate-900/90 p-3 text-sm text-slate-200';
// Short, wide screens put the lesson beside the soundtrack and above the dock.
// Working if compact pace remains visible at844x390 without covering either.
const JOURNEY_FRAME =
  'pointer-events-auto fixed bottom-[11.5rem] left-3 right-3 z-40 max-h-[calc(100dvh-20rem)] overflow-y-auto overscroll-contain rounded-xl border border-cyan-400/40 bg-slate-950/95 shadow-xl sm:left-5 sm:right-auto sm:w-[360px] [@media(min-width:640px)_and_(max-height:500px)]:left-auto [@media(min-width:640px)_and_(max-height:500px)]:right-5 [@media(min-width:640px)_and_(max-height:500px)]:bottom-28 [@media(min-width:640px)_and_(max-height:500px)]:max-h-[calc(100dvh-11rem)]';

function DeliveryDeadline({
  order,
  elapsedMinutes,
}: {
  order: CustomerOrder | null;
  elapsedMinutes: number;
}) {
  const t = useT(playableShiftMessages);
  const deadline = deriveDeliveryDeadline(order, elapsedMinutes);
  if (!deadline) return null;
  return (
    <p
      aria-label={t('deliveryDeadline')}
      className={`mt-1 text-xs tabular-nums ${deadline.overdue ? 'text-amber-200' : 'text-slate-300'}`}
    >
      {deadline.label}
    </p>
  );
}

export function TeachingPace() {
  const speed = useGameSimulationStore((s) => s.gameSpeed);
  const setSpeed = useGameSimulationStore((s) => s.setGameSpeed);
  const t = useT(playableShiftMessages);
  return (
    <label className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-300">
      {t('shiftPace')}
      <select
        aria-label={t('shiftPace')}
        value={[0, 30, 180].includes(speed) ? speed : 'custom'}
        onChange={(e) => setSpeed(Number(e.target.value))}
        className="min-h-11 rounded bg-slate-800 px-2 text-white"
      >
        {/* Production and trucks run in real seconds; customer deadlines run on
            this clock. Working if 30 reads as the feasible standard pace and 180
            warns that deadlines tighten, with option values unchanged. */}
        <option value={0}>{t('pacePaused')}</option>
        <option value={30}>{t('paceStandard')}</option>
        <option value={180}>{t('paceFast')}</option>
        {![0, 30, 180].includes(speed) && <option value="custom">{t('paceCustom')}</option>}
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
  const t = useT(playableShiftMessages);
  const ui = useUIStore(
    useShallow((s) => ({
      orderId: s.journeyOrderId,
      inspected: s.inspectedMachineIds.length > 0,
      record: s.recordMachineInspection,
      close: s.setJourneyVisible,
    }))
  );
  const campaign = useOperationsCampaignStore(
    useShallow((s) => ({
      orders: s.orders,
      execution: s.execution,
      activeOrderId: s.activeOrderId,
      constraints: s.constraints,
      incidents: s.incidents,
      elapsedMinutes: s.elapsedMinutes,
      activeChallenge: s.activeChallenge,
      challengeHistory: s.challengeHistory,
    }))
  );
  const order = campaign.orders.find((item) => item.id === ui.orderId) ?? null;
  const guide = deriveDeliveryJourney(order, campaign.execution, ui.inspected);
  const [sceneFocused, setSceneFocused] = useState(false);
  const expandButton = useRef<HTMLButtonElement>(null);
  const collapseButton = useRef<HTMLButtonElement>(null);
  const firstFocus = useRef(true);
  useEffect(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    (sceneFocused ? expandButton : collapseButton).current?.focus();
  }, [sceneFocused]);
  useEffect(() => setSceneFocused(false), [ui.orderId]);
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
      // Working if Escape closes an open sidebar or inspector before the guide.
      if (
        event.key !== 'Escape' ||
        document.querySelector('[role="dialog"], [role="menu"], #context-sidebar')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      ui.close(false);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [ui.close]);
  // Completion keeps its receipt available while yielding the foreground to
  // the live commitment. This projection never advances an order or a truck.
  // Working if a real fulfilment shows its receipt whether or not the
  // inspection step was done; inspection stays a separate milestone.
  const completed = order?.status === 'fulfilled';
  const play = deriveOperationsPlay(campaign);
  const compactWorkspace: 'overview' | 'scada' | null = completed
    ? ['quality', 'programme', 'acknowledge', 'mitigate', 'resume', 'resolve'].includes(
        play.nextAction.kind
      )
      ? 'overview'
      : 'scada'
    : guide.workspace;
  if (completed && !sceneFocused)
    return (
      <section aria-label={t('guidedDelivery')} className={`${JOURNEY_FRAME} p-4`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-white">{t('deliveryFulfilled')}</h2>
          <button
            ref={collapseButton}
            className={BUTTON}
            aria-label={t('compactGuide')}
            aria-expanded={true}
            onClick={() => setSceneFocused(true)}
          >
            <Minimize2 className="h-4 w-4" aria-hidden="true" />
          </button>
          <button className={BUTTON} aria-label={t('closeGuide')} onClick={() => ui.close(false)}>
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-200">
          {t('fulfilledDispatched', {
            customer: order.customer,
            kg: formatFixed(order.shippedKg, 0),
          })}
        </p>
        <p className="mt-3 text-sm font-semibold text-cyan-100" aria-live="polite">
          {play.nextAction.kind === 'programme' ? t('programmeComplete') : play.nextAction.label}
        </p>
        <p className="mt-1 text-xs leading-5 text-slate-300">
          {play.nextAction.kind === 'programme'
            ? t('programmeCompleteDetail')
            : play.nextAction.consequence}
        </p>
        <button
          className={`${BUTTON} mt-3`}
          onClick={() =>
            onOpenWorkspace(
              ['quality', 'programme', 'acknowledge', 'mitigate', 'resume', 'resolve'].includes(
                play.nextAction.kind
              )
                ? 'overview'
                : 'scada'
            )
          }
        >
          {play.nextAction.kind === 'programme'
            ? t('reviewShiftProgramme')
            : t('openCurrentOperations')}
        </button>
        <details className="mt-2 text-xs text-slate-300">
          <summary className="min-h-11 cursor-pointer py-3 text-cyan-200">
            {t('receiptAndLearning')}
          </summary>
          <p className="leading-5">{guide.detail}</p>
          <TeachingPace />
          <LearningNote entryId={guide.entryId} />
        </details>
      </section>
    );
  // Keep the live inspection effects mounted while making room for the scene.
  // Working if a scene shortcut reveals the machinery on a phone, selecting it
  // still records the real inspection, and Guide restores the full lesson.
  if (sceneFocused)
    return (
      <section aria-label={t('guidedDelivery')} className={`${JOURNEY_FRAME} p-3`}>
        <div className="flex items-center justify-between gap-3">
          <h2 aria-live="polite" className="min-w-0 flex-1 font-semibold text-white">
            {guide.title}
          </h2>
          <button
            className={`${BUTTON} shrink-0`}
            ref={expandButton}
            aria-expanded={false}
            aria-label={t('expandGuide')}
            onClick={() => setSceneFocused(false)}
          >
            {t('guide')}
          </button>
          <button
            className={`${BUTTON} shrink-0`}
            aria-label={t('closeGuide')}
            onClick={() => ui.close(false)}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <DeliveryDeadline order={order} elapsedMinutes={campaign.elapsedMinutes} />
        <p className="mt-1 text-xs leading-5 text-slate-300">
          {t('inspectionStatus', {
            inspection: ui.inspected ? t('inspectionRecorded') : t('inspectionWaiting'),
            delivery: t('kgDispatched', { kg: formatFixed(order?.shippedKg ?? 0, 0) }),
          })}
        </p>
        <TeachingPace />
        {compactWorkspace && (
          <button
            className={`${BUTTON} mt-2 w-full`}
            onClick={() => onOpenWorkspace(compactWorkspace)}
          >
            {completed
              ? t('reviewCurrentOperations')
              : compactWorkspace === 'overview'
                ? t('reviewDeliveryQc')
                : t('openScada')}
          </button>
        )}
        {!ui.inspected && (
          <p className="text-xs leading-5 text-cyan-200">{t('selectMachineHint')}</p>
        )}
      </section>
    );
  return (
    <section aria-label={t('guidedDelivery')} className={`${JOURNEY_FRAME} p-4`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-white">{t('firstDelivery')}</h2>
        <button
          ref={collapseButton}
          className={BUTTON}
          aria-label={t('compactGuide')}
          aria-expanded={true}
          onClick={() => setSceneFocused(true)}
        >
          <Minimize2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button className={BUTTON} aria-label={t('closeGuide')} onClick={() => ui.close(false)}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <p className="mt-2 text-xs text-cyan-200">
        {order
          ? t('orderLine', {
              customer: order.customer,
              kg: formatFixed(order.requiredKg, 0),
              product: order.recipe.label,
            })
          : t('awaitingOrder')}
      </p>
      <DeliveryDeadline order={order} elapsedMinutes={campaign.elapsedMinutes} />
      <h3 aria-live="polite" className="mt-3 font-semibold text-white">
        {guide.title}
      </h3>
      <p className="mt-2 text-sm leading-6 text-slate-200">{guide.detail}</p>
      {guide.loading && guide.loading.capacityKg > 0 && (
        <div className="mt-3">
          <p className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-cyan-100">
            <span>{t('truckLoad')}</span>
            <span className="tabular-nums">
              {t('truckLoadValue', {
                loaded: formatFixed(guide.loading.loadedKg, 0),
                capacity: formatFixed(guide.loading.capacityKg, 0),
              })}
            </span>
          </p>
          <progress
            aria-label={t('truckLoad')}
            aria-valuetext={t('truckLoadValueText', {
              loaded: formatFixed(guide.loading.loadedKg, 0),
              capacity: formatFixed(guide.loading.capacityKg, 0),
            })}
            max={guide.loading.capacityKg}
            value={guide.loading.loadedKg}
            className="mt-2 h-2 w-full overflow-hidden rounded-full border-0 bg-slate-700/80 [&::-moz-progress-bar]:bg-cyan-400 [&::-webkit-progress-bar]:bg-slate-700/80 [&::-webkit-progress-value]:bg-cyan-400"
          />
        </div>
      )}
      <p className="mt-2 text-xs text-slate-300">
        {t('inspectionStatus', {
          inspection: ui.inspected ? t('inspectionRecorded') : t('inspectionWaiting'),
          delivery:
            order?.status === 'fulfilled'
              ? t('deliveryStatusFulfilled')
              : t('kgDispatched', { kg: formatFixed(order?.shippedKg ?? 0, 0) }),
        })}
      </p>
      {/* The lesson's next actions stay pinned in the card's scroll box; pace,
          note and Skip keep their order below. Working if Show/Open stay
          visible at 1280x657 without scrolling the card. */}
      {(guide.view || guide.workspace) && (
        <div className="sticky bottom-0 -mx-4 mt-3 flex flex-wrap gap-2 border-t border-slate-800 bg-slate-950/95 px-4 py-3">
          {guide.view && (
            <button
              className={BUTTON}
              onClick={() => {
                // Reuse the actual site camera, without granting an inspection receipt.
                // The host hides this guide during first-person walking.
                if (useUIStore.getState().fpsMode) return;
                const index = CAMERA_PRESETS.findIndex((preset) => preset.name === guide.view);
                if (index >= 0) {
                  useCameraStore.getState().setPreset(index);
                  setSceneFocused(true);
                }
              }}
            >
              {guide.view === 'Milling'
                ? t('showMilling')
                : guide.view === 'Packing'
                  ? t('showPacking')
                  : t('showShipping')}
            </button>
          )}
          {guide.workspace && (
            <button className={BUTTON} onClick={() => onOpenWorkspace(guide.workspace!)}>
              {guide.workspace === 'scada' ? t('openScada') : t('openOverviewQc')}
            </button>
          )}
        </div>
      )}
      <TeachingPace />
      <LearningNote entryId={guide.entryId} />
      <button className={`${BUTTON} mt-3`} onClick={() => ui.close(false)}>
        {t('skipGuide')}
      </button>
    </section>
  );
}

function linkedReviewPending(state: WorkplaceState) {
  if (state.improvement)
    return (
      state.phase !== 'review' ||
      !state.improvement.verdict ||
      improvementObligations(state).length > 0
    );
  return (
    !!state.campaign?.mission &&
    (state.campaign.shift !== 2 ||
      state.phase !== 'review' ||
      state.members.some((member) => member.recoveryOwedMinutes > 0) ||
      state.objections.some((objection) => objection.status === 'open'))
  );
}

function WorkingAgreementSummary({ state }: { state: WorkplaceState }) {
  const t = useT(playableShiftMessages);
  const trial = improvementSummary(state);
  if (trial)
    return (
      <div className="mt-3 space-y-2 border-t border-slate-700 pt-3 text-xs leading-5">
        <h4 className="font-semibold text-white">{t('handoffAgreement')}</h4>
        <p>{trial.next}</p>
        <p>
          {t('trialReceipts', {
            kg: formatFixed(trial.actualKg, 0),
            pay: formatFixed(trial.lifetimeWages, 2),
          })}
        </p>
        {trial.remainingKg !== null && (
          <p>{t('trialRemaining', { kg: formatFixed(trial.remainingKg, 0) })}</p>
        )}
      </div>
    );
  if (!state.campaign?.mission) return null;
  const outcome = campaignOutcomes(state);
  const totals = campaignTotals(state);
  return (
    <div className="mt-3 space-y-2 border-t border-slate-700 pt-3 text-xs leading-5">
      <h4 className="font-semibold text-white">{t('linkedAgreement')}</h4>
      <p>
        {t('deliveryOutcome', {
          status: t('deliveryStatus', { status: outcome.delivery.status }),
          deliveredKg: formatFixed(outcome.delivery.deliveredKg, 0),
          targetKg: formatFixed(outcome.delivery.targetKg, 0),
          customer: outcome.delivery.customer,
        })}
      </p>
      {outcome.delivery.deferredKg > 0 && (
        <p>{t('agreedDeferral', { kg: formatFixed(outcome.delivery.deferredKg, 0) })}</p>
      )}
      <p>
        {t('remainingCommitment', { kg: formatFixed(outcome.delivery.remainingKg, 0) })}
        {outcome.delivery.remainingKg === 0 && t('fullCommitmentDispatched')}
      </p>
      <p>
        {t('agreementOutcome', {
          status: t('agreementStatus', { status: outcome.agreement.status }),
          combined: outcome.complete ? t('outcomeComplete') : t('outcomeUnfinished'),
        })}
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-cyan-200">
          {t('individualObligations')}
        </summary>
        {state.members.map((member) => (
          <p key={member.id}>
            {t('memberCurrent', {
              role: t('role', { role: member.role }),
              rest: formatFixed(member.restMinutes, 1),
              owed: formatFixed(member.recoveryOwedMinutes, 1),
            })}
          </p>
        ))}
        {totals.members.map((member) => (
          <p key={member.id}>
            {t('memberCumulative', {
              role: t('role', { role: member.role }),
              extra: formatFixed(member.extraMinutes, 1),
              rest: formatFixed(member.restMinutes, 1),
              owed: formatFixed(member.recoveryOwedMinutes, 1),
            })}
          </p>
        ))}
      </details>
      <p>
        {t('accounts', {
          cash: formatFixed(outcome.accounts.closingCash, 2),
          wages: formatFixed(outcome.accounts.wages, 2),
          compensation: formatFixed(outcome.accounts.compensation, 2),
          improvements: formatFixed(outcome.accounts.improvements, 2),
          allocations: formatFixed(outcome.accounts.allocations, 2),
        })}
      </p>

      <button
        className={BUTTON}
        onClick={() =>
          window.dispatchEvent(
            new CustomEvent('millos:open-operations-workspace', { detail: 'autonomy' })
          )
        }
      >
        {t('reviewAgreement')}
      </button>
    </div>
  );
}

export function OperationsPlayCard() {
  const t = useT(playableShiftMessages);
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
  const focusId = useUIStore((s) => s.operationalFocusId);
  const nextActionRef = useRef<HTMLButtonElement>(null);
  // Consume navigation only after the real control mounts, including lazy and
  // compact panels. Inspection never executes its action or advances the clock.
  // Working if the response is in view/focus and a stale/FPS request is discarded.
  useEffect(() => {
    if (!focusId) return;
    // Let the panel's own modal focus trap capture its return target first.
    const frame = requestAnimationFrame(() => {
      if (useUIStore.getState().operationalFocusId !== focusId) return;
      if (
        !useUIStore.getState().fpsMode &&
        useOperationsCampaignStore
          .getState()
          .incidents.some((incident) => incident.id === focusId && incident.phase !== 'resolved')
      ) {
        nextActionRef.current?.scrollIntoView?.({ block: 'center', behavior: 'instant' });
        nextActionRef.current?.focus({ preventScroll: true });
      }
      useUIStore.getState().setOperationalFocusId(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusId]);
  const workplace = useWorkplaceStore((s) => s.workplace);
  const [profile, setProfile] = useState<WorkplaceProfile>('toe-dip');
  const [missionFeedback, setMissionFeedback] = useState<string | null>(null);
  const reviewPending = linkedReviewPending(workplace);
  const gameSpeed = useGameSimulationStore((s) => s.gameSpeed);
  const play = deriveOperationsPlay(snapshot);
  const awaitingResponse = play.nextAction.kind === 'resume' && gameSpeed > 0;
  // Only an isolated dispatch or an empty recipe feed stops work; due, overdue,
  // storage and maintenance constraints call for attention. Working if a
  // critical constraint leads a warning and only real stops read 'Blocked'.
  const leadConstraint =
    play.blockers.find((constraint) => constraint.severity === 'critical') ?? play.blockers[0];
  const hardBlock =
    !!leadConstraint &&
    (leadConstraint.id === 'dispatch-isolated' || leadConstraint.id.startsWith('recipe-feed-'));
  const nextLabel = awaitingResponse ? t('awaitingUpdate') : play.nextAction.label;
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
    // The live action is rechecked at click time; the ordinary tick owns clock holds. Inspection never
    // resumes, and a running/custom pace is retained. Working if this explicit
    // choice changes only a paused shift's speed, with consequences processed
    // by the ordinary game tick before controller restoration becomes available.
    if (action.kind === 'resume') {
      const simulation = useGameSimulationStore.getState();
      if (simulation.gameSpeed === 0) simulation.setGameSpeed(30);
    }
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
    <section aria-label={t('shiftCommitment')} className={CARD}>
      <h3 className="font-semibold text-white">{t('shiftCommitment')}</h3>
      {snapshot.orders.some(
        (order) => order.status !== 'fulfilled' && order.status !== 'cancelled'
      ) && (
        <label className="mt-2 block text-xs text-slate-300">
          {t('activeCommitment')}
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
              {t('chooseCustomer')}
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
              ? t('switchChallengeHint')
              : reviewPending
                ? t('switchReviewHint')
                : t('switchHint')}
          </span>
        </label>
      )}
      <p className="mt-2">
        {play.activeOrder
          ? t('activeOrderProgress', {
              customer: play.activeOrder.customer,
              shippedKg: formatFixed(play.activeOrder.shippedKg, 0),
              requiredKg: formatFixed(play.activeOrder.requiredKg, 0),
            })
          : t('programmeCompleteCurrent')}
      </p>
      <DeliveryDeadline order={play.activeOrder} elapsedMinutes={snapshot.elapsedMinutes} />
      {leadConstraint && (
        <p className="mt-2 text-amber-200">
          {hardBlock ? t('blocked') : t('attention')}: {leadConstraint.label}.{' '}
          {leadConstraint.detail}
        </p>
      )}
      {play.challengeProgress && (
        <div
          role="group"
          aria-label={t('challengeProgress')}
          className="mt-3 border-t border-slate-700 pt-3"
        >
          <p className="text-xs leading-5">
            {t('challengeProgressLine', {
              label: play.challengeProgress.label,
              dispatchedKg: formatFixed(play.challengeProgress.dispatchedKg, 0),
              targetKg: formatFixed(play.challengeProgress.targetKg, 0),
              minutes: formatFixed(Math.max(0, play.challengeProgress.remainingMinutes), 0),
            })}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-300">
            {awaitingResponse ? t('responseQueued') : play.challengeProgress.instruction}
          </p>
        </div>
      )}
      <p className="mt-2 text-cyan-200">{t('nextLine', { label: nextLabel })}</p>
      <p className="mt-1 text-xs leading-5 text-slate-300">
        {awaitingResponse ? t('runningAtPace') : play.nextAction.consequence}
      </p>
      <button
        ref={nextActionRef}
        className={`${BUTTON} mt-2`}
        disabled={awaitingResponse || (play.nextAction.kind === 'programme' && reviewPending)}
        onClick={performNext}
      >
        {nextLabel}
      </button>
      <button
        className={`${BUTTON} mt-2`}
        onClick={() => {
          startJourney(play.activeOrder?.id ?? null);
          useMobileControlStore.getState().closeMobilePanel();
        }}
      >
        {t('replayGuide')}
      </button>
      {snapshot.challengeHistory.at(-1) && (
        <p className="mt-2 text-xs text-slate-300">
          {t('lastChallenge', {
            status: t('challengeStatus', { status: snapshot.challengeHistory.at(-1)!.status }),
          })}
        </p>
      )}
      <WorkingAgreementSummary state={workplace} />
      {workplace.phase === 'idle' && (
        <div className="mt-3 space-y-2 border-t border-slate-700 pt-3">
          <label className="block text-xs text-slate-300">
            {t('agreementProfile')}
            <select
              aria-label={t('agreementProfile')}
              value={profile}
              onChange={(event) => setProfile(event.target.value as WorkplaceProfile)}
              className="mt-1 min-h-11 w-full rounded border border-slate-600 bg-slate-800 px-2 text-white"
            >
              <option value="toe-dip">{t('profileToeDip')}</option>
              <option value="team">{t('profileTeam')}</option>
              <option value="cooperative">{t('profileCooperative')}</option>
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
            {t('startCampaign')}
          </button>
          <p className="text-xs leading-5 text-slate-300">{t('campaignOptIn')}</p>
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
          {t('adjustChallenge')}
        </summary>
        <p className="mb-2 text-xs leading-5">
          {t('challengeRules', {
            hours: formatFixed(RECOVERY_CHALLENGE_WINDOW_MINUTES / 60, 0),
            kg: formatGrouped(RECOVERY_CHALLENGE_TARGET_KG),
          })}
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
          <button
            className={`${BUTTON} mt-2`}
            onClick={() => useOperationsCampaignStore.getState().abandonChallenge()}
          >
            {t('abandonChallenge')}
          </button>
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
  const t = useT(playableShiftMessages);
  return (
    <section aria-label={t('savedReports')} className={CARD}>
      <h3 className="font-semibold text-white">{t('shiftDebrief')}</h3>
      {reports.length === 0 ? (
        <p className="mt-2 text-xs text-slate-300">{t('noReports')}</p>
      ) : (
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-3 text-cyan-200">
            {t('readReports', { count: reports.length, countText: formatFixed(reports.length, 0) })}
          </summary>
          {reports
            .slice()
            .reverse()
            .map((report) => (
              <article key={report.id} className="mb-3 border-t border-slate-700 pt-3">
                <h4 className="font-semibold">
                  {t('reportHeading', { shift: report.shiftLabel, grade: report.grade })}
                </h4>
                <p className="mt-1 text-xs leading-5">{report.summary}</p>
                <ul className="mt-2 list-inside list-disc text-xs leading-5">
                  {report.gradeReasons?.map((reason, index) => (
                    <li key={index}>{reason}</li>
                  ))}
                </ul>
                <details className="mt-2">
                  <summary className="min-h-11 cursor-pointer py-3 text-xs text-cyan-200">
                    {t('decisionsHeading')}
                  </summary>
                  {report.decisions?.length ? (
                    <ul className="list-inside list-disc text-xs leading-5">
                      {report.decisions.map((decision, index) => (
                        <li key={index}>{decision}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs">
                      {report.decisions ? t('noDecisions') : t('decisionsNotSaved')}
                    </p>
                  )}
                </details>
                {report.openRisks.length > 0 && (
                  <p className="text-xs text-amber-200">
                    {t('carryForward', { risks: report.openRisks.join('; ') })}
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
        {t('acceptNextProgramme')}
      </button>
      {(!canNext || reviewPending) && (
        <p className="mt-1 text-xs text-slate-300">{t('acceptNextHint')}</p>
      )}
    </section>
  );
}
