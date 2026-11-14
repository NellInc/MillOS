import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_EGRESS_POINTS, useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useProductionStore } from '../../stores/productionStore';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';
import { centralTick } from '../CentralTickSystem';
import {
  EGRESS_ZONE_INTERVAL_GAME_SECONDS,
  registerEgressDrillSequencer,
} from '../egressDrillSequencer';
import { FORKLIFT_CREW_SITES } from '../../constants/forkliftCrewLayout';
import { forkliftCrewLive } from '../../stores/forkliftCrewStore';
import { readStoppedVehicles } from '../accessibleEgress';

// 6.4: the drill keeps a record. Each zone's result (own route, the
// alternative, or blocked), any forklift standing on its route, and the plant
// clock time it was verified, kept on the drill's safety event after the drill
// ends. Nobody moves: the record is of routes checked, not people evacuated.
const TICK = 0.5;
const ticksPerZone = EGRESS_ZONE_INTERVAL_GAME_SECONDS / STANDARD_GAME_SPEED / TICK;

describe('the egress drill record', () => {
  let unregister: () => void;
  const clock = { t: 0 };
  const tick = (count: number) => {
    useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED });
    for (let i = 0; i < count; i += 1) {
      clock.t += TICK;
      // The plant clock advances as the frame loop would advance it.
      useGameSimulationStore.getState().tickGameTime(TICK);
      centralTick.tick(clock.t, 12, STANDARD_GAME_SPEED);
    }
  };
  const drillEvent = () =>
    [...useGameSimulationStore.getState().safetyEvents]
      .reverse()
      .find((event) => event.kind === 'fire_drill');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-13T12:00:00.000Z'));
    centralTick.reset();
    clock.t = 0;
    centralTick.tick(clock.t, 12, STANDARD_GAME_SPEED);
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useProductionStore.setState({ aiDecisions: [] });
    for (const site of FORKLIFT_CREW_SITES) forkliftCrewLive(site.forkliftId).vehicle = null;
    unregister = registerEgressDrillSequencer();
  });
  afterEach(() => {
    unregister();
    useGameSimulationStore.getState().endEmergencyDrill();
    for (const site of FORKLIFT_CREW_SITES) forkliftCrewLive(site.forkliftId).vehicle = null;
    centralTick.reset();
    vi.useRealTimers();
  });

  it('names each stopped forklift by its fleet tag', () => {
    const [first] = FORKLIFT_CREW_SITES;
    forkliftCrewLive(first.forkliftId).vehicle = { x: -30, y: 0, z: -20, heading: 0 };
    expect(readStoppedVehicles().map((vehicle) => vehicle.id)).toEqual([first.tag]);
  });

  it('a forklift parked on the west route sends that zone to its alternative, and the record names it', () => {
    const [first] = FORKLIFT_CREW_SITES;
    forkliftCrewLive(first.forkliftId).vehicle = { x: -30, y: 0, z: -20, heading: 0 };
    useGameSimulationStore.getState().startEmergencyDrill();
    tick(ticksPerZone * SERVICE_EGRESS_POINTS.length);
    expect(useGameSimulationStore.getState().drillMetrics.verificationComplete).toBe(true);
    // The drill ends itself after its completion hold; the record outlives it.
    tick(ticksPerZone * 4);
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(false);

    const record = drillEvent()?.drillZones ?? [];
    expect(record.map((zone) => zone.zoneId)).toEqual(SERVICE_EGRESS_POINTS.map((p) => p.id));
    const west = record.find((zone) => zone.zoneId === 'west')!;
    expect(west.result).toBe('alternative');
    expect(west.alternative).toBe('east');
    expect(west.blockedBy).toEqual([first.tag]);
    expect(record.find((zone) => zone.zoneId === 'front')!.result).toBe('clear');
    // Timed on the plant clock: the third zone is verified three intervals in.
    const start = drillEvent()!.drillStartClock!;
    const elapsedSeconds =
      ((west.clock!.day - start.day) * 24 + (west.clock!.hour - start.hour)) * 3600;
    expect(elapsedSeconds).toBeCloseTo(3 * EGRESS_ZONE_INTERVAL_GAME_SECONDS, 3);
  });

  it('names a zone left blocked, and the zones never reached, when the drill is ended early', () => {
    const [first, second] = FORKLIFT_CREW_SITES;
    forkliftCrewLive(first.forkliftId).vehicle = { x: -30, y: 0, z: -20, heading: 0 };
    forkliftCrewLive(second.forkliftId).vehicle = { x: 37, y: 0, z: 46, heading: 0 };
    useGameSimulationStore.getState().startEmergencyDrill();
    // One interval: the front zone (alternative west, also blocked) waits,
    // and back is verified in its place.
    tick(ticksPerZone);
    useGameSimulationStore.getState().endEmergencyDrill();

    const record = drillEvent()?.drillZones ?? [];
    const byZone = Object.fromEntries(record.map((zone) => [zone.zoneId, zone]));
    expect(byZone.front.result).toBe('blocked');
    expect(byZone.front.blockedBy).toEqual([second.tag, first.tag]);
    expect(byZone.back.result).toBe('clear');
    expect(byZone.west.result).toBe('unverified');
    expect(byZone.east.result).toBe('unverified');
    // A blocked zone re-checked every interval keeps one entry.
    expect(record.filter((zone) => zone.zoneId === 'front')).toHaveLength(1);
  });

  it('never calls a verified zone unverified when it has no entry (a drill from an older save)', () => {
    useGameSimulationStore.getState().startEmergencyDrill();
    useGameSimulationStore.getState().markZoneVerified('front');
    useGameSimulationStore.getState().endEmergencyDrill();
    const zones = drillEvent()?.drillZones ?? [];
    expect(zones.find((zone) => zone.zoneId === 'front')).toBeUndefined();
    expect(zones.map((zone) => zone.result)).toEqual(['unverified', 'unverified', 'unverified']);
  });
});
