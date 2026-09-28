import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { MachineType, type MachineData } from '../../../types';
import { useMaterialFlowStore, type MachineBuffer } from '../../../stores/materialFlowStore';

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

describe('MachineInspector evidence', () => {
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
  });
  beforeEach(() => {
    useMaterialFlowStore.setState({ machineBuffers: new Map() });
  });

  it('does not invent service records or historical health from the current status', () => {
    render(<MachineInspector machine={machine} />);
    fireEvent.click(screen.getByRole('button', { name: 'View Maintenance Logs' }));
    expect(screen.getByText('No maintenance records.')).toBeVisible();
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
