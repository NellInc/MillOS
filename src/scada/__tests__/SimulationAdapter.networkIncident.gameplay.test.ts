import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCADA_SETPOINT_STORAGE_KEY, SimulationAdapter } from '../adapters/SimulationAdapter';
import { MILL_TAGS } from '../tagDatabase';
import { AlarmManager } from '../AlarmManager';
import { safeJSONStorage } from '../../stores/storage';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';

/**
 * Plan item 7.4. The control-network incident's history note says the SCADA
 * view "may be stale or incomplete" while it lasts. Working if, during it, a
 * seeded subset of tags reads UNCERTAIN and holds its last value, the same
 * subset for the same incident, and every tag reads GOOD again once it closes.
 */
const RUNNING = [
  ...new Set(
    MILL_TAGS.map((tag) => tag.machineId).filter((id) => /^(rm|sifter|packer|silo)-/.test(id))
  ),
].map((id) => ({ id, status: 'running' as const, metrics: { load: 70, rpm: 1200 } }));

async function connected(): Promise<SimulationAdapter> {
  const adapter = new SimulationAdapter(MILL_TAGS);
  await adapter.connect();
  adapter.updateMachineStates(RUNNING);
  vi.advanceTimersByTime(5_000);
  return adapter;
}

async function qualities(adapter: SimulationAdapter): Promise<Map<string, string>> {
  return new Map((await adapter.readAllTags()).map((value) => [value.tagId, value.quality]));
}

describe('SCADA during the control-network incident', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED });
    safeJSONStorage.removeItem(SCADA_SETPOINT_STORAGE_KEY);
  });
  afterEach(() => vi.useRealTimers());

  it('serves a seeded subset UNCERTAIN and held, and GOOD again when it closes', async () => {
    const adapter = await connected();
    const baseline = await qualities(adapter);
    const goodAtBaseline = [...baseline].filter(([, q]) => q === 'GOOD').map(([id]) => id);
    expect(goodAtBaseline.length).toBeGreaterThan(50);

    adapter.setNetworkDegradation('incident-0007');
    const held = adapter.getNetworkUncertainTagIds();
    expect(held.length).toBeGreaterThan(MILL_TAGS.length * 0.1);
    expect(held.length).toBeLessThan(MILL_TAGS.length * 0.5);
    // Setpoints are the operator's own writes, not readings over the network.
    const writable = new Set(MILL_TAGS.filter((t) => t.accessMode !== 'READ').map((t) => t.id));
    expect(held.some((id) => writable.has(id))).toBe(false);

    const frozen = new Map((await adapter.readAllTags()).map((v) => [v.tagId, v.value]));
    vi.advanceTimersByTime(30_000);
    const during = await adapter.readAllTags();
    for (const value of during) {
      if (held.includes(value.tagId)) {
        expect(value.quality).toBe('UNCERTAIN');
        expect(value.value).toBe(frozen.get(value.tagId));
      }
    }
    // The rest of the plant still reports as it did.
    const others = during.filter(
      (v) => !held.includes(v.tagId) && baseline.get(v.tagId) === 'GOOD'
    );
    expect(others.length).toBeGreaterThan(0);
    expect(others.every((v) => v.quality === 'GOOD')).toBe(true);
    // A noisy held reading would have moved in 30 s; a mill's speed is noisy.
    const noisyHeld = MILL_TAGS.filter(
      (t) => held.includes(t.id) && (t.simulation?.noiseAmplitude ?? 0) > 0
    );
    expect(noisyHeld.length).toBeGreaterThan(0);

    adapter.setNetworkDegradation(null);
    vi.advanceTimersByTime(2_000);
    const after = await qualities(adapter);
    for (const id of goodAtBaseline) expect(after.get(id)).toBe('GOOD');
    expect(adapter.getNetworkUncertainTagIds()).toEqual([]);
    await adapter.disconnect();
  });

  // A packing line's speed: a mill's roll speed has had no operating band since
  // it became the line rate (tagDatabase.ts), so it cannot show a held LOLO.
  it('raises no alarm from a held reading: a line restarted under the hold does not trip LOLO', () => {
    const speed = MILL_TAGS.find((t) => t.id === 'PACKER_1.ST001.PV')!;
    const manager = new AlarmManager([speed]);
    vi.advanceTimersByTime(60_000);
    const sample = (value: number, quality: 'GOOD' | 'UNCERTAIN') =>
      manager.evaluate({ tagId: speed.id, value, quality, timestamp: Date.now() });
    // Stopped when the incident opened: the held reading is the stopped 0.
    manager.setEquipmentRunning(speed.machineId, false);
    sample(0, 'UNCERTAIN');
    manager.setEquipmentRunning(speed.machineId, true);
    sample(0, 'UNCERTAIN');
    expect(manager.getActiveAlarms()).toEqual([]);
    // A GOOD reading at the limit still alarms, and an UNCERTAIN one may still return.
    sample(0, 'GOOD');
    expect(manager.getActiveAlarms().map((a) => a.type)).toEqual(['LOLO']);
    sample(speed.simulation!.baseValue, 'UNCERTAIN');
    expect(manager.getActiveAlarms().map((a) => a.state)).toEqual(['RTN_UNACK']);
  });

  it('draws the same subset for the same incident and a different one for another', async () => {
    const a = await connected();
    a.setNetworkDegradation('incident-0007');
    const first = a.getNetworkUncertainTagIds();
    await a.disconnect();
    const b = await connected();
    b.setNetworkDegradation('incident-0007');
    expect(b.getNetworkUncertainTagIds()).toEqual(first);
    b.setNetworkDegradation('incident-0012');
    expect(b.getNetworkUncertainTagIds()).not.toEqual(first);
    await b.disconnect();
  });
});
