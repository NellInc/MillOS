import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bookmark, Flame, ScrollText, Scale } from 'lucide-react';
import {
  answerablePending,
  canAfford,
  choiceAvailable,
  effectiveChoice,
  FIRE_HAND_CLEAN_MINUTES,
  FIRE_SUPPRESSION_COST,
  FIRE_SUPPRESSION_MINUTES,
  FORCED_FUND_PER_KNOW_HOW,
  fundOf,
  knowHowOf,
} from '../../chronicle/engine';
import { canFundMitigations } from '../../chronicle/delegation';
import { describeEffect } from '../../chronicle/describe';
import { EVENT_DECK } from '../../chronicle/eventDeck';
import {
  FRONT_HOLD_THRESHOLD,
  FRONTS,
  frontPreparation,
  otherFront,
} from '../../chronicle/longNight';
import { conditionText, hasMark } from '../../chronicle/record';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { useMobileDetection } from '../../hooks/useMobileDetection';
import { OPEN_EVENT } from './ChronicleOverview';
import { BUTTON, BUTTON_PRIMARY, CostTag } from './shared';

type Prompt = { kind: 'event'; instanceId: string } | { kind: 'fire' } | { kind: 'shortfall' };

/** Where the player's focus is their own: a field they type in, or a modal they opened. */
const PLAYER_OWNED_FOCUS =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]), textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"][aria-modal="true"]';

/**
 * Predynastic Egypt's event dialog: the price and effect on every button,
 * unaffordable choices greyed out, and "Think it over" to answer later from
 * the Chronicle workspace. Mounted once by the game interface, which hides it
 * (rather than unmounting it) during the tour, walk mode and the shortcuts
 * help, so a decision the player deferred stays deferred when the HUD returns.
 * Working if "Think it over", then V and V, leaves the decision in the workspace.
 */
export function ChronicleEventHost({
  hidden: hiddenByHost = false,
}: { readonly hidden?: boolean } = {}) {
  // On a phone an open sheet makes this host's root inert, yet the dialog draws
  // above the sheet, so a tap on it fell through to the sheet control beneath.
  // Wait for the sheet to close, as for the tour; a decision asked for closes it.
  const { isCompactLayout } = useMobileDetection();
  const sheetOpen = useMobileControlStore((s) => s.mobilePanelVisible) && isCompactLayout;
  const hidden = hiddenByHost || sheetOpen;
  const state = useChronicleStore((s) => s.chronicle);
  const choose = useChronicleStore((s) => s.choose);
  const suppress = useChronicleStore((s) => s.suppress);
  const answerShortfall = useChronicleStore((s) => s.answerShortfall);
  const setDialogOpen = useChronicleStore((s) => s.setDialogOpen);
  // The emergency banner holds the top of the screen during a stop.
  const emergency = useGameSimulationStore((s) => s.emergencyActive);
  const forkliftStop = useSafetyStore((s) => s.forkliftEmergencyStop);
  const stopped = emergency || forkliftStop;
  // Saved in the chronicle store, so 'Think it over' survives a reload; the
  // setter keeps the functional-update shape the rest of the host uses.
  const deferredList = useChronicleStore((s) => s.deferredPrompts);
  const deferred = useMemo(() => new Set(deferredList), [deferredList]);
  const setDeferred = useCallback((update: (current: Set<string>) => Set<string>) => {
    const current = new Set(useChronicleStore.getState().deferredPrompts);
    const next = update(current);
    if (next !== current) useChronicleStore.getState().setDeferredPrompts([...next]);
  }, []);
  const [requested, setRequested] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const returnToPanelRef = useRef(false);

  useEffect(() => {
    const open = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      // On a phone this host sits in the game interface, which is inert while a
      // sheet is open: close the sheet so the decision asked for can be pressed.
      const mobile = useMobileControlStore.getState();
      if (mobile.mobilePanelVisible) mobile.closeMobilePanel();
      setRequested(id);
      setDeferred((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    };
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  // Instance ids restart with each charter, so "Think it over" in one chronicle
  // must not hold back a decision of the next: forget deferrals when it is let go.
  const unsigned = state.status === 'unsigned';
  useEffect(() => {
    if (!unsigned) return;
    setDeferred((current) => (current.size ? new Set() : current));
    setRequested(null);
  }, [unsigned]);

  // A deferred fire prompt re-arms for the next fire.
  const fireActive = state.fire.active;
  useEffect(() => {
    if (fireActive) return;
    setDeferred((current) => {
      if (!current.has('fire')) return current;
      const next = new Set(current);
      next.delete('fire');
      return next;
    });
  }, [fireActive]);

  const shortfallKey = `shortfall-${state.shift}`;
  // An event a later deck dropped, or one the crop overtook, has nothing true
  // to offer, so it must not hold the dialog (the next close clears it).
  const answerable = answerablePending(state, EVENT_DECK).map(({ pending }) => pending);
  let prompt: Prompt | null = null;
  if (state.status !== 'unsigned' && !hidden) {
    // A prompt the player asked for comes first; then the fire, the shortfall
    // and any unanswered event. A facility stop comes before the business:
    // while one holds, nothing else opens unasked; it all stays answerable from
    // the workspace. A forklift-only hold leaves the mill running, so it does not.
    // A partner at delegation 2 or 3 answers the fire on its next tick, so the
    // fire is not put to the player (a restored save opened it for that tick).
    // Working if no fire dialog shows while the partner is about to act.
    const partnerAnswersFire = state.status === 'active' && canFundMitigations(state.delegation);
    const asked = answerable.find((p) => p.instanceId === requested);
    if (asked) prompt = { kind: 'event', instanceId: asked.instanceId };
    else if (
      state.fire.active &&
      !state.fire.suppressing &&
      !partnerAnswersFire &&
      !deferred.has('fire')
    )
      prompt = { kind: 'fire' };
    else if (emergency) prompt = null;
    else if (state.upkeepShortfall !== null && !deferred.has(shortfallKey))
      prompt = { kind: 'shortfall' };
    else {
      const pending = answerable.find((p) => !deferred.has(p.instanceId));
      if (pending) prompt = { kind: 'event', instanceId: pending.instanceId };
    }
  }
  const deferKey = !prompt
    ? null
    : prompt.kind === 'event'
      ? prompt.instanceId
      : prompt.kind === 'fire'
        ? 'fire'
        : shortfallKey;

  const dialogOpen = deferKey !== null;
  useEffect(() => {
    setDialogOpen(dialogOpen);
  }, [dialogOpen, setDialogOpen]);
  useEffect(() => () => setDialogOpen(false), [setDialogOpen]);

  // Focus the heading, never a paying button, and give focus back afterwards.
  // A prompt nobody asked for leaves a text field or a modal dialog the player
  // is in alone: taking focus from a field sent the rest of what was typed to
  // the game's shortcuts, where Space is the emergency stop.
  const asked = prompt?.kind === 'event' && prompt.instanceId === requested;
  useEffect(() => {
    if (deferKey) {
      const active = document.activeElement;
      if (!asked && active instanceof Element && active.closest(PLAYER_OWNED_FOCUS)) return;
      if (!dialogRef.current?.contains(active) && !returnFocusRef.current) {
        returnFocusRef.current = document.activeElement as HTMLElement | null;
        returnToPanelRef.current = !!returnFocusRef.current?.closest(
          '[data-testid="chronicle-panel"]'
        );
      }
      headingRef.current?.focus();
      return;
    }
    // Hidden, as unmounted before: focus is not handed anywhere, and a later
    // dialog records its own return target.
    if (hidden) {
      returnFocusRef.current = null;
      return;
    }
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    // Only focus the prompt took with it is handed back; a player who has moved
    // on to another control keeps it.
    const current = document.activeElement;
    if (current && current !== document.body && document.contains(current)) return;
    if (target && document.contains(target)) target.focus();
    // A "Decide" button leaves the workspace with the decision it opened; land on
    // the workspace's tabs rather than drop focus to the page.
    else if (target && returnToPanelRef.current)
      document.getElementById('chronicle-tab-overview')?.focus();
  }, [deferKey, hidden, asked]);

  useEffect(() => {
    if (!deferKey) return;
    const onKey = (event: KeyboardEvent) => {
      // Escape belongs to this dialog only while focus is inside it.
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (!dialogRef.current?.contains(document.activeElement)) return;
      event.preventDefault();
      event.stopPropagation();
      setDeferred((current) => new Set(current).add(deferKey));
      setRequested(null);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [deferKey]);

  if (!prompt || !deferKey) return null;
  const defer = () => {
    setDeferred((current) => new Set(current).add(deferKey));
    setRequested(null);
  };

  let title = '';
  let body = '';
  let icon = <ScrollText className="h-5 w-5 text-cyan-300" aria-hidden="true" />;
  let buttons: ReactNode = null;

  if (prompt.kind === 'fire') {
    title = 'Smouldering dust in the extraction ducting';
    body =
      'The fail-safe has stopped production and the forklifts. Nobody is in danger. The duct must be suppressed and cleaned before restart.';
    icon = <Flame className="h-5 w-5 text-rose-300" aria-hidden="true" />;
    buttons = (
      <>
        <button
          className={BUTTON_PRIMARY}
          disabled={!canAfford(state, { fund: FIRE_SUPPRESSION_COST })}
          onClick={() => suppress('suppress')}
        >
          Suppress and clean, {FIRE_SUPPRESSION_MINUTES} min
          <CostTag state={state} cost={{ fund: FIRE_SUPPRESSION_COST }} />
        </button>
        <button className={BUTTON} onClick={() => suppress('by_hand')}>
          Clean by hand, {FIRE_HAND_CLEAN_MINUTES} min
        </button>
      </>
    );
  } else if (prompt.kind === 'shortfall') {
    const due = state.upkeepShortfall ?? 0;
    const knowHow = Math.ceil(
      Math.max(0, due - Math.max(0, fundOf(state))) / FORCED_FUND_PER_KNOW_HOW
    );
    title = 'Lack of material';
    body = `Upkeep of ${Math.round(due)} is due and the fund holds ${Math.max(0, Math.floor(fundOf(state)))}. Decrepit plant raises the chance of breakdown and fire.`;
    icon = <Scale className="h-5 w-5 text-amber-300" aria-hidden="true" />;
    buttons = (
      <>
        <button className={BUTTON} onClick={() => answerShortfall('conserve')}>
          Conserve resources: upkeep halved; production x0.92, wear x1.2
        </button>
        <button
          className={BUTTON}
          disabled={knowHowOf(state) < knowHow}
          onClick={() => answerShortfall('forced')}
        >
          Forced maintenance: pay in full
          <CostTag state={state} cost={{ knowHow }} />
        </button>
      </>
    );
  } else {
    const instanceId = prompt.instanceId;
    const pending = state.pendingEvents.find((p) => p.instanceId === instanceId)!;
    const event = EVENT_DECK.find((e) => e.id === pending.eventId);
    if (!event) return null;
    title = event.title;
    body = pending.echo?.text ?? event.text;
    // A choice the record has ruled out (its party is gone) is not offered at all;
    // one that is only locked stays, and says what it needs.
    const offered = event.choices.filter(
      (choice) => !choice.requires?.marks?.none?.some((id) => hasMark(state, id))
    );
    buttons = offered.map((choice) => {
      const available = choiceAvailable(state, choice);
      const { effect } = effectiveChoice(state, choice);
      const parts = [describeEffect(effect, { suspended: state.certifier.suspended })];
      if (effect.holdFront) {
        const other = otherFront(effect.holdFront);
        const prepared = frontPreparation(state, other);
        if (choice.delegates) parts.push(`holds ${FRONTS[effect.holdFront].subject}`);
        parts.push(
          `${FRONTS[other].subject} will ${prepared >= FRONT_HOLD_THRESHOLD ? 'hold' : 'fall'} (${prepared} of ${FRONT_HOLD_THRESHOLD} prepared)`
        );
      }
      if (!available && choice.requires) parts.push(`needs ${conditionText(choice.requires)}`);
      const text = parts.filter(Boolean).join('; ');
      return (
        <button
          key={choice.id}
          className={`${BUTTON} text-left`}
          disabled={!available || !canAfford(state, choice.cost)}
          onClick={() => {
            choose(instanceId, choice.id);
            setRequested(null);
          }}
        >
          {effect.marks?.length ? (
            <Bookmark
              className="mr-1 inline h-3.5 w-3.5 text-violet-300"
              role="img"
              aria-label="Goes in the record"
            />
          ) : null}
          {choice.label}
          {text ? `: ${text}` : ''}
          <CostTag state={state} cost={choice.cost} />
        </button>
      );
    });
  }

  // Placement is split on height as well as width. A landscape phone is wide
  // enough for the desktop arm but only ~375 px tall, where reserving 14rem
  // left a 166 px box with every choice below the fold; a short screen
  // instead gets nearly the whole height, a wider box and two columns.
  // During an emergency stop both short arms start below the banner.
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-50 flex justify-center px-3 [@media(min-width:640px)_and_(min-height:501px)]:top-auto [@media(min-width:640px)_and_(min-height:501px)]:bottom-44 ${stopped ? 'top-20 [@media(max-height:500px)]:top-16' : 'top-14 [@media(max-height:500px)]:top-2'}`}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="chronicle-dialog-title"
        className={`pointer-events-auto max-h-[calc(100dvh-28rem)] w-full max-w-md overflow-y-auto rounded-xl border border-cyan-300/40 bg-slate-950 p-4 text-sm text-slate-200 shadow-2xl [@media(min-width:640px)_and_(min-height:501px)]:max-h-[calc(100dvh-14rem)] [@media(max-height:500px)]:max-w-3xl [@media(max-height:500px)]:p-3 ${stopped ? '[@media(max-height:500px)]:max-h-[calc(100dvh-4.5rem)]' : '[@media(max-height:500px)]:max-h-[calc(100dvh-1rem)]'}`}
      >
        <h2
          id="chronicle-dialog-title"
          ref={headingRef}
          tabIndex={-1}
          className="flex items-center gap-2 font-semibold text-white outline-none focus-visible:shadow-none"
        >
          {icon}
          {title}
        </h2>
        <p className="mt-2 leading-6 [@media(max-height:500px)]:leading-5">{body}</p>
        <div className="mt-3 flex flex-col gap-2 [@media(max-height:500px)]:grid [@media(max-height:500px)]:grid-cols-2">
          {buttons}
          <button
            className={`${BUTTON} border-slate-600 text-slate-300 [@media(max-height:500px)]:col-span-2`}
            onClick={defer}
          >
            Think it over
          </button>
        </div>
      </div>
    </div>
  );
}
