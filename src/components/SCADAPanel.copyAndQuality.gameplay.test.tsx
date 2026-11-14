import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TagDefinition, TagValue } from '../scada/types';
import { setLocale } from '../i18n';
import { useGraphicsStore } from '../stores/graphicsStore';
import { SCADAPanel } from './SCADAPanel';

/**
 * The SCADA workspace from a play-test screenshot in Portuguese: the tag-type
 * filters read in English, every machine read "1 tags", and helper text sat
 * under two headings (D-012). And plan item 7.4: a reading the network incident
 * holds is UNCERTAIN on the readout itself, not in a caption.
 */
const state = vi.hoisted(() => {
  const tag = (id: string, machineId: string, group: TagDefinition['group']): TagDefinition => ({
    id,
    name: id,
    description: 'Test tag',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 'C',
    engLow: 0,
    engHigh: 100,
    machineId,
    group,
  });
  const tags = [
    tag('RM101.TT001.PV', 'rm-101', 'TEMPERATURE'),
    tag('RM101.VT001.PV', 'rm-101', 'VIBRATION'),
    tag('PACKER_1.PT001.PV', 'packer-0', 'PRESSURE'),
  ];
  const values = new Map<string, TagValue>(
    tags.map((t) => [
      t.id,
      {
        tagId: t.id,
        value: 42,
        quality: t.id === 'RM101.TT001.PV' ? 'UNCERTAIN' : 'GOOD',
        timestamp: Date.now(),
      },
    ])
  );
  return { tags, values };
});

vi.mock('../scada', () => ({
  useSCADA: () => ({
    isConnected: true,
    linkUp: true,
    mode: 'simulation',
    tagCount: state.tags.length,
    values: state.values,
    tags: state.tags,
    injectFault: vi.fn(),
    clearAllFaults: vi.fn(),
    activeFaults: [],
    exportToCSV: vi.fn(),
    exportToJSON: vi.fn(),
    getHistory: vi.fn(async () => []),
    writeSetpoint: vi.fn(async () => true),
  }),
  useSCADAAlarms: () => ({
    alarms: [],
    summary: { total: 0, unacknowledged: 0, critical: 0, high: 0 },
    acknowledge: vi.fn(),
    acknowledgeAll: vi.fn(),
    shelve: vi.fn(),
    suppress: vi.fn(),
    takeOutOfService: vi.fn(),
    suppressed: [],
    unsuppress: vi.fn(),
    hasCritical: false,
  }),
  refreshSharedSCADAStatus: vi.fn(),
  getSCADAService: () => ({
    getConnectionConfig: () => ({ type: 'simulation' }),
    getAlarmHistory: vi.fn(async () => []),
    setConnectionConfig: vi.fn(async () => undefined),
  }),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  Brush: () => null,
}));

async function openWorkspace(name: RegExp) {
  render(<SCADAPanel isOpen onClose={vi.fn()} embedded />);
  fireEvent.click(screen.getByRole('button', { name }));
  return screen.findByRole('dialog');
}

describe('SCADA workspace copy and readout quality', () => {
  beforeEach(() => useGraphicsStore.getState().setSCADAEnabled(true));
  afterEach(() => setLocale('en'));

  it('has no subtitle under its heading or under the ledger and commitments headings', async () => {
    const dialog = await openWorkspace(/Open full SCADA workspace/);
    expect(dialog).not.toHaveTextContent(/ISA-18\.2/);
    expect(dialog).not.toHaveTextContent(/Training simulation/);
    expect(dialog).not.toHaveTextContent(/Conserved simulation values/);
    expect(dialog).not.toHaveTextContent(/Customer promise, incident/);
    expect(dialog.getAttribute('aria-describedby')).toBeNull();
  });

  it('counts one tag as "1 tag" and two as "2 tags", in both languages', async () => {
    const dialog = await openWorkspace(/Open full SCADA workspace/);
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Tags' }));
    expect(within(dialog).getByText('1 tag')).toBeInTheDocument();
    expect(within(dialog).getByText('2 tags')).toBeInTheDocument();
    expect(within(dialog).queryByText('1 tags')).toBeNull();
  });

  it('labels the tag-type filters in Portuguese and leaves the tag ids as they are', async () => {
    setLocale('pt-BR');
    const dialog = await openWorkspace(/Abrir a área de trabalho SCADA completa/);
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Tags' }));
    expect(within(dialog).getByRole('button', { name: /PRESSÃO/ })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /TEMPERATURA/ })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /^PRESSURE$/ })).toBeNull();
    expect(within(dialog).getByText('1 tag')).toBeInTheDocument();
    fireEvent.click(within(dialog).getAllByRole('button', { name: /rm-101/ })[0]);
    expect(within(dialog).getAllByText('RM101.TT001.PV').length).toBeGreaterThan(0);
  });

  it('marks an UNCERTAIN reading on the readout itself', async () => {
    const dialog = await openWorkspace(/Open full SCADA workspace/);
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Tags' }));
    fireEvent.click(within(dialog).getAllByRole('button', { name: /rm-101/ })[0]);
    const uncertain = dialog.querySelectorAll('[data-quality="UNCERTAIN"]');
    expect(uncertain.length).toBeGreaterThan(0);
    for (const element of uncertain) expect(element.className).toMatch(/decoration-dotted/);
    const good = dialog.querySelectorAll('[data-quality="GOOD"]');
    expect(good.length).toBeGreaterThan(0);
    for (const element of good) expect(element.className).not.toMatch(/decoration-dotted/);
  });
});
