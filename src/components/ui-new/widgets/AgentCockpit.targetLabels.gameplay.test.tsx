import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentCockpit } from './AgentCockpit';
import { installMillOSAgentRuntime } from '../../../agent/adapters/runtime/installAgentRuntime';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useProductionStore } from '../../../stores/productionStore';
import { setLocale } from '../../../i18n';
import type { AIDecision } from '../../../types';

// The target lists offered only raw ids ("millos://decision/plant-optimization-
// 1730812345678-k3j9x"). No card, incident or order in the game shows its id, so
// with two cards waiting the player could not tell which one Accept would
// answer, and the command could land on the card they did not mean.
// Working if each target reads as the game names it, beside its id.
describe('agent cockpit target names', () => {
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
    setLocale('en');
  });

  const card = (id: string, action: string): AIDecision => ({
    id,
    timestamp: new Date(),
    type: 'optimization',
    action,
    reasoning: 'Load high',
    confidence: 75,
    impact: 'Smoother flow',
    status: 'pending',
    priority: 'medium',
  });
  const optionText = (label: string) =>
    Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map(
      (option) => option.textContent ?? ''
    );

  it('names each waiting AI card by its action', () => {
    useProductionStore.setState({
      aiDecisions: [card('card-a', 'Balance RM-101 load'), card('card-b', 'Inspect Silo Beta')],
    });
    render(<AgentCockpit />);
    fireEvent.change(screen.getByLabelText('Capability'), {
      target: { value: 'ai.respond-to-decision' },
    });
    const options = optionText('Decision Uri');
    expect(options.find((text) => text.includes('card-a'))).toContain('Balance RM-101 load');
    expect(options.find((text) => text.includes('card-b'))).toContain('Inspect Silo Beta');
  });

  it('names a raised incident by its title, in the language shown', () => {
    const incident = useOperationsCampaignStore.getState().triggerIncident('bearing_overheat')!;
    render(<AgentCockpit />);
    fireEvent.change(screen.getByLabelText('Capability'), {
      target: { value: 'incident.acknowledge' },
    });
    const english = optionText('Incident Uri').find((text) => text.includes(incident.id))!;
    expect(english.replace(`millos://incident/${incident.id}`, '').trim()).not.toBe('');
    act(() => setLocale('pt-BR'));
    const portuguese = optionText('URI da ocorrência').find((text) => text.includes(incident.id))!;
    expect(portuguese).not.toBe(english);
  });
});
