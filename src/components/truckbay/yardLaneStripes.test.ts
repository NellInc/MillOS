import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { YARD_LANE_STRIPE_SIZE, YARD_LANE_STRIPES } from './yardSurfaces';

/**
 * final3 med-12 packing doorway (x 490-540, y 570-580): "short bright dash
 * fragments". The probe (hide `world-logistics`, then each candidate under the
 * pixels in turn) put them on the receiving east lane's first stripe: a
 * 0.15 x 4 m dash at yard z = 0, i.e. world (18, -0.01, -50), which ran 2 m
 * in under the hall's plinth and slab. Drawn with the `strong` -4 paint bias,
 * at the packing camera's grazing angle it beat the slab 1 cm above it in
 * fragments: a dashed line on the hall floor. Every lane had one at z = 0.
 */
describe('yard lane stripes', () => {
  const hall = SITE_LAYOUT.factory.bounds;
  // The wall's outer face: the 0.55 m plinth is centred on the wall line.
  const wallOuter = hall.maxZ + 0.55 / 2;

  it('start beyond the hall wall in every yard', () => {
    const [, length] = YARD_LANE_STRIPE_SIZE;
    for (const [name, lane] of Object.entries(YARD_LANE_STRIPES)) {
      expect(lane.zs.length, name).toBeGreaterThan(0);
      for (const z of lane.zs) {
        const world = lane.originZ + z;
        const near = Math.abs(world) - length / 2;
        expect(near, `${name} stripe at yard z ${z}`).toBeGreaterThan(wallOuter + 0.5);
      }
    }
  });
});
