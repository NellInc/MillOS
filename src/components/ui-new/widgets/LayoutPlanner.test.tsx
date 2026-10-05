import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LayoutPlanner } from './LayoutPlanner';
import { useProductionStore } from '../../../stores/productionStore';
import { cloneMaterialFlowData, useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { canonicalProcessMachines } from '../../../simulation/materialTransport';
import { currentLogisticsLayout } from '../../../simulation/layoutPlanning';
import type { MachineData } from '../../../types';
import {
  useLogisticsLayoutStore,
  defaultSavedLogisticsLayout,
} from '../../../stores/logisticsLayoutStore';
import { registerLogisticsVehicle } from '../../../simulation/logisticsRuntime';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';

const priorProduction = useProductionStore.getState();
beforeEach(() => {
  useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
  useProductionStore.setState({
    machines: canonicalProcessMachines().map((m) => ({ ...m, status: 'running' })) as MachineData[],
  });
  useMaterialFlowStore.getState().resetMaterialFlow();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  useProductionStore.setState(priorProduction, true);
});
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name, exact: true }));

describe('protected layout workspace', () => {
  it('edits, searches, undoes, redoes and resets without mutating the running twin, including StrictMode', async () => {
    const machines = structuredClone(useProductionStore.getState().machines);
    const material = cloneMaterialFlowData(useMaterialFlowStore.getState());
    render(
      <React.StrictMode>
        <LayoutPlanner onClose={vi.fn()} />
      </React.StrictMode>
    );
    const x = () => screen.getByLabelText('shipping staging X (m)');
    expect(x()).toHaveValue(16);
    fireEvent.change(x(), { target: { value: '18' } });
    expect(x()).toHaveValue(18);
    click('Undo');
    expect(x()).toHaveValue(16);
    click('Redo');
    expect(x()).toHaveValue(18);
    click('Reset proposal');
    expect(x()).toHaveValue(16);
    click('Find lower-cost layout');
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('alternatives checked')
    );
    expect(x()).not.toHaveValue(16);
    expect(useProductionStore.getState().machines).toEqual(machines);
    expect(cloneMaterialFlowData(useMaterialFlowStore.getState())).toEqual(material);
    expect(currentLogisticsLayout().staging.shipping[0]).toBe(16);
    click('Capture current again');
    expect(x()).toHaveValue(16);
  });

  it('exports locally, disables conflicted/stale exports and uses Escape without writing live state', async () => {
    const blobs: Blob[] = [];
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn((blob: Blob) => {
        blobs.push(blob);
        return 'blob:plan';
      }),
    });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const material = cloneMaterialFlowData(useMaterialFlowStore.getState());
    const close = vi.fn();
    render(<LayoutPlanner onClose={close} />);
    for (const name of ['Export SVG', 'Export DXF', 'Save proposal JSON']) {
      click(name);
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('download started'));
    }
    expect(blobs.map((blob) => blob.type)).toEqual([
      'image/svg+xml',
      'application/dxf',
      'application/json',
    ]);
    expect(blobs.every((blob) => blob.size > 1000)).toBe(true);
    fireEvent.change(screen.getByLabelText('shipping staging X (m)'), { target: { value: '29' } });
    expect(screen.getByRole('button', { name: 'Export SVG' })).toBeDisabled();
    click('Reset proposal');
    // Catch a geometry change immediately, before the periodic stale-state poll.
    const changed = structuredClone(useProductionStore.getState().machines);
    changed[0].position[0] += 2;
    act(() => useProductionStore.setState({ machines: changed }));
    click('Export SVG');
    expect(screen.getByRole('alert')).toHaveTextContent('live process layout changed');
    expect(blobs).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeDisabled();
    // Recapture must validate the machine footprint it actually draws.
    changed[0].position = [-28, 0, -30];
    act(() => useProductionStore.setState({ machines: structuredClone(changed) }));
    click('Capture current again');
    expect(screen.getByRole('button', { name: 'Export SVG' })).toBeDisabled();
    expect(screen.getByText('receiving: swept route meets silo-0.')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(close).toHaveBeenCalledOnce();
    expect(cloneMaterialFlowData(useMaterialFlowStore.getState())).toEqual(material);
  });
});

it('pauses, applies, runs, compares and undoes through the workspace controls', () => {
  useProductionStore.getState().setProductionSpeed(1.5);
  useGameSimulationStore.getState().setGameSpeed(60);
  const remove = ['shipping', 'receiving'].map((dock) =>
    registerLogisticsVehicle(dock as 'shipping' | 'receiving', {
      prepare: () => () => {},
      restore: () => {},
    })
  );
  try {
    const session = useMaterialFlowStore.getState().sessionId;
    useLogisticsLayoutStore.getState().observe(session, 12, 18, 100, 0, 'baseline');
    const close = vi.fn();
    const view = render(<LayoutPlanner onClose={close} />);
    fireEvent.change(screen.getByLabelText('shipping staging X (m)'), { target: { value: '18' } });
    expect(screen.getByRole('button', { name: 'Apply to mill' })).toBeDisabled();
    click('Pause mill');
    expect(useProductionStore.getState().productionSpeed).toBe(0);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    click('Apply to mill');
    expect(useLogisticsLayoutStore.getState().layout.staging.shipping[0]).toBe(18);
    expect(screen.getByRole('status')).toHaveTextContent('Layout applied');
    click('Run production');
    expect(close).toHaveBeenCalledOnce();
    expect(useProductionStore.getState().productionSpeed).toBe(1.5);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(60);
    view.unmount();
    useLogisticsLayoutStore.getState().observe(session, 12, 18, 150, 10, 'baseline');
    render(<LayoutPlanner onClose={close} />);
    expect(screen.getByText('Observed operating results')).toBeInTheDocument();
    expect(screen.getByLabelText('shipping staging X (m)')).toHaveValue(18);
    click('Pause mill');
    click('Undo applied layout');
    expect(useLogisticsLayoutStore.getState().layout.staging.shipping[0]).toBe(16);
    expect(useLogisticsLayoutStore.getState().retainedAfter?.shippedKg).toBe(10);
    expect(screen.getByRole('status')).toHaveTextContent('Previous geometry restored');
  } finally {
    remove.forEach((f) => f());
  }
});
