/**
 * Shared Time Formatting Utilities
 *
 * Consolidates duplicate formatTime functions that were scattered
 * across multiple components with inconsistent implementations.
 */

import { formatFixed, getLocale, translate } from '../i18n';
import { timeFormattingMessages } from './timeFormatting.messages';
// Read only inside readPlantClock, never at module evaluation, so the import
// cycle through the stores that stamp records is inert (as incidentReplayStore's is).
import { useGameSimulationStore } from '../stores/gameSimulationStore';

/** The plant clock a record was made at: gameDay and gameTime (fractional hours). */
export interface PlantClock {
  day: number;
  hour: number;
}

/**
 * The plant clock now, for stamping a plant event when it is recorded, or
 * undefined where it cannot be read (a partial test mock). Converting a wall
 * time to game time later would be false across pauses, pace changes and resets.
 */
export function readPlantClock(): PlantClock | undefined {
  try {
    const { gameDay, gameTime } = useGameSimulationStore.getState();
    return Number.isFinite(gameDay) && Number.isFinite(gameTime)
      ? { day: gameDay, hour: gameTime }
      : undefined;
  } catch {
    return undefined;
  }
}

/** A restored value that is a usable plant clock, else undefined. */
export function sanitizePlantClock(value: unknown): PlantClock | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { day, hour } = value as Record<string, unknown>;
  return typeof day === 'number' &&
    Number.isFinite(day) &&
    typeof hour === 'number' &&
    Number.isFinite(hour)
    ? { day, hour }
    : undefined;
}

/**
 * "Day 3, 14:30" on the plant clock, in the app language; game day N reads as
 * Day N + 1, as the maintenance log does. Null for a record without a clock,
 * so the caller falls back to its wall time.
 */
export function formatPlantStamp(clock: PlantClock | undefined | null): string | null {
  const usable = sanitizePlantClock(clock);
  if (!usable) return null;
  const minuteOfDay = Math.floor((((usable.hour % 24) + 24) % 24) * 60 + 1e-6);
  return translate(timeFormattingMessages, 'plantStamp', {
    day: formatFixed(Math.max(0, Math.floor(usable.day)) + 1, 0),
    time: `${String(Math.floor(minuteOfDay / 60)).padStart(2, '0')}:${String(minuteOfDay % 60).padStart(2, '0')}`,
  });
}

/**
 * Format a Date object to a time string in the app language, never the
 * browser's (e.g., "02:30 PM"; pt-BR "14:30"). With `seconds`, English keeps
 * the browser-default en-US form ("2:30:15 PM"); pt-BR reads "14:30:15".
 * @param date - Date object or timestamp
 * @returns Formatted time string
 */
export function formatTime(
  date: Date | number | string,
  options: { seconds?: boolean } = {}
): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--:--';
  const locale = getLocale();
  if (locale === 'en') {
    return options.seconds
      ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
      : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }
  // The glossary keeps clock times 24-hour outside English.
  return d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    ...(options.seconds ? { second: '2-digit' } : {}),
    hourCycle: 'h23',
  });
}

/**
 * Format seconds to a duration string (e.g., "1:30:45" or "30:45")
 * @param seconds - Total seconds
 * @param includeHours - Whether to always include hours (default: auto)
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number, includeHours: 'always' | 'auto' = 'auto'): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (includeHours === 'always' || hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
