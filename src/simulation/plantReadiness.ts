/**
 * The plant readiness index the Management surfaces show: the mean of
 * efficiency, uptime and quality, clamped to 0-100. One formula, so the phone
 * sheet and the desktop Autonomy panel never read different numbers.
 */
export const plantReadinessIndex = (metrics: {
  efficiency: number;
  uptime: number;
  quality: number;
}): number =>
  Math.min(100, Math.max(0, (metrics.efficiency + metrics.uptime + metrics.quality) / 3));
