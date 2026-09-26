import { act, fireEvent, render as renderComponent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineInspector, inspectorTrendPaths } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useMaterialFlowStore, type MachineBuffer } from '../../../stores/materialFlowStore';
import { useProductionStore } from '../../../stores/productionStore';

const machine: MachineData = {
  id: 'review-mill',
  name: 'Review mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 5, efficiency: 90 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

const buffer: MachineBuffer = {
  machineId: machine.id,
  machineType: 'roller_mill',
  inputBuffer: [],
  outputBuffer: [],
  inputCapacity: 100,
  outputCapacity: 100,
  processingRate: 10,
  conversionRatios: [],
  isProcessing: true,
};

const render = (element: Parameters<typeof renderComponent>[0]) => {
  const result = renderComponent(element);
  fireEvent.click(screen.getByText('Inspect'));
  return result;
};

describe('recorded inspector trends', () => {
  it('never fabricates a trace from absent or single-sample history', () => {
    expect(inspectorTrendPaths([])).toEqual([]);
    expect(inspectorTrendPaths([{ timestamp: 1000, value: 12, quality: 'GOOD' }])).toEqual([]);
  });
  it('leaves quality gaps disconnected and keeps a flat measured trace finite', () => {
    const points = [10, 10, 99, 10, 10].map((value, index) => ({
      timestamp: index * 1000,
      value,
      quality: index === 2 ? ('BAD' as const) : ('GOOD' as const),
    }));
    const paths = inspectorTrendPaths(points);
    expect(paths).toEqual(['M8.00,34.00 L74.00,34.00', 'M206.00,34.00 L272.00,34.00']);
  });
});

describe('MachineInspector evidence', () => {
  it('shows one readable status and keeps fault guidance specific', () => {
    const { rerender } = renderComponent(<MachineInspector machine={machine} />);
    expect(screen.getByRole('status', { name: 'Machine status: running' })).toHaveTextContent(
      'running'
    );
    expect(screen.queryByText('Running.')).not.toBeInTheDocument();
    rerender(<MachineInspector machine={{ ...machine, status: 'warning' }} />);
    expect(screen.getByRole('status', { name: 'Machine status: warning' })).toHaveTextContent(
      'warning'
    );
    expect(
      screen.getByText("Something's off. Check the metrics and maintenance log.")
    ).toBeVisible();
  });

  it('places the primary Inspect disclosure before the secondary focus action', () => {
    renderComponent(<MachineInspector machine={machine} onFocusMachine={vi.fn()} />);
    const inspect = screen.getByText('Inspect').closest('summary')!;
    const focus = screen.getByRole('button', { name: 'Focus machine' });
    expect(inspect.compareDocumentPosition(focus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps the primary readings visible and discloses service controls on Inspect', () => {
    renderComponent(<MachineInspector machine={machine} />);
    expect(screen.getByText('Temperature')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Restart Unit' })).not.toBeVisible();
    fireEvent.click(screen.getByText('Inspect'));
    expect(screen.getByRole('button', { name: 'Restart Unit' })).toBeVisible();
  });
  it('focuses the selected machine through the real callback and only offers focus when supported', () => {
    const focus = vi.fn();
    const { rerender } = render(<MachineInspector machine={machine} onFocusMachine={focus} />);
    fireEvent.click(screen.getByRole('button', { name: 'Focus machine' }));
    expect(focus).toHaveBeenCalledWith(machine.id);
    rerender(<MachineInspector machine={machine} />);
    expect(screen.queryByRole('button', { name: 'Focus machine' })).not.toBeInTheDocument();
  });

  it('labels the actual temperature and preserves the critical restart safety gate', () => {
    render(<MachineInspector machine={{ ...machine, status: 'critical' }} />);
    expect(screen.getByText('Temperature')).toBeVisible();
    expect(screen.getByText('45.0')).toBeVisible();
    expect(screen.queryByText(/Bearing temperature|Throughput/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart Unit' })).toBeDisabled();
    expect(
      screen.getByText('Critical fault. Restart is locked until maintenance or a repair clears it.')
    ).toBeVisible();
  });

  describe('with the machine in the production store', () => {
    let savedMachines: MachineData[];
    beforeEach(() => {
      savedMachines = useProductionStore.getState().machines;
      useProductionStore.setState({ machines: [{ ...machine, status: 'critical' }] });
    });
    afterEach(() => {
      vi.useRealTimers();
      useProductionStore.setState({ machines: savedMachines });
    });

    it('follows live store status instead of the click-time snapshot', () => {
      render(<MachineInspector machine={{ ...machine, status: 'critical' }} />);
      expect(screen.getByRole('button', { name: 'Restart Unit' })).toBeDisabled();
      act(() => useProductionStore.getState().updateMachineStatus(machine.id, 'running'));
      expect(screen.getByRole('status', { name: 'Machine status: running' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Restart Unit' })).toBeEnabled();
    });

    it('finishes a restart even when the panel closes mid-sequence', async () => {
      vi.useFakeTimers();
      useProductionStore.setState({ machines: [{ ...machine, status: 'warning' }] });
      const { unmount } = render(<MachineInspector machine={machine} />);
      fireEvent.click(screen.getByRole('button', { name: 'Restart Unit' }));
      expect(useProductionStore.getState().machines[0].status).toBe('idle');
      unmount();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2600);
      });
      expect(useProductionStore.getState().machines[0].status).toBe('running');
    });
  });
  beforeEach(() => {
    useMaterialFlowStore.setState({ machineBuffers: new Map() });
  });

  it('does not invent service records or historical health from the current status', () => {
    render(<MachineInspector machine={machine} />);
    fireEvent.click(screen.getByRole('button', { name: 'View Maintenance Logs' }));
    expect(screen.getByText(/No maintenance on record/)).toBeVisible();
    expect(screen.queryByText(/Service unit:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/last 24 hours/)).not.toBeInTheDocument();
  });

  it('preserves recorded service evidence', () => {
    render(
      <MachineInspector
        machine={{
          ...machine,
          maintenanceHistory: [
            {
              id: 'recorded-service',
              date: '2026-09-01',
              type: 'preventive',
              serviceUnit: 'service-01',
              notes: 'Replaced bearing after inspection.',
              duration: 45,
            },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'View Maintenance Logs' }));
    expect(screen.getByText('Replaced bearing after inspection.')).toBeVisible();
    expect(screen.getByText('Service unit: service-01')).toBeVisible();
    expect(screen.queryByText(/No maintenance records/)).not.toBeInTheDocument();
  });

  it('distinguishes missing flow data from an empty input buffer', () => {
    render(<MachineInspector machine={machine} />);
    expect(screen.getByText('Flow unavailable')).toBeVisible();
    act(() => useMaterialFlowStore.setState({ machineBuffers: new Map([[machine.id, buffer]]) }));
    expect(screen.getByText('Waiting for material')).toBeVisible();
    expect(screen.queryByText(/Flow unavailable/)).not.toBeInTheDocument();
  });

  it('explains full output and updates when transport makes room', () => {
    const fullBuffer: MachineBuffer = {
      ...buffer,
      inputBuffer: [{ type: 'wheat_grain', amount: 30 }],
      outputBuffer: [{ type: 'flour', amount: 100 }],
    };
    useMaterialFlowStore.setState({ machineBuffers: new Map([[machine.id, fullBuffer]]) });
    render(<MachineInspector machine={machine} />);
    expect(screen.getByText('Waiting for output space')).toBeVisible();
    expect(screen.getByText('100 kg')).toBeVisible();
    act(() =>
      useMaterialFlowStore.setState({
        machineBuffers: new Map([[machine.id, { ...fullBuffer, outputBuffer: [] }]]),
      })
    );
    expect(screen.getByText('Material ready')).toBeVisible();
    expect(screen.queryByText('Waiting for output space')).not.toBeInTheDocument();
  });

  it('does not describe a full storage silo as a blocked processing machine', () => {
    useMaterialFlowStore.setState({
      machineBuffers: new Map([
        [
          machine.id,
          {
            ...buffer,
            machineType: 'silo',
            outputBuffer: [{ type: 'wheat_grain', amount: 100 }],
          },
        ],
      ]),
    });
    render(<MachineInspector machine={{ ...machine, type: MachineType.SILO }} />);
    expect(screen.getByText('Storage inventory')).toBeVisible();
    expect(screen.queryByText('Waiting for output space')).not.toBeInTheDocument();
  });

  it('shows unavailable metrics instead of invented zero or non-finite readings', () => {
    const { rerender } = render(
      <MachineInspector
        machine={{
          ...machine,
          metrics: undefined as unknown as MachineData['metrics'],
        }}
      />
    );
    expect(screen.getAllByText('--')).toHaveLength(4);
    rerender(
      <MachineInspector
        machine={{
          ...machine,
          metrics: { ...machine.metrics, temperature: NaN, rpm: Infinity },
        }}
      />
    );
    expect(screen.getAllByText('--')).toHaveLength(2);
    expect(screen.queryByText('NaN')).not.toBeInTheDocument();
    expect(screen.queryByText('Infinity')).not.toBeInTheDocument();
  });
});
