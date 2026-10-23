/**
 * The automated egress verification sequence, on game time.
 *
 * The drill used to verify a zone every 4 s of wall time from a setInterval,
 * so it kept verifying under P and ignored pace. It now runs on the central
 * tick: each tick credits `deltaSeconds * gameSpeed` game seconds, so a held
 * clock verifies nothing, 4x verifies four times as fast, and a hidden tab
 * holds the drill because CentralTickProvider does not tick while hidden.
 * Working if the drill takes the same game time at every pace and none while
 * the clock is held (egressDrillSequencer.test.ts).
 */

import { SERVICE_EGRESS_POINTS, useGameSimulationStore } from '../stores/gameSimulationStore';
import { MAX_GAME_SPEED, STANDARD_GAME_SPEED } from '../simulation/pace';
import { centralTick, TICK_PRIORITY, type TickContext } from './CentralTickSystem';

/** Game seconds between verified zones: 4 real seconds at standard pace. */
export const EGRESS_ZONE_INTERVAL_GAME_SECONDS = 4 * STANDARD_GAME_SPEED;

/** Game seconds the completed drill stays on screen before it ends itself. */
export const EGRESS_COMPLETION_HOLD_GAME_SECONDS = 5 * STANDARD_GAME_SPEED;

/**
 * Below TICK_PRIORITY.HIGH, so the callback runs inside the tick. Lazy work
 * keeps only the freshest pending context per callback, and every tick it
 * dropped would be game time the drill never counted.
 */
const EGRESS_DRILL_TICK_PRIORITY = TICK_PRIORITY.CRITICAL + 2;

const EGRESS_DRILL_TICK_ID = 'egress-drill-sequencer';

function gameSecondsForTick(ctx: TickContext, liveGameSpeed: number): number {
  const speed = Math.min(ctx.gameSpeed, liveGameSpeed, MAX_GAME_SPEED);
  return Number.isFinite(speed) && speed > 0 && ctx.deltaSeconds > 0 ? ctx.deltaSeconds * speed : 0;
}

export function createEgressDrillSequencer(): (ctx: TickContext) => void {
  let elapsedGameSeconds = 0;
  let drillStartedAt: number | null = null;

  return (ctx) => {
    const state = useGameSimulationStore.getState();
    const { drillMetrics } = state;
    if (!state.emergencyDrillMode || !drillMetrics.active) {
      elapsedGameSeconds = 0;
      drillStartedAt = null;
      return;
    }
    if (drillStartedAt !== drillMetrics.startTime) {
      drillStartedAt = drillMetrics.startTime;
      elapsedGameSeconds = 0;
    }

    const gameSeconds = gameSecondsForTick(ctx, state.gameSpeed);
    if (gameSeconds <= 0) return;
    elapsedGameSeconds += gameSeconds;

    if (drillMetrics.verificationComplete) {
      if (elapsedGameSeconds >= EGRESS_COMPLETION_HOLD_GAME_SECONDS) {
        elapsedGameSeconds = 0;
        state.endEmergencyDrill();
      }
      return;
    }

    if (elapsedGameSeconds < EGRESS_ZONE_INTERVAL_GAME_SECONDS) return;
    elapsedGameSeconds -= EGRESS_ZONE_INTERVAL_GAME_SECONDS;

    // startEmergencyDrill clamps totalZones, so a pending zone exists until
    // verification completes; if none does, hold rather than spin.
    const zone = SERVICE_EGRESS_POINTS.slice(0, drillMetrics.totalZones).find(
      (point) => !drillMetrics.verifiedZoneIds.includes(point.id)
    );
    if (!zone) return;
    state.markZoneVerified(zone.id);
    // The completion hold starts from the last verification, not mid-interval.
    if (useGameSimulationStore.getState().drillMetrics.verificationComplete) {
      elapsedGameSeconds = 0;
    }
  };
}

/** Registers the sequencer on the central tick; returns its unregister. */
export function registerEgressDrillSequencer(): () => void {
  centralTick.register(
    EGRESS_DRILL_TICK_ID,
    createEgressDrillSequencer(),
    EGRESS_DRILL_TICK_PRIORITY
  );
  return () => centralTick.unregister(EGRESS_DRILL_TICK_ID);
}
