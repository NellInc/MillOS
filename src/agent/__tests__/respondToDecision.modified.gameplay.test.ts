import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMillOSAgentRuntime } from '../adapters/runtime/installAgentRuntime';
import { useProductionStore } from '../../stores/productionStore';
import { createTranslator, setLocale } from '../../i18n';
import { agentCockpitMessages } from '../../components/ui-new/widgets/AgentCockpit.messages';
import type { AIDecision } from '../../types';

// The cockpit offers "modified" as a disposition and Modified action as an
// optional field. Without the replacement action the handler records nothing
// (it refuses to run the AI's original recommendation instead), yet the
// preview read "ready", so Commit spent a command and the receipt came back
// failed. Working if the preview names the missing replacement and is denied,
// and a modified response with its replacement still commits.

const api = () => window.__MILLOS_AGENT__!;

const card = (id: string): AIDecision =>
  ({
    id,
    timestamp: new Date(0),
    type: 'optimization',
    action: `Recommendation ${id}`,
    reasoning: 'Test.',
    confidence: 80,
    impact: 'Test impact.',
    status: 'pending',
    priority: 'medium',
  }) as AIDecision;

describe('a modified response to a decision card', () => {
  const removals: Array<() => void> = [];
  const before = useProductionStore.getState().aiDecisions;
  beforeEach(() => {
    setLocale('en');
    useProductionStore.setState({ aiDecisions: [card('decision-1')] });
    removals.push(installMillOSAgentRuntime(window));
  });
  afterEach(() => {
    removals.splice(0).forEach((remove) => remove());
    useProductionStore.setState({ aiDecisions: before });
  });

  const preview = (parameters: Record<string, string>) =>
    api().preview(
      api().draft({
        capabilityId: 'ai.respond-to-decision',
        targetUri: 'millos://decision/decision-1',
        parameters: {
          decisionUri: 'millos://decision/decision-1',
          disposition: 'modified',
          ...parameters,
        },
        reason: 'Run it my way.',
      })
    );

  it('is denied before commit when the replacement action is missing', async () => {
    const shown = await preview({});
    expect(shown.status).toBe('denied');
    const unmet = shown.preconditions.find((check) => !check.satisfied);
    expect(unmet?.detail).toBe('A modified response needs the replacement action.');
    // The refusal reads in Portuguese too.
    expect(
      createTranslator(agentCockpitMessages, 'pt-BR')('agentText', { text: unmet!.detail })
    ).not.toBe(unmet!.detail);
  });

  it('is denied when the replacement action is blank', async () => {
    expect((await preview({ modifiedAction: '   ' })).status).toBe('denied');
  });

  it('commits with its replacement action', async () => {
    const shown = await preview({ modifiedAction: 'Lower R.M. 101 to 80%.' });
    expect(shown.status).toBe('ready');
    const receipt = await api().commit(shown);
    expect(receipt.status).toBe('verified');
    expect(
      useProductionStore.getState().aiDecisions.find((d) => d.id === 'decision-1')?.response
        ?.disposition
    ).toBe('modified');
  });
});
