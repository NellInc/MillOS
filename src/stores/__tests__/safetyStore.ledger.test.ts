/**
 * The Safety Analytics counters and the Incident Log describe the same events.
 * Working if every live producer moves the log and "Last Event" together, and a
 * blocked-route stop is counted and logged as one event.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSafetyStore } from '../safetyStore';

const FIXED_NOW = new Date('2026-08-20T12:00:00.000Z');

describe('safety ledger agreement', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    useSafetyStore.setState(useSafetyStore.getInitialState(), true);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('logs a blocked-route stop in the incident log it is counted in', () => {
    useSafetyStore.getState().recordSafetyStop();

    const { safetyMetrics, safetyIncidents } = useSafetyStore.getState();
    expect(safetyMetrics.safetyStops).toBe(1);
    expect(safetyIncidents).toHaveLength(1);
    expect(safetyIncidents[0]).toMatchObject({
      type: 'stop',
      timestamp: FIXED_NOW.getTime(),
      description: 'Forklift stopped for a blocked route',
    });
    expect(safetyIncidents.filter((incident) => incident.type === 'stop')).toHaveLength(
      safetyMetrics.safetyStops
    );
  });

  it('a logged emergency stop is the last event, without counting as a near miss', () => {
    useSafetyStore.getState().addSafetyIncident({
      type: 'emergency',
      description: 'Emergency stop activated via keyboard (Space)',
    });

    const { safetyMetrics, safetyIncidents } = useSafetyStore.getState();
    expect(safetyIncidents).toHaveLength(1);
    expect(safetyMetrics.lastIncidentTime).toBe(FIXED_NOW.getTime());
    // A deliberate stop is not a lapse: the score, near misses and Days Safe hold.
    expect(safetyMetrics.safetyStops).toBe(0);
    expect(safetyMetrics.nearMisses).toBe(0);
  });
});
