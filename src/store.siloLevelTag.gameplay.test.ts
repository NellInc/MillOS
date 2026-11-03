/**
 * A silo's SCADA level transmitter and the Machine Inspector's output buffer
 * describe the same grain. The level was synthetic: a fixed 21-80% per silo,
 * never moving as the silo drained or a truck filled it, while the inspector
 * showed the material model's stock. Working if each silo's level is its stock
 * as a share of its capacity, and a silo emptied by milling (routine: trucks
 * top up the emptiest silo) raises no low-level alarm; raw inventory alarms on
 * OPERATIONS.WT001.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTagsByMachine, MILL_TAGS } from './scada/tagDatabase';
import { buildOperationalTelemetry } from './store';
import { useBreakdownStore } from './stores/breakdownStore';
import { useMaterialFlowStore } from './stores/materialFlowStore';
import { useQCLabStore } from './stores/qcLabStore';
import { SimulationAdapter } from './scada/adapters/SimulationAdapter';

const SILOS = ['silo-0', 'silo-1', 'silo-2', 'silo-3', 'silo-4'];
const levelTagOf = (machineId: string) =>
  getTagsByMachine(machineId).find((tag) => tag.group === 'LEVEL');
const telemetry = () =>
  buildOperationalTelemetry(
    useMaterialFlowStore.getState(),
    useBreakdownStore.getState().partsInventory,
    useQCLabStore.getState().qcLab
  );
const stockPercent = (machineId: string) => {
  const buffer = useMaterialFlowStore.getState().machineBuffers.get(machineId)!;
  return (
    (buffer.outputBuffer.reduce((sum, material) => sum + material.amount, 0) /
      buffer.outputCapacity) *
    100
  );
};

describe('silo level tag', () => {
  let adapter: SimulationAdapter | null = null;
  beforeEach(() => {
    useMaterialFlowStore.getState().resetMaterialFlow();
    useBreakdownStore.getState().resetBreakdownStore();
    useQCLabStore.getState().resetQCLab();
  });
  afterEach(async () => {
    await adapter?.disconnect();
    adapter = null;
  });

  it("reads each silo's stock as a share of its capacity, as it drains and fills", () => {
    for (let second = 0; second < 30; second++)
      useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
    useMaterialFlowStore.getState().receiveGrainDelivery(15000);
    const values = telemetry();
    const levels = SILOS.map((siloId) => {
      const tag = levelTagOf(siloId);
      expect(tag).toBeDefined();
      expect(values[tag!.id]).toBeCloseTo(stockPercent(siloId), 6);
      return values[tag!.id];
    });
    // The silos the mills drew from and the one the truck filled now differ.
    expect(new Set(levels.map((level) => level.toFixed(3))).size).toBeGreaterThan(1);
  });

  it('is what the simulated transmitter publishes, with no low limit on an emptied silo', async () => {
    useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
    adapter = new SimulationAdapter(MILL_TAGS);
    adapter.updateOperationalValues(telemetry());
    await adapter.connect();
    for (const siloId of SILOS) {
      const tag = levelTagOf(siloId)!;
      expect((await adapter.readTag(tag.id)).value as number).toBeCloseTo(stockPercent(siloId), 3);
      expect(tag.alarmLo).toBeUndefined();
      expect(tag.alarmLoLo).toBeUndefined();
      // A full silo is a HIGH notice; nothing about it is CRITICAL.
      expect(tag.alarmHi).toBe(95);
      expect(tag.alarmHiHi).toBeUndefined();
    }
  });
});
