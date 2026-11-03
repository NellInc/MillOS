/**
 * A packing line's FLOW tag is the reading the Machine Inspector shows as its
 * feed rate (MachineInspector picks a machine's first FLOW tag) and the SCADA
 * tag list shows for the line. It was a bag counter whose simulation had no
 * source (base 0, no noise, drift disabled), so a packer packing 25 kg every
 * plant second read 0 with a flat-zero trend. Working if each line's FLOW tag
 * reads the mass that packer is processing in the material model, and the three
 * lines add up to the plant's packer flow.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getTagsByMachine, MILL_TAGS, OPERATION_TAG_IDS } from './scada/tagDatabase';
import { buildOperationalTelemetry } from './store';
import { useBreakdownStore } from './stores/breakdownStore';
import { useMaterialFlowStore } from './stores/materialFlowStore';
import { useQCLabStore } from './stores/qcLabStore';
import { SimulationAdapter } from './scada/adapters/SimulationAdapter';
import { PLANT_SECONDS_PER_GAME_SECOND } from './simulation/pace';

const PACKERS = ['packer-0', 'packer-1', 'packer-2'];
const flowTagOf = (machineId: string) =>
  getTagsByMachine(machineId).find((tag) => tag.group === 'FLOW');
const telemetry = () =>
  buildOperationalTelemetry(
    useMaterialFlowStore.getState(),
    useBreakdownStore.getState().partsInventory,
    useQCLabStore.getState().qcLab
  );

describe('packing line feed tag', () => {
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

  it('reads what each packer is processing, and the lines sum to the packer flow', () => {
    // Every packer starts with flour in its hopper, so one plant second packs.
    useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
    const values = telemetry();
    let sum = 0;
    for (const packerId of PACKERS) {
      const tag = flowTagOf(packerId);
      expect(tag).toBeDefined();
      const expected =
        (useMaterialFlowStore.getState().getMachineFeedRate(packerId) *
          3600 *
          PLANT_SECONDS_PER_GAME_SECOND) /
        1000;
      expect(expected).toBeGreaterThan(0);
      expect(values[tag!.id]).toBeCloseTo(expected, 6);
      expect(values[tag!.id]).toBeLessThanOrEqual(tag!.engHigh);
      sum += values[tag!.id];
    }
    expect(sum).toBeCloseTo(values[OPERATION_TAG_IDS.packerFlow], 6);
  });

  it('is what the simulated transmitter publishes for a working line', async () => {
    useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
    adapter = new SimulationAdapter(MILL_TAGS);
    adapter.updateOperationalValues(telemetry());
    await adapter.connect();
    const tag = flowTagOf('packer-0')!;
    const reading = await adapter.readTag(tag.id);
    expect(reading.quality).toBe('GOOD');
    expect(reading.value as number).toBeGreaterThan(0);
  });
});
