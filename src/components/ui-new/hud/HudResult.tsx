import React, { useEffect, useRef, useState } from 'react';
import { Award, Bell } from 'lucide-react';
import {
  sanitizeCelebrationEvent,
  useGameSimulationStore,
  type CelebrationEvent,
} from '../../../stores/gameSimulationStore';
import { useUIStore } from '../../../stores/uiStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { isPASafetyHeld, useAnnouncementsStore } from '../../../stores/announcementsStore';
import { audioManager } from '../../../utils/audioManager';
import { isBenchmarkRuntime } from '../../../runtime/runtimeMode';
import { createTranslator, formatGrouped, useLocale, type Locale } from '../../../i18n';
import { alertText } from '../../../i18n/alertCopy';
import { formatShiftDuration } from '../../../simulation/shiftReview';
import { LiveRegionPortal } from '../../ui/LiveRegionPortal';
import { hudResultMessages } from './HudResult.messages';
import { useReorientAfterRestore } from './reorientAfterRestore';
import type { AlertData } from '../../../types';
import { customerDisplayName } from '../../../stores/customerNames';

const RESULT_MS = 6000;
const NOTICE_MS = 5000;
/** Notices that ask for attention; a success is a record and an info notice a report. */
const NOTICE_TYPES: ReadonlySet<AlertData['type']> = new Set(['critical', 'warning', 'safety']);

type Shown =
  | { kind: 'result'; event: CelebrationEvent; serial: number }
  | { kind: 'notice'; alertId: string; serial: number };

/** The words of a result, in `locale`; null for an entry the HUD does not show. */
export function resultText(event: CelebrationEvent, locale: Locale): string | null {
  const t = createTranslator(hudResultMessages, locale);
  if (event.type === 'order_fulfilled') {
    if (!event.customer || event.value === undefined) return null;
    const kg = formatGrouped(Math.round(event.value), undefined, locale);
    const result = event.lateMinutes
      ? t('fulfilledLate', {
          customer: customerDisplayName(event.customer),
          kg,
          duration: formatShiftDuration(event.lateMinutes, locale),
        })
      : t('fulfilledOnTime', { customer: customerDisplayName(event.customer), kg });
    return event.offSpecKg
      ? t('withQualityFailure', {
          result,
          kg: formatGrouped(event.offSpecKg, undefined, locale),
        })
      : result;
  }
  if (event.type === 'shift_complete') {
    if (!event.grade) return null;
    const shift = /(morning|afternoon|night)$/.exec(event.shiftKey ?? '')?.[1] ?? '';
    return t('shiftGraded', { shift, grade: event.grade });
  }
  // An unlock carries its own words. A daily-target milestone from an older
  // save carried a bag count, and that target is gone (D11).
  if (event.type === 'milestone') return event.value === undefined ? (event.message ?? null) : null;
  return null;
}

/** A win sounds: an order in on time and to spec, an A or B shift, an unlock. */
const isWin = (event: CelebrationEvent) =>
  (event.type === 'order_fulfilled' && !event.lateMinutes && !event.offSpecKg) ||
  (event.type === 'shift_complete' && (event.grade === 'A' || event.grade === 'B')) ||
  event.type === 'milestone';

// A live region whose text does not change is not read again (AlertSystem's rule).
const NBSP = String.fromCharCode(0xa0);
const reread = (text: string) => (previous: string) =>
  previous.trimEnd() !== text ? text : previous.endsWith(NBSP) ? text : `${text}${NBSP}`;

function HudResultHost({ compact }: { compact: boolean }) {
  const locale = useLocale();
  const queue = useGameSimulationStore((state) => state.celebrations.milestoneQueue);
  const [shown, setShown] = useState<Shown | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [spoken, setSpoken] = useState('');
  const serial = useRef(0);
  // The emergency banner (EmergencyOverlay) sits under the HUD row while a
  // stop or drill holds; the line goes below it rather than under it.
  const forkliftStop = useSafetyStore((state) => state.forkliftEmergencyStop);
  const emergencyActive = useGameSimulationStore((state) => state.emergencyActive);
  const noticeAlert = useUIStore((state) =>
    shown?.kind === 'notice' ? state.alerts.find((alert) => alert.id === shown.alertId) : undefined
  );

  // Nothing ever read the queue before, so a save holds up to five old entries
  // (daily-target milestones among them). What was queued before this mount
  // is not news, and a reload must raise nothing.
  useEffect(() => {
    useGameSimulationStore.getState().discardCelebrations();
  }, []);

  // Surface unread notices once. A notice filed after mount that asks for
  // attention (the bell's unread rule: not a success, not acknowledged) shows
  // once in this slot; the bell keeps it. Keyed by id and raise time, as
  // AlertSystem reads them, and held in memory only. Visual only: AlertSystem
  // already reads announced notices to screen readers.
  useEffect(() => {
    const raised = (alert: AlertData) => `${alert.id}@${new Date(alert.timestamp).getTime()}`;
    let seen = new Set(useUIStore.getState().alerts.map(raised));
    return useUIStore.subscribe(({ alerts }) => {
      const fresh = alerts.filter(
        (alert) => !seen.has(raised(alert)) && !alert.acknowledged && NOTICE_TYPES.has(alert.type)
      );
      seen = new Set(alerts.map(raised));
      if (fresh.length === 0) return;
      // The bell lists newest first; show them in the order they were filed.
      setNotices((queued) => [...queued, ...fresh.reverse().map((alert) => alert.id)].slice(-5));
    });
  }, []);

  // Each shows for its time; a later arrival does not extend it.
  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => setShown(null), shown.kind === 'result' ? RESULT_MS : NOTICE_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  // One at a time: results first, then notices, each shown once and dequeued.
  useEffect(() => {
    if (shown) return;
    const game = useGameSimulationStore.getState();
    const live = game.celebrations.milestoneQueue;
    if (Array.isArray(live) && live.length > 0) {
      // The restore writes the saved queue unsanitised; read each entry through it.
      const event = sanitizeCelebrationEvent(live[0]);
      game.clearCelebration();
      if (event && resultText(event, locale) !== null)
        setShown({ kind: 'result', event, serial: ++serial.current });
      return;
    }
    if (notices.length > 0) {
      const [next, ...rest] = notices;
      setNotices(rest);
      const alert = useUIStore.getState().alerts.find((item) => item.id === next);
      if (alert && !alert.acknowledged)
        setShown({ kind: 'notice', alertId: next, serial: ++serial.current });
    }
  }, [shown, queue, notices, locale]);

  // A win rings the cycle bell (a tone, not the PA voice). A fulfilment and an unlock are read once to screen readers; a
  // shift's grade is already read by its bell notice and PA caption.
  useEffect(() => {
    if (shown?.kind !== 'result') return;
    // The PA's own gates for its bells (audioManager.startPASystem): quiet with
    // the PA set to Off, and under its safety hold, where a bell would say the
    // plant is running. Optional call: suites that mock the audio manager give
    // it a few methods.
    const pa = useAnnouncementsStore.getState();
    if (
      isWin(shown.event) &&
      !audioManager.muted &&
      pa.mode !== 'off' &&
      !isPASafetyHeld(pa.context)
    )
      audioManager.playCycleBell?.();
    if (shown.event.type === 'order_fulfilled' || shown.event.type === 'milestone') {
      const text = resultText(shown.event, locale);
      if (text) setSpoken(reread(text));
    }
    // Keyed on the entry's serial: once per entry shown, not again on a
    // language switch while it shows.
  }, [shown?.serial]);

  const text =
    shown?.kind === 'result'
      ? resultText(shown.event, locale)
      : noticeAlert
        ? alertText(noticeAlert).title
        : null;
  // Its own line under the HUD row, wrapped, never truncated: beside the
  // target at 1280 px it was cut to "Achievemen..." and the win went unread.
  // On a phone it sits below the music player (top 4rem, z-40), which hid it
  // under the bell. Working if the whole sentence shows in either language.
  const Icon = shown?.kind === 'notice' ? Bell : Award;
  const chip = text && shown && (
    <div
      key={shown.serial}
      aria-hidden="true"
      data-testid="hud-result"
      data-kind={shown.kind}
      className={`millos-glass flex min-w-0 max-w-[min(40rem,100%)] items-center gap-1.5 rounded border px-3 py-1.5 text-[12px] font-semibold ${
        shown.kind === 'notice'
          ? 'border-amber-300/40 text-amber-100'
          : 'border-emerald-300/40 text-emerald-100'
      }`}
    >
      <Icon size={12} className="shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{text}</span>
    </div>
  );
  return (
    <>
      <LiveRegionPortal>
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
          data-testid="hud-result-status"
        >
          {spoken}
        </div>
      </LiveRegionPortal>
      {chip && (
        <div
          className={`pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4 ${
            compact
              ? 'top-[calc(max(0.75rem,env(safe-area-inset-top))+7.25rem)]'
              : forkliftStop || emergencyActive
                ? 'top-[6.75rem]'
                : 'top-14'
          }`}
        >
          {chip}
        </div>
      )}
    </>
  );
}

/**
 * The HUD's result slot: a delivered order, a graded shift or an unlock, and
 * once each, a new notice that needs reading. Mounted once for both layouts,
 * so a desktop and compact swap neither loses nor repeats one. Inert in
 * benchmark runs: nothing shows and nothing sounds.
 * Working if fulfilling order-001 shows "Riverside Bakers' Cooperative:
 * 6,000 kg, on time" and reads it once.
 */
export const HudResult: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  useReorientAfterRestore();
  if (isBenchmarkRuntime()) return null;
  return <HudResultHost compact={compact} />;
};
