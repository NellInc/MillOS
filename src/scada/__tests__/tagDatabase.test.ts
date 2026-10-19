import { describe, it, expect } from 'vitest';
import { VEHICLE_TAG_IDS, getTagById } from '../tagDatabase';

// truckController.ts MAXIMUM_ARTICULATION: every normal docking reaches it.
const ARTICULATION_CLAMP_DEG = (0.7 * 180) / Math.PI;

describe('vehicle steering and articulation tags', () => {
  it('carry no alarm limit inside the controller articulation clamp', () => {
    for (const [vehicleId, ids] of Object.entries(VEHICLE_TAG_IDS)) {
      const tag = getTagById(ids.steeringOrArticulation);
      expect(tag, vehicleId).toBeDefined();
      for (const field of ['alarmLo', 'alarmHi', 'alarmLoLo', 'alarmHiHi'] as const) {
        const limit = tag?.[field];
        if (limit === undefined) continue;
        expect(Math.abs(limit), `${tag?.id} ${field}`).toBeGreaterThan(ARTICULATION_CLAMP_DEG);
      }
    }
  });
});
