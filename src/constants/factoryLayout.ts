/**
 * Factory layout constants
 *
 * Central source of truth for zone centerline positions used across the scene.
 * Keep these aligned with `src/components/MillScene.tsx`.
 */

export const FACTORY_ZONE_Z = {
  silos: -22,
  milling: -6,
  sifting: 6,
  packing: 25,
} as const;
