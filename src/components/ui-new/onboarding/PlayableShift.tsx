import { useEffect, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Minimize2, X } from 'lucide-react';
import { useUIStore } from '../../../stores/uiStore';
import { useMobileControlStore } from '../../../stores/mobileControlStore';
import {
  selectChosenPace,
  selectClockHolder,
  SHIFT_CLOSING_TIME,
  useGameSimulationStore,
} from '../../../stores/gameSimulationStore';
import { isPaceGameSpeed, PACE_GAME_SPEEDS, STANDARD_GAME_SPEED } from '../../../simulation/pace';
import { paceMessages } from '../../../simulation/pace.messages';
import { WorkplaceLeaveSeason } from '../widgets/WorkplaceCampaignArchive';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import {
  improvementSummary,
  improvementObligations,
} from '../../../simulation/workplaceImprovement';
import { campaignOutcomes, campaignTotals } from '../../../simulation/workplaceCampaign';
import type { WorkplaceProfile, WorkplaceState } from '../../../types/workplace';
import {
  selectProvisionalShiftReport,
  useOperationsCampaignStore,
} from '../../../stores/operationsCampaignStore';
import { useTruckScheduleStore } from '../../../stores/truckScheduleStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import {
  deriveOperationsPlay,
  RECOVERY_CHALLENGE_TARGET_KG,
  RECOVERY_CHALLENGE_WINDOW_MINUTES,
} from '../../../simulation/operationsPlay';
import { LearningNote } from '../../knowledge/LearningNote';
import { CAMERA_PRESETS, useCameraStore } from '../../CameraController';
import { deriveDeliveryDeadline, deriveDeliveryJourney } from './deliveryJourney';
import { MachineType, type MachineData } from '../../../types';
import type { CustomerOrder, ShiftCampaignReport } from '../../../stores/operationsCampaignStore';
import { formatFixed, formatGrouped, useLocale, useT } from '../../../i18n';
import {
  describeOrderOutcome,
  describeShiftGap,
  describeShiftTryNext,
  shiftGradeReasons,
  shiftHeadline,
  shiftWindowName,
} from '../../../simulation/shiftReview';
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

/** Names who holds the clock, beside every pace control. A player pause needs no note. */
export function PaceHoldNote() {
  const holder = useGameSimulationStore(selectClockHolder);
  const pace = useT(paceMessages);
  if (!holder || holder === 'player') return null;
  return (
    <p className="mt-1 text-xs leading-5 text-amber-200" aria-live="polite">
      {pace(`heldBy_${holder}`)}
    </p>
  );
}

export function TeachingPace() {
  const setSpeed = useGameSimulationStore((s) => s.setGameSpeed);
  const t = useT(playableShiftMessages);
  const pace = useT(paceMessages);
  const shown = useGameSimulationStore(selectChosenPace);
  const known = isPaceGameSpeed(shown);
  return (
    <div className="mt-3">
      <label className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
        {t('shiftPace')}
        {/* One time model (src/simulation/pace.ts): a pace scales the clock,
            deadlines, production and vehicles together, so no option needs a
            caveat. Working if every option keeps the first delivery winnable. */}
        <select
          aria-label={t('shiftPace')}
          title={pace('paceTitle')}
          value={known ? shown : 'custom'}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="min-h-11 rounded bg-slate-800 px-2 text-white"
        >
          {PACE_GAME_SPEEDS.map((value) => (
            <option key={value} value={value}>
              {pace(`pace${value}`)}
            </option>
          ))}
          {!known && <option value="custom">{pace('paceCustom')}</option>}
        </select>
      </label>
      <PaceHoldNote />
    </div>
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
  const locale = useLocale();
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
  const shippingTruck = useTruckScheduleStore(
    useShallow((s) => ({
      active: s.truckSchedule.shipping.truckActive,
      docked: s.truckSchedule.shipping.truckDocked,
      nextArrivalMinutes: Math.ceil(s.truckSchedule.shipping.nextArrivalMinutes),
    }))
  );
  // The oldest open work order, so the guide can turn to the repair.
  const fault = useBreakdownStore(
    useShallow((s) => {
      const open = s.workOrders.find((workOrder) => workOrder.phase !== 'returned_to_service');
      return { machineName: open?.machineName ?? '', workOrderId: open?.id ?? '' };
    })
  );
  const order = campaign.orders.find((item) => item.id === ui.orderId) ?? null;
  const guide = deriveDeliveryJourney(
    order,
    campaign.execution,
    ui.inspected,
    shippingTruck,
    fault.workOrderId ? fault : null
  );
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
  // Opening Overview for a repair also lands on its maintenance section.
  const openWorkspace = (mode: 'scada' | 'overview') => {
    if (
      mode === 'overview' &&
      (guide.focus === 'maintenance' || (completed && play.nextAction.kind === 'repair'))
    )
      useUIStore.getState().requestMaintenanceFocus();
    onOpenWorkspace(mode);
  };
  const compactWorkspace: 'overview' | 'scada' | null = completed
    ? ['quality', 'programme', 'acknowledge', 'mitigate', 'resume', 'resolve', 'repair'].includes(
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
          {order.completedAtMinute !== null
            ? describeOrderOutcome(
                { ...order, completedAtMinute: order.completedAtMinute },
                campaign.elapsedMinutes,
                locale
              )
            : t('fulfilledDispatched', {
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
            openWorkspace(
              [
                'quality',
                'programme',
                'acknowledge',
                'mitigate',
                'resume',
                'resolve',
                'repair',
              ].includes(play.nextAction.kind)
                ? 'overview'
                : 'scada'
            )
          }
        >
          {play.nextAction.kind === 'programme'
            ? t('reviewShiftProgramme')
            : compactWorkspace === 'overview'
              ? t('openOverview')
              : t('openScada')}
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
            onClick={() => openWorkspace(compactWorkspace)}
          >
            {compactWorkspace === 'overview'
              ? completed
                ? t('openOverview')
                : t('reviewDeliveryQc')
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
      {/* Pace sits with the deadline it is read against, above the fold, so it
          is visible at 1366x768 without scrolling the card. */}
      <TeachingPace />
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
      {/* The lesson's next actions stay pinned in the card's scroll box; the
          note and Skip keep their order below. The sticky edge is inset by the
          card's 1rem padding, so the row pins into it and covers it: nothing
          scrolls half-visible beneath the buttons. Working if Show/Open stay
          visible at 1280x657 without scrolling the card, with no text under them. */}
      {(guide.view || guide.workspace) && (
        <div className="sticky bottom-[-1rem] -mx-4 mt-3 flex flex-wrap gap-2 border-t border-slate-800 bg-slate-950 px-4 pt-3 pb-7">
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
            <button className={BUTTON} onClick={() => openWorkspace(guide.workspace!)}>
              {guide.workspace === 'scada' ? t('openScada') : t('openOverviewQc')}
            </button>
          )}
        </div>
      )}
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

function WorkingAgreementSummary({
  state,
  onLeft,
}: {
  state: WorkplaceState;
  onLeft?: (message: string) => void;
}) {
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
      {state.campaign.followOn && (
        <p>
          {t('followOnCredit', {
            customer: state.campaign.followOn.customer,
            kg: formatFixed(state.campaign.followOn.creditedKg, 0),
          })}
        </p>
      )}
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
      <WorkplaceLeaveSeason onLeft={onLeft} />
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
  // Rates keep their reference while unchanged, and the shift total is read in
  // whole pounds, so the card does not re-render on every tick.
  const costRates = useOperationsCampaignStore((s) => s.costRates);
  const shiftFailureCost = useOperationsCampaignStore((s) =>
    Math.round(
      s.shiftMetrics.latePenalties + s.shiftMetrics.maintenanceCost + s.shiftMetrics.demurrageCost
    )
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
      state.acknowledgeIncident(action.targetId, 'operator');
    if (action.kind === 'mitigate' && action.targetId)
      state.mitigateIncident(action.targetId, 'operator');
    // The live action is rechecked at click time; the ordinary tick owns clock holds. Inspection never
    // resumes, and a running/custom pace is retained. Working if this explicit
    // choice changes only a paused shift's speed, with consequences processed
    // by the ordinary game tick before controller restoration becomes available.
    if (action.kind === 'resume') {
      const simulation = useGameSimulationStore.getState();
      if (simulation.gameSpeed === 0) simulation.setGameSpeed(STANDARD_GAME_SPEED);
    }
    if (action.kind === 'resolve') state.finishChallengeRecovery('operator');
    if (action.kind === 'programme' && !linkedReviewPending(useWorkplaceStore.getState().workplace))
      state.acceptNextProgramme('operator');
    if (action.kind === 'repair') useUIStore.getState().requestMaintenanceFocus();
    if (['quality', 'repair', 'receiving', 'dispatch', 'production'].includes(action.kind)) {
      window.dispatchEvent(
        new CustomEvent('millos:open-operations-workspace', {
          detail: action.kind === 'quality' || action.kind === 'repair' ? 'overview' : 'scada',
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
                current.activateOrder(event.target.value, 'operator');
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
      {/* What each failure is costing now, from the rates the tick books.
          Working if an overdue order, an open work order or a held truck shows
          its price on the card before the shift report does. */}
      {(costRates.late > 0 ||
        costRates.maintenance > 0 ||
        costRates.demurrage > 0 ||
        shiftFailureCost > 0) && (
        <div role="group" aria-label={t('failureCosts')} className="mt-2 text-xs leading-5">
          <p className="font-semibold text-amber-100">{t('failureCosts')}</p>
          {costRates.late > 0 && <p>{t('costLate', { rate: formatFixed(costRates.late, 2) })}</p>}
          {costRates.maintenance > 0 && (
            <p>{t('costMaintenance', { rate: formatFixed(costRates.maintenance, 2) })}</p>
          )}
          {costRates.demurrage > 0 && (
            <p>{t('costDemurrage', { rate: formatFixed(costRates.demurrage, 2) })}</p>
          )}
          {shiftFailureCost > 0 && (
            <p className="text-slate-300">
              {t('costShiftTotal', { total: formatGrouped(shiftFailureCost) })}
            </p>
          )}
        </div>
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
      <WorkingAgreementSummary state={workplace} onLeft={setMissionFeedback} />
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
                useGameSimulationStore.getState().setGameSpeed(STANDARD_GAME_SPEED);
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
              onClick={() =>
                useOperationsCampaignStore.getState().startChallenge(challenge.id, 'operator')
              }
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
            onClick={() => useOperationsCampaignStore.getState().abandonChallenge('operator')}
          >
            {t('abandonChallenge')}
          </button>
        )}
      </details>
      <LearningNote entryId="resource-tradeoffs" />
    </section>
  );
}

/**
 * One shift report. A report written by store v3 carries its evidence, so its
 * headline, reasons, order lines, gap and next step render in the reader's
 * language; an older report shows the text it was saved with.
 * Working if a report says which orders were on time, what held the grade
 * back and one thing to try next, in English and in Brazilian Portuguese.
 */
function ShiftReportArticle({
  report,
  provisional = false,
}: {
  report: ShiftCampaignReport;
  provisional?: boolean;
}) {
  const t = useT(playableShiftMessages);
  const locale = useLocale();
  const basis = report.gradeBasis;
  const shift = shiftWindowName(report.shiftKey, report.shiftLabel, locale);
  const reasons = basis ? shiftGradeReasons(basis, locale) : (report.gradeReasons ?? []);
  const summary = basis ? shiftHeadline(basis, report.grade, locale) : report.summary;
  const gap = basis ? describeShiftGap(basis, report.grade, locale) : null;
  const tryNext = basis ? describeShiftTryNext(basis, report.grade, locale) : null;
  return (
    <article className="mb-3 border-t border-slate-700 pt-3">
      <h4 className="font-semibold">
        {provisional
          ? report.grade === null
            ? t('reportHeadingProvisionalUngraded', { shift })
            : t('reportHeadingProvisional', { shift, grade: report.grade })
          : report.grade === null
            ? t('reportHeadingUngraded', { shift })
            : t('reportHeading', { shift, grade: report.grade })}
      </h4>
      {provisional && <p className="mt-1 text-xs text-slate-300">{t('provisionalNote')}</p>}
      {/* Older C to F reports saved their reasons as the summary too. */}
      {summary !== reasons.join(' ') && <p className="mt-1 text-xs leading-5">{summary}</p>}
      <ul className="mt-2 list-inside list-disc text-xs leading-5">
        {reasons.map((reason, index) => (
          <li key={index}>{reason}</li>
        ))}
      </ul>
      {report.orderOutcomes && report.orderOutcomes.length > 0 && (
        <>
          <h5 className="mt-2 text-xs font-semibold text-white">{t('ordersHeading')}</h5>
          <ul className="list-inside list-disc text-xs leading-5">
            {report.orderOutcomes.map((outcome) => (
              <li key={outcome.id}>
                {describeOrderOutcome(outcome, report.endedAtMinute, locale)}
              </li>
            ))}
          </ul>
        </>
      )}
      {gap && <p className="mt-2 text-xs leading-5">{gap}</p>}
      {tryNext && <p className="mt-1 text-xs leading-5 text-cyan-100">{tryNext}</p>}
      {report.choices ? (
        <>
          <h5 className="mt-2 text-xs font-semibold text-white">{t('choicesHeading')}</h5>
          {report.choices.length ? (
            <ul className="list-inside list-disc text-xs leading-5">
              {report.choices.map((choice, index) => (
                <li key={index}>
                  {choice.actor === 'agent'
                    ? t('agentChoice', { message: choice.message })
                    : choice.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs">{t('noChoices')}</p>
          )}
          {report.narration && report.narration.length > 0 && (
            <details className="mt-2">
              <summary className="min-h-11 cursor-pointer py-3 text-xs text-cyan-200">
                {t('narrationHeading')}
              </summary>
              <ul className="list-inside list-disc text-xs leading-5">
                {report.narration.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        // Saved before choices were told apart from narration: a log, not decisions.
        <details className="mt-2">
          <summary className="min-h-11 cursor-pointer py-3 text-xs text-cyan-200">
            {t('shiftLogHeading')}
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
      )}
      {report.openRisks.length > 0 && (
        <p className="text-xs text-amber-200">
          {t('carryForward', { risks: report.openRisks.join('; ') })}
        </p>
      )}
    </article>
  );
}

export function ShiftDebrief() {
  const workplace = useWorkplaceStore((s) => s.workplace);
  const reviewPending = linkedReviewPending(workplace);
  const reports = useOperationsCampaignStore((s) => s.reports);
  const canNext = useOperationsCampaignStore((s) => deriveOperationsPlay(s).canAcceptNextProgramme);
  const t = useT(playableShiftMessages);
  const open = useOperationsCampaignStore(
    useShallow((s) => ({
      currentShiftKey: s.currentShiftKey,
      currentShiftLabel: s.currentShiftLabel,
      shiftStartedAtMinute: s.shiftStartedAtMinute,
      elapsedMinutes: s.elapsedMinutes,
      shiftMetrics: s.shiftMetrics,
      orders: s.orders,
      logbook: s.logbook,
      constraints: s.constraints,
      incidents: s.incidents,
    }))
  );
  const provisional = selectProvisionalShiftReport(open);
  // The shift label, not the clock: this re-renders three times a day, not every tick.
  const currentShift = useGameSimulationStore((s) => s.currentShift);
  return (
    <section aria-label={t('savedReports')} className={CARD}>
      <h3 className="font-semibold text-white">{t('shiftDebrief')}</h3>
      {provisional && <ShiftReportArticle report={provisional} provisional />}
      {/* The newest closed shift is in view; older ones stay one click away.
          Working if a shift that just closed is readable without expanding. */}
      {reports.length === 0 ? (
        <p className="mt-2 text-xs text-slate-300">
          {t('noReports', { shift: currentShift, time: SHIFT_CLOSING_TIME[currentShift] })}
        </p>
      ) : (
        <>
          <ShiftReportArticle report={reports[reports.length - 1]} />
          {reports.length > 1 && (
            <details className="mt-2">
              <summary className="min-h-11 cursor-pointer py-3 text-cyan-200">
                {t('readEarlierReports', {
                  count: reports.length - 1,
                  countText: formatFixed(reports.length - 1, 0),
                })}
              </summary>
              {reports
                .slice(0, -1)
                .reverse()
                .map((report) => (
                  <ShiftReportArticle key={report.id} report={report} />
                ))}
            </details>
          )}
        </>
      )}
      <WorkingAgreementSummary state={workplace} />
      <button
        className={`${BUTTON} mt-3`}
        disabled={!canNext || reviewPending}
        onClick={() => {
          if (!linkedReviewPending(useWorkplaceStore.getState().workplace))
            useOperationsCampaignStore.getState().acceptNextProgramme('operator');
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
