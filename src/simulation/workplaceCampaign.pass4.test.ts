import { describe, expect, it } from 'vitest';
import { createWorkplace, transitionWorkplace } from './bilateralWorkplace';
import { campaignOutcomes } from './workplaceCampaign';
import type { WorkplaceMission, WorkplaceState } from '../types/workplace';

const binding = (): WorkplaceMission => ({
  orderId: 'order-real',
  customer: "Riverside Bakers' Cooperative",
  materialSessionId: 'session-real',
  startingShippedKg: 0,
  originalTargetKg: 6000,
  targetKg: 6000,
  observedShippedKg: 0,
  creditedKg: 0,
  manifestIds: [],
  evidence: 'current',
});

/** A linked season whose 6,000 kg order was renegotiated to a 4,800 kg installment. */
function renegotiated(creditedKg: number): WorkplaceState {
  const started = transitionWorkplace(createWorkplace(), {
    type: 'startCampaign',
    args: ['cooperative', 17, binding()],
  }).state;
  const mission = { ...started.campaign!.mission!, targetKg: 4800, creditedKg };
  return { ...started, campaign: { ...started.campaign!, mission } };
}

describe('linked delivery outcome, fourth pass', () => {
  it('never reports more delivered than the figure it is measured against', () => {
    const { delivery } = campaignOutcomes(renegotiated(6000));
    expect(delivery.status).toBe('met');
    expect(delivery.deliveredKg).toBeLessThanOrEqual(delivery.targetKg);
    expect(delivery.targetKg).toBe(6000);
    // The deferral stays the one agreed; nothing of the order remains.
    expect(delivery.deferredKg).toBe(1200);
    expect(delivery.remainingKg).toBe(0);
  });

  it('past the installment, measures against the order', () => {
    const { delivery } = campaignOutcomes(renegotiated(5000));
    expect(delivery.status).toBe('met');
    expect(delivery.targetKg).toBe(6000);
    expect(delivery.deferredKg).toBe(1200);
    expect(delivery.remainingKg).toBe(1000);
  });

  it('below the installment, keeps the installment and the whole agreed deferral', () => {
    const { delivery } = campaignOutcomes(renegotiated(4000));
    expect(delivery.status).toBe('pending');
    expect(delivery.targetKg).toBe(4800);
    expect(delivery.deferredKg).toBe(1200);
    expect(delivery.remainingKg).toBe(2000);
  });
});
