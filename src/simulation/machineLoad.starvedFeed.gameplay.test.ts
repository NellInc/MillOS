/**
 * A unit that is running but has no feed (its line's order is fully packed and
 * waiting on dispatch, or the silos are dry) works nothing. It kept 80% load
 * and was billed 94% of running demand while its feed tag read 0. Working if a
 * starved mill's load falls to the idle level (0, as an idle unit's does) and
 * its demand to the idle figure, while a fed mill keeps working load, and a
 * mill with no feed record yet (a fresh session or a reload) is not judged.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineType, type MachineData } from '../types';
import { useProductionStore } from '../stores/productionStore';
import { useBreakdownStore } from '../stores/breakdownStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { updateOfflineMachineMetrics } from '../components/machines/MachineSimulationController';
import { getMachineEnergy, MACHINE_ENERGY_CONSUMPTION } from '../utils/energyCalculations';
import { storeOwnedLoad } from './machineLoad';

const mill = (id: string): MachineData => ({
  id,
  name: id,
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 1200, temperature: 58, vibration: 1.6, load: 80, wear: 5, efficiency: 100 },
  lastMaintenance: '',
  nextMaintenance: '',
});

/** rm-101's hopper is empty and the order is fully packed, so no silo feeds it. */
function starveRm101(plantSeconds: number) {
  const flow = useMaterialFlowStore.getState();
  const buffers = new Map(flow.machineBuffers);
  const rm101 = buffers.get('rm-101')!;
  buffers.set('rm-101', { ...rm101, inputBuffer: [] });
  useMaterialFlowStore.setState({ machineBuffers: buffers });
  for (let second = 0; second < plantSeconds; second++) {
    useMaterialFlowStore.getState().tickMaterialFlow(1, 1, {
      sourceMaterial: 'wheat_grain',
      finishedMaterial: 'flour',
      remainingFinishedKg: 0,
    });
  }
}

const byId = (id: string) => useProductionStore.getState().machines.find((m) => m.id === id)!;

describe('a running unit with no feed draws idle load', () => {
  let saved: MachineData[];
  beforeEach(() => {
    saved = useProductionStore.getState().machines;
    useBreakdownStore.getState().resetBreakdownStore();
    useGameSimulationStore.getState().resetGameState();
    useMaterialFlowStore.getState().resetMaterialFlow();
    useProductionStore.setState({ machines: [mill('rm-101'), mill('rm-102')], productionSpeed: 1 });
  });
  afterEach(() => {
    useMaterialFlowStore.getState().resetMaterialFlow();
    useGameSimulationStore.getState().resetGameState();
    useProductionStore.setState({ machines: saved });
  });

  it('a starved mill falls to idle load and idle demand; a fed mill keeps working', () => {
    starveRm101(12);
    const flow = useMaterialFlowStore.getState();
    expect(flow.getMachineFeedRate('rm-101')).toBe(0);
    expect(flow.getMachineFeedRate('rm-102')).toBeGreaterThan(0);

    // Three plant minutes of the offline model.
    for (let i = 0; i < 90; i++) updateOfflineMachineMetrics(2);

    const starved = byId('rm-101');
    expect(starved.status).toBe('running');
    expect(starved.metrics.load).toBe(0);
    expect(getMachineEnergy(starved)).toBeCloseTo(
      MACHINE_ENERGY_CONSUMPTION[MachineType.ROLLER_MILL].idle,
      6
    );
    // rm-102 ran through its hopper in the window, so it counts as fed.
    expect(byId('rm-102').metrics.load).toBeCloseTo(80, 0);
  });

  it('an idle unit offline settles at 0% load, not at a stuck 0.5%', () => {
    useProductionStore.setState({ machines: [{ ...mill('rm-101'), status: 'idle' }] });
    for (let i = 0; i < 120; i++) updateOfflineMachineMetrics(2);
    expect(byId('rm-101').metrics.load).toBe(0);
  });

  it('holds a load near its target on a paused (zero-ease) sample', () => {
    expect(storeOwnedLoad({ status: 'running', metrics: { load: 79.7 } }, 1, 0)).toBe(79.7);
  });

  it('does not judge a unit before the feed window has a full record', () => {
    // A fresh session (or a reload) has processed nothing yet.
    for (let i = 0; i < 30; i++) updateOfflineMachineMetrics(2);
    expect(byId('rm-101').metrics.load).toBeCloseTo(80, 0);
  });
});
