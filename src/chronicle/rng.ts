/**
 * Seeded, order-independent chance for the Chronicle.
 *
 * Every draw is keyed by (seed, stream, index) rather than taken from a running
 * generator, so a draw for shift 12's event does not change because a forecast
 * was rolled first. Replays and captures of the same charter see the same
 * history.
 */

function hashString(text: string): number {
  // FNV-1a, 32-bit.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A uniform draw in [0, 1) for one (seed, stream, index) key. */
export function chronicleChance(seed: number, stream: string, index: number): number {
  return mulberry32(hashString(`${seed >>> 0}:${stream}:${index}`))();
}

/** A generator for draws that need several numbers under one key. */
export function chronicleStream(seed: number, stream: string, index: number): () => number {
  return mulberry32(hashString(`${seed >>> 0}:${stream}:${index}`));
}

/** Pick by weight. Returns null when nothing has positive weight. */
export function weightedPick<T>(
  items: readonly T[],
  weight: (item: T) => number,
  draw: number
): T | null {
  let total = 0;
  for (const item of items) total += Math.max(0, weight(item));
  if (total <= 0) return null;
  let target = draw * total;
  for (const item of items) {
    const w = Math.max(0, weight(item));
    if (target < w) return item;
    target -= w;
  }
  return items[items.length - 1] ?? null;
}

/** Uniform value in [min, max], rounded to whole numbers. */
export function rollRange(min: number, max: number, draw: number): number {
  return Math.round(min + (max - min) * draw);
}

/** A fresh seed for a new charter. Non-deterministic by design: it is the one input. */
export function newCharterSeed(): number {
  const crypto = globalThis.crypto;
  if (crypto?.getRandomValues) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0] % 1_000_000;
  }
  return Date.now() % 1_000_000;
}
