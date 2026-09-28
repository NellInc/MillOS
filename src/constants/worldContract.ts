import type { Object3D } from 'three';

export const CONTINUOUS_WORLD_LAYER_IDS = [
  'world-root',
  'world-environment',
  'world-factory-process',
  'world-factory-infrastructure',
  'world-conveyors',
  'world-forklifts',
  'world-logistics',
  'world-personnel',
  'world-community-details',
  'world-terrain',
  'authored-factory-exterior',
  'authored-castle',
  'authored-farm',
  'authored-village',
] as const;

/** Celestial bodies share the world permanently, while time may hide either disk. */
export const PRESENT_WORLD_LAYER_IDS = [
  'optimized-sky-system',
  'optimized-horizon-backdrop',
  'near-horizon-city',
  'sun-visual',
  'moon-visual',
] as const;

export type ContinuousWorldLayerId = (typeof CONTINUOUS_WORLD_LAYER_IDS)[number];
export type PresentWorldLayerId = (typeof PRESENT_WORLD_LAYER_IDS)[number];
export type WorldLayerId = ContinuousWorldLayerId | PresentWorldLayerId;

export interface WorldIntegrityReport {
  required: WorldLayerId[];
  present: WorldLayerId[];
  visible: ContinuousWorldLayerId[];
  missing: WorldLayerId[];
  hidden: ContinuousWorldLayerId[];
  passed: boolean;
}

function isEffectivelyVisible(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

/**
 * Verify the permanent authored-world contract against the live Three scene.
 * Missing and hidden stay separate because they diagnose different regressions:
 * failed/lazy mounting versus a camera or quality gate splitting the world.
 */
export function inspectWorldIntegrity(
  root: Pick<Object3D, 'getObjectByName'>
): WorldIntegrityReport {
  const required = [...CONTINUOUS_WORLD_LAYER_IDS, ...PRESENT_WORLD_LAYER_IDS];
  const present: WorldLayerId[] = [];
  const visible: ContinuousWorldLayerId[] = [];
  const missing: WorldLayerId[] = [];
  const hidden: ContinuousWorldLayerId[] = [];

  for (const id of required) {
    const object = root.getObjectByName(id);
    if (!object) {
      missing.push(id);
      continue;
    }
    present.push(id);
    if (!(CONTINUOUS_WORLD_LAYER_IDS as readonly string[]).includes(id)) continue;
    const continuousId = id as ContinuousWorldLayerId;
    if (isEffectivelyVisible(object)) visible.push(continuousId);
    else hidden.push(continuousId);
  }

  return {
    required,
    present,
    visible,
    missing,
    hidden,
    passed: missing.length === 0 && hidden.length === 0,
  };
}
