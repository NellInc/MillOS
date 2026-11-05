import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MachineType, type MachineData } from '../../../types';
import { useMaterialFlowStore, type MachineBuffer } from '../../../stores/materialFlowStore';
import { useGraphicsStore } from '../../../stores/graphicsStore';

// The mill's FT001 transmitter carries the material model's feed (t per game
// hour); this mock pins a stale running value to check the inspector's guard.
vi.mock('../../../scada/useSCADA', () => ({
  useSCADATag: () => ({
    value: { tagId: 'RM101.FT001.PV', value: 27.4, quality: 'GOOD', timestamp: 0 },
    history: [],
    loadHistory: vi.fn(async () => {}),
  }),
}));

const { MachineInspector } = await import('../sidebar/MachineInspector');

const mill: MachineData = {
  id: 'rm-101',
  name: 'R.M. 101',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 100, temperature: 45, vibration: 1, load: 60, wear: 5, efficiency: 90 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
};

const buffer = (inputKg: number, outputKg = 0): MachineBuffer => ({
  machineId: mill.id,
  machineType: 'roller_mill',
  inputBuffer: inputKg > 0 ? [{ type: 'wheat_grain', amount: inputKg }] : [],
  outputBuffer: outputKg > 0 ? [{ type: 'flour', amount: outputKg }] : [],
  inputCapacity: 100,
  outputCapacity: 100,
  processingRate: 10,
  conversionRatios: [],
  isProcessing: true,
});

const feedRate = () => screen.getByText('Feed rate').nextElementSibling?.textContent;

beforeEach(() => {
  useGraphicsStore.setState((state) => ({ graphics: { ...state.graphics, enableSCADA: true } }));
});
afterEach(() => {
  cleanup();
  useMaterialFlowStore.setState({ machineBuffers: new Map() });
});

// R.M. 101 read "Running, Feed rate 27-28 t/h" while Inspect said "Waiting for
// material, Input buffer 0 kg". Working if the feed rate is zero whenever the
// material model says nothing is passing through the unit.
describe('MachineInspector feed rate against the material model', () => {
  it('reads zero while the mill waits for material', () => {
    useMaterialFlowStore.setState({ machineBuffers: new Map([[mill.id, buffer(0)]]) });
    render(<MachineInspector machine={mill} />);
    expect(screen.getByText('Waiting for material')).toBeInTheDocument();
    expect(feedRate()).toContain('0.0');
    expect(feedRate()).not.toContain('27.4');
  });

  it('reads zero while the mill waits for output space', () => {
    useMaterialFlowStore.setState({ machineBuffers: new Map([[mill.id, buffer(30, 100)]]) });
    render(<MachineInspector machine={mill} />);
    expect(feedRate()).toContain('0.0');
  });

  it('shows the transmitter reading while material is moving', () => {
    useMaterialFlowStore.setState({ machineBuffers: new Map([[mill.id, buffer(30)]]) });
    render(<MachineInspector machine={mill} />);
    expect(feedRate()).toContain('27.4');
    act(() => useMaterialFlowStore.setState({ machineBuffers: new Map([[mill.id, buffer(0)]]) }));
    expect(feedRate()).toContain('0.0');
  });
});
