/**
 * Shared Time Formatting Utilities
 *
 * Consolidates duplicate formatTime functions that were scattered
 * across multiple components with inconsistent implementations.
 */

/**
 * Format a Date object to a time string (e.g., "02:30 PM")
 * @param date - Date object or timestamp
 * @returns Formatted time string
 */
export function formatTime(date: Date | number | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--:--';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
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
