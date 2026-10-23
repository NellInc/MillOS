import { describe, expect, it } from 'vitest';
import { FLOUR_SACK_HEIGHT, PALLET_SACK_LAYOUT } from '../../utils/flourSacks';
import { AUTHORED_PALLET_POSITION, COMPACT_FORK_LOAD } from './ForkliftModel';
import {
  FORKLIFT_BEACON,
  FORKLIFT_LOADED_TRAVEL_FORK_HEIGHT,
  forkliftBeaconLabelHeight,
  forkliftBeaconSpan,
} from './forkliftBeacon';

/** Top of the carried sacks above the pallet origin. */
const SACK_TOP = Math.max(
  ...PALLET_SACK_LAYOUT.map(
    ({ position, scale }) => position[1] + (FLOUR_SACK_HEIGHT * scale[1]) / 2
  )
);

const tiers = [
  {
    tier: 'authored' as const,
    loadTop: AUTHORED_PALLET_POSITION[1] + FORKLIFT_LOADED_TRAVEL_FORK_HEIGHT + SACK_TOP,
  },
  {
    tier: 'compact' as const,
    loadTop: COMPACT_FORK_LOAD.palletPosition[1] + FORKLIFT_LOADED_TRAVEL_FORK_HEIGHT + SACK_TOP,
  },
];

/**
 * final3-med-12 forklift and interior: the beacon's light wedge read as an
 * editor gizmo, a translucent blue pyramid over FLT01. It was an open cone of
 * revolution spun about its own axis, so the "sweep" changed nothing on screen:
 * what shipped was a static 16-sided translucent pyramid 1 m across.
 */
describe('forklift beacon', () => {
  it('is a lamp with a camera-facing glow, not a light cone', () => {
    expect('wedge' in FORKLIFT_BEACON).toBe(false);
    const { housing, base, lens, dome, reflector, glow } = FORKLIFT_BEACON;
    // Every solid part sits inside the lamp's housing envelope.
    for (const part of [base, lens, dome]) {
      expect(part.radius).toBeLessThanOrEqual(housing.radius + 1e-9);
      expect(part.bottom).toBeGreaterThanOrEqual(-housing.height / 2 - 1e-9);
      expect(part.top).toBeLessThanOrEqual(housing.height / 2 + 1e-9);
    }
    // Stacked base -> lens -> dome without a gap.
    expect(base.top).toBeCloseTo(lens.bottom, 9);
    expect(lens.top).toBeCloseTo(dome.bottom, 9);
    // The rotating reflector rides the lens face, inside the dome's height.
    expect(reflector.radius).toBeGreaterThanOrEqual(lens.radius);
    expect(reflector.radius + reflector.depth / 2).toBeLessThanOrEqual(housing.radius + 1e-9);
    expect(reflector.y + reflector.height / 2).toBeLessThanOrEqual(lens.top + 1e-9);
    expect(reflector.y - reflector.height / 2).toBeGreaterThanOrEqual(lens.bottom - 1e-9);
    // A soft spill a few lamp-widths across, not a metre-wide shape.
    expect(glow.diameter).toBeGreaterThanOrEqual(2 * housing.radius);
    expect(glow.diameter).toBeLessThanOrEqual(0.4);
  });

  it.each(tiers)(
    'lights its lens above a load carried at travel height ($tier)',
    ({ tier, loadTop }) => {
      const lensCentre =
        FORKLIFT_BEACON.mountHeight[tier] +
        (FORKLIFT_BEACON.lens.bottom + FORKLIFT_BEACON.lens.top) / 2;
      expect(lensCentre - loadTop).toBeGreaterThanOrEqual(0.03);
    }
  );

  it.each(tiers)('keeps the fleet label clear of the lamp and its glow ($tier)', ({ tier }) => {
    const [bottom, top] = forkliftBeaconSpan(tier);
    const lamp = FORKLIFT_BEACON.mountHeight[tier];
    expect(bottom).toBeCloseTo(lamp - FORKLIFT_BEACON.housing.height / 2, 9);
    const lensCentre = lamp + (FORKLIFT_BEACON.lens.bottom + FORKLIFT_BEACON.lens.top) / 2;
    expect(top).toBeGreaterThanOrEqual(lensCentre + FORKLIFT_BEACON.glow.diameter / 2 - 1e-9);
    // The 0.17 m label sits wholly above the glow.
    expect(forkliftBeaconLabelHeight(tier) - 0.17 / 2).toBeGreaterThan(top);
  });
});
