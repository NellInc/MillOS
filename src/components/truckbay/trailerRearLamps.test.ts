import { describe, expect, it } from 'vitest';
import { TRAILER_REAR_DOOR, TRAILER_REAR_LAMPS } from './OptimizedTruckBay';

// The trailer faces +Z, so its rear faces are its most negative z.
const doorOuterFace = TRAILER_REAR_DOOR.z - TRAILER_REAR_DOOR.depth / 2;

describe('trailer rear lamp cluster', () => {
  it('stands every lamp lens proud of the closed doors, sharing no face with them', () => {
    // The z-fight probe found the reverse and signal lenses exactly on the door
    // face (0 mm, flickering against the door paint from behind the truck), and
    // the brake lamps 1 cm inside the doors, where they never showed at all.
    for (const { lamp, position, scale } of TRAILER_REAR_LAMPS) {
      const lens = position[2] - scale[2] / 2;
      const back = position[2] + scale[2] / 2;
      expect(doorOuterFace - lens, `${lamp} at x ${position[0]}`).toBeGreaterThanOrEqual(0.02);
      // Still seated on the door leaf, not floating behind it.
      expect(back, `${lamp} at x ${position[0]}`).toBeGreaterThan(doorOuterFace);
    }
  });
});
