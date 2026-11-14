import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMillOSAgentRuntime } from '../adapters/runtime/installAgentRuntime';
import { useProductionStore } from '../../stores/productionStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { MachineType } from '../../types';
import { usePartnerProposalStore } from '../../stores/partnerProposalStore';
import { raiseProposals, type PlantWorld } from '../../simulation/partnerProposals';
import { setLocale } from '../../i18n';
import { unitInService } from '../../systems/unitService';

// Plan item 3.0: the partner's proposals are the floor's cards now. An agent
// sees each one in production.aiDecisions (type 'proposal', its options and
// prices) and answers it with the old decision.respond contract.

const api = () => window.__MILLOS_AGENT__!;

const world: PlantWorld = {
  sessionId: 'session-1',
  minute: 0,
  programme: { canAccept: false, programmeCount: 0, lastAcceptedBy: null, offer: null },
  units: [
    {
      machineId: 'rm-101',
      machineName: 'R.M. 101',
      wear: 62,
      breakdownWear: 90,
      wearPerMinute: 0.039,
      servicePart: 'filters',
      failureParts: ['bearings', 'belts'],
      repairMinutes: 44.5,
      workOrderRatePerHour: 90,
      qualityServiced: 99.5,
      qualityAtFailure: 97.5,
      strictestMinimum: 95,
      openWearAlertId: 'alert-00001',
      brokenDown: false,
      minimumServiceWear: 30,
    },
  ],
};

describe('decision.respond on a partner proposal', () => {
  const removals: Array<() => void> = [];
  const before = useProductionStore.getState().aiDecisions;
  beforeEach(() => {
    setLocale('en');
    useProductionStore.setState({ aiDecisions: [] });
    useOperationsCampaignStore.getState().resetCampaign();
    usePartnerProposalStore.getState().setProposals(
      raiseProposals(world, [], () => 'proposal-00001'),
      1
    );
    removals.push(installMillOSAgentRuntime(window));
  });
  afterEach(() => {
    removals.splice(0).forEach((remove) => remove());
    useProductionStore.setState({ aiDecisions: before });
    usePartnerProposalStore.getState().reset();
  });

  const preview = (parameters: Record<string, string>) =>
    api().preview(
      api().draft({
        capabilityId: 'ai.respond-to-decision',
        targetUri: 'millos://decision/proposal-00001',
        parameters: { decisionUri: 'millos://decision/proposal-00001', ...parameters },
        reason: 'Answer the partner.',
      })
    );

  it('refuses a deferral: the window is the deferral', async () => {
    const shown = await preview({ disposition: 'deferred' });
    expect(shown.status).toBe('denied');
  });

  it('answers "rejected" with the other answer, recorded as the agent’s', async () => {
    const shown = await preview({ disposition: 'rejected' });
    expect(shown.status).toBe('ready');
    const receipt = await api().commit(shown);
    expect(receipt.status).toBe('verified');
    expect(usePartnerProposalStore.getState().proposals[0].resolution).toMatchObject({
      optionId: 'run-on',
      decidedBy: 'agent',
    });
  });
  it('answers "accepted" with the partner\u2019s choice: the unit is serviced, through the kernel', async () => {
    useProductionStore.setState({
      machines: [
        {
          id: 'rm-101',
          name: 'R.M. 101',
          type: MachineType.ROLLER_MILL,
          position: [0, 0, 0],
          size: [1, 1, 1],
          rotation: 0,
          status: 'warning',
          metrics: { rpm: 450, temperature: 50, vibration: 1, load: 80, wear: 62, efficiency: 90 },
          lastMaintenance: '2026-11-01',
          nextMaintenance: '2026-11-08',
        },
      ],
    });
    const filters = useBreakdownStore.getState().partsInventory.filters;
    const shown = await preview({ disposition: 'accepted' });
    expect(shown.status).toBe('ready');
    const receipt = await api().commit(shown);
    expect(receipt.status).toBe('verified');
    expect(usePartnerProposalStore.getState().proposals[0].resolution).toMatchObject({
      optionId: 'service',
      decidedBy: 'agent',
      ran: true,
    });
    // The service is under way on the game clock (D7): the unit is offline
    // and its part is taken now; its wear comes off when the minutes have run.
    expect(unitInService('rm-101')).toBe(true);
    expect(useProductionStore.getState().machines[0].status).toBe('idle');
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(filters - 1);
  });

  it('answers "accepted" on a programme: the programme is accepted, through the kernel', async () => {
    const campaign = useOperationsCampaignStore.getState();
    useOperationsCampaignStore.setState({
      orders: campaign.orders.map((order) => ({
        ...order,
        status: 'fulfilled' as const,
        shippedKg: order.requiredKg,
        completedAtMinute: 1,
      })),
      activeOrderId: null,
    });
    usePartnerProposalStore.getState().reset();
    usePartnerProposalStore.getState().setProposals(
      raiseProposals(
        {
          ...world,
          units: [],
          programme: {
            canAccept: true,
            programmeCount: 0,
            lastAcceptedBy: null,
            offer: {
              programmeNumber: 2,
              programmeCount: 0,
              committedKg: 11500,
              revenue: 9800,
              firstDueMinutes: 125,
              stockReadyKg: 0,
            },
          },
        },
        [],
        () => 'proposal-00001'
      ),
      1
    );
    const shown = await preview({ disposition: 'accepted' });
    expect(shown.status).toBe('ready');
    const receipt = await api().commit(shown);
    expect(receipt.status).toBe('verified');
    expect(useOperationsCampaignStore.getState().programmeCount).toBe(1);
  });
});
