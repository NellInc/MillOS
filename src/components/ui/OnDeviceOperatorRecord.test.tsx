import { act, cleanup, render, screen, within } from '@testing-library/react';
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

import { OnDeviceOperatorRecord } from './OnDeviceOperatorRecord';

const entry = (over: Partial<OperatorRecord>): OperatorRecord => ({
  incidentId: 'incident-0001',
  kind: 'bearing_overheat',
  title: 'Roller mill bearing overheat',
  minute: 12,
  queue: 'Equipment maintenance',
  outcome: 'handled',
  ...over,
});

describe('the on-device AI record', () => {
  afterEach(() => {
    cleanup();
    store.set([]);
  });

  it('shows nothing until the operator has settled something', () => {
    const { container } = render(<OnDeviceOperatorRecord />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists what it did, newest first, with what each action asked of people', () => {
    render(<OnDeviceOperatorRecord />);
    act(() =>
      store.set([
        entry({}),
        entry({
          incidentId: 'incident-0002',
          kind: 'packaging_shortage',
          title: 'Packaging material shortage',
          minute: 30,
          queue: 'Product quality',
          outcome: 'misrouted',
        }),
        entry({
          incidentId: 'incident-0003',
          kind: 'severe_rain',
          title: 'Severe rain and drainage loading',
          minute: 41,
          queue: null,
          outcome: 'stoodDown',
        }),
      ])
    );
    expect(screen.getByRole('heading', { name: 'On-device AI record' })).toBeInTheDocument();
    expect(screen.getByText('1 handled · 2 left for you')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(
      items.map((item) => within(item).getByText(/overheat|shortage|rain/).textContent)
    ).toEqual([
      'Severe rain and drainage loading',
      'Packaging material shortage',
      'Roller mill bearing overheat',
    ]);
    expect(items[0]).toHaveTextContent('No route · Held at a safety boundary');
    expect(items[0]).toHaveTextContent('Left for you; no one asked.');
    expect(items[1]).toHaveTextContent(
      'Product quality · Acknowledged; belongs with Logistics coordination'
    );
    expect(items[2]).toHaveTextContent('Equipment maintenance · Acknowledged and mitigated');
    expect(items[2]).toHaveTextContent('No one called in.');
    expect(items[2]).toHaveTextContent('min 12');
  });
});
