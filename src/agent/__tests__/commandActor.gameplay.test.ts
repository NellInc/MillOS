import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMillOSAgentRuntime } from '../adapters/runtime/installAgentRuntime';
import { createMillOSRuntimeCommandHandlers } from '../adapters/runtime/runtimeCommandHandlers';
import { getOperatorRuntime } from '../client/operatorRuntime';
import { HUMAN_OPERATOR_URI } from '../command/authority';
import { useProductionStore } from '../../stores/productionStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { usePartnerProposalStore } from '../../stores/partnerProposalStore';
import { raiseProposals, type PlantWorld } from '../../simulation/partnerProposals';
import { proposalDeciderText } from '../../simulation/partnerProposalText';
import { setLocale } from '../../i18n';

// Who answered is recorded from the command's own actor, as every other
// handler does: the human operator's command is the player's, anything else
// the agent's. The window handle cannot supply the person (D-077): a draft
// naming the human operator is refused, so nothing it commits reads as the
// player's own decision in the debrief, the achievements or the record.

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

const PROPOSAL_URI = 'millos://decision/proposal-00001';

const handler = (capabilityId: string) =>
  createMillOSRuntimeCommandHandlers().find((item) => item.capabilityId === capabilityId)!;

const answer = (actorUri?: string, disposition = 'rejected') =>
  handler('ai.respond-to-decision').execute({
    targetUri: PROPOSAL_URI,
    ...(actorUri ? { actorUri } : {}),
    parameters: { decisionUri: PROPOSAL_URI, disposition },
  } as never);

const resolution = () => usePartnerProposalStore.getState().proposals[0].resolution;

function raiseProgramme() {
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
}

const programmeAcceptedBy = () =>
  useOperationsCampaignStore
    .getState()
    .logbook.filter((entry) => entry.wording?.key === 'logProgrammeAccepted')
    .map((entry) => entry.actor);

describe('a partner proposal answered through a command records who answered', () => {
  const removals: Array<() => void> = [];
  const decisions = useProductionStore.getState().aiDecisions;
  beforeEach(() => {
    setLocale('en');
    useProductionStore.setState({ aiDecisions: [] });
    useOperationsCampaignStore.getState().resetCampaign();
    usePartnerProposalStore.getState().setProposals(
      raiseProposals(world, [], () => 'proposal-00001'),
      1
    );
  });
  afterEach(() => {
    removals.splice(0).forEach((remove) => remove());
    useProductionStore.setState({ aiDecisions: decisions });
    usePartnerProposalStore.getState().reset();
  });

  it("records the human operator's answer as the player's, for the debrief", async () => {
    await answer(HUMAN_OPERATOR_URI);
    expect(resolution()).toMatchObject({ optionId: 'run-on', decidedBy: 'operator' });
    expect(proposalDeciderText(resolution()!.decidedBy, 'en')).toBe(
      proposalDeciderText('operator', 'en')
    );
  });

  it("records any other actor's answer as the agent's", async () => {
    await answer();
    expect(resolution()).toMatchObject({ optionId: 'run-on', decidedBy: 'agent' });
  });

  it("counts the human operator's programme acceptance as the player's own (D-108)", async () => {
    raiseProgramme();
    await answer(HUMAN_OPERATOR_URI, 'accepted');
    expect(useOperationsCampaignStore.getState().programmeCount).toBe(1);
    expect(programmeAcceptedBy()).toEqual(['operator']);
  });

  it("does not count an agent's programme acceptance as the player's", async () => {
    raiseProgramme();
    await answer(undefined, 'accepted');
    expect(programmeAcceptedBy()).toEqual(['agent']);
  });

  it('refuses a handle draft that names the human operator, under every grant', async () => {
    raiseProgramme();
    removals.push(installMillOSAgentRuntime(window));
    const api = window.__MILLOS_AGENT__!;
    const grantIds = api.grants().map((grant) => grant.id);
    expect(grantIds.length).toBeGreaterThan(0);
    for (const grantId of grantIds) {
      const preview = await api.preview(
        api.draft({
          capabilityId: 'ai.respond-to-decision',
          targetUri: PROPOSAL_URI,
          actorUri: HUMAN_OPERATOR_URI,
          grantId,
          parameters: { decisionUri: PROPOSAL_URI, disposition: 'accepted' },
          reason: 'Pass the answer off as the person at the controls.',
        })
      );
      expect(preview.status).toBe('denied');
      expect((await api.commit(preview)).status).not.toBe('verified');
    }
    expect(usePartnerProposalStore.getState().proposals[0].status).toBe('open');
    expect(programmeAcceptedBy()).toEqual([]);
  });

  it('records an operator-runtime draft, which the agent driver makes, as the agent’s', async () => {
    removals.push(installMillOSAgentRuntime(window));
    const operator = getOperatorRuntime(window);
    const preview = await operator.preview(
      operator.draft({
        capabilityId: 'ai.respond-to-decision',
        targetUri: PROPOSAL_URI,
        parameters: { decisionUri: PROPOSAL_URI, disposition: 'rejected' },
        reason: 'Answer the partner from the cockpit.',
      })
    );
    expect(preview.status).toBe('ready');
    expect((await operator.commit(preview)).status).toBe('verified');
    expect(resolution()).toMatchObject({ decidedBy: 'agent' });
  });
});

describe('order and incident commands record who issued them', () => {
  beforeEach(() => {
    setLocale('en');
    useOperationsCampaignStore.getState().resetCampaign();
  });

  const lastActor = () => useOperationsCampaignStore.getState().logbook.at(-1)?.actor;

  const activate = async (actorUri?: string) => {
    const campaign = useOperationsCampaignStore.getState();
    const other = campaign.orders.find(
      (order) => order.id !== campaign.activeOrderId && order.status === 'planned'
    )!;
    expect(other).toBeDefined();
    await handler('operations.activate-order').execute({
      targetUri: `millos://order/${other.id}`,
      ...(actorUri ? { actorUri } : {}),
      parameters: {},
    } as never);
    expect(useOperationsCampaignStore.getState().activeOrderId).toBe(other.id);
  };

  const incident = async (capabilityId: string, actorUri?: string) => {
    const raised = useOperationsCampaignStore.getState().triggerIncident('power_sag')!;
    await handler(capabilityId).execute({
      targetUri: `millos://incident/${raised.id}`,
      ...(actorUri ? { actorUri } : {}),
      parameters: {},
    } as never);
  };

  it('activates an order as the operator or the agent', async () => {
    await activate(HUMAN_OPERATOR_URI);
    expect(lastActor()).toBe('operator');
    useOperationsCampaignStore.getState().resetCampaign();
    await activate();
    expect(lastActor()).toBe('agent');
  });

  it('acknowledges and mitigates an incident as the operator or the agent', async () => {
    for (const capabilityId of ['incident.acknowledge', 'incident.mitigate']) {
      useOperationsCampaignStore.getState().resetCampaign();
      await incident(capabilityId, HUMAN_OPERATOR_URI);
      expect(lastActor()).toBe('operator');
      useOperationsCampaignStore.getState().resetCampaign();
      await incident(capabilityId);
      expect(lastActor()).toBe('agent');
    }
  });
});
