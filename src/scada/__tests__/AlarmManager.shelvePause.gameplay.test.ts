import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlarmManager, SCADA_DISPOSITION_STORAGE_KEY } from '../AlarmManager';
import { safeJSONStorage } from '../../stores/storage';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import type { TagDefinition } from '../types';

const tag: TagDefinition = {
  id: 'RM101.TT001.PV',
  name: 'Mill bearing temperature',
  description: 'Drive-end bearing temperature',
  dataType: 'FLOAT32',
  accessMode: 'READ',
  engUnit: 'C',
  engLow: 0,
  engHigh: 120,
  alarmHi: 70,
  deadband: 2,
  machineId: 'rm-101',
  group: 'TEMPERATURE',
};

const MINUTE = 60_000;
const hot = () => ({ tagId: tag.id, value: 75, quality: 'GOOD' as const, timestamp: Date.now() });

/**
 * The SCADA panel shelves or suppresses an alarm for 15 minutes. A paused plant
 * cannot change the condition (the simulated readings hold with the clock), but
 * the shelf ran on the wall clock, so a player who paused for 20 minutes came
 * back to the same alarm standing unacknowledged in the list and the bell.
 * Working if a pause stops the shelf's clock and the shelf's remaining time is
 * there again on resume.
 */
describe('AlarmManager: a shelf does not run out while the game is paused', () => {
  const savedSpeed = useGameSimulationStore.getState().gameSpeed;
  let manager: AlarmManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T12:00:00Z'));
    useGameSimulationStore.setState({ gameSpeed: 30 });
    // Dispositions are saved across a reload: each test starts with none.
    safeJSONStorage.removeItem(SCADA_DISPOSITION_STORAGE_KEY);
    manager = new AlarmManager([tag]);
    vi.advanceTimersByTime(5_001);
    manager.evaluate(hot());
    const alarm = manager.getActiveAlarms()[0];
    manager.acknowledge(alarm.id, 'Nell');
  });

  afterEach(() => {
    manager.reset();
    useGameSimulationStore.setState({ gameSpeed: savedSpeed });
    vi.useRealTimers();
  });

  it('keeps a 15-minute shelf through a 20-minute pause, then lets it run out', () => {
    manager.shelve(tag.id, 'Nell', 'Sensor check', 15 * MINUTE);
    vi.advanceTimersByTime(5 * MINUTE);

    useGameSimulationStore.setState({ gameSpeed: 0 });
    vi.advanceTimersByTime(20 * MINUTE);
    manager.evaluate(hot());
    expect(manager.getSuppressedTags().map((entry) => entry.tagId)).toEqual([tag.id]);

    useGameSimulationStore.setState({ gameSpeed: 30 });
    manager.evaluate(hot());
    expect(manager.getSuppressedTags().map((entry) => entry.tagId)).toEqual([tag.id]);
    expect(manager.getUnacknowledgedCount()).toBe(0);

    // Ten minutes of the shelf were left when the game paused.
    vi.advanceTimersByTime(9 * MINUTE);
    manager.evaluate(hot());
    expect(manager.getSuppressedTags()).toHaveLength(1);
    vi.advanceTimersByTime(1 * MINUTE + 1);
    manager.evaluate(hot());
    expect(manager.getSuppressedTags()).toHaveLength(0);
  });

  it('starts the shelf clock only when play resumes for a shelf set while paused', () => {
    useGameSimulationStore.setState({ gameSpeed: 0 });
    manager.suppress(tag.id, 'Nell', 'Sensor check', 15 * MINUTE);
    vi.advanceTimersByTime(30 * MINUTE);
    manager.evaluate(hot());
    expect(manager.getSuppressedTags()).toHaveLength(1);

    useGameSimulationStore.setState({ gameSpeed: 30 });
    vi.advanceTimersByTime(14 * MINUTE);
    manager.evaluate(hot());
    expect(manager.getSuppressedTags()).toHaveLength(1);
    vi.advanceTimersByTime(1 * MINUTE + 1);
    manager.evaluate(hot());
    expect(manager.getSuppressedTags()).toHaveLength(0);
  });

  it('counts only standing suppressions in the summary', () => {
    manager.shelve(tag.id, 'Nell', 'Sensor check', 15 * MINUTE);
    expect(manager.getSummary().suppressed).toBe(1);
    vi.advanceTimersByTime(15 * MINUTE + 1);
    expect(manager.getSummary().suppressed).toBe(0);
  });
});
