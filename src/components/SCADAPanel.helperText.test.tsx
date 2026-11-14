import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TagDefinition, TagValue } from '../scada/types';
import { setLocale } from '../i18n';
import { useGraphicsStore } from '../stores/graphicsStore';
import { SCADAPanel } from './SCADAPanel';

/**
 * D14 (D-012): the SCADA workspace kept a subtitle under the grain-flow,
 * event-history and logbook headings, a caption under each stage and each
 * connection, a footnote under the trend chart and a hint beside the
 * telemetry switch. Working if each heading and control stands alone.
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

// One object per hook, as the real hooks keep their callbacks stable: a fresh
// getHistory on every render re-ran the trend loader's effect each render, and
// the Trends tab looped until the worker ran out of memory.
const scada = vi.hoisted(() => ({
  hook: {
    isConnected: true,
    linkUp: true,
    mode: 'simulation',
    injectFault: () => undefined,
    clearAllFaults: () => undefined,
    activeFaults: [],
    exportToCSV: () => undefined,
    exportToJSON: () => undefined,
    getHistory: async () => [],
    writeSetpoint: async () => true,
  },
  alarms: {
    alarms: [],
    summary: { total: 0, unacknowledged: 0, critical: 0, high: 0 },
    acknowledge: () => undefined,
    acknowledgeAll: () => undefined,
    shelve: () => undefined,
    suppress: () => undefined,
    takeOutOfService: () => undefined,
    suppressed: [],
    unsuppress: () => undefined,
    hasCritical: false,
  },
  service: {
    getConnectionConfig: () => ({ type: 'simulation' }),
    getAlarmHistory: async () => [],
    setConnectionConfig: async () => undefined,
  },
}));

vi.mock('../scada', () => {
  const hook = {
    ...scada.hook,
    tagCount: state.tags.length,
    values: state.values,
    tags: state.tags,
  };
  return {
    useSCADA: () => hook,
    useSCADAAlarms: () => scada.alarms,
    refreshSharedSCADAStatus: () => undefined,
    getSCADAService: () => scada.service,
  };
});

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

describe('SCADA workspace without helper text', () => {
  beforeEach(() => useGraphicsStore.getState().setSCADAEnabled(true));
  afterEach(() => setLocale('en'));

  it.each([
    [
      'Process',
      [
        /Select an asset to link the workspace/,
        /Rear intake to front dispatch/,
        /Raw grain inventory/,
        /Roll reduction/,
      ],
    ],
    ['Trends', [/One-second aligned samples/, /Up to 6 tags can be displayed/]],
    ['Events', [/Active alarms and the last 24 hours/, /Control decisions, campaign incidents/]],
    [
      'Connections',
      [/Local physics simulation/, /HTTP polling/, /MQTT pub\/sub/, /Direct WS connection/],
    ],
  ] as const)('the %s tab has no caption under its headings or controls', async (tab, cut) => {
    const dialog = await openWorkspace(/Open full SCADA workspace/);
    fireEvent.click(within(dialog).getByRole('tab', { name: tab }));
    for (const text of cut) expect(dialog).not.toHaveTextContent(text);
  });

  it('keeps the trend table caption for a screen reader', async () => {
    const dialog = await openWorkspace(/Open full SCADA workspace/);
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Trends' }));
    for (const caption of dialog.querySelectorAll('caption'))
      expect(caption).toHaveClass('sr-only');
  });

  it('has no captions in Portuguese either', async () => {
    setLocale('pt-BR');
    const dialog = await openWorkspace(/Abrir a área de trabalho SCADA completa/);
    fireEvent.click(within(dialog).getByRole('tab', { name: 'Processo' }));
    expect(dialog).not.toHaveTextContent(/Selecione um ativo/);
  });
});
