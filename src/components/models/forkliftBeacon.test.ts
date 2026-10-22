import { describe, expect, it } from 'vitest';
import { FLOUR_SACK_HEIGHT, PALLET_SACK_LAYOUT } from '../../utils/flourSacks';
import { AUTHORED_PALLET_POSITION, COMPACT_FORK_LOAD } from './ForkliftModel';
import {
  FORKLIFT_BEACON,
  FORKLIFT_LOADED_TRAVEL_FORK_HEIGHT,
  forkliftBeaconLabelHeight,
  forkliftBeaconWedgeSpan,
} from './forkliftBeacon';

/** Top of the carried sacks above the pallet origin. */
const SACK_TOP = Math.max(
  ...PALLET_SACK_LAYOUT.map(
    ({ position, scale }) => position[1] + (FLOUR_SACK_HEIGHT * scale[1]) / 2
  )
);

/**
 * final-med-12 forklift (1060,410)-(1180,590): the beacon's light cone passed
 * through the top bag layer. The cone hung 0.43 m below the lamp and widened
 * downward, so its base ring sat at 1.43 m while a load carried at travel
 * height tops out at 1.80 m: seen from ahead, the cone came out of the bags.
 */
describe('forklift beacon light cone', () => {
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

  it.each(tiers)('rides above a load carried at travel height ($tier)', ({ tier, loadTop }) => {
    const [bottom] = forkliftBeaconWedgeSpan(tier);
    expect(bottom - loadTop).toBeGreaterThanOrEqual(0.05);
  });

  it.each(tiers)('starts at its lamp and keeps clear of the fleet label ($tier)', ({ tier }) => {
    const [bottom, top] = forkliftBeaconWedgeSpan(tier);
    const lamp = FORKLIFT_BEACON.mountHeight[tier];
    expect(bottom).toBeGreaterThanOrEqual(lamp - FORKLIFT_BEACON.housing.height / 2);
    expect(bottom).toBeLessThanOrEqual(lamp + FORKLIFT_BEACON.housing.height / 2);
    // The 0.17 m label sits wholly above the cone's apex.
    expect(forkliftBeaconLabelHeight(tier) - 0.17 / 2).toBeGreaterThan(top);
  });
});
