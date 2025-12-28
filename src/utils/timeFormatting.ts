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
 * Format a Date object to a date string (e.g., "Dec 28, 2025")
 * @param date - Date object or timestamp
 * @returns Formatted date string
 */
export function formatDate(date: Date | number | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format a Date object to a full datetime string (e.g., "Dec 28, 2025 02:30 PM")
 * @param date - Date object or timestamp
 * @returns Formatted datetime string
 */
export function formatDateTime(date: Date | number | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return '--';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

/**
 * Format an hour number (0-23) to display time (e.g., "2:00 PM")
 * @param hour - Hour number (0-23)
 * @returns Formatted hour string
 */
export function formatHour(hour: number): string {
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return '--:--';
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

/**
 * Get relative time string (e.g., "2 hours ago", "in 5 minutes")
 * @param date - Date object or timestamp
 * @returns Relative time string
 */
export function formatRelativeTime(date: Date | number | string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return 'unknown';

  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.abs(Math.floor(diffMs / 1000));
  const isPast = diffMs > 0;

  if (diffSec < 60) {
    return isPast ? 'just now' : 'in a moment';
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    const unit = diffMin === 1 ? 'minute' : 'minutes';
    return isPast ? `${diffMin} ${unit} ago` : `in ${diffMin} ${unit}`;
  }

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) {
    const unit = diffHr === 1 ? 'hour' : 'hours';
    return isPast ? `${diffHr} ${unit} ago` : `in ${diffHr} ${unit}`;
  }

  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) {
    const unit = diffDay === 1 ? 'day' : 'days';
    return isPast ? `${diffDay} ${unit} ago` : `in ${diffDay} ${unit}`;
  }

  // Beyond a week, just show the date
  return formatDate(d);
}
