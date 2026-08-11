/**
 * Worker Portrait Utility
 *
 * Maps worker IDs to their portrait image paths.
 */

// Portrait paths by worker ID
export const WORKER_PORTRAITS: Record<string, string> = {
  w1: '/assets/workers/w1_marcus_chen.webp',
  w2: '/assets/workers/w2_sarah_mitchell.webp',
  w3: '/assets/workers/w3_james_rodriguez.webp',
  w4: '/assets/workers/w4_emily_ronson.webp',
  w5: '/assets/workers/w5_david_kim.webp',
  w6: '/assets/workers/w6_lisa_thompson.webp',
  w7: '/assets/workers/w7_robert_garcia.webp',
  w8: '/assets/workers/w8_anna_kowalski.webp',
  w9: '/assets/workers/w9_michael_brown.webp',
  w10: '/assets/workers/w10_jennifer_lee.webp',
};

export interface WorkerPresenceAssets {
  portrait: string;
  animation?: string;
  rest?: string;
}

const WORKER_IDLE_PORTRAITS: Record<string, Pick<WorkerPresenceAssets, 'animation' | 'rest'>> = {
  w1: {
    animation: '/assets/workers/idle/w1_marcus_chen_idle.webp',
    rest: '/assets/workers/idle/w1_marcus_chen_idle_rest.webp',
  },
  w2: {
    animation: '/assets/workers/idle/w2_sarah_mitchell_idle.webp',
    rest: '/assets/workers/idle/w2_sarah_mitchell_idle_rest.webp',
  },
  w3: {
    animation: '/assets/workers/idle/w3_james_rodriguez_idle.webp',
    rest: '/assets/workers/idle/w3_james_rodriguez_idle_rest.webp',
  },
  w4: {
    animation: '/assets/workers/idle/w4_emily_ronson_idle.webp',
    rest: '/assets/workers/idle/w4_emily_ronson_idle_rest.webp',
  },
  w5: {
    animation: '/assets/workers/idle/w5_david_kim_idle.webp',
    rest: '/assets/workers/idle/w5_david_kim_idle_rest.webp',
  },
  w6: {
    animation: '/assets/workers/idle/w6_lisa_thompson_idle.webp',
    rest: '/assets/workers/idle/w6_lisa_thompson_idle_rest.webp',
  },
  w7: {
    animation: '/assets/workers/idle/w7_robert_garcia_idle.webp',
    rest: '/assets/workers/idle/w7_robert_garcia_idle_rest.webp',
  },
  w8: {
    animation: '/assets/workers/idle/w8_anna_kowalski_idle.webp',
    rest: '/assets/workers/idle/w8_anna_kowalski_idle_rest.webp',
  },
  w9: {
    animation: '/assets/workers/idle/w9_michael_brown_idle.webp',
    rest: '/assets/workers/idle/w9_michael_brown_idle_rest.webp',
  },
  w10: {
    animation: '/assets/workers/idle/w10_jennifer_lee_idle.webp',
    rest: '/assets/workers/idle/w10_jennifer_lee_idle_rest.webp',
  },
};

/**
 * Get the portrait path for a worker by ID
 * Returns undefined if no portrait exists
 */
export const getWorkerPortrait = (workerId: string): string | undefined => {
  return WORKER_PORTRAITS[workerId];
};

/**
 * Neutral fallback avatar as an inline SVG data URI. Used instead of a file
 * path so the fallback can NEVER 404 (there is no default_avatar.webp on disk,
 * and an unknown worker id previously yielded a broken image).
 */
export const DEFAULT_AVATAR_DATA_URI =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">' +
      '<rect width="128" height="128" fill="#334155"/>' +
      '<circle cx="64" cy="48" r="24" fill="#94a3b8"/>' +
      '<path d="M64 78c-26 0-42 16-42 38v12h84v-12c0-22-16-38-42-38z" fill="#94a3b8"/>' +
      '</svg>'
  );

/**
 * Get the portrait path for a worker, with fallback to a neutral default avatar
 */
export const getWorkerPortraitOrDefault = (workerId: string): string => {
  return WORKER_PORTRAITS[workerId] ?? DEFAULT_AVATAR_DATA_URI;
};

/**
 * Resolve the large worker-presence artwork while retaining the canonical
 * profile portrait as the synchronous fallback.
 */
export const getWorkerPresenceAssets = (workerId: string): WorkerPresenceAssets => ({
  portrait: getWorkerPortraitOrDefault(workerId),
  ...WORKER_IDLE_PORTRAITS[workerId],
});
