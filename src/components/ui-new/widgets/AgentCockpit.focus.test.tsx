import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentCockpit } from './AgentCockpit';
import { SYSTEM_REGISTRY_SOURCE } from '../../../agent/registry/systemRegistrySource.js';

// The typed registry carries every command descriptor unchanged.
const drill = SYSTEM_REGISTRY_SOURCE.capabilities.find(
  (item) => item.id === 'simulation.start-fire-drill'
)!;

// Commit is replaced by "Receipt issued" when its receipt arrives, and focus
// fell to <body>. The next step the line names is a fresh preview.
describe('committing a preview from the cockpit', () => {
  beforeEach(() => {
    (window as unknown as { __MILLOS_AGENT__: unknown }).__MILLOS_AGENT__ = {
      capabilities: () => ({ data: { items: [drill] } }),
      brief: () => ({
        data: { status: 'nominal', health: { exceptions: [] }, authority: { activeGrantIds: [] } },
        build: 'test',
        mode: 'simulation',
        revision: 'rev-0000000000000',
      }),
      policy: () => ({ objections: [] }),
      draft: vi.fn((command: unknown) => command),
      preview: vi.fn(async () => ({
        previewId: 'preview-1',
        status: 'ready',
        effects: [],
        preconditions: [],
        invariants: [],
        cost: { computeClass: 'trivial', latencyClass: 'local', externalCalls: false },
        problems: [],
      })),
      commit: vi.fn(async () => ({
        previewId: 'preview-1',
        correlationId: 'correlation-1',
        status: 'verified',
        changedDomains: ['simulation'],
        verification: [],
      })),
      trace: () => null,
    };
  });
  afterEach(() => {
    cleanup();
    delete (window as unknown as { __MILLOS_AGENT__?: unknown }).__MILLOS_AGENT__;
  });

  it('moves focus to the preview button once the receipt replaces Commit', async () => {
    render(<AgentCockpit />);
    fireEvent.change(screen.getByLabelText('Capability'), { target: { value: drill.id } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /preview effects/i }));
    });
    const commit = screen.getByRole('button', { name: 'Commit preview' });
    commit.focus();
    await act(async () => {
      fireEvent.click(commit);
    });
    expect(screen.getByText(/Receipt issued/)).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /preview effects/i }));
  });
});
