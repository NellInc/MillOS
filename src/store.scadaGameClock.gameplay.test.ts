import { beforeEach, describe, expect, it } from 'vitest';
import { AlarmManager } from './scada/AlarmManager';
import { MILL_TAGS, OPERATION_TAG_IDS, getTagById } from './scada/tagDatabase';
import { buildOperationalTelemetry } from './store';
import { useBreakdownStore } from './stores/breakdownStore';
import { useMaterialFlowStore } from './stores/materialFlowStore';
import { useQCLabStore } from './stores/qcLabStore';
import { bagsPerGameHour } from './simulation/pace';

/**
 * SCADA reports the material model on the game clock. The HUD reads three
 * packers at 25 kg per plant second as 360 bags (9 t) per GAME hour; the SCADA
 * final-flow tag read 270 t/h for the same plant, and each mill's feed tag was a
 * synthetic random walk (~25-31 t/h) blind to what the mill was processing.
 * Working if: FT001 agrees with the HUD's bag rate, each RM*.FT001 is that
 * mill's conserved throughput (zero for a mill the model has stopped), and a
 * normally running line - including a line idling between orders - raises no
 * feed alarm.
 */
const MILL_FEED = {
  'rm-101': 'RM101.FT001.PV',
  'rm-102': 'RM102.FT001.PV',
  'rm-103': 'RM103.FT001.PV',
  'rm-104': 'RM104.FT001.PV',
} as const;

const telemetry = () =>
  buildOperationalTelemetry(
    useMaterialFlowStore.getState(),
    useBreakdownStore.getState().partsInventory,
    useQCLabStore.getState().qcLab
  );

describe('SCADA flow tags on the game clock', () => {
  beforeEach(() => {
    useMaterialFlowStore.getState().resetMaterialFlow();
    useBreakdownStore.getState().resetBreakdownStore();
    useQCLabStore.getState().resetQCLab();
  });

  it('publishes final packing flow in t per game hour, matching the HUD bag rate', () => {
    useMaterialFlowStore.setState({ currentPackerFlowRate: 75 });
    const flowTph = telemetry()[OPERATION_TAG_IDS.packerFlow];
    // 360 bags of 25 kg per game hour is 9 t per game hour.
    expect((bagsPerGameHour(75, 25) * 25) / 1000).toBeCloseTo(9, 6);
    expect(flowTph).toBeCloseTo(9, 6);
    const tag = getTagById(OPERATION_TAG_IDS.packerFlow)!;
    // The transmitter range holds the reading rather than clamping it.
    expect(tag.engHigh).toBeGreaterThan(flowTph * 1.5);
    expect(tag.simulation?.baseValue).toBeLessThanOrEqual(tag.engHigh);
    expect(tag.simulation?.baseValue).toBeCloseTo(9, 0);
  });

  it("drives each mill's feed tag from that mill's conserved throughput", () => {
    const flow = useMaterialFlowStore.getState();
    flow.syncMachineProcessing([{ id: 'rm-101', status: 'idle' }]);
    for (let i = 0; i < 4; i += 1) useMaterialFlowStore.getState().tickMaterialFlow(0.5, 1);
    const values = telemetry();

    // rm-101 stopped: the model processes nothing through it.
    expect(values[MILL_FEED['rm-101']]).toBe(0);
    // rm-102 runs at its rated 50 kg per plant second while its hopper holds
    // grain: 50 * 3600 / 30 / 1000 = 6 t per game hour.
    expect(values[MILL_FEED['rm-102']]).toBeCloseTo(6, 3);
    // The combined-throughput tag is the sum of the four mills.
    const sum = Object.values(MILL_FEED).reduce((total, id) => total + values[id], 0);
    expect(values['UTILITY.FT002.PV']).toBeCloseTo(sum, 6);
  });

  it('reads a mill with nothing to process as zero, not its last burst', () => {
    for (let i = 0; i < 4; i += 1) useMaterialFlowStore.getState().tickMaterialFlow(0.5, 1);
    expect(telemetry()[MILL_FEED['rm-103']]).toBeGreaterThan(0);
    useMaterialFlowStore.getState().syncMachineProcessing([{ id: 'rm-103', status: 'idle' }]);
    // A full feed window later the stopped mill reads zero.
    for (let i = 0; i < 40; i += 1) useMaterialFlowStore.getState().tickMaterialFlow(0.5, 1);
    expect(telemetry()[MILL_FEED['rm-103']]).toBe(0);
  });

  it('starts every reset with an empty feed window', () => {
    for (let i = 0; i < 4; i += 1) useMaterialFlowStore.getState().tickMaterialFlow(0.5, 1);
    expect(telemetry()[MILL_FEED['rm-102']]).toBeGreaterThan(0);
    useMaterialFlowStore.getState().resetMaterialFlow();
    expect(telemetry()[MILL_FEED['rm-102']]).toBe(0);
  });

  it('raises no feed alarm for a running line, at rate or idling between orders', () => {
    const alarms = new AlarmManager(MILL_TAGS);
    // Past the startup warmup.
    (alarms as unknown as { startupTime: number }).startupTime = 0;
    const feedTags = [...Object.values(MILL_FEED), 'UTILITY.FT002.PV'];
    const evaluate = (tph: number) =>
      feedTags.forEach((tagId) =>
        alarms.evaluate({ tagId, value: tph, quality: 'GOOD', timestamp: Date.now() })
      );
    // Steady line: rm-101/104 share one packer (~2.2 t/h each), rm-102/103 ~4.4.
    [2.2, 4.4, 6].forEach(evaluate);
    // Order covered and waiting for its truck: the mills run empty by design.
    evaluate(0);
    expect(alarms.getActiveAlarms().filter((a) => feedTags.includes(a.tagId))).toEqual([]);
    alarms.evaluate({
      tagId: OPERATION_TAG_IDS.packerFlow,
      value: 9,
      quality: 'GOOD',
      timestamp: Date.now(),
    });
    expect(alarms.getActiveAlarms()).toEqual([]);
  });

  it('gives every mill feed tag a range that holds the rated feed', () => {
    for (const id of Object.values(MILL_FEED)) {
      const tag = getTagById(id)!;
      expect(tag.engHigh).toBeGreaterThanOrEqual(6);
      expect(tag.engHigh).toBeLessThan(20);
      expect(tag.simulation?.baseValue).toBeLessThanOrEqual(6);
    }
  });
});
