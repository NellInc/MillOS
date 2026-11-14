import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import {
  capturePhysicalSession,
  decodePhysicalSession,
  encodePhysicalSession,
} from '../utils/physicalSession';
import {
  registerReplayParticipant,
  REQUIRED_REPLAY_PARTICIPANTS,
} from '../simulation/workplaceReplayRuntime';

/**
 * `bookDemurrageCharge` (added with plan item 3.5 for the relief lorry and a
 * refused lot's fee). Reviewed in the plant tail: it writes the existing
 * demurrage line (whole session and this shift) once, adds no saved field, and
 * its only callers run in play (incident answers outside benchmark runtime;
 * intake only under a charter). By reading, not by a tick test: the ordinary
 * demurrage line charges only while the shipping truck stands docked and held
 * (updateCampaign's rates), and the relief lorry pays for delay minutes the
 * shipping truck spends away (cancelShippingDelay), a refused lot's fee for the
 * receiving dock, so the two do not charge for the same time.
 */
describe('a booked demurrage charge', () => {
  let owners: Array<() => void> = [];
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    // The scene's owners, as a mounted scene registers them, so the shift can be saved.
    owners = REQUIRED_REPLAY_PARTICIPANTS.map((id) =>
      registerReplayParticipant(id, { capture: () => ({}), restore: () => undefined })
    );
  });
  afterEach(() => owners.forEach((remove) => remove()));

  it('adds once to the session and the shift, and ignores a charge that is not a cost', () => {
    const before = useOperationsCampaignStore.getState();
    before.bookDemurrageCharge(120);
    for (const bad of [0, -50, Number.NaN, Number.POSITIVE_INFINITY])
      useOperationsCampaignStore.getState().bookDemurrageCharge(bad);
    const after = useOperationsCampaignStore.getState();
    expect(after.economics.demurrageCost - before.economics.demurrageCost).toBe(120);
    expect(after.shiftMetrics.demurrageCost - before.shiftMetrics.demurrageCost).toBe(120);
    // A one-off charge, not a standing rate the card prices per hour.
    expect(after.costRates).toEqual(before.costRates);
  });

  it('is saved and restored with the shift, in fields the save already carries', () => {
    useOperationsCampaignStore.getState().bookDemurrageCharge(35);
    const saved = decodePhysicalSession(encodePhysicalSession(capturePhysicalSession()));
    expect(saved.operations.economics.demurrageCost).toBe(35);
    expect(saved.operations.shiftMetrics.demurrageCost).toBe(35);
  });
});
