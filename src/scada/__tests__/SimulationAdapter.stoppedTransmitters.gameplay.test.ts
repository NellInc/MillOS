import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCADA_SETPOINT_STORAGE_KEY, SimulationAdapter } from '../adapters/SimulationAdapter';
import { getTagsByMachine } from '../tagDatabase';
import { safeJSONStorage } from '../../stores/storage';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';

/**
 * In SCADA mode (the default) the store's temperature and vibration come from
 * these transmitters, and the bridge takes GOOD readings only. A stopped or
 * tripped unit's bearing temperature and vibration were marked UNCERTAIN, so
 * the Machine Inspector froze them at their running values for as long as the
 * unit stood, and its vibration reading held still at its running level. A
 * tripped mill therefore never read cool and still, and its trip never lifted.
 * Working if a stopped mill's bearing temperature and vibration velocity keep
 * reporting (GOOD), the temperature cooling and the vibration settling to rest.
 */
const TT = 'RM101.TT001.PV';
const VT = 'RM101.VT001.PV';
const ST = 'RM101.ST001.PV';

describe('a stopped unit keeps reporting its condition', () => {
  let adapter: SimulationAdapter;

  beforeEach(async () => {
    vi.useFakeTimers();
    useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED });
    safeJSONStorage.removeItem(SCADA_SETPOINT_STORAGE_KEY);
    adapter = new SimulationAdapter(getTagsByMachine('rm-101'));
    await adapter.connect();
    adapter.updateMachineStates([
      { id: 'rm-101', status: 'running', metrics: { load: 80, rpm: 1200 } },
    ]);
    vi.advanceTimersByTime(10_000);
  });

  afterEach(async () => {
    await adapter.disconnect();
    vi.useRealTimers();
  });

  it('reports a tripped mill cooling and settling, as GOOD readings', async () => {
    const runningVibration = (await adapter.readTag(VT)).value as number;
    expect(runningVibration).toBeGreaterThan(0.5);

    adapter.updateMachineStates([
      { id: 'rm-101', status: 'critical', metrics: { load: 0, rpm: 0 } },
    ]);
    vi.advanceTimersByTime(120_000);

    const temperature = await adapter.readTag(TT);
    const vibration = await adapter.readTag(VT);
    expect(temperature.quality).toBe('GOOD');
    expect(vibration.quality).toBe('GOOD');
    expect(temperature.value as number).toBeLessThan(40);
    expect(vibration.value as number).toBeLessThan(0.5);
    // The stopped process's own values stay as they were: zero speed, uncertain.
    expect(await adapter.readTag(ST)).toMatchObject({ value: 0, quality: 'UNCERTAIN' });
  });

  it('holds a stopped mill’s readings while the clock is held', async () => {
    adapter.updateMachineStates([{ id: 'rm-101', status: 'idle', metrics: { load: 0, rpm: 0 } }]);
    vi.advanceTimersByTime(5_000);
    const before = (await adapter.readTag(VT)).value as number;
    useGameSimulationStore.setState({ gameSpeed: 0 });
    vi.advanceTimersByTime(30_000);
    expect((await adapter.readTag(VT)).value).toBe(before);
  });
});
