import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Bookmark, Flame, ScrollText, Scale } from 'lucide-react';
import {
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
import { OPEN_EVENT } from './ChronicleOverview';
import { BUTTON, BUTTON_PRIMARY, CostTag } from './shared';

type Prompt = { kind: 'event'; instanceId: string } | { kind: 'fire' } | { kind: 'shortfall' };

/**
 * Predynastic Egypt's event dialog: the price and effect on every button,
 * unaffordable choices greyed out, and "Think it over" to answer later from
 * the Chronicle workspace. Mounted once by the game interface.
 */
export function ChronicleEventHost() {
  const state = useChronicleStore((s) => s.chronicle);
  const choose = useChronicleStore((s) => s.choose);
  const suppress = useChronicleStore((s) => s.suppress);
  const answerShortfall = useChronicleStore((s) => s.answerShortfall);
  const setDialogOpen = useChronicleStore((s) => s.setDialogOpen);
  // The emergency banner holds the top of the screen during a stop.
  const emergency = useGameSimulationStore((s) => s.emergencyActive);
  const forkliftStop = useSafetyStore((s) => s.forkliftEmergencyStop);
  const stopped = emergency || forkliftStop;
  const [deferred, setDeferred] = useState<Set<string>>(() => new Set());
  const [requested, setRequested] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const open = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
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
  let prompt: Prompt | null = null;
  if (state.status !== 'unsigned') {
    // A prompt the player asked for comes first; then the fire, the shortfall
    // and any unanswered event. A facility stop comes before the business:
    // while one holds, nothing else opens unasked; it all stays answerable from
    // the workspace. A forklift-only hold leaves the mill running, so it does not.
    const asked = state.pendingEvents.find((p) => p.instanceId === requested);
    if (asked) prompt = { kind: 'event', instanceId: asked.instanceId };
    else if (state.fire.active && !state.fire.suppressing && !deferred.has('fire'))
      prompt = { kind: 'fire' };
    else if (emergency) prompt = null;
    else if (state.upkeepShortfall !== null && !deferred.has(shortfallKey))
      prompt = { kind: 'shortfall' };
    else {
      const pending = state.pendingEvents.find((p) => !deferred.has(p.instanceId));
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
  useEffect(() => {
    if (deferKey) {
      if (!dialogRef.current?.contains(document.activeElement) && !returnFocusRef.current)
        returnFocusRef.current = document.activeElement as HTMLElement | null;
      headingRef.current?.focus();
      return;
    }
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target && document.contains(target)) target.focus();
  }, [deferKey]);

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
      const parts = [describeEffect(effect)];
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
