import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DOCK_SHELTER_GUIDE_STRIPE,
  DOCK_SHELTER_HEAD_PLEATS,
  DOCK_SHELTER_PAD,
  DOCK_SHELTER_PLEAT,
  DOCK_SHELTER_SIDE_PLEATS,
  type ShelterPart,
} from './dockApronLayout';

const lo = (p: ShelterPart, axis: 0 | 1 | 2) => p.position[axis] - p.scale[axis] / 2;
const hi = (p: ShelterPart, axis: 0 | 1 | 2) => p.position[axis] + p.scale[axis] / 2;

/**
 * final4 logistics-close (centre): the shelter pads either side of the ribbed
 * door read as untreated dark boxes. Pads are fabric over foam, folded.
 */
describe('dock shelter pads', () => {
  it('folds each side pad across its full height, every fold proud of the faces it wraps', () => {
    const pad = DOCK_SHELTER_PAD.side;
    expect(DOCK_SHELTER_SIDE_PLEATS.length).toBeGreaterThanOrEqual(12);
    for (const fold of DOCK_SHELTER_SIDE_PLEATS) {
      expect(hi(fold, 0) - pad.width / 2).toBeGreaterThanOrEqual(0.015);
      expect(-lo(fold, 0) - pad.width / 2).toBeGreaterThanOrEqual(0.015);
      expect(hi(fold, 2) - pad.depth / 2).toBeGreaterThanOrEqual(0.015);
      expect(Math.abs(fold.position[1]) + fold.scale[1] / 2).toBeLessThan(pad.height / 2);
    }
    const ys = DOCK_SHELTER_SIDE_PLEATS.map((f) => f.position[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(pad.height - 0.6);
    // About 43 px per metre at logistics-close: folds at least 8 px apart.
    expect(DOCK_SHELTER_PLEAT.pitch * 43).toBeGreaterThanOrEqual(8);
  });

  it('folds the head pad along its width', () => {
    const pad = DOCK_SHELTER_PAD.head;
    expect(DOCK_SHELTER_HEAD_PLEATS.length).toBeGreaterThanOrEqual(12);
    for (const fold of DOCK_SHELTER_HEAD_PLEATS) {
      expect(-lo(fold, 1) - pad.height / 2).toBeGreaterThanOrEqual(0.015);
      expect(hi(fold, 2) - pad.depth / 2).toBeGreaterThanOrEqual(0.015);
      expect(Math.abs(fold.position[0]) + fold.scale[0] / 2).toBeLessThan(pad.width / 2);
    }
  });

  it('runs a guide stripe down each side pad yard face, clear of the folds', () => {
    const foldFront = Math.max(...DOCK_SHELTER_SIDE_PLEATS.map((f) => hi(f, 2)));
    expect(lo(DOCK_SHELTER_GUIDE_STRIPE, 2)).toBeGreaterThan(foldFront);
    expect(DOCK_SHELTER_GUIDE_STRIPE.scale[1]).toBeGreaterThan(DOCK_SHELTER_PAD.side.height * 0.9);
  });

  it('mounts the folds on all three pads and the stripe on both side pads', () => {
    const source = readFileSync('src/components/TruckBay.tsx', 'utf8');
    const shelter = source.slice(source.indexOf('export const DockShelter'));
    expect(shelter.match(/<ShelterFolds parts=\{DOCK_SHELTER_SIDE_PLEATS\} \/>/g)).toHaveLength(2);
    expect(shelter.match(/<ShelterFolds parts=\{DOCK_SHELTER_HEAD_PLEATS\} \/>/g)).toHaveLength(1);
    expect(shelter.match(/<ShelterGuideStripe \/>/g)).toHaveLength(2);
  });
});
