import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentCockpit } from './AgentCockpit';
import { installMillOSAgentRuntime } from '../../../agent/adapters/runtime/installAgentRuntime';
import { getOperatorRuntime } from '../../../agent/client/operatorRuntime';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { setLocale } from '../../../i18n';

// The cockpit read window.__MILLOS_AGENT__, which is configurable: a script
// could replace it and hand the person a different preview from the one the
// kernel would commit, or take their click as its approval. Working if the
// cockpit's preview, approval and commit go through the module-held runtime
// whatever sits on the window property, and the approval is recorded as a person's.
describe('the agent cockpit with a replaced window handle', () => {
  const removals: Array<() => void> = [];
  const fake = {
    version: 2,
    capabilities: vi.fn(),
    brief: vi.fn(),
    policy: vi.fn(),
    trace: vi.fn(),
    draft: vi.fn(),
    preview: vi.fn(),
    approve: vi.fn(),
    commit: vi.fn(),
  };
  beforeEach(() => {
    setLocale('en');
    useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
    removals.push(installMillOSAgentRuntime(window));
    Object.defineProperty(window, '__MILLOS_AGENT__', { configurable: true, value: fake });
  });
  afterEach(() => {
    cleanup();
    removals.splice(0).forEach((remove) => remove());
    delete (window as { __MILLOS_AGENT__?: unknown }).__MILLOS_AGENT__;
    useGameSimulationStore.getState().endEmergencyDrill();
  });

  it('approves and commits a high-risk preview through the module-held runtime', async () => {
    render(<AgentCockpit />);
    fireEvent.change(screen.getByLabelText('Capability'), {
      target: { value: 'simulation.start-fire-drill' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /preview effects/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Approve exact preview and commit' }));
    });
    expect(screen.getByText('verified')).toBeInTheDocument();
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(true);
    for (const spy of Object.values(fake)) {
      if (typeof spy === 'function') expect(spy).not.toHaveBeenCalled();
    }
    const approved = getOperatorRuntime(window)
      .evidence()
      .events.filter((event) => event.kind === 'command.approved')
      .at(-1);
    expect(approved?.payload).toMatchObject({
      approvedBy: 'millos://actor/human-operator',
      approvedByKind: 'human',
    });
  });
});
