import { useSyncExternalStore } from 'react';
import type { GraphicsQuality } from '../stores/graphicsStore';

// The canvas renders at devicePixelRatio x Resolution Scale device pixels per
// CSS pixel, held between a floor of 0.5 and a per-tier cap (1 on Low, 2
// otherwise). App sets the canvas from `canvasDpr` and the Settings slider
// offers only the steps that change it (`resolutionScaleBounds`), so the two
// cannot disagree. Working if every slider step renders differently and a
// stored scale outside the range reads as its nearest end.
export const CANVAS_DPR_FLOOR = 0.5;
const RESOLUTION_SCALE_MIN = 0.25;
const RESOLUTION_SCALE_STEPS = 20;

const safeRatio = (dpr: number): number => (Number.isFinite(dpr) && dpr > 0 ? dpr : 1);

export const canvasDprCap = (quality: GraphicsQuality | string): number =>
  quality === 'low' ? 1 : 2;

export const canvasDpr = (
  dpr: number,
  resolutionScale: number,
  quality: GraphicsQuality | string
): number => {
  const scale = Number.isFinite(resolutionScale) && resolutionScale > 0 ? resolutionScale : 1;
  return Math.max(CANVAS_DPR_FLOOR, Math.min(safeRatio(dpr) * scale, canvasDprCap(quality)));
};

/**
 * The lowest and highest Resolution Scale steps (on the slider's 5% grid) that
 * still change the canvas: below the floor every step renders like the floor,
 * above the ceiling every step renders like the cap.
 */
export const resolutionScaleBounds = (
  dpr: number,
  quality: GraphicsQuality | string
): { floor: number; ceiling: number } => {
  const ratio = safeRatio(dpr);
  const rawFloor = Math.max(RESOLUTION_SCALE_MIN, CANVAS_DPR_FLOOR / ratio);
  const floor = Math.min(
    1,
    Math.ceil(rawFloor * RESOLUTION_SCALE_STEPS - 1e-9) / RESOLUTION_SCALE_STEPS
  );
  const rawCeiling = canvasDprCap(quality) / ratio;
  const ceiling = Math.min(
    1,
    Math.max(floor, Math.ceil(rawCeiling * RESOLUTION_SCALE_STEPS - 1e-9) / RESOLUTION_SCALE_STEPS)
  );
  return { floor, ceiling };
};

// Browser zoom and a move to another monitor change devicePixelRatio. Both
// usually fire `resize`, but a move between screens of the same CSS size does
// not, so the resolution media query for the current ratio is watched too: it
// fires once, when the ratio leaves that value, and is re-armed for the new one.
const readRatio = (): number =>
  typeof window === 'undefined' ? 1 : safeRatio(window.devicePixelRatio);

const subscribe = (notify: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  let query: MediaQueryList | null = null;
  let armedRatio = 0;
  const onChange = () => {
    if (readRatio() !== armedRatio) arm();
    notify();
  };
  const disarm = () => {
    query?.removeEventListener?.('change', onChange);
    query = null;
  };
  function arm() {
    disarm();
    armedRatio = readRatio();
    if (typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(`(resolution: ${armedRatio}dppx)`);
    if (typeof list?.addEventListener !== 'function') return;
    query = list;
    query.addEventListener('change', onChange);
  }
  arm();
  window.addEventListener('resize', onChange);
  return () => {
    window.removeEventListener('resize', onChange);
    disarm();
  };
};

export const useDevicePixelRatio = (): number =>
  useSyncExternalStore(subscribe, readRatio, () => 1);
