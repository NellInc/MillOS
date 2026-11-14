import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import {
  ClipboardList,
  ShieldCheck,
  ShieldAlert,
  Bell,
  Activity as ActivityIcon,
  X,
  CheckCircle,
  GripVertical,
  Wrench,
  Bot,
} from 'lucide-react';
import { computeSafetyScore, useSafetyStore } from '../../../stores/safetyStore';
import { useFPSStore } from '../../FPSMonitor';
import { useUIStore } from '../../../stores/uiStore';
import { useProductionStore, wearHoldsWarning } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { openMachineService, openRepairWorkspace } from '../openRepairWorkspace';
import {
  LINE_RESTART_ALERT_ID,
  selectClockHolder,
  useGameSimulationStore,
} from '../../../stores/gameSimulationStore';
import { paceMessages } from '../../../simulation/pace.messages';
import { closesAtMinute } from '../../../simulation/partnerProposals';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { openProgramme } from '../../../stores/programmeCommitment';
import { deriveDeliveryDeadline, shownShippedKg } from '../onboarding/deliveryJourney';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { workplaceCapacity } from '../../../simulation/bilateralWorkplace';
import { improvementCapacity } from '../../../simulation/workplaceImprovement';
import type { WorkplaceState } from '../../../types/workplace';
import { useShallow } from 'zustand/react/shallow';
import { formatFixed, formatGrouped, useLocale, useT } from '../../../i18n';
import { statusHudMessages } from './StatusHUD.messages';
import { formatPlantStamp, formatTime } from '../../../utils/timeFormatting';
import { alertText } from '../../../i18n/alertCopy';
import type { AlertData } from '../../../types';
import { customerDisplayName } from '../../../stores/customerNames';
import { usePartnerProposalStore } from '../../../stores/partnerProposalStore';
import { openProposalCard } from '../../proposalCardFocus';

/** The bell id of an asked card (partnerProposalRuntime, incidentRuntime, temperRuntime). */
const PROPOSAL_ALERT_PREFIX = 'partner-proposal-';

const SHIFT_KEYS = {
  morning: 'shiftMorning',
  afternoon: 'shiftAfternoon',
  night: 'shiftNight',
} as const;

/**
 * The cooperative plan multiplies the plant rate (UnifiedGameTick), so the
 * rate beside it says why it reads lower: the agreed pace while a shift runs
 * below the plant rate, null at or above it. D4: the season's plans run at the
 * plant rate (1.0), so in a season only the Monday inspection hold shows. The
 * handoff experiment still paces below it, and while it continues to its
 * review the chip reads 'between' instead of blinking out between shifts.
 * Working if a steady shift shows nothing, the inspection hold shows 0%, a
 * stopped handoff shows 78% and then between shifts, and nothing shows once
 * it ends.
 */
function agreementPacingReading(s: WorkplaceState): number | 'between' | null {
  if (s.mode !== 'game' || s.phase === 'idle') return null;
  if (s.phase === 'active') {
    const pace = workplaceCapacity(s);
    return pace < 1 ? pace : null;
  }
  if (!s.improvement || (s.phase === 'review' && s.improvement.verdict)) return null;
  // The pace the experiment settles at once any briefing is over.
  const settled = improvementCapacity({ ...s, phase: 'active' }, Number.POSITIVE_INFINITY);
  return settled !== null && settled < 1 ? 'between' : null;
}

export const StatusHUD: React.FC<{
  workspace?: string;
  /** Selects a machine, as clicking it does, so its Inspector opens. */
  onFocusMachine?: (machineId: string) => void;
  /**
   * The compact layout's bar: only the bell (the same notices) and the chip
   * naming what holds the clock. A phone has no room for the metrics row.
   */
  compact?: boolean;
}> = ({ workspace: workspaceProp, onFocusMachine, compact = false }) => {
  const t = useT(statusHudMessages);
  const workspace = workspaceProp ?? t('defaultWorkspace');
  const safetyMetrics = useSafetyStore((state) => state.safetyMetrics);
  const fps = useFPSStore((state) => state.fps);
  const alerts = useUIStore((state) => state.alerts);
  const showFPSCounter = useUIStore((state) => state.showFPSCounter);
  const acknowledgeAlert = useUIStore((state) => state.acknowledgeAlert);
  const removeAlert = useUIStore((state) => state.removeAlert);
  const throughput = useProductionStore((state) => state.metrics.throughput);
  // The goal is the running programme's committed kilograms (D11), not a daily
  // bag count: stock packed for no customer counts for nothing. The tonnes and
  // their rounding are openProgramme's, as every other surface shows them.
  // Working if the guided programme reads 0.0 / 18.0 t and nothing shows once
  // it is all delivered and the next is not yet accepted.
  const programme = useOperationsCampaignStore(useShallow((state) => openProgramme(state.orders)));
  // The active commitment replaces the constant 'SCADA SIMULATED' (whose
  // state the SCADA workspace shows): the customer, shipped of required and
  // the time due, as the guide and the shift card word them. Clicking it opens
  // Overview, whose shift card leads with the commitment. No order, nothing.
  // Working if, with the guide closed, the order can be named from the HUD.
  const activeOrder = useOperationsCampaignStore((state) => {
    const order = state.orders.find((item) => item.id === state.activeOrderId);
    return order && order.status !== 'fulfilled' && order.status !== 'cancelled' ? order : null;
  });
  const elapsedMinutes = useOperationsCampaignStore((state) => state.elapsedMinutes);
  const commitmentDeadline = deriveDeliveryDeadline(activeOrder, elapsedMinutes);
  const { gameTime, currentShift } = useGameSimulationStore(
    useShallow((state) => ({
      gameTime: state.gameTime,
      currentShift: state.currentShift,
    }))
  );
  // The P notice fades and the delivery card's pace control goes with the
  // card, so the clock reads as a state here for as long as it is held,
  // naming the holder; the full sentence (how it resumes) is its label.
  // Working if a pause by any control shows until the clock runs again.
  const clockHolder = useGameSimulationStore(selectClockHolder);
  const pace = useT(paceMessages);
  // The order feed budget (materialFlowStore) admits no more grain once the
  // active order's whole remaining mass is packed or in process, and packed
  // stock stays committed until its truck departs. The line then reads
  // '0 bags/h' with a still target by design; say so instead of looking frozen.
  // Working if the hint shows only while output is 0 and the unshipped
  // remainder of an open order is already packed (1 kg bag-carry tolerance).
  const orderPackedAwaitingTruck = useOperationsCampaignStore((state) => {
    const execution = state.execution;
    return (
      !!execution?.orderId &&
      execution.stage !== 'fulfilled' &&
      execution.remainingKg > 1 &&
      execution.finishedAvailableKg >= execution.remainingKg - 1
    );
  });
  // Once the remainder is packed the line pre-stages the next commitment, so
  // a zero rate then means the line is filling with that order's grain.
  const prestagingCustomer = useOperationsCampaignStore(
    (state) => state.execution?.lineCustomer ?? null
  );
  // No bag rate shows (the target is tonnes, D11); the raw rate still says
  // whether the line is idle.
  const lineIdleAwaitingTruck = throughput <= 0 && orderPackedAwaitingTruck;
  const lineChangingOver = lineIdleAwaitingTruck && !!prestagingCustomer;
  const agreementPacing = useWorkplaceStore((state) => agreementPacingReading(state.workplace));

  const [showNotifications, setShowNotifications] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const notificationsCloseRef = useRef<HTMLButtonElement>(null);
  const [notificationPosition, setNotificationPosition] = useState({
    left: 16,
    top: 72,
    width: 320,
    short: false,
  });

  // The default is a full-width header; dragging detaches the same controls.
  const [detached, setDetached] = useState(false);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const elementStartPos = useRef({ x: 0, y: 0 });

  // Count unacknowledged alerts. A success (an achievement, a finished
  // repair) is a record, not something to act on: it is listed but never
  // unread, so the badge only counts what needs reading.
  // Working if two achievement unlocks leave the badge at zero.
  const unread = (alert: (typeof alerts)[number]) =>
    !alert.acknowledged && alert.type !== 'success';
  const unacknowledgedCount = alerts.filter(unread).length;

  // Machines a notification can send the player to repair, read live so a
  // notice about a machine already back in service offers nothing: an open
  // fault, a breakdown, or wear holding a warning. Joined strings keep the
  // selectors stable while wear creeps up every tick.
  const faultedIds = useBreakdownStore((state) =>
    state.activeBreakdowns.map((breakdown) => breakdown.machineId).join('|')
  );
  const wornIds = useProductionStore((state) =>
    state.machines
      .filter((machine) => machine.status === 'critical' || wearHoldsWarning(machine))
      .map((machine) => machine.id)
      .join('|')
  );
  const repairableIds = new Set(`${faultedIds}|${wornIds}`.split('|').filter(Boolean));
  // A fault is repaired through its work order, so its notice opens the work
  // orders. Wear alone is serviced at the unit: its notice opens the unit's
  // Inspector on Maintain, the one-part service. Read live at the press, so a
  // wear notice whose unit has since broken down goes to the repair.
  // Working if a wear notice lands on Maintain and a fault's on the work orders.
  const openRepairFor = (machineId: string) => {
    rowRouted.current = true;
    setShowNotifications(false);
    const unit = useProductionStore.getState().machines.find((m) => m.id === machineId);
    const faulted =
      Boolean(useBreakdownStore.getState().getBreakdownForMachine(machineId)) ||
      unit?.status === 'critical';
    if (faulted || !onFocusMachine) openRepairWorkspace();
    else openMachineService(machineId, onFocusMachine);
  };

  // Pointer events, so a finger or pen drags the grip as a mouse does: a
  // tablet wide enough for this header sends no mouse events during a drag,
  // and a tap's compatibility mousedown detached the bar where touch could
  // neither move it nor dock it again. The bar detaches once the grip moves,
  // so a press that does not drag leaves it where it is.
  // Working if a finger drags the bar and a tap leaves it docked.
  const dragMovedRef = useRef(false);
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      setIsDragging(true);
      dragMovedRef.current = false;
      dragStartPos.current = { x: e.clientX, y: e.clientY };
      elementStartPos.current = { x: position.x, y: position.y };
    },
    [position]
  );

  // Handle keyboard repositioning on grip (WCAG 2.1.1 - keyboard operable)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Home') {
      e.preventDefault();
      setDetached(false);
      setPosition({ x: 16, y: 16 });
      return;
    }
    const NUDGE = e.shiftKey ? 20 : 4;
    let dx = 0;
    let dy = 0;
    switch (e.key) {
      case 'ArrowLeft':
        dx = -NUDGE;
        break;
      case 'ArrowRight':
        dx = NUDGE;
        break;
      case 'ArrowUp':
        dy = -NUDGE;
        break;
      case 'ArrowDown':
        dy = NUDGE;
        break;
      default:
        return;
    }
    e.preventDefault();
    setDetached(true);
    const rect = hudRef.current?.getBoundingClientRect();
    const maxX = window.innerWidth - (rect?.width ?? 200) - 16;
    const maxY = window.innerHeight - (rect?.height ?? 50) - 16;
    setPosition((prev) => ({
      x: Math.max(16, Math.min(maxX, prev.x + dx)),
      y: Math.max(16, Math.min(maxY, prev.y + dy)),
    }));
  }, []);

  // Re-clamp when the window shrinks, or a HUD dragged to the right edge
  // ends up off-screen with no handle to drag it back.
  useEffect(() => {
    const clampToViewport = () => {
      const rect = hudRef.current?.getBoundingClientRect();
      const maxX = window.innerWidth - (rect?.width ?? 200) - 16;
      const maxY = window.innerHeight - (rect?.height ?? 50) - 16;
      setPosition((prev) => ({
        x: Math.max(16, Math.min(maxX, prev.x)),
        y: Math.max(16, Math.min(maxY, prev.y)),
      }));
    };
    window.addEventListener('resize', clampToViewport);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(clampToViewport);
    if (hudRef.current) observer?.observe(hudRef.current);
    return () => {
      window.removeEventListener('resize', clampToViewport);
      observer?.disconnect();
    };
  }, []);

  // Handle pointer move while dragging
  useEffect(() => {
    if (!isDragging) return;

    const handlePointerMove = (e: PointerEvent) => {
      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;
      // A few pixels of jitter in a tap or click is not a drag.
      if (!dragMovedRef.current && Math.hypot(deltaX, deltaY) < 4) return;
      dragMovedRef.current = true;
      setDetached(true);
      const newX = elementStartPos.current.x + deltaX;
      const newY = elementStartPos.current.y + deltaY;

      // Constrain to viewport
      const rect = hudRef.current?.getBoundingClientRect();
      const maxX = window.innerWidth - (rect?.width ?? 200) - 16;
      const maxY = window.innerHeight - (rect?.height ?? 50) - 16;
      setPosition({
        x: Math.max(16, Math.min(maxX, newX)),
        y: Math.max(16, Math.min(maxY, newY)),
      });
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDragging]);

  // Keep the notification surface in the viewport even after the HUD is moved.
  useEffect(() => {
    if (!showNotifications) return;
    const placeNotifications = () => {
      const rect = bellRef.current?.getBoundingClientRect();
      if (!rect) return;
      // A landscape phone (844 x 390) showed one notice per view: on a short,
      // wide viewport the list is wider, so each notice's actions sit beside
      // its text, and "Mark all as read" moves into the header.
      const short = compact && window.innerHeight <= 500 && window.innerWidth > window.innerHeight;
      const width = Math.min(short ? 480 : 320, window.innerWidth - 32);
      setNotificationPosition({
        left: Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16)),
        top: Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 384)),
        width,
        short,
      });
    };
    placeNotifications();
    window.addEventListener('resize', placeNotifications);
    return () => window.removeEventListener('resize', placeNotifications);
  }, [showNotifications, position, compact]);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // A click in a modal opened over the list (the ? help, Reset, About) or
      // on its backdrop is not a click away from it: closing here unmounted
      // the row button that modal hands focus back to, dropping it to <body>.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // A modal opened over the list (Reset, About, the shortcuts help) and a
      // text field clearing its search own this Escape; this capture listener
      // stopped it before either saw it. Working if the first Escape closes
      // the dialog on top and the list stays open behind it.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (
        e.target instanceof Element &&
        e.target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"])'
        )
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      setShowNotifications(false);
      bellRef.current?.focus();
    };
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [showNotifications]);

  // Acknowledge and Dismiss remove the button that was pressed; hand focus to
  // the row now at that place, else the list's Close, never to <body>.
  // Working if a keyboard user can acknowledge and clear a list in a row.
  const listRef = useRef<HTMLDivElement>(null);
  const handOffRowFocus = (rowIndex: number) => {
    requestAnimationFrame(() => {
      const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-alert-row]');
      const row = rows?.length ? rows[Math.min(rowIndex, rows.length - 1)] : undefined;
      (row?.querySelector<HTMLElement>('button') ?? notificationsCloseRef.current)?.focus();
    });
  };

  // A dialog takes focus when it opens; Escape and Close hand it back to the bell.
  useEffect(() => {
    if (!showNotifications) return;
    const frame = requestAnimationFrame(() => notificationsCloseRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [showNotifications]);
  // Any other close (B, the bell itself) takes the focused control with the
  // list: focus goes back to the bell when it fell to <body>. A row that sent
  // focus somewhere (Repair, Open Safety, a proposal) keeps its target.
  const listWasOpen = useRef(false);
  const rowRouted = useRef(false);
  useEffect(() => {
    if (showNotifications) {
      listWasOpen.current = true;
      rowRouted.current = false;
      return;
    }
    if (!listWasOpen.current) return;
    listWasOpen.current = false;
    if (rowRouted.current) return;
    const active = document.activeElement;
    if (!active || active === document.body || !active.isConnected) bellRef.current?.focus();
  }, [showNotifications]);

  // An asked card's row opens that card while it is open (proposalCardFocus.ts).
  // Each open card with the game minute its window closes at ("id@minute").
  const openProposalCloses = usePartnerProposalStore((state) =>
    state.proposals
      .filter((proposal) => proposal.status === 'open')
      .map((proposal) => `${proposal.id}@${closesAtMinute(proposal)}`)
      .join('|')
  );
  const closesById = React.useMemo(
    () =>
      new Map(
        openProposalCloses
          .split('|')
          .filter(Boolean)
          .map((entry) => {
            const at = entry.lastIndexOf('@');
            return [entry.slice(0, at), Number(entry.slice(at + 1))] as const;
          })
      ),
    [openProposalCloses]
  );
  const askedProposalOf = (alertId: string): string | null => {
    const id = alertId.startsWith(PROPOSAL_ALERT_PREFIX)
      ? alertId.slice(PROPOSAL_ALERT_PREFIX.length)
      : null;
    return id && closesById.has(id) ? id : null;
  };
  // An asked card's row says how long there is to answer, and says what the
  // card says: the minutes left now (partnerProposals minutesLeft), not the
  // window it was filed with. Once the card has closed (answered, or the
  // partner's choice ran) the row reads without it. Every asked kind's bell
  // carries a numeric `window`, whatever its key. Seen: an incident's bell
  // read "15 min" beside its card's 5; at 4x a long-gone card's read "24 min".
  const rowText = (alert: AlertData) => {
    const params = alert.copy?.params;
    if (!alert.copy || !alert.id.startsWith(PROPOSAL_ALERT_PREFIX) || !params)
      return alertText(alert);
    if (typeof params.window !== 'number') return alertText(alert);
    const closes = closesById.get(alert.id.slice(PROPOSAL_ALERT_PREFIX.length));
    const window = closes === undefined ? 0 : Math.max(0, closes - elapsedMinutes);
    return alertText({ ...alert, copy: { ...alert.copy, params: { ...params, window } } });
  };
  // 44 px on a phone (min-h-11), as every touch control in the repo is.
  const rowButton = compact ? 'flex min-h-11 min-w-11 items-center justify-center' : 'p-2';
  // A short, wide phone list (placeNotifications): tighter rows, actions
  // beside the text, "Mark all as read" in the header.
  const shortList = compact && notificationPosition.short;
  const actionsOwnRow = compact && !shortList;
  const markAllRead = () => {
    alerts.forEach((a) => {
      if (!a.acknowledged) acknowledgeAlert(a.id);
    });
  };

  // Shared formula with OverviewPanel so both surfaces show the same number.
  const safetyScore = computeSafetyScore(safetyMetrics);

  // Determine safety color
  const safetyColor =
    safetyScore > 90 ? 'text-emerald-300' : safetyScore > 70 ? 'text-yellow-400' : 'text-red-500';
  const SafetyIcon = safetyScore > 90 ? ShieldCheck : ShieldAlert;

  const clockHours = Math.floor(gameTime).toString().padStart(2, '0');
  const clockMinutes = Math.floor((gameTime % 1) * 60)
    .toString()
    .padStart(2, '0');
  const clockTime = `${clockHours}:${clockMinutes}`;
  const shiftKey = SHIFT_KEYS[currentShift];
  const shiftLabel = shiftKey ? t(shiftKey) : currentShift;

  // A live region inserted with its text is not read, so the hold is announced
  // through one that stays on the page (sr-only is out of flow); the chip is
  // its visual copy. Working if a tour, planner or workplace pause reaches a
  // screen reader, in either layout.
  const clockHoldStatus = (
    <span role="status" aria-atomic="true" className="sr-only">
      {clockHolder !== null ? pace(`heldBy_${clockHolder}`) : ''}
    </span>
  );
  const clockHoldChip = clockHolder !== null && (
    <span
      aria-hidden="true"
      data-testid="clock-hold-chip"
      className={`rounded border border-amber-300/40 text-[12px] font-semibold text-amber-200 ${compact ? 'millos-glass max-w-[45vw] truncate px-3 py-1.5' : 'px-1.5 py-0.5'}`}
      aria-label={pace(`heldBy_${clockHolder}`)}
    >
      {t(`pausedBy_${clockHolder}`)}
    </span>
  );

  // At 1280 px the row could not hold everything and cut the commitment, the
  // one reading it exists for. It gives way in a fixed order instead: safety
  // (1), the programme to its figures (2), the workspace name (3); only then
  // does the commitment wrap to a second line (4). Measured, because what fits
  // turns on the language, the customer, the due label and the holds; a change
  // to any of those measures again from the full row.
  // Working if at 1280 x 720 the commitment reads whole in English and pt-BR.
  const locale = useLocale();
  const metricsRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 0 : window.innerWidth
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const fitKey = [
    viewportWidth,
    detached,
    locale,
    clockHolder,
    agreementPacing !== null,
    lineIdleAwaitingTruck,
    activeOrder?.id,
    commitmentDeadline?.overdue,
    !!programme,
    showFPSCounter,
  ].join('|');
  const [fit, setFit] = useState({ key: fitKey, level: 0 });
  const squeeze = fit.key === fitKey ? fit.level : 0;
  useLayoutEffect(() => {
    if (compact) return;
    const row = metricsRef.current;
    if (!row) return;
    if (row.scrollWidth > row.clientWidth + 1 && squeeze < 4)
      setFit({ key: fitKey, level: squeeze + 1 });
    else if (fit.key !== fitKey) setFit({ key: fitKey, level: squeeze });
  });

  return (
    <header
      ref={hudRef}
      style={
        compact ? undefined : detached ? { left: position.x, top: position.y } : { left: 0, top: 0 }
      }
      className={
        compact
          ? // Top centre: the corners hold the view toggle and camera menu
            // (right) and the season notice and music player (left). Centred
            // by a full-width row the taps pass through, never a transform:
            // a transformed ancestor would carry the fixed notice list with
            // it, half off a 390 px screen.
            // The chip shares the bell's row: under it, it sat at the music
            // player's height and the player (z-40) covered it.
            `fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] flex items-center justify-center gap-2 pointer-events-none ${showNotifications ? 'z-50' : 'z-30'}`
          : `millos-glass fixed flex items-center pointer-events-auto ${showNotifications ? 'z-50' : 'z-30'} ${detached ? 'max-w-[calc(100vw-32px)] rounded-md' : 'millos-glass-thick w-full min-h-12 border-0 border-b'} ${isDragging ? 'cursor-grabbing' : ''}`
      }
      role="banner"
      aria-label={t('bannerLabel')}
      data-compact-hud={compact ? '' : undefined}
    >
      {compact && (
        <>
          {clockHoldStatus}
          {clockHoldChip}
        </>
      )}
      {/* System Status Bar */}
      {!compact && (
        <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
          {/* Drag Handle */}
          <div
            onPointerDown={handlePointerDown}
            onKeyDown={handleKeyDown}
            className="touch-none px-1 py-2 min-w-[28px] cursor-grab hover:bg-white/10 transition-colors flex items-center border-r border-white/10"
            role="button"
            aria-label={t('repositionLabel')}
            tabIndex={0}
          >
            <GripVertical className="w-3 h-3 text-slate-500" aria-hidden="true" />
          </div>

          <div
            className="flex shrink-0 items-center border-r border-white/10 px-5"
            aria-label="MillOS"
          >
            <span className="text-xl font-semibold tracking-tight text-slate-100">
              Mill<span className="text-cyan-300">OS</span>
            </span>
          </div>
          <span
            className={`hidden shrink-0 items-center border-r border-white/10 px-6 text-sm text-cyan-200 ${squeeze >= 3 ? '' : 'min-[1200px]:flex'}`}
          >
            {workspace}
          </span>
          {/* On desktop the bar stays one row: a wrapped row grew it into the
            cards below and pushed the clock under the open panel. Only the long
            changeover chip gives way, truncating; its full text stays in
            aria-label, and the agreement reading keeps its number.
            Working if the bar is one row at 1280 px with both chips showing,
            in English and pt-BR. */}
          <div
            ref={metricsRef}
            data-hud-metrics=""
            className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 lg:flex-nowrap"
            role="group"
            aria-label={t('metricsLabel')}
          >
            {/* Metrics remain readable in the accessibility tree without becoming
              live announcements every time the simulation updates. */}
            {showFPSCounter && (
              <>
                <div
                  className="flex shrink-0 items-center gap-1.5 text-[12px] text-slate-300 font-mono"
                  aria-label={t('fpsLabel', { fps: formatFixed(fps, 0) })}
                >
                  <ActivityIcon size={12} aria-hidden="true" />
                  <span>{t('fpsValue', { fps: formatFixed(fps, 0) })}</span>
                </div>
                <div
                  className="hidden w-px h-3 bg-white/10 min-[1200px]:block"
                  aria-hidden="true"
                ></div>
              </>
            )}

            {agreementPacing !== null && (
              <div
                className="flex shrink-0 items-center gap-1.5 text-[12px] text-amber-200"
                aria-label={
                  agreementPacing === 'between'
                    ? t('agreementBetweenLabel')
                    : t('agreementPacingLabel', { value: formatFixed(agreementPacing * 100, 0) })
                }
              >
                <span>
                  {agreementPacing === 'between'
                    ? t('agreementBetweenText')
                    : t('agreementPacingText', { value: formatFixed(agreementPacing * 100, 0) })}
                </span>
              </div>
            )}

            {/* The idle chip names its reason ("Line idle: all packed") and
                never truncates: the squeeze above makes room for it. Nor does
                the changeover chip (its customer in aria-label): shrinkable,
                it hid the row's overflow from the squeeze and was seen at
                1280 px cut to a 2 px sliver. */}
            {lineIdleAwaitingTruck && (
              <div
                className="flex shrink-0 items-center gap-1.5 text-[12px] text-amber-200"
                aria-label={
                  lineChangingOver
                    ? t('lineChangeoverLabel', {
                        customer: customerDisplayName(prestagingCustomer!),
                      })
                    : t('lineIdleLabel')
                }
              >
                <span className="whitespace-nowrap">
                  {lineChangingOver ? t('lineChangeoverText') : t('lineIdleText')}
                </span>
              </div>
            )}

            <div
              className="hidden w-px h-3 bg-white/10 min-[1200px]:block"
              aria-hidden="true"
            ></div>

            {programme && (
              <div
                className="flex shrink-0 items-center gap-1.5 text-[12px] text-slate-200 font-mono"
                aria-label={t('programmeTargetLabel', {
                  shipped: formatFixed(programme.shippedT, 1),
                  committed: formatFixed(programme.committedT, 1),
                })}
              >
                <span>
                  {t(squeeze >= 2 ? 'programmeTargetFigures' : 'programmeTargetValue', {
                    shipped: formatFixed(programme.shippedT, 1),
                    committed: formatFixed(programme.committedT, 1),
                  })}
                </span>
              </div>
            )}

            <div
              className="order-last ml-auto flex shrink-0 items-center gap-3 text-sm text-slate-200"
              aria-label={t('runWindowLabel', { shift: shiftLabel, time: clockTime })}
            >
              <span className="hidden uppercase text-xs text-slate-400 min-[1600px]:inline">
                {shiftLabel}
              </span>
              <time>
                {Math.floor(gameTime).toString().padStart(2, '0')}:
                {Math.floor((gameTime % 1) * 60)
                  .toString()
                  .padStart(2, '0')}
              </time>
              {clockHoldStatus}
              {clockHoldChip}
            </div>

            <div
              className="hidden w-px h-3 bg-white/10 min-[1200px]:block"
              aria-hidden="true"
            ></div>

            {/* Safety Score: the first to give way on a short row. */}
            {squeeze < 1 && (
              <>
                <div
                  className={`flex shrink-0 items-center gap-1.5 text-[12px] font-bold ${safetyColor}`}
                  aria-label={t('safetyScoreLabel', { score: formatFixed(safetyScore, 0) })}
                >
                  <SafetyIcon size={12} aria-hidden="true" />
                  <span>{t('safetyScoreValue', { score: formatFixed(safetyScore, 0) })}</span>
                </div>

                <div
                  className="hidden w-px h-3 bg-white/10 min-[1200px]:block"
                  aria-hidden="true"
                ></div>
              </>
            )}

            {/* The commitment is what the row is for: it never truncates.
                Everything else gives way first; last of all it wraps. */}
            {activeOrder && commitmentDeadline && (
              <button
                type="button"
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent('millos:open-operations-workspace', { detail: 'overview' })
                  )
                }
                className={`flex items-center gap-1.5 rounded text-[12px] hover:text-white ${squeeze >= 4 ? 'min-w-[12rem] shrink text-left' : 'shrink-0'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${
                  commitmentDeadline.overdue ? 'text-amber-200' : 'text-cyan-200'
                }`}
                aria-label={t('commitmentLabel', {
                  customer: customerDisplayName(activeOrder.customer),
                  shipped: formatGrouped(shownShippedKg(activeOrder)),
                  required: formatGrouped(Math.round(activeOrder.requiredKg)),
                  due: commitmentDeadline.label,
                })}
              >
                <ClipboardList size={12} className="shrink-0" aria-hidden="true" />
                <span
                  className={squeeze >= 4 ? 'whitespace-normal leading-tight' : 'whitespace-nowrap'}
                >
                  {t('commitmentText', {
                    customer: customerDisplayName(activeOrder.customer),
                    shipped: formatGrouped(shownShippedKg(activeOrder)),
                    required: formatGrouped(Math.round(activeOrder.requiredKg)),
                    due: commitmentDeadline.label,
                  })}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Notifications Bell */}
      <div className="relative shrink-0" ref={panelRef}>
        <button
          ref={bellRef}
          data-notification-bell=""
          onClick={() => setShowNotifications(!showNotifications)}
          className={`w-12 h-12 ${compact ? 'millos-glass rounded-full border-2 border-slate-600/50' : 'border-l border-white/10'} flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 transition-colors pointer-events-auto relative`}
          aria-label={t('bellLabel', {
            count: formatFixed(unacknowledgedCount, 0),
            n: unacknowledgedCount,
          })}
          aria-haspopup="dialog"
          aria-expanded={showNotifications}
        >
          <Bell size={14} />
          {unacknowledgedCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-[20px] bg-red-700 rounded-full border-2 border-slate-950 flex items-center justify-center text-[12px] font-bold text-white">
              {unacknowledgedCount > 9 ? '9+' : unacknowledgedCount}
            </span>
          )}
        </button>

        {/* Notifications Panel */}
        {showNotifications && (
          <div
            role="dialog"
            aria-label={t('notifications')}
            style={{
              left: notificationPosition.left,
              top: notificationPosition.top,
              width: notificationPosition.width,
              // Above the dock's band: on a landscape phone the list ran
              // under the dock, which hid its lower notices.
              maxHeight: `calc(100dvh - ${notificationPosition.top + 16}px - 6rem)`,
            }}
            // Opaque: glass inside the glass header blurs nothing behind it
            // (the header is its backdrop root), so the card behind read through.
            className="fixed flex w-[min(320px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border border-white/10 bg-slate-950 shadow-2xl pointer-events-auto"
          >
            <div
              data-notifications-header=""
              className={`${shortList ? 'px-3 py-0.5' : 'p-3'} border-b border-white/10 flex items-center justify-between gap-2`}
            >
              <h3 className="text-sm font-bold text-white">{t('notifications')}</h3>
              <div className="flex items-center gap-1">
                {shortList && alerts.length > 0 && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="min-h-11 min-w-11 px-2 text-[12px] text-cyan-400 hover:text-cyan-300"
                  >
                    {t('markAllRead')}
                  </button>
                )}
                <button
                  ref={notificationsCloseRef}
                  type="button"
                  onClick={() => {
                    setShowNotifications(false);
                    bellRef.current?.focus();
                  }}
                  className={`text-slate-400 hover:text-white ${rowButton}`}
                  aria-label={t('closeNotifications')}
                  title={t('closeNotifications')}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div ref={listRef} className="min-h-0 max-h-80 overflow-y-auto">
              {alerts.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-sm">{t('allClear')}</div>
              ) : (
                alerts.slice(0, 10).map((alert, rowIndex) => (
                  <div
                    key={alert.id}
                    data-alert-row=""
                    className={`${shortList ? 'px-3 py-1.5' : 'p-3'} border-b border-white/5 last:border-0 ${
                      unread(alert) ? 'bg-white/5' : ''
                    }`}
                  >
                    {/* On an upright phone the actions take their own row:
                        four 44 px buttons beside the text left it about 100
                        px. A landscape phone's wider list keeps them beside it. */}
                    <div className={`flex items-start gap-2 ${actionsOwnRow ? 'flex-wrap' : ''}`}>
                      <div
                        className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          alert.type === 'critical'
                            ? 'bg-red-500'
                            : alert.type === 'warning'
                              ? 'bg-amber-500'
                              : alert.type === 'safety'
                                ? 'bg-orange-500'
                                : alert.type === 'success'
                                  ? 'bg-green-500'
                                  : 'bg-blue-500'
                        }`}
                        aria-hidden="true"
                      />
                      {/* The dot is colour-only; name the type for screen readers. */}
                      <span className="sr-only">{t('alertType', { type: alert.type })}: </span>
                      <div className="flex-1 min-w-0">
                        {/* Wraps: truncated, the Portuguese shift-close title
                            lost its grade ("Turno da manhã encerrado: ..."). */}
                        <div className="text-xs font-medium text-white break-words">
                          {alertText(alert).title}
                        </div>
                        <div className="text-[12px] text-slate-300 break-words">
                          {rowText(alert).message}
                        </div>
                        <div className="text-[12px] text-slate-400 mt-1">
                          {formatPlantStamp(alert.gameClock) ??
                            formatTime(alert.timestamp, { seconds: true })}
                        </div>
                      </div>
                      <div
                        data-alert-actions=""
                        className={`flex gap-1 ${actionsOwnRow ? 'w-full justify-end' : shortList ? 'shrink-0' : ''}`}
                      >
                        {askedProposalOf(alert.id) && (
                          <button
                            onClick={() => {
                              const proposalId = askedProposalOf(alert.id);
                              rowRouted.current = true;
                              setShowNotifications(false);
                              if (proposalId) openProposalCard(proposalId);
                            }}
                            className={`${rowButton} text-slate-400 hover:text-cyan-300 transition-colors`}
                            aria-label={t('openProposalLabel', { title: alertText(alert).title })}
                          >
                            <Bot size={12} aria-hidden="true" />
                          </button>
                        )}
                        {alert.machineId && repairableIds.has(alert.machineId) && (
                          <button
                            onClick={() => {
                              if (alert.machineId) openRepairFor(alert.machineId);
                            }}
                            className={`${rowButton} text-slate-400 hover:text-amber-300 transition-colors`}
                            title={t('openRepair')}
                            aria-label={t('openRepairLabel', { title: alertText(alert).title })}
                          >
                            <Wrench size={12} />
                          </button>
                        )}
                        {/* The restart notice waits on RESTART LINE, which is in
                            Safety (D13): its row opens Safety. */}
                        {alert.id === LINE_RESTART_ALERT_ID && (
                          <button
                            onClick={() => {
                              rowRouted.current = true;
                              setShowNotifications(false);
                              window.dispatchEvent(
                                new CustomEvent('millos:open-operations-workspace', {
                                  detail: 'safety',
                                })
                              );
                            }}
                            className={`${rowButton} text-slate-400 hover:text-amber-300 transition-colors`}
                            aria-label={t('openSafetyLabel', { title: alertText(alert).title })}
                          >
                            <ShieldCheck size={12} aria-hidden="true" />
                          </button>
                        )}
                        {unread(alert) && (
                          <button
                            onClick={() => {
                              acknowledgeAlert(alert.id);
                              handOffRowFocus(rowIndex);
                            }}
                            className={`${rowButton} text-slate-400 hover:text-green-400 transition-colors`}
                            title={t('acknowledge')}
                            aria-label={t('acknowledgeLabel', { title: alertText(alert).title })}
                          >
                            <CheckCircle size={12} />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            removeAlert(alert.id);
                            handOffRowFocus(rowIndex);
                          }}
                          className={`${rowButton} text-slate-400 hover:text-red-400 transition-colors`}
                          title={t('dismiss')}
                          aria-label={t('dismissLabel', { title: alertText(alert).title })}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {alerts.length > 0 && !shortList && (
              <div className="p-2 border-t border-white/10">
                <button
                  onClick={markAllRead}
                  className={`w-full text-[12px] text-cyan-400 hover:text-cyan-300 ${compact ? 'min-h-11 min-w-11' : 'py-1'}`}
                >
                  {t('markAllRead')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
