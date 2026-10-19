import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_EGRESS_POINTS, useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { MAX_GAME_SPEED, STANDARD_GAME_SPEED } from '../../simulation/pace';
import { centralTick } from '../CentralTickSystem';
import {
  EGRESS_COMPLETION_HOLD_GAME_SECONDS,
  EGRESS_ZONE_INTERVAL_GAME_SECONDS,
  registerEgressDrillSequencer,
} from '../egressDrillSequencer';

const TICK_SECONDS = 0.5;

/**
 * Drives the real central tick (lazy queue on, never drained) the way
 * CentralTickProvider does, so a sequencer queued as lazy work would lose ticks.
 */
function runTicks(count: number, gameSpeed: number, clock: { t: number }) {
  useGameSimulationStore.setState({ gameSpeed });
  for (let i = 0; i < count; i += 1) {
    clock.t += TICK_SECONDS;
    centralTick.tick(clock.t, 12, gameSpeed);
  }
}

const verifiedCount = () => useGameSimulationStore.getState().drillMetrics.verifiedZoneIds.length;

describe('egress drill sequencer on game time', () => {
  let unregister: () => void;
  const clock = { t: 0 };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T12:00:00.000Z'));
    centralTick.reset();
    clock.t = 0;
    centralTick.tick(clock.t, 12, STANDARD_GAME_SPEED);
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    unregister = registerEgressDrillSequencer();
    useGameSimulationStore.getState().startEmergencyDrill();
  });

  afterEach(() => {
    unregister();
    useGameSimulationStore.getState().endEmergencyDrill();
    centralTick.reset();
    vi.useRealTimers();
  });

  it('keeps the 1x cadence: one zone per four real seconds at standard pace', () => {
    expect(EGRESS_ZONE_INTERVAL_GAME_SECONDS).toBe(4 * STANDARD_GAME_SPEED);
    runTicks(7, STANDARD_GAME_SPEED, clock);
    expect(verifiedCount()).toBe(0);
    runTicks(1, STANDARD_GAME_SPEED, clock);
    expect(verifiedCount()).toBe(1);
    expect(useGameSimulationStore.getState().drillMetrics.verifiedZoneIds[0]).toBe(
      SERVICE_EGRESS_POINTS[0].id
    );
  });

  it('verifies nothing while the shift clock is held, however long', () => {
    runTicks(4, STANDARD_GAME_SPEED, clock);
    runTicks(600, 0, clock);
    expect(verifiedCount()).toBe(0);
    // Resumes where it left off: the first half-interval is not lost or doubled.
    runTicks(4, STANDARD_GAME_SPEED, clock);
    expect(verifiedCount()).toBe(1);
  });

  it('runs four times as fast at 4x', () => {
    const ticksPerZoneAt4x = EGRESS_ZONE_INTERVAL_GAME_SECONDS / MAX_GAME_SPEED / TICK_SECONDS;
    runTicks(ticksPerZoneAt4x * SERVICE_EGRESS_POINTS.length, MAX_GAME_SPEED, clock);
    const metrics = useGameSimulationStore.getState().drillMetrics;
    expect(metrics.verifiedZoneIds).toEqual(SERVICE_EGRESS_POINTS.map((point) => point.id));
    expect(metrics.verificationComplete).toBe(true);
  });

  it('ends the drill after the completion hold, counted on game time', () => {
    const ticksPerZone = EGRESS_ZONE_INTERVAL_GAME_SECONDS / STANDARD_GAME_SPEED / TICK_SECONDS;
    runTicks(ticksPerZone * SERVICE_EGRESS_POINTS.length, STANDARD_GAME_SPEED, clock);
    expect(useGameSimulationStore.getState().drillMetrics.verificationComplete).toBe(true);

    runTicks(200, 0, clock);
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(true);

    const holdTicks = EGRESS_COMPLETION_HOLD_GAME_SECONDS / STANDARD_GAME_SPEED / TICK_SECONDS;
    runTicks(holdTicks - 1, STANDARD_GAME_SPEED, clock);
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(true);
    runTicks(1, STANDARD_GAME_SPEED, clock);
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(false);
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
  });

  it('starts a restarted drill from zero rather than from the last one', () => {
    runTicks(6, STANDARD_GAME_SPEED, clock);
    useGameSimulationStore.getState().endEmergencyDrill();
    vi.advanceTimersByTime(1000);
    useGameSimulationStore.getState().startEmergencyDrill();
    runTicks(7, STANDARD_GAME_SPEED, clock);
    expect(verifiedCount()).toBe(0);
    runTicks(1, STANDARD_GAME_SPEED, clock);
    expect(verifiedCount()).toBe(1);
  });
});
