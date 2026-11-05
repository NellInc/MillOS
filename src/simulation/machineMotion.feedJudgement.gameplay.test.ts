import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { getMachineOperationalState } from './machineMotion';
import { unitHasFeed } from './machineLoad';
import { MachineType } from '../types';

/**
 * The 3D pose (and the inspector's flow line and the beacon colour) judged
 * starvation from the mill's hopper this instant, while its load and its share
 * of the energy bill judge feed over the material model's feed window
 * (isMachineUnfed). A mill between parcels posed starved while billed at
 * working load, and a mill on a 0% line posed working while billed idle.
 * Working if the pose is 'operating' exactly when the unit is billed as fed.
 */
const MILL = { id: 'rm-101', type: MachineType.ROLLER_MILL };

const tickSeconds = (seconds: number, productionSpeed: number, remainingFinishedKg: number) => {
  for (let second = 0; second < seconds; second++) {
    useMaterialFlowStore.getState().tickMaterialFlow(1, productionSpeed, {
      sourceMaterial: 'wheat_grain',
      finishedMaterial: 'flour',
      remainingFinishedKg,
    });
  }
};

const setMillInput = (amount: number) => {
  const flow = useMaterialFlowStore.getState();
  const buffers = new Map(flow.machineBuffers);
  const mill = buffers.get(MILL.id)!;
  buffers.set(MILL.id, {
    ...mill,
    inputBuffer: amount > 0 ? [{ type: 'wheat_grain', amount }] : [],
    outputBuffer: [],
  });
  useMaterialFlowStore.setState({ machineBuffers: buffers });
};

const pose = () =>
  getMachineOperationalState(
    'running',
    useMaterialFlowStore.getState().machineBuffers.get(MILL.id)
  );

beforeEach(() => useMaterialFlowStore.getState().resetMaterialFlow());
afterEach(() => useMaterialFlowStore.getState().resetMaterialFlow());

describe('machine pose follows the billed feed judgement', () => {
  it('a mill billed idle on a 0% line does not pose as working', () => {
    setMillInput(500);
    tickSeconds(12, 0, 100_000);
    expect(unitHasFeed(MILL, useMaterialFlowStore.getState())).toBe(false);
    expect(pose()).not.toBe('operating');
    // Its hopper is full, so it is not waiting for material: the line is stopped.
    expect(pose()).toBe('stopped');
  });

  it('a mill billed at working load does not pose starved between parcels', () => {
    setMillInput(5000);
    tickSeconds(12, 1, 100_000);
    expect(useMaterialFlowStore.getState().hasFeedRecord()).toBe(true);
    expect(unitHasFeed(MILL, useMaterialFlowStore.getState())).toBe(true);
    // The hopper is empty this instant, but the unit processed inside the window.
    setMillInput(0);
    expect(unitHasFeed(MILL, useMaterialFlowStore.getState())).toBe(true);
    expect(pose()).toBe('operating');
  });

  it('a mill with an empty hopper for a whole window poses starved, as it is billed', () => {
    setMillInput(0);
    tickSeconds(12, 1, 0);
    expect(unitHasFeed(MILL, useMaterialFlowStore.getState())).toBe(false);
    expect(pose()).toBe('starved');
  });

  it('before a full window is on record, the bill and the pose read the same hopper', () => {
    setMillInput(0);
    expect(useMaterialFlowStore.getState().hasFeedRecord()).toBe(false);
    expect(unitHasFeed(MILL, useMaterialFlowStore.getState())).toBe(false);
    expect(pose()).toBe('starved');
    setMillInput(500);
    expect(unitHasFeed(MILL, useMaterialFlowStore.getState())).toBe(true);
    expect(pose()).toBe('operating');
  });
});
