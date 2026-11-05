import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentCockpit } from './AgentCockpit';
import { installMillOSAgentRuntime } from '../../../agent/adapters/runtime/installAgentRuntime';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useProductionStore } from '../../../stores/productionStore';
import { setLocale } from '../../../i18n';
import type { AIDecision } from '../../../types';

// Only orders, the dispatch, the simulation and the workplace plan had target
// suggestions. Every other command (acknowledge or mitigate an incident,
// answer an AI card, repair, restart, hold or release a batch, SCADA) showed an
// empty URI box, and nothing in the game shows an incident's or a card's id,
// so the player could not aim the command at anything that exists.
// Working if the target field offers the live targets the command can act on.
describe('agent cockpit targets', () => {
  const removals: Array<() => void> = [];
  const decisionsBefore = useProductionStore.getState().aiDecisions;
  beforeEach(() => {
    setLocale('en');
    useOperationsCampaignStore.getState().resetCampaign();
    useOperationsCampaignStore.getState().initializeCampaign();
    removals.push(installMillOSAgentRuntime(window));
  });
  afterEach(() => {
    cleanup();
    removals.splice(0).forEach((remove) => remove());
    useOperationsCampaignStore.getState().resetCampaign();
    useProductionStore.setState({ aiDecisions: decisionsBefore });
  });

  it('offers a raised incident and acknowledges it end to end', async () => {
    const incident = useOperationsCampaignStore.getState().triggerIncident('bearing_overheat')!;
    render(<AgentCockpit />);
    fireEvent.change(screen.getByLabelText('Capability'), {
      target: { value: 'incident.acknowledge' },
    });
    const field = screen.getByLabelText('Incident Uri') as HTMLSelectElement;
    expect(field.value).toBe(`millos://incident/${incident.id}`);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /preview effects/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /commit preview/i }));
    });
    expect(
      useOperationsCampaignStore.getState().incidents.find((item) => item.id === incident.id)?.phase
    ).toBe('acknowledged');
  });

  it('offers the pending AI cards to answer', () => {
    const decision: AIDecision = {
      id: 'decision-cockpit-target',
      timestamp: new Date(),
      type: 'optimization',
      action: 'Balance RM-101 load',
      reasoning: 'Load high',
      confidence: 75,
      impact: 'Smoother flow',
      status: 'pending',
      priority: 'medium',
    };
    useProductionStore.setState({ aiDecisions: [decision] });
    render(<AgentCockpit />);
    fireEvent.change(screen.getByLabelText('Capability'), {
      target: { value: 'ai.respond-to-decision' },
    });
    expect((screen.getByLabelText('Decision Uri') as HTMLSelectElement).value).toBe(
      'millos://decision/decision-cockpit-target'
    );
  });
});
