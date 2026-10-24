import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TagDefinition, TagHistoryPoint, TagValue } from '../scada/types';
import { setLocale } from '../i18n';
import { useBreakdownStore } from '../stores/breakdownStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useQCLabStore } from '../stores/qcLabStore';
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
    writeSetpoint: vi.fn(async () => true),
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
    writeSetpoint: testState.writeSetpoint,
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

  it('keeps focus where the operator put it when the docked panel re-renders', async () => {
    // The docked panel hands the workspace a fresh inline onClose on every
    // render (each live tag update). That must not re-run the open-dialog
    // focus effect: it moved focus to Close, so an Enter meant for the
    // setpoint form closed the workspace instead.
    const { rerender } = render(<SCADAPanel isOpen onClose={vi.fn()} embedded />);
    fireEvent.click(screen.getByRole('button', { name: 'Open full SCADA workspace' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Full simulated SCADA workspace',
    });
    const closeButton = within(dialog).getByRole('button', { name: 'Close SCADA panel' });
    await waitFor(() => expect(closeButton).toHaveFocus());

    fireEvent.click(within(dialog).getByRole('tab', { name: 'Tags' }));
    const search = within(dialog).getByPlaceholderText('Search tags...');
    search.focus();
    expect(search).toHaveFocus();

    rerender(<SCADAPanel isOpen onClose={vi.fn()} embedded />);
    expect(search).toHaveFocus();
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

  it('offers an operator setpoint control on a writable tag in the Tags tab', async () => {
    const setpoint: TagDefinition = {
      id: 'RM101.ST001.SP',
      name: 'RM-101 Speed Setpoint',
      description: 'Test speed setpoint',
      dataType: 'FLOAT32',
      accessMode: 'READ_WRITE',
      engUnit: 'RPM',
      engLow: 0,
      engHigh: 2000,
      machineId: 'rm-101',
      group: 'SETPOINT',
    };
    testState.tags.push(setpoint);
    testState.values.set(setpoint.id, {
      tagId: setpoint.id,
      value: 1200,
      quality: 'GOOD',
      timestamp: Date.now(),
    });
    try {
      render(<SCADAPanel isOpen onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: 'Tags' }));
      fireEvent.click(screen.getByRole('button', { name: /^rm-101/ }));

      // Read-only tags get no control; the writable one does.
      expect(screen.getAllByRole('button', { name: 'Apply' })).toHaveLength(1);
      const input = screen.getByLabelText('New setpoint for RM-101 Speed Setpoint (RPM)');
      fireEvent.change(input, { target: { value: '1500' } });
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
      await waitFor(() =>
        expect(testState.writeSetpoint).toHaveBeenCalledWith('RM101.ST001.SP', 1500)
      );
    } finally {
      testState.tags.pop();
      testState.values.delete(setpoint.id);
    }
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

  it('renders plant-state values and an English-raised incident in Portuguese', () => {
    const campaign = useOperationsCampaignStore.getState();
    const flow = useMaterialFlowStore.getState();
    const breakdowns = useBreakdownStore.getState();
    const qc = useQCLabStore.getState();
    try {
      setLocale('en');
      campaign.resetCampaign();
      useOperationsCampaignStore.getState().triggerIncident('power_sag');
      setLocale('pt-BR');
      useOperationsCampaignStore.setState((state) => ({
        execution: {
          ...state.execution,
          stage: 'quality_hold',
          sourceMaterial: 'wheat_grain',
          finishedMaterial: 'flour',
          dispatchLoad: { ...state.execution.dispatchLoad, status: 'departed', blockReason: null },
        },
      }));
      useMaterialFlowStore.setState({
        productionBatches: [
          {
            ...(flow.productionBatches[0] ?? {}),
            id: 'batch-0042',
            disposition: 'released',
            availableKg: 1234.5,
          } as never,
        ],
      });
      useBreakdownStore.setState({
        workOrders: [{ id: 'wo-0007', phase: 'awaiting_parts' } as never],
      });
      useQCLabStore.setState((state) => ({
        qcLab: {
          ...state.qcLab,
          dispositionHistory: [
            { id: 'qd-0003', action: 'hold', referenceId: 'batch-0042' } as never,
          ],
        },
      }));

      const { container } = render(<SCADAPanel isOpen onClose={vi.fn()} />);
      const text = container.textContent ?? '';

      expect(screen.getByText('Retenção de qualidade')).toBeInTheDocument();
      expect(screen.getByText('Grão de trigo')).toBeInTheDocument();
      expect(screen.getByText('para farinha')).toBeInTheDocument();
      expect(screen.getByText('Saiu')).toBeInTheDocument();
      expect(screen.getByText('Aguardando peças, serviço autônomo')).toBeInTheDocument();
      expect(screen.getByText(/^Liberado, 1\.234,5 kg$/)).toBeInTheDocument();
      expect(screen.getByText('Retenção, batch-0042')).toBeInTheDocument();
      expect(screen.getByText('Queda de tensão na unidade')).toBeInTheDocument();
      expect(text).not.toMatch(
        /quality hold|wheat grain|\bflour\b|departed|released|awaiting parts|Site power sag/i
      );
      // Portuguese never title-cases: the Overview carries no CSS capitalize.
      expect(container.querySelector('.capitalize')).toBeNull();
    } finally {
      setLocale('en');
      campaign.resetCampaign();
      useMaterialFlowStore.setState({ productionBatches: flow.productionBatches });
      useBreakdownStore.setState({ workOrders: breakdowns.workOrders });
      useQCLabStore.setState({ qcLab: qc.qcLab });
    }
  });
});
