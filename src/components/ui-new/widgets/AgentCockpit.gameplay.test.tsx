import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentCockpit } from './AgentCockpit';
import { SYSTEM_REGISTRY_SOURCE } from '../../../agent/registry/systemRegistrySource.js';
import { useWorkplaceStore } from '../../../stores/workplaceStore';

// The typed registry carries every command descriptor unchanged.
const drill = SYSTEM_REGISTRY_SOURCE.capabilities.find(
  (item) => item.id === 'simulation.start-fire-drill'
)!;

describe('the agent cockpit command form', () => {
  const draft = vi.fn((command: unknown) => command);
  const preview = vi.fn(async () => ({
    previewId: 'preview-1',
    status: 'ready',
    effects: [],
    preconditions: [],
    invariants: [],
    cost: { computeClass: 'trivial', latencyClass: 'local', externalCalls: false },
    problems: [],
  }));

  beforeEach(() => {
    (window as unknown as { __MILLOS_AGENT__: unknown }).__MILLOS_AGENT__ = {
      capabilities: () => ({ data: { items: [drill] } }),
      brief: () => ({
        data: { status: 'ok', health: { exceptions: [] }, authority: { activeGrantIds: [] } },
        build: 'test',
        mode: 'simulation',
        revision: 'rev-0000000000000',
      }),
      policy: () => ({ objections: [] }),
      draft,
      preview,
      trace: () => null,
    };
  });
  afterEach(() => {
    cleanup();
    draft.mockClear();
    preview.mockClear();
    delete (window as unknown as { __MILLOS_AGENT__?: unknown }).__MILLOS_AGENT__;
  });

  // A cleared number input read Number('') = 0, so an optional field the player
  // typed in and then emptied was sent as 0 (below totalZones' minimum of 1)
  // and could never be left out again.
  it('leaves a cleared optional number field out of the command', async () => {
    render(<AgentCockpit />);
    fireEvent.change(screen.getByLabelText('Capability'), { target: { value: drill.id } });
    const zones = screen.getByLabelText('Total Zones') as HTMLInputElement;
    fireEvent.change(zones, { target: { value: '3' } });
    fireEvent.change(zones, { target: { value: '' } });
    expect(zones.value).toBe('');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    });
    expect(draft).toHaveBeenCalledTimes(1);
    const command = draft.mock.calls[0][0] as { parameters: Record<string, unknown> };
    expect(command.parameters).not.toHaveProperty('totalZones');
  });

  // The workplace plan has no URI field, so the cockpit sent an empty target and
  // every preview was denied (TARGET_URI_INVALID), and the player had to know the
  // revision number to type it. Working if it targets the local simulation, as
  // WorkplaceLab does, with the current revision filled in.
  it('targets the local simulation and fills the current revision for a workplace plan', async () => {
    const plan = SYSTEM_REGISTRY_SOURCE.capabilities.find(
      (item) => item.id === 'workplace.activate-plan'
    )!;
    const api = (window as unknown as { __MILLOS_AGENT__: Record<string, unknown> })
      .__MILLOS_AGENT__;
    api.capabilities = () => ({ data: { items: [drill, plan] } });
    const revision = useWorkplaceStore.getState().workplace.revision;
    render(<AgentCockpit />);
    fireEvent.change(screen.getByLabelText('Capability'), { target: { value: plan.id } });
    expect((screen.getByLabelText('Revision') as HTMLInputElement).value).toBe(String(revision));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /preview/i }));
    });
    const command = draft.mock.calls[0][0] as {
      targetUri: string;
      parameters: Record<string, unknown>;
    };
    expect(command.targetUri).toBe('millos://simulation/local');
    expect(command.parameters.revision).toBe(revision);
  });
});
