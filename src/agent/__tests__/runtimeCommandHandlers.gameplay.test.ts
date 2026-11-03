import { afterEach, describe, expect, it } from 'vitest';
import { installMillOSAgentRuntime } from '../adapters/runtime/installAgentRuntime';
import { executeAgentCommand } from '../client/executeAgentCommand';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useProductionStore } from '../../stores/productionStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { setLocale } from '../../i18n';
import type { AIDecision } from '../../types';

describe('runtime command handlers in play', () => {
  const removals: Array<() => void> = [];
  afterEach(() => {
    removals.splice(0).forEach((remove) => remove());
    setLocale('en');
    useGameSimulationStore.setState({ gameSpeed: 1, clockHolds: [] });
  });

  it('sets the pace the shift handoff resumes at, and verifies the pace it set', async () => {
    removals.push(installMillOSAgentRuntime(window));
    useGameSimulationStore.setState({ gameSpeed: 1, clockHolds: [] });
    // The handoff decision holds the clock; a chosen pace waits as its resume pace.
    useGameSimulationStore.getState().holdClock('handoff');
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);

    const { preview, receipt } = await executeAgentCommand({
      capabilityId: 'simulation.set-speed',
      targetUri: 'millos://simulation/local',
      parameters: { simulationUri: 'millos://simulation/local', speed: 2 },
      reason: 'Run faster once the handoff decision is made.',
    });

    expect(preview.status).toBe('ready');
    // The request took effect exactly as the player's own pace control does.
    expect(useGameSimulationStore.getState().clockHolds.at(-1)).toMatchObject({
      holder: 'handoff',
      resumeSpeed: 2,
    });
    expect(receipt?.status).toBe('verified');
  });

  // A pace change made through the agent plane is a shift decision like the
  // player's own pace control; the review recorded only the player's.
  // Working if a new running pace from a command lands in the shift logbook.
  it('records a new running pace set by command in the shift logbook', async () => {
    removals.push(installMillOSAgentRuntime(window));
    useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
    const before = useOperationsCampaignStore.getState().logbook.length;
    const { receipt } = await executeAgentCommand({
      capabilityId: 'simulation.set-speed',
      targetUri: 'millos://simulation/local',
      parameters: { simulationUri: 'millos://simulation/local', speed: 60 },
      reason: 'Run faster.',
    });
    expect(receipt?.status).toBe('verified');
    const added = useOperationsCampaignStore.getState().logbook.slice(before);
    expect(
      added.some((entry) => entry.category === 'operation' && /60|2x|2×/.test(entry.message))
    ).toBe(true);
  });

  it('records the operator-modification outcome in the reader language', async () => {
    removals.push(installMillOSAgentRuntime(window));
    const decision: AIDecision = {
      id: 'decision-modified-pt',
      timestamp: new Date(),
      type: 'optimization',
      action: 'Balance RM-101 load',
      reasoning: 'Load high',
      confidence: 75,
      impact: 'Smoother flow',
      status: 'pending',
      priority: 'medium',
      machineId: 'RM-101',
    };
    const previous = useProductionStore.getState().aiDecisions;
    useProductionStore.setState({ aiDecisions: [decision] });
    try {
      setLocale('pt-BR');
      const { receipt } = await executeAgentCommand({
        capabilityId: 'ai.respond-to-decision',
        targetUri: `millos://decision/${decision.id}`,
        parameters: {
          decisionUri: `millos://decision/${decision.id}`,
          disposition: 'modified',
          modifiedAction: 'Balance RM-101 load by hand',
        },
        reason: 'Operator replaced the recommendation.',
      });
      expect(receipt?.status).toBe('verified');
      const stored = useProductionStore.getState().aiDecisions.find((d) => d.id === decision.id);
      expect(stored?.status).toBe('completed');
      expect(stored?.outcome).toBe('Concluída após modificação do operador');
      expect(stored?.measuredOutcome?.summary).toBe('Concluída após modificação do operador');
    } finally {
      useProductionStore.setState({ aiDecisions: previous });
    }
  });
  // The panel offers Defer once: the engine brings a deferred card back after a
  // plant hour, then lets it lapse. The agent plane deferred the same card
  // again, wiping the returned note that told the player when it would lapse.
  // Working if a second deferral by command is refused and the note stays.
  it('defers a card once, as the panel does', async () => {
    removals.push(installMillOSAgentRuntime(window));
    const decision: AIDecision = {
      id: 'decision-defer-once',
      timestamp: new Date(),
      type: 'maintenance',
      action: 'Plan a bearing check',
      reasoning: 'Bearing warm',
      confidence: 80,
      impact: 'Avoids a trip',
      status: 'pending',
      priority: 'high',
      machineId: 'RM-101',
      response: { disposition: 'deferred', recordedAt: 1, note: 'Back for a decision.' },
    };
    const previous = useProductionStore.getState().aiDecisions;
    useProductionStore.setState({ aiDecisions: [decision] });
    try {
      const { preview, receipt } = await executeAgentCommand({
        capabilityId: 'ai.respond-to-decision',
        targetUri: `millos://decision/${decision.id}`,
        parameters: { decisionUri: `millos://decision/${decision.id}`, disposition: 'deferred' },
        reason: 'Not now.',
      });
      expect(preview.status).not.toBe('ready');
      expect(receipt?.status).not.toBe('verified');
      const stored = useProductionStore.getState().aiDecisions.find((d) => d.id === decision.id);
      expect(stored?.response?.note).toBe('Back for a decision.');
    } finally {
      useProductionStore.setState({ aiDecisions: previous });
    }
  });
});
