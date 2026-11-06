import type { StartupSnapshot } from './startupReadiness';

/** Frames the strict readiness window holds (StartupFrameWindow). */
export const STARTUP_SETTLE_FRAMES = 45;

/**
 * The loading bar as a weighted sum of the four kinds of startup work, each
 * measured by its own count, so the bar moves only when work is done and the
 * label names the work that is holding it.
 *
 * - download: files fetched of those requested (three's loading manager)
 * - build: startup tasks finished of those started (lazy modules, static
 *   batches, the app's own setup, the shader prewarm itself), plus scene
 *   sections committed of those rendered under the cover
 * - shaders: programs linked of those the prewarm submitted (world, trucks)
 * - settle: frames on time (<= 34 ms) in the readiness window's 45
 *
 * Weights are each phase's share of wall time to readiness (see
 * STARTUP_PHASE_WEIGHTS). Totals grow as later work is discovered, so a phase
 * can fall back; the caller keeps the highest value reached. Below readiness
 * the bar stops at 99: only the readiness marker shows 100.
 */
export type StartupPhase = 'download' | 'build' | 'shaders' | 'settle';

// Measured on a visitor's load (plain URL, 1280x800, this Mac, 2026-11-05):
// download 3%, build 48%, shaders 41%, settle 6% of 20.8 s. Benchmark loads
// skip the texture preload and compile far fewer programs, so the visitor's
// load sets the weights; download keeps a little more than it measured, as a
// slower connection spends longer there.
export const STARTUP_PHASE_WEIGHTS: Record<StartupPhase, number> = {
  download: 0.1,
  build: 0.45,
  shaders: 0.35,
  settle: 0.1,
};

export interface StartupProgress {
  /** 0-99 before readiness, 100 at readiness. */
  percent: number;
  /** The phase holding the cover, or null before any work is counted. */
  phase: StartupPhase | null;
  done: number;
  total: number;
}

const fraction = (done: number, total: number) => {
  const value = total > 0 ? done / total : 0;
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
};

export function startupProgress(s: StartupSnapshot): StartupProgress {
  const parts: Record<StartupPhase, [number, number]> = {
    download: [s.loadedAssets, s.totalAssets],
    // Lazy modules, batches and setup work, plus the scene sections built.
    build: [
      (s.finishedTasks ?? 0) + (s.sectionsBuilt ?? 0),
      (s.startedTasks ?? 0) + (s.sectionsRequested ?? 0),
    ],
    shaders: [s.shaderProgramsReady, s.shaderPrograms],
    settle: [s.settleFrames, STARTUP_SETTLE_FRAMES],
  };
  if (s.ready) {
    return { percent: 100, phase: null, done: 0, total: 0 };
  }
  const weighted = (Object.keys(parts) as StartupPhase[]).reduce(
    (sum, phase) => sum + STARTUP_PHASE_WEIGHTS[phase] * fraction(...parts[phase]),
    0
  );
  // The phase that is holding the cover, in the order the work must finish.
  const [built, toBuild] = parts.build;
  const shadersStarted = (s.shaderPrograms ?? 0) > 0;
  const phase: StartupPhase | null =
    s.pendingAssets > 0
      ? 'download'
      : s.shaderPrograms > s.shaderProgramsReady
        ? 'shaders'
        : !shadersStarted && (s.pendingTasks > 0 || built < toBuild)
          ? 'build'
          : (s.settleFrames ?? 0) > 0 || shadersStarted
            ? 'settle'
            : toBuild > 0
              ? 'build'
              : // Downloads are named only while files are pending; finished
                // downloads with nothing else counted yet read as "Preparing".
                null;
  const [done, total] = phase ? parts[phase] : [0, 0];
  return { percent: Math.min(99, weighted * 100), phase, done, total };
}
