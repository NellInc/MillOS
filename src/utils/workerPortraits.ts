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
