import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

import { setLocale } from '../../i18n';
import { OnDeviceOperatorRecord } from './OnDeviceOperatorRecord';

// A record copied the incident's title as it was stored when the incident fired,
// so after a switch to Portuguese the on-device AI's record kept every row in
// English. Working if each row names its incident in the language chosen now.
describe('the on-device AI record after a language switch', () => {
  afterEach(() => {
    cleanup();
    store.set([]);
    act(() => setLocale('en'));
  });

  it('names an incident recorded in English in Portuguese', () => {
    store.set([
      {
        incidentId: 'incident-0001',
        kind: 'bearing_overheat',
        title: 'Roller mill bearing overheat',
        minute: 12,
        queue: 'Equipment maintenance',
        outcome: 'handled',
      },
    ]);
    render(<OnDeviceOperatorRecord />);
    act(() => setLocale('pt-BR'));
    expect(
      screen.getByText('Superaquecimento de rolamento no moinho de rolos')
    ).toBeInTheDocument();
    expect(screen.queryByText('Roller mill bearing overheat')).not.toBeInTheDocument();
  });
});
