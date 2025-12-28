/**
 * Render Profiler - Identifies components that re-render too often
 *
 * Usage: Import and call trackRender('ComponentName') at start of component
 * Then call renderReport() in console to see which components render most
 */

import { logger } from './logger';

const renderCounts: Map<string, number> = new Map();
const renderTimes: Map<string, number[]> = new Map();
let profilingStartTime = Date.now();
let totalRenders = 0;

export function trackRender(componentName: string) {
  totalRenders++;
  const count = (renderCounts.get(componentName) || 0) + 1;
  renderCounts.set(componentName, count);

  // Track timing
  const now = Date.now();
  const times = renderTimes.get(componentName) || [];
  times.push(now);
  // Keep last 100 render times
  if (times.length > 100) times.shift();
  renderTimes.set(componentName, times);

  // DISABLED: This warning is too noisy for React Three Fiber apps where 60fps renders are expected
  // To re-enable for debugging, uncomment the block below
  // if (times.length >= 10) {
  //   const recentTimes = times.slice(-10);
  //   const timeSpan = recentTimes[recentTimes.length - 1] - recentTimes[0];
  //   if (timeSpan > 0 && timeSpan < 200) {
  //     console.warn(`[RENDER STORM] ${componentName}: ${Math.round(10000 / timeSpan)} renders/sec`);
  //   }
  // }
}

export function renderReport() {
  const elapsed = (Date.now() - profilingStartTime) / 1000;

  console.log('%c=== RENDER REPORT ===', 'color: #f97316; font-weight: bold; font-size: 14px');
  console.log(`Profiling duration: ${elapsed.toFixed(1)}s`);
  console.log(`Total renders: ${totalRenders} (${(totalRenders / elapsed).toFixed(1)}/sec)`);

  // Sort by render count
  const sorted = Array.from(renderCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  console.log('\nTop 20 most-rendered components:');
  sorted.forEach(([name, count], i) => {
    const rate = (count / elapsed).toFixed(1);
    const status = parseFloat(rate) > 60 ? '🔴' : parseFloat(rate) > 30 ? '🟡' : '🟢';
    console.log(`${status} ${i + 1}. ${name}: ${count} renders (${rate}/sec)`);
  });

  return Object.fromEntries(sorted);
}

export function resetRenderProfile() {
  renderCounts.clear();
  renderTimes.clear();
  profilingStartTime = Date.now();
  totalRenders = 0;
  console.log('%cRender profiling reset', 'color: #22c55e');
}

// Extend Window type for render profiler globals
declare global {
  interface Window {
    renderReport?: typeof renderReport;
    resetRenderProfile?: typeof resetRenderProfile;
  }
}

// Expose globally
if (typeof window !== 'undefined') {
  window.renderReport = renderReport;
  window.resetRenderProfile = resetRenderProfile;
  // Use debug level to hide by default
  logger.perf.debug('[RenderProfiler] Ready. Use renderReport() to see render counts');
}
