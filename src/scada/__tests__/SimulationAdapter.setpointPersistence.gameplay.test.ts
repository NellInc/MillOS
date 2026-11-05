/**
 * An operator's or agent's setpoint is a decision about the plant, so it must
 * survive a reload. Working if a setpoint written before a reload is the
 * setpoint after it, under a millos-* key the Reset Simulation sweep clears.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCADA_SETPOINT_STORAGE_KEY, SimulationAdapter } from '../adapters/SimulationAdapter';
import { MILL_TAGS } from '../tagDatabase';
import { safeJSONStorage } from '../../stores/storage';

const SP = 'RM101.ST001.SP';
const PV = 'RM101.ST001.PV';
const millTags = () => MILL_TAGS.filter((tag) => tag.machineId === 'rm-101');

describe('SCADA setpoints written by the operator survive a reload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    safeJSONStorage.removeItem(SCADA_SETPOINT_STORAGE_KEY);
  });

  afterEach(() => {
    safeJSONStorage.removeItem(SCADA_SETPOINT_STORAGE_KEY);
    vi.useRealTimers();
  });

  it('a new adapter starts from the setpoint the last one was given', async () => {
    const before = new SimulationAdapter(millTags());
    await before.connect();
    expect(await before.writeTag(SP, 1500)).toBe(true);
    await before.disconnect();

    const after = new SimulationAdapter(millTags());
    await after.connect();
    expect((await after.readTag(SP)).value).toBe(1500);
    // The drive was running at that setpoint before the reload: no ramp-in.
    expect(Math.abs(((await after.readTag(PV)).value as number) - 1500)).toBeLessThanOrEqual(5);
    await after.disconnect();
  });

  it('keeps the setpoints under a millos-* key, which Reset Simulation sweeps', async () => {
    expect(SCADA_SETPOINT_STORAGE_KEY.startsWith('millos-')).toBe(true);
    const adapter = new SimulationAdapter(millTags());
    await adapter.connect();
    await adapter.writeTag(SP, 1400);
    await adapter.disconnect();
    expect(safeJSONStorage.getItem(SCADA_SETPOINT_STORAGE_KEY)).toMatchObject({
      state: { setpoints: { [SP]: 1400 } },
    });
  });

  it('ignores a stored value the tag cannot hold, a read-only tag and an unknown tag', async () => {
    safeJSONStorage.setItem(SCADA_SETPOINT_STORAGE_KEY, {
      state: { setpoints: { [SP]: 99999, [PV]: 10, 'NO.SUCH.TAG': 5 } },
      version: 1,
    });
    const adapter = new SimulationAdapter(millTags());
    await adapter.connect();
    const authored = millTags().find((tag) => tag.id === SP)?.simulation?.baseValue;
    expect((await adapter.readTag(SP)).value).toBe(authored);
    expect(Math.abs(((await adapter.readTag(PV)).value as number) - 1200)).toBeLessThanOrEqual(5);
    await adapter.disconnect();
  });
});
