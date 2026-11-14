/**
 * A temper answer across a reload (review 2). The Chronicle store saves at
 * once; the plant (the campaign, the partner's proposals) every 5 s. A reload
 * between the two restores the plant from before an answer the Chronicle
 * already holds, and the card is answered again. The Chronicle must not book
 * the drying twice, nor rest the wheat twice; the plant, whose older save does
 * not hold the first answer's energy, books it once.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, signCharter } from '../../chronicle/engine';
import { proposalEffect } from '../../simulation/partnerProposals';
import { runTemper } from '../temperRuntime';

function wetChronicle() {
  const signed = signCharter(createInitialState(), { ...DEFAULT_CHARTER }, 11, {
    reportId: null,
    qcTestIds: [],
    challengeIds: [],
    orders: [],
  }).state;
  return { ...signed, crop: { index: 1, kind: 'wet' as const, treated: false } };
}

const FACTS = {
  shiftIndex: 3,
  cropYear: 1,
  moisturePct: 15.8,
  base: 99.2,
  standardPenalty: 5,
  driedPenalty: 0,
  openMinimums: [95, 92],
  dryingCost: 61.5,
  dryingKwh: 410,
  inForce: 'standard' as const,
};

beforeEach(() => {
  useOperationsCampaignStore.getState().resetCampaign();
  useChronicleStore.setState({ ...useChronicleStore.getInitialState(), chronicle: wetChronicle() });
});
afterEach(() => useChronicleStore.setState(useChronicleStore.getInitialState(), true));

describe('a temper answer, answered again after a reload between the two saves', () => {
  it('books the drying and the rest once in the Chronicle, and once in the restored plant', () => {
    const effect = proposalEffect('temper', 'dry-first', FACTS as never);
    expect(effect).toMatchObject({ type: 'temper', key: 'temper-1-3' });
    // The plant's last save, from before the answer.
    const olderPlant = structuredClone(useOperationsCampaignStore.getState().economics);
    const energyBefore = olderPlant.energyCost;
    expect(runTemper(effect as never)).toBe(true);
    const chronicle = () => useChronicleStore.getState().chronicle;
    expect(chronicle().dryingSinceClose).toBe(61.5);
    expect(chronicle().crop?.temper?.schedule).toHaveLength(1);
    // Reload: the Chronicle as saved after the answer, the plant from before.
    const savedChronicle = JSON.parse(
      JSON.stringify({
        chronicle: chronicle(),
        temperAnswers: useChronicleStore.getState().temperAnswers,
      })
    );
    useChronicleStore.setState(savedChronicle);
    useOperationsCampaignStore.setState({ economics: olderPlant });
    // The card is answered again, a little later on the restored clock.
    useOperationsCampaignStore.setState({ elapsedMinutes: 4 });
    expect(runTemper(effect as never)).toBe(true);
    expect(chronicle().dryingSinceClose).toBe(61.5);
    expect(chronicle().crop?.temper?.schedule).toHaveLength(1);
    expect(useOperationsCampaignStore.getState().economics.energyCost - energyBefore).toBeCloseTo(
      61.5,
      6
    );
    // A different card books as before.
    const next = proposalEffect('temper', 'dry-first', { ...FACTS, shiftIndex: 4 } as never);
    expect(runTemper(next as never)).toBe(true);
    expect(chronicle().dryingSinceClose).toBe(123);
    expect(chronicle().crop?.temper?.schedule).toHaveLength(2);
  });

  it('keeps the answers it booked through its own save', () => {
    runTemper(proposalEffect('temper', 'dry-first', FACTS as never) as never);
    const persisted = JSON.parse(
      JSON.stringify({
        chronicle: useChronicleStore.getState().chronicle,
        deferredPrompts: [],
        temperAnswers: useChronicleStore.getState().temperAnswers,
      })
    );
    const merge = useChronicleStore.persist.getOptions().merge!;
    const merged = merge(persisted, useChronicleStore.getInitialState()) as ReturnType<
      typeof useChronicleStore.getState
    >;
    expect(merged.temperAnswers).toEqual([
      { key: '11:temper-1-3', option: 'dry-first', drying: 61.5 },
    ]);
  });
});
