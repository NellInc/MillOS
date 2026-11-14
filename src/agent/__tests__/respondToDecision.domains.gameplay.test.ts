import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMillOSAgentRuntime } from '../adapters/runtime/installAgentRuntime';
import { useProductionStore } from '../../stores/productionStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { usePartnerProposalStore } from '../../stores/partnerProposalStore';
import { raiseProposals, type PlantWorld } from '../../simulation/partnerProposals';
import { setLocale } from '../../i18n';

// ai.respond-to-decision writes only its own production record (the registry's
// owner rule: every write starts with the owner domain); what the chosen answer
// then does runs through the owning store's own action, declared as a side
// effect and bounded by the handler's allowedDomains, as
// simulation.start-fire-drill does for the equipment it stops. Since plan items
// 3.1 and 3.5 a proposal's answer also recalls a notified supplier's stock
// (quality, material), receives or refuses an intake lot (material, campaign,
// logistics) and sends a relief lorry (logistics). Working if the kernel
// verifies such an answer instead of failing it on domain scope after it ran.

const api = () => window.__MILLOS_AGENT__!;

describe('decision.respond reaches the domains its answers act in', () => {
  const removals: Array<() => void> = [];
  const before = useProductionStore.getState().aiDecisions;
  beforeEach(() => {
    setLocale('en');
    useProductionStore.setState({ aiDecisions: [] });
    useOperationsCampaignStore.getState().resetCampaign();
    useQCLabStore.getState().resetQCLab();
    usePartnerProposalStore.getState().reset();
    removals.push(installMillOSAgentRuntime(window));
  });
  afterEach(() => {
    removals.splice(0).forEach((remove) => remove());
    useProductionStore.setState({ aiDecisions: before });
    usePartnerProposalStore.getState().reset();
  });

  /** A plant supplier notice, its two answers raised as proposal-00001. */
  function supplierNotice() {
    const incident = useOperationsCampaignStore
      .getState()
      .triggerIncident('supplier_contamination', { origin: 'plant' })!;
    // The notice the tick raises with the incident (UnifiedGameTick).
    useQCLabStore.getState().triggerContaminationAlert({
      type: 'supplier_notification',
      severity: 'high',
      sourceLotIds: [],
      batchIds: [],
      controlSource: 'Operations campaign controller',
    });
    const world: PlantWorld = {
      sessionId: 'session-1',
      minute: 0,
      programme: { canAccept: false, programmeCount: 0, lastAcceptedBy: null, offer: null },
      units: [],
      incidents: [
        {
          id: incident.id,
          phase: 'raised',
          response: null,
          facts: {
            incidentId: incident.id,
            incidentKind: 'supplier_contamination',
            origin: 'plant',
            machineId: null,
            qualityPenalty: 0,
            energyMultiplier: 1,
            minutes: 120,
            lineStamp: 99.5,
            openMinimums: [95],
            energyCostPerHour: 0,
            delayLateMinutes: 0,
            delayLateCost: 0,
            reliefCost: 0,
            servicePartPrice: 0,
            serviceMinutes: 0,
            recallKg: 0,
            recallCost: 0,
          },
        },
      ],
    };
    usePartnerProposalStore.getState().setProposals(
      raiseProposals(world, [], () => 'proposal-00001'),
      1
    );
    const proposal = usePartnerProposalStore.getState().proposals[0];
    expect(proposal.options.map((option) => option.id).sort()).toEqual(['recall', 'test-first']);
    return proposal;
  }

  const answer = async (parameters: Record<string, string>) => {
    const shown = await api().preview(
      api().draft({
        capabilityId: 'ai.respond-to-decision',
        targetUri: 'millos://decision/proposal-00001',
        parameters: { decisionUri: 'millos://decision/proposal-00001', ...parameters },
        reason: 'Recall the notified stock.',
      })
    );
    expect(shown.status).toBe('ready');
    return api().commit(shown);
  };
  const recalled = () =>
    useQCLabStore
      .getState()
      .qcLab.contaminationAlerts.every((alert) => alert.resolution === 'recalled');

  it('verifies a recall answered on a supplier notice: quality changes, as declared', async () => {
    const proposal = supplierNotice();
    // "recall" is the partner's choice or the other of the two.
    const receipt = await answer({
      disposition: proposal.defaultOptionId === 'recall' ? 'accepted' : 'rejected',
    });
    expect(recalled()).toBe(true);
    expect(receipt.status, JSON.stringify(receipt)).toBe('verified');
  });

  // "modified" naming an option is the contract's third way to answer; on a
  // two-answer proposal it reads back as accepted or rejected, the same answer.
  it('verifies "modified" naming one of two answers', async () => {
    supplierNotice();
    const receipt = await answer({ disposition: 'modified', modifiedAction: 'recall' });
    expect(recalled()).toBe(true);
    expect(receipt.status, JSON.stringify(receipt)).toBe('verified');
  });
});
