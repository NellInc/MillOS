import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  capturePhysicalSession,
  decodePhysicalSession,
  encodePhysicalSession,
} from '../physicalSession';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { usePartnerProposalStore, readSavedProposals } from '../../stores/partnerProposalStore';
import { raiseProposals, type PlantWorld } from '../../simulation/partnerProposals';
import type { IntakeFacts } from '../../simulation/intakeProposal';
import {
  registerReplayParticipant,
  REQUIRED_REPLAY_PARTICIPANTS,
} from '../../simulation/workplaceReplayRuntime';

// Plan items 3.1 and 3.5 add only optional saved fields: a lot's readings
// (already optional), an incident's origin, answer and end, and two proposal
// kinds. Working if a save from before them restores with none of them (a lot
// with no readings, an incident on its old route), and one written now keeps
// every one.

const lotFacts: IntakeFacts = {
  deliveryIndex: 3,
  amountKg: 15000,
  supplier: null,
  cropYear: 1,
  cropKind: 'sprouted',
  moisturePct: 14.6,
  proteinPct: 11,
  fallingNumberS: 190,
  siloId: 'silo-2',
  blendSiloId: 'silo-0',
  base: 99.2,
  straightPenalty: 9,
  blendPenalty: 0,
  refusePenalty: 0,
  openMinimums: [95, 92],
  refusalFee: 120,
  shortMinutes: 0,
};

let removeOwners: (() => void)[] = [];
afterEach(() => removeOwners.forEach((remove) => remove()));
beforeEach(() => {
  // decode requires every scene participant, as the game registers them.
  removeOwners = REQUIRED_REPLAY_PARTICIPANTS.map((id) =>
    registerReplayParticipant(id, { capture: () => ({ phase: 'waiting' }), restore: () => {} })
  );
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  usePartnerProposalStore.getState().reset();
});

describe('a save around intake and plant incidents', () => {
  it('written now, keeps a lot readings, an incident origin, answer and end, and an open intake', () => {
    useMaterialFlowStore.getState().receiveGrainDelivery(15000, {
      materialType: 'wheat_grain',
      siloId: 'silo-4',
      crop: {
        cropYear: 1,
        kind: 'sprouted',
        moisturePct: 14.6,
        proteinPct: 11,
        fallingNumberS: 190,
      },
    });
    const campaign = useOperationsCampaignStore.getState();
    const incident = campaign.triggerIncident('power_sag', { origin: 'plant' })!;
    campaign.markIncidentEffectApplied(incident.id);
    useOperationsCampaignStore.getState().respondToIncident(incident.id, 'ride', 'operator');
    const world = {
      sessionId: useMaterialFlowStore.getState().sessionId,
      minute: 0,
      programme: { canAccept: false, programmeCount: 0, lastAcceptedBy: null, offer: null },
      units: [],
      intake: lotFacts,
    } satisfies PlantWorld;
    usePartnerProposalStore.getState().setProposals(
      raiseProposals(world, [], () => 'proposal-00001'),
      1
    );

    const saved = decodePhysicalSession(encodePhysicalSession(capturePhysicalSession()));
    const lots = [...(saved.material.sourceLots as Map<string, { crop?: unknown }>).values()];
    expect(lots.some((lot) => lot.crop)).toBe(true);
    const restoredIncident = saved.operations.incidents.find((i) => i.id === incident.id)!;
    expect(restoredIncident.origin).toBe('plant');
    expect(restoredIncident.response).toBe('ride');
    expect(restoredIncident.endsAtMinute).toBe(120);
    const proposals = readSavedProposals(saved.proposals).proposals;
    expect(proposals.map((p) => p.kind)).toEqual(['intake']);
    expect(proposals[0].facts).toEqual(lotFacts);
  });

  it('written before them, restores a lot with no readings and an incident on its old route', () => {
    useMaterialFlowStore.getState().receiveGrainDelivery(15000, { materialType: 'wheat_grain' });
    useOperationsCampaignStore.getState().triggerIncident('severe_rain');
    const older = JSON.parse(encodePhysicalSession(capturePhysicalSession())) as {
      operations: { incidents: Record<string, unknown>[] };
    };
    for (const entry of older.operations.incidents) {
      delete entry.origin;
      delete entry.response;
      delete entry.endsAtMinute;
    }
    const saved = decodePhysicalSession(JSON.stringify(older));
    const lots = [...(saved.material.sourceLots as Map<string, { crop?: unknown }>).values()];
    expect(lots.length).toBeGreaterThan(0);
    expect(lots.every((lot) => lot.crop === undefined)).toBe(true);
    const restored = saved.operations.incidents[0];
    expect(restored.kind).toBe('severe_rain');
    expect('origin' in restored).toBe(false);
    expect(restored.response).toBeUndefined();
  });
});
