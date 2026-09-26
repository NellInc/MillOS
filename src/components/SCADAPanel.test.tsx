import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TagDefinition, TagHistoryPoint, TagValue } from '../scada/types';
import { useGraphicsStore } from '../stores/graphicsStore';
import { SCADAPanel } from './SCADAPanel';

const testState = vi.hoisted(() => {
  const tags: TagDefinition[] = Array.from({ length: 7 }, (_, index) => ({
    id: `RM101.TT00${index + 1}.PV`,
    name: `Mill temperature ${index + 1}`,
    description: 'Test process temperature',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 'C',
    engLow: 0,
    engHigh: 100,
    machineId: index < 4 ? 'rm-101' : 'silo-0',
    group: 'TEMPERATURE',
  }));
  const values = new Map<string, TagValue>(
    tags.map((tag, index) => [
      tag.id,
      {
        tagId: tag.id,
        value: 40 + index,
        quality: 'GOOD',
        timestamp: Date.now(),
      },
    ])
  );
  return {
    tags,
    values,
    focus: vi.fn(),
    acknowledge: vi.fn(),
    acknowledgeAll: vi.fn(),
    injectFault: vi.fn(),
    clearAllFaults: vi.fn(),
    exportToCSV: vi.fn(),
    exportToJSON: vi.fn(),
    getHistory: vi.fn(async (): Promise<TagHistoryPoint[]> => []),
    getAlarmHistory: vi.fn(async () => []),
    setConnectionConfig: vi.fn(async () => undefined),
  };
});

vi.mock('../scada', () => ({
  useSCADA: () => ({
    isConnected: true,
    linkUp: true,
    mode: 'simulation',
    tagCount: testState.tags.length,
    values: testState.values,
    tags: testState.tags,
    injectFault: testState.injectFault,
    clearAllFaults: testState.clearAllFaults,
    activeFaults: [],
    exportToCSV: testState.exportToCSV,
    exportToJSON: testState.exportToJSON,
    getHistory: testState.getHistory,
  }),
  useSCADAAlarms: () => ({
    alarms: [],
    summary: { total: 0, unacknowledged: 0, critical: 0, high: 0 },
    acknowledge: testState.acknowledge,
    acknowledgeAll: testState.acknowledgeAll,
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
    getAlarmHistory: testState.getAlarmHistory,
    setConnectionConfig: testState.setConnectionConfig,
  }),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="trend-chart">{children}</div>
  ),
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  Legend: () => null,
  Brush: () => null,
}));

describe('SCADAPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGraphicsStore.getState().setSCADAEnabled(true);
  });

  it('opens the full workspace, traps focus, closes with Escape, and restores focus', async () => {
    render(<SCADAPanel isOpen onClose={vi.fn()} embedded />);

    const openWorkspace = screen.getByRole('button', { name: 'Open full SCADA workspace' });
    openWorkspace.focus();
    fireEvent.click(openWorkspace);

    const dialog = await screen.findByRole('dialog', {
      name: 'Full simulated SCADA workspace',
    });
    const closeButton = within(dialog).getByRole('button', { name: 'Close SCADA panel' });
    await waitFor(() => expect(closeButton).toHaveFocus());

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Full simulated SCADA workspace' })
      ).not.toBeInTheDocument()
    );
    expect(openWorkspace).toHaveFocus();
  });

  it('exposes process, event, simulation, and connection workspaces with scene linking', () => {
    const onFocusMachine = vi.fn();
    render(
      <SCADAPanel
        isOpen
        onClose={vi.fn()}
        selectedMachineId="rm-101"
        onFocusMachine={onFocusMachine}
      />
    );

    expect(screen.getByRole('tab', { name: 'Process' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Simulation Lab' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Connections' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'rm-101' }));
    expect(onFocusMachine).toHaveBeenCalledWith('rm-101');
    expect(screen.getByRole('heading', { name: 'Live material ledger' })).toBeInTheDocument();
    expect(screen.getByText(/Maintenance stock:/)).toBeInTheDocument();
    expect(screen.getByText('Dispatch quality: hold')).toBeInTheDocument();
  });

  it('supports roving keyboard focus across the full workspace tabs', async () => {
    render(<SCADAPanel isOpen onClose={vi.fn()} />);
    const processTab = screen.getByRole('tab', { name: 'Process' });
    processTab.focus();

    fireEvent.keyDown(processTab, { key: 'ArrowRight' });
    const tagsTab = screen.getByRole('tab', { name: 'Tags' });
    await waitFor(() => expect(tagsTab).toHaveFocus());
    expect(tagsTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(tagsTab, { key: 'End' });
    const connectionsTab = screen.getByRole('tab', { name: 'Connections' });
    await waitFor(() => expect(connectionsTab).toHaveFocus());
    expect(connectionsTab).toHaveAttribute('aria-selected', 'true');
  });

  it('caps trend selection at six tags', () => {
    render(<SCADAPanel isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Trends' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));

    const tagOptions = screen.getAllByTestId('scada-trend-tag-option');
    tagOptions.slice(0, 6).forEach((option) => fireEvent.click(option));

    expect(screen.getByText('6/6 tags selected')).toBeInTheDocument();
    expect(tagOptions[6]).toHaveAccessibleName(/Mill temperature 7/);
    expect(tagOptions[6]).toBeDisabled();
  });

  it('provides a keyboard-readable trend table and scoped CSV export', async () => {
    testState.getHistory.mockResolvedValueOnce([
      { timestamp: 1_000, value: 42, quality: 'GOOD' },
      { timestamp: 2_000, value: 99, quality: 'BAD' },
    ]);
    render(<SCADAPanel isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Trends' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    fireEvent.click(screen.getAllByTestId('scada-trend-tag-option')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(testState.getHistory).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'table' }));
    expect(
      screen.getByRole('table', {
        name: /SCADA trend samples/,
      })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    expect(testState.exportToCSV).toHaveBeenCalledWith(['RM101.TT001.PV'], 5 * 60 * 1000);
  });
});
