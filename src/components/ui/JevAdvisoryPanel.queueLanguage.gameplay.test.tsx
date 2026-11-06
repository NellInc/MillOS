import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JevAdvisoryPanel } from './JevAdvisoryPanel';
import { OnDeviceOperatorRecord } from './OnDeviceOperatorRecord';
import { requestJevAdvice } from '../../utils/jevClient';
import { setLocale } from '../../i18n';
import type { OperatorRecord } from '../../utils/onDeviceOperator';

const store = vi.hoisted(() => {
  let records: readonly OperatorRecord[] = [];
  const listeners = new Set<() => void>();
  return {
    set(next: readonly OperatorRecord[]) {
      records = next;
      listeners.forEach((listener) => listener());
    },
    get: () => records,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});
vi.mock('../../utils/onDeviceOperator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/onDeviceOperator')>()),
  onDeviceOperatorRecords: store.get,
  subscribeOnDeviceOperator: store.subscribe,
}));
vi.mock('../../utils/jevClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/jevClient')>()),
  requestJevAdvice: vi.fn(),
}));

// The advisory queue is the panel's answer and the on-device record's route.
// The English queue names stay in the request (the frozen rubric), but they
// were also shown as-is, so a Portuguese player read "Equipment maintenance"
// as the suggested queue and as every row's route.
// Working if both surfaces name the queue in the language chosen now.
describe('advisory queue names in Portuguese', () => {
  beforeEach(() => {
    act(() => setLocale('pt-BR'));
  });
  afterEach(() => {
    cleanup();
    store.set([]);
    act(() => setLocale('en'));
  });

  it('names the suggested queue in Portuguese', async () => {
    vi.mocked(requestJevAdvice).mockResolvedValue({
      queue: 'Equipment maintenance',
      receivedAt: Date.now(),
    });
    render(<JevAdvisoryPanel />);
    fireEvent.change(screen.getByLabelText(/chave de API do OpenRouter/i), {
      target: { value: `sk-or-v1-${'test-only-'.repeat(5)}` },
    });
    fireEvent.change(screen.getByLabelText(/texto da ocorrência/i), {
      target: { value: 'A bomba quebrou.' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /jev/i }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Manutenção de equipamentos');
    expect(screen.getByRole('status')).not.toHaveTextContent('Equipment maintenance');
  });

  it("names each record's route and expected queue in Portuguese", () => {
    store.set([
      {
        incidentId: 'incident-0001',
        kind: 'delayed_truck',
        title: 'Delayed inbound truck',
        minute: 12,
        queue: 'Equipment maintenance',
        outcome: 'misrouted',
      },
    ]);
    render(<OnDeviceOperatorRecord />);
    const row = screen.getByRole('listitem');
    expect(row).toHaveTextContent('Manutenção de equipamentos');
    expect(row).toHaveTextContent('Coordenação logística');
    expect(row).not.toHaveTextContent(/Equipment maintenance|Logistics coordination/);
  });
});
