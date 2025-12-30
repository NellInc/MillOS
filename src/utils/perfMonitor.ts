/**
 * Performance Monitoring Utility for MillOS
 * Tracks execution time of key functions to identify bottlenecks
 */

import { logger } from './logger';

const timings: Map<string, number[]> = new Map();
const frameCounts: Map<string, number> = new Map();
const MAX_SAMPLES = 100;

let frameStartTime = 0;
let frameCount = 0;
let frameBudget: { useFrame: number; render: number; store: number; idle: number } = {
  useFrame: 0,
  render: 0,
  store: 0,
  idle: 0,
};

export function perfStart(label: string) {
  performance.mark(`${label}-start`);
}

export function perfEnd(label: string) {
  performance.mark(`${label}-end`);
  try {
    performance.measure(label, `${label}-start`, `${label}-end`);
    const measure = performance.getEntriesByName(label).pop();
    if (measure) {
      const samples = timings.get(label) || [];
      samples.push(measure.duration);
      if (samples.length > MAX_SAMPLES) samples.shift();
      timings.set(label, samples);
    }
    performance.clearMarks(`${label}-start`);
    performance.clearMarks(`${label}-end`);
    performance.clearMeasures(label);
  } catch {
    // Ignore measurement errors
  }
}

export function perfCount(label: string) {
  const count = frameCounts.get(label) || 0;
  frameCounts.set(label, count + 1);
}

export function perfFrameStart() {
  frameStartTime = performance.now();
  frameCount++;
}

export function perfFrameEnd() {
  // Returns frame duration for external use
  return performance.now() - frameStartTime;
}

export function perfReport() {
  const report: Record<
    string,
    { avg: number; max: number; min: number; total: number; samples: number }
  > = {};

  timings.forEach((samples, label) => {
    if (samples.length === 0) return;
    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
    const max = Math.max(...samples);
    const min = Math.min(...samples);
    const total = samples.reduce((a, b) => a + b, 0);
    report[label] = {
      avg: Math.round(avg * 100) / 100,
      max: Math.round(max * 100) / 100,
      min: Math.round(min * 100) / 100,
      total: Math.round(total),
      samples: samples.length,
    };
  });

  // Sort by avg time descending
  const sorted = Object.entries(report).sort((a, b) => b[1].avg - a[1].avg);

  if (import.meta.env.DEV) {
    logger.perf.info('=== PERFORMANCE REPORT ===');
    logger.perf.debug(`Samples per metric: up to ${MAX_SAMPLES}`);
    logger.perf.debug('Timings:', Object.fromEntries(sorted));
  }

  return report;
}

export function perfCountReport() {
  const sorted = Array.from(frameCounts.entries()).sort((a, b) => b[1] - a[1]);
  if (import.meta.env.DEV) {
    logger.perf.info('=== CALL COUNT REPORT ===');
    logger.perf.debug('Call counts:', Object.fromEntries(sorted));
  }
  return Object.fromEntries(sorted);
}

export function perfReset() {
  timings.clear();
  frameCounts.clear();
  frameCount = 0;
  if (import.meta.env.DEV) {
    logger.perf.info('Performance data reset');
  }
}

// Heavy operation detector - logs if operation takes more than threshold
export function perfWarn(label: string, thresholdMs: number = 1) {
  return {
    start: () => performance.mark(`${label}-warn-start`),
    end: () => {
      performance.mark(`${label}-warn-end`);
      try {
        performance.measure(`${label}-warn`, `${label}-warn-start`, `${label}-warn-end`);
        const measure = performance.getEntriesByName(`${label}-warn`).pop();
        if (import.meta.env.DEV && measure && measure.duration > thresholdMs) {
          logger.perf.warn(
            `[SLOW] ${label}: ${measure.duration.toFixed(2)}ms (threshold: ${thresholdMs}ms)`
          );
        }
        performance.clearMarks(`${label}-warn-start`);
        performance.clearMarks(`${label}-warn-end`);
        performance.clearMeasures(`${label}-warn`);
      } catch {
        // Ignore
      }
    },
  };
}

// Frame budget tracker
export function updateFrameBudget(category: 'useFrame' | 'render' | 'store', duration: number) {
  frameBudget[category] += duration;
}

export function getFrameBudget() {
  const total = frameBudget.useFrame + frameBudget.render + frameBudget.store;
  const targetFrameTime = 16.67; // 60fps target
  frameBudget.idle = Math.max(0, targetFrameTime - total);
  return { ...frameBudget, total };
}

export function resetFrameBudget() {
  frameBudget = { useFrame: 0, render: 0, store: 0, idle: 0 };
}

// =============================================================================
// Stutter Monitor (DEV-only, opt-in)
// =============================================================================

export interface StutterMonitorOptions {
  frameThresholdMs?: number;
  longTaskThresholdMs?: number;
  ignoreAfterHiddenMs?: number;
  minLogIntervalMs?: number;
  maxEvents?: number;
}

type StutterEventType = 'frame' | 'longtask';

export interface StutterEvent {
  type: StutterEventType;
  timestamp: number;
  durationMs: number;
  startTime?: number;
  detail?: Record<string, unknown>;
}

interface StutterMonitorState {
  running: boolean;
  frameThresholdMs: number;
  longTaskThresholdMs: number;
  ignoreAfterHiddenMs: number;
  minLogIntervalMs: number;
  maxEvents: number;
  events: StutterEvent[];
  rafId: number | null;
  lastRafTime: number;
  lastLogTime: number;
  worstFrameGapMs: number;
  frameStutterCount: number;
  longTaskCount: number;
  longTaskObserver: PerformanceObserver | null;
}

const stutterState: StutterMonitorState = {
  running: false,
  frameThresholdMs: 32,
  longTaskThresholdMs: 50,
  ignoreAfterHiddenMs: 250,
  minLogIntervalMs: 1000,
  maxEvents: 200,
  events: [],
  rafId: null,
  lastRafTime: 0,
  lastLogTime: 0,
  worstFrameGapMs: 0,
  frameStutterCount: 0,
  longTaskCount: 0,
  longTaskObserver: null,
};

function pushStutterEvent(event: StutterEvent) {
  stutterState.events.push(event);
  if (stutterState.events.length > stutterState.maxEvents) {
    stutterState.events.splice(0, stutterState.events.length - stutterState.maxEvents);
  }
}

export function getStutterEvents(): StutterEvent[] {
  return stutterState.events.slice();
}

export function resetStutterEvents(): void {
  stutterState.events = [];
  stutterState.worstFrameGapMs = 0;
  stutterState.frameStutterCount = 0;
  stutterState.longTaskCount = 0;
}

export function getStutterSummary(): {
  running: boolean;
  frameThresholdMs: number;
  longTaskThresholdMs: number;
  worstFrameGapMs: number;
  frameStutterCount: number;
  longTaskCount: number;
  recentEvents: StutterEvent[];
} {
  return {
    running: stutterState.running,
    frameThresholdMs: stutterState.frameThresholdMs,
    longTaskThresholdMs: stutterState.longTaskThresholdMs,
    worstFrameGapMs: Math.round(stutterState.worstFrameGapMs * 100) / 100,
    frameStutterCount: stutterState.frameStutterCount,
    longTaskCount: stutterState.longTaskCount,
    recentEvents: getStutterEvents(),
  };
}

function stopLongTaskObserver() {
  if (stutterState.longTaskObserver) {
    try {
      stutterState.longTaskObserver.disconnect();
    } catch {
      // Ignore
    }
    stutterState.longTaskObserver = null;
  }
}

function startLongTaskObserver() {
  if (typeof window === 'undefined') return;
  if (typeof PerformanceObserver === 'undefined') return;

  const supported = PerformanceObserver.supportedEntryTypes;
  if (!supported || !supported.includes('longtask')) return;

  stopLongTaskObserver();

  try {
    stutterState.longTaskObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const entry of entries) {
        if (entry.duration < stutterState.longTaskThresholdMs) continue;

        stutterState.longTaskCount++;
        const anyEntry = entry as PerformanceEntry & {
          attribution?: Array<{
            name?: string;
            containerType?: string;
            containerSrc?: string;
            containerId?: string;
          }>;
        };

        pushStutterEvent({
          type: 'longtask',
          timestamp: Date.now(),
          durationMs: entry.duration,
          startTime: entry.startTime,
          detail: {
            name: entry.name,
            attribution: anyEntry.attribution?.slice(0, 1)?.[0] ?? undefined,
          },
        });

        const now = Date.now();
        if (now - stutterState.lastLogTime >= stutterState.minLogIntervalMs) {
          stutterState.lastLogTime = now;
          logger.perf.warn(`[Stutter] Long task: ${entry.duration.toFixed(1)}ms`, {
            name: entry.name,
            startTime: Math.round(entry.startTime * 10) / 10,
            attribution: anyEntry.attribution?.slice(0, 1)?.[0] ?? undefined,
          });
        }
      }
    });

    stutterState.longTaskObserver.observe({ entryTypes: ['longtask'] });
  } catch {
    stopLongTaskObserver();
  }
}

function rafTick(time: number) {
  if (!stutterState.running) return;

  // If tab is hidden, reset baseline and keep monitoring without recording spikes.
  if (typeof document !== 'undefined' && document.hidden) {
    stutterState.lastRafTime = time;
    stutterState.rafId = requestAnimationFrame(rafTick);
    return;
  }

  if (stutterState.lastRafTime > 0) {
    const deltaMs = time - stutterState.lastRafTime;

    // Ignore huge gaps (common after tab restore / debugger pauses).
    if (deltaMs <= stutterState.ignoreAfterHiddenMs && deltaMs >= stutterState.frameThresholdMs) {
      stutterState.frameStutterCount++;
      stutterState.worstFrameGapMs = Math.max(stutterState.worstFrameGapMs, deltaMs);

      pushStutterEvent({
        type: 'frame',
        timestamp: Date.now(),
        durationMs: deltaMs,
      });

      const now = Date.now();
      if (now - stutterState.lastLogTime >= stutterState.minLogIntervalMs) {
        stutterState.lastLogTime = now;
        logger.perf.warn(`[Stutter] Long frame gap: ${deltaMs.toFixed(1)}ms`);
      }
    }
  }

  stutterState.lastRafTime = time;
  stutterState.rafId = requestAnimationFrame(rafTick);
}

export function startStutterMonitor(options: StutterMonitorOptions = {}): void {
  if (!import.meta.env?.DEV) return;
  if (typeof window === 'undefined') return;
  if (stutterState.running) return;

  stutterState.frameThresholdMs = options.frameThresholdMs ?? stutterState.frameThresholdMs;
  stutterState.longTaskThresholdMs =
    options.longTaskThresholdMs ?? stutterState.longTaskThresholdMs;
  stutterState.ignoreAfterHiddenMs =
    options.ignoreAfterHiddenMs ?? stutterState.ignoreAfterHiddenMs;
  stutterState.minLogIntervalMs = options.minLogIntervalMs ?? stutterState.minLogIntervalMs;
  stutterState.maxEvents = options.maxEvents ?? stutterState.maxEvents;

  stutterState.running = true;
  stutterState.lastRafTime = 0;
  stutterState.lastLogTime = 0;

  startLongTaskObserver();
  stutterState.rafId = requestAnimationFrame(rafTick);

  logger.perf.info('[Stutter] Monitor started', {
    frameThresholdMs: stutterState.frameThresholdMs,
    longTaskThresholdMs: stutterState.longTaskThresholdMs,
  });
}

export function stopStutterMonitor(): void {
  if (!stutterState.running) return;

  stutterState.running = false;
  if (stutterState.rafId !== null) {
    cancelAnimationFrame(stutterState.rafId);
    stutterState.rafId = null;
  }

  stopLongTaskObserver();
  logger.perf.info('[Stutter] Monitor stopped');
}

// Extend Window interface for perf monitor globals
declare global {
  interface Window {
    perfReport?: typeof perfReport;
    perfCountReport?: typeof perfCountReport;
    perfReset?: typeof perfReset;
    perfTimings?: typeof timings;
    perfCounts?: typeof frameCounts;
    startAutoReport?: typeof startAutoReport;
    stopAutoReport?: typeof stopAutoReport;
    startStutterMonitor?: typeof startStutterMonitor;
    stopStutterMonitor?: typeof stopStutterMonitor;
    getStutterSummary?: typeof getStutterSummary;
    resetStutterEvents?: typeof resetStutterEvents;
  }
}

// Expose globally for console access
if (typeof window !== 'undefined') {
  window.perfReport = perfReport;
  window.perfCountReport = perfCountReport;
  window.perfReset = perfReset;
  window.perfTimings = timings;
  window.perfCounts = frameCounts;
  window.startStutterMonitor = startStutterMonitor;
  window.stopStutterMonitor = stopStutterMonitor;
  window.getStutterSummary = getStutterSummary;
  window.resetStutterEvents = resetStutterEvents;
}

// Auto-report every 10 seconds in development
let autoReportInterval: ReturnType<typeof setInterval> | null = null;

export function startAutoReport(intervalMs: number = 10000) {
  if (autoReportInterval) clearInterval(autoReportInterval);
  autoReportInterval = setInterval(() => {
    perfReport();
    perfCountReport();
  }, intervalMs);
  if (import.meta.env.DEV) {
    logger.perf.info(
      `Auto-report started (every ${intervalMs / 1000}s). Call perfReport() manually anytime.`
    );
  }
}

export function stopAutoReport() {
  if (autoReportInterval) {
    clearInterval(autoReportInterval);
    autoReportInterval = null;
  }
}

// Start auto-report in dev mode
if (typeof window !== 'undefined' && import.meta.env?.DEV) {
  // Don't auto-start, let user control it
  window.startAutoReport = startAutoReport;
  window.stopAutoReport = stopAutoReport;

  // Optional auto-start for stutter monitoring:
  // - `?stutter=1` in the URL
  // - `localStorage.setItem('millos.stutterMonitor', '1')`
  try {
    const params = new URLSearchParams(window.location.search);
    const enabledByQuery = params.get('stutter') === '1';
    const enabledByStorage = localStorage.getItem('millos.stutterMonitor') === '1';
    if (enabledByQuery || enabledByStorage) {
      startStutterMonitor();
    }
  } catch {
    // Ignore
  }
}
