import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AgentCockpit } from './AgentCockpit';
import { SYSTEM_REGISTRY_SOURCE } from '../../../agent/registry/systemRegistrySource.js';
import { setLocale } from '../../../i18n';

const drill = SYSTEM_REGISTRY_SOURCE.capabilities.find(
  (item) => item.id === 'simulation.start-fire-drill'
)!;

// A commit the kernel refuses (a stale or expired preview, a spent grant) or
// whose handler throws returns its reason in receipt.problems. The receipt
// showed only "Status: rejected" and "Changed domains: none", with Commit
// already replaced by "Receipt issued", so the player never learned why.
// Working if a refused or failed receipt says why, in the reader's language.
describe('a refused commit in the agent cockpit', () => {
  const commit = vi.fn();
  beforeEach(() => {
    setLocale('en');
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
      commit,
      trace: () => null,
    };
  });
  afterEach(() => {
    cleanup();
    commit.mockReset();
    setLocale('en');
    delete (window as unknown as { __MILLOS_AGENT__?: unknown }).__MILLOS_AGENT__;
  });

  const previewAndCommit = async () => {
    render(<AgentCockpit />);
    fireEvent.change(screen.getByLabelText(/Capability|Capacidade/), {
      target: { value: drill.id },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /preview effects|pré-visualizar/i }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /commit preview|executar prévia/i }));
    });
  };

  it('says why a commit was refused', async () => {
    commit.mockResolvedValue({
      previewId: 'preview-1',
      correlationId: 'correlation-1',
      status: 'rejected',
      changedDomains: [],
      verification: [],
      problems: [
        {
          code: 'PREVIEW_EXPIRED',
          severity: 'blocking',
          message: 'The supplied preview has expired.',
        },
      ],
    });
    await previewAndCommit();
    expect(screen.getByText(/The supplied preview has expired\./)).toBeInTheDocument();
  });

  it('says why a committed command failed, in Portuguese', async () => {
    setLocale('pt-BR');
    commit.mockResolvedValue({
      previewId: 'preview-1',
      correlationId: 'correlation-1',
      status: 'failed',
      changedDomains: [],
      verification: [],
      problems: [
        {
          code: 'PREVIEW_EXPIRED',
          severity: 'blocking',
          message: 'The supplied preview has expired.',
        },
      ],
    });
    await previewAndCommit();
    expect(screen.getByText(/A prévia informada expirou\./)).toBeInTheDocument();
  });
});
