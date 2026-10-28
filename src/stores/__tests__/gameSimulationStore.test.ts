import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { useSafetyStore } from '../safetyStore';
import { safeJSONStorage } from '../storage';
import {
  SERVICE_EGRESS_POINTS,
  getShiftForHour,
  persistedGameSpeed,
  selectClockHolder,
  selectSafetyHoldActive,
  useGameSimulationStore,
} from '../gameSimulationStore';
import { MAX_GAME_SPEED, PACE_GAME_SPEEDS, STANDARD_GAME_SPEED } from '../../simulation/pace';

describe('autonomous game simulation store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T12:00:00.000Z'));
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps side egress markers immediately outside the actual service doors', () => {
    for (const side of ['west', 'east'] as const) {
      const marker = SERVICE_EGRESS_POINTS.find((point) => point.id === side)!;
      const portal = SITE_LAYOUT.portals[side === 'west' ? 'westService' : 'eastService'];
      expect(marker.position.x).toBe(portal.centre[0] + portal.normal[0] * 2);
      expect(marker.position.z).toBe(portal.centre[2]);
    }
  });

  it('maps clock hours to deterministic run windows', () => {
    expect(getShiftForHour(5.99)).toBe('night');
    expect(getShiftForHour(6)).toBe('morning');
    expect(getShiftForHour(14)).toBe('afternoon');
    expect(getShiftForHour(22)).toBe('night');
    expect(getShiftForHour(30)).toBe('morning');
  });

  it('advances time, day, and run window together', () => {
    const store = useGameSimulationStore.getState();
    store.setGameTime(13.99);
    store.setGameSpeed(MAX_GAME_SPEED);
    store.tickGameTime(1);

    const state = useGameSimulationStore.getState();
    expect(state.gameTime).toBeCloseTo(13.99 + MAX_GAME_SPEED / 3600);
    expect(state.currentShift).toBe('afternoon');

    store.setGameTime(23.99);
    store.tickGameTime(1);
    expect(useGameSimulationStore.getState()).toMatchObject({ gameDay: 1, currentShift: 'night' });
  });

  it('supports every advertised pace and rejects non-finite time inputs', () => {
    const store = useGameSimulationStore.getState();

    for (const pace of PACE_GAME_SPEEDS) {
      store.setGameSpeed(pace);
      expect(useGameSimulationStore.getState().gameSpeed).toBe(pace);
    }
    store.setGameSpeed(20_000);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(MAX_GAME_SPEED);
    store.setGameSpeed(-1);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);

    store.setGameTime(12);
    store.setGameSpeed(MAX_GAME_SPEED);
    store.tickGameTime(1);
    const advanced = useGameSimulationStore.getState().gameTime;
    expect(advanced).toBeCloseTo(12 + MAX_GAME_SPEED / 3600);

    store.setGameTime(Number.NaN);
    store.tickGameTime(Number.POSITIVE_INFINITY);
    expect(useGameSimulationStore.getState()).toMatchObject({
      gameTime: advanced,
      gameSpeed: MAX_GAME_SPEED,
    });

    store.setGameSpeed(Number.NaN);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
  });

  it('bounds hostile finite deltas and saturates the day counter', () => {
    useGameSimulationStore.setState({
      gameTime: 23.99,
      gameDay: Number.MAX_SAFE_INTEGER,
      gameSpeed: 3600,
    });

    useGameSimulationStore.getState().tickGameTime(Number.MAX_VALUE);

    // The pace is sanitised to the 4x ceiling and the delta to one second.
    const state = useGameSimulationStore.getState();
    expect(state.gameTime).toBeCloseTo(23.99 + MAX_GAME_SPEED / 3600 - 24);
    expect(state).toMatchObject({ gameDay: Number.MAX_SAFE_INTEGER, currentShift: 'night' });
  });

  it('repairs corrupt clock and day authorities on the next valid tick', () => {
    useGameSimulationStore.setState({
      gameTime: Number.NaN,
      gameDay: Number.POSITIVE_INFINITY,
      gameSpeed: 3600,
      currentShift: 'morning',
    });

    useGameSimulationStore.getState().tickGameTime(1);

    const state = useGameSimulationStore.getState();
    expect(state.gameTime).toBeCloseTo(MAX_GAME_SPEED / 3600);
    expect(state).toMatchObject({ gameDay: 0, currentShift: 'night' });
  });

  it('records and clears a facility stop with the mobile fleet interlock', () => {
    const store = useGameSimulationStore.getState();
    store.triggerEmergency('rm-101');

    let state = useGameSimulationStore.getState();
    expect(selectSafetyHoldActive(state)).toBe(true);
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
    expect(state.safetyEvents.at(-1)).toMatchObject({
      kind: 'facility_stop',
      cause: 'rm-101 interlock',
      stage: 'active',
    });

    store.resolveEmergency();
    state = useGameSimulationStore.getState();
    expect(selectSafetyHoldActive(state)).toBe(false);
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
    expect(state.safetyEvents.at(-1)?.stage).toBe('cleared');
  });

  it('leaves an active drill to endEmergencyDrill rather than resolveEmergency', () => {
    const store = useGameSimulationStore.getState();
    store.startEmergencyDrill();
    store.resolveEmergency();

    const state = useGameSimulationStore.getState();
    expect(state.emergencyDrillMode).toBe(true);
    expect(state.drillMetrics.active).toBe(true);
    expect(selectSafetyHoldActive(state)).toBe(true);
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
  });

  it('verifies each service egress zone once and records completion time', () => {
    const store = useGameSimulationStore.getState();
    store.startEmergencyDrill();
    SERVICE_EGRESS_POINTS.forEach((point, index) => {
      vi.advanceTimersByTime(1000);
      store.markZoneVerified(point.id);
      if (index === 0) store.markZoneVerified(point.id);
    });

    const metrics = useGameSimulationStore.getState().drillMetrics;
    expect(metrics.verifiedZoneIds).toHaveLength(SERVICE_EGRESS_POINTS.length);
    expect(metrics.verificationComplete).toBe(true);
    expect(metrics.finalTimeSeconds).toBe(4);
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);

    store.endEmergencyDrill();
    expect(useGameSimulationStore.getState().drillMetrics.active).toBe(false);
  });

  it('isolates low-severity crises and interlocks high-severity crises', () => {
    const store = useGameSimulationStore.getState();
    store.triggerCrisis('weather', 'low');
    expect(useGameSimulationStore.getState().emergencyActive).toBe(false);
    expect(useGameSimulationStore.getState().safetyEvents.at(-1)?.response).toContain(
      'autonomous monitoring'
    );
    store.resolveCrisis();

    store.triggerCrisis('fire', 'high', { machineId: 'rm-102' });
    expect(useGameSimulationStore.getState().crisisState.affectedMachineId).toBe('rm-102');
    expect(useGameSimulationStore.getState().emergencyActive).toBe(true);
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
  });

  it('bounds the celebration queue and repairs incomplete persisted state', () => {
    useGameSimulationStore.setState((state) => ({
      celebrations: { ...state.celebrations, milestoneQueue: undefined as never },
    }));
    expect(() => useGameSimulationStore.getState().triggerCelebration('milestone')).not.toThrow();

    for (let index = 0; index < 9; index += 1) {
      useGameSimulationStore.getState().triggerCelebration('target_met', { value: index });
    }
    expect(useGameSimulationStore.getState().celebrations.milestoneQueue).toHaveLength(5);
  });

  it('sanitizes malformed celebration payloads and streak updates', () => {
    const store = useGameSimulationStore.getState();

    store.triggerCelebration('milestone', {
      timestamp: Number.NaN,
      value: Number.POSITIVE_INFINITY,
      message: 'x'.repeat(600),
      position: [0, Number.NaN, 2],
    });
    store.updateZeroIncidentStreak(Number.POSITIVE_INFINITY);

    let celebrations = useGameSimulationStore.getState().celebrations;
    expect(celebrations.lastMilestone).toBe(0);
    expect(celebrations.zeroIncidentStreak).toBe(0);
    expect(celebrations.milestoneQueue).toEqual([
      {
        type: 'milestone',
        timestamp: expect.any(Number),
        message: 'x'.repeat(500),
      },
    ]);

    store.updateZeroIncidentStreak(3.9);
    celebrations = useGameSimulationStore.getState().celebrations;
    expect(celebrations.zeroIncidentStreak).toBe(3);
  });

  it('rehydrates only valid data and cannot replace store actions', async () => {
    await safeJSONStorage.setItem('millos-autonomous-simulation', {
      version: 1,
      state: {
        gameTime: 25.5,
        gameDay: 3.8,
        gameSpeed: 10800,
        weather: 'storm',
        currentShift: 'morning',
        setGameSpeed: 'corrupt action',
        celebrations: {
          lastMilestone: 1_000_000,
          milestoneQueue: [
            { type: 'milestone', timestamp: 1, message: 'expired one' },
            'corrupt event',
            { type: 'target_met', timestamp: 2, value: 2 },
            { type: 'zero_incident', timestamp: 3 },
            { type: 'shift_complete', timestamp: 4 },
            { type: 'milestone', timestamp: 5 },
            null,
            { type: 'target_met', timestamp: 6, value: 6 },
            { type: 'zero_incident', timestamp: 7, position: [1, 2, 3] },
          ],
          zeroIncidentStreak: Number.MAX_VALUE,
          celebrationActive: 'yes',
          packerBellEnabled: false,
        },
      },
    });

    await useGameSimulationStore.persist.rehydrate();

    const state = useGameSimulationStore.getState();
    // A version-1 time-lapse pace (10800) maps to the fastest pace.
    expect(state).toMatchObject({
      gameTime: 1.5,
      gameDay: 3,
      gameSpeed: MAX_GAME_SPEED,
      weather: 'storm',
      currentShift: 'night',
    });
    expect(typeof state.setGameSpeed).toBe('function');
    expect(state.celebrations).toEqual({
      lastMilestone: 100,
      milestoneQueue: [
        { type: 'zero_incident', timestamp: 3 },
        { type: 'shift_complete', timestamp: 4 },
        { type: 'milestone', timestamp: 5 },
        { type: 'target_met', timestamp: 6, value: 6 },
        { type: 'zero_incident', timestamp: 7, position: [1, 2, 3] },
      ],
      zeroIncidentStreak: Number.MAX_SAFE_INTEGER,
      celebrationActive: true,
      packerBellEnabled: false,
    });
  });

  it('bounds work while sanitizing a hostile persisted celebration queue', () => {
    let indexedReads = 0;
    const hostileQueue = new Proxy(
      Array.from({ length: 10_000 }, () => 'corrupt'),
      {
        get(target, property, receiver) {
          if (typeof property === 'string' && /^\d+$/.test(property)) indexedReads += 1;
          return Reflect.get(target, property, receiver);
        },
      }
    );
    const merge = useGameSimulationStore.persist.getOptions().merge;
    expect(merge).toBeTypeOf('function');

    const merged = merge!(
      { celebrations: { milestoneQueue: hostileQueue } },
      useGameSimulationStore.getState()
    );

    expect(
      (merged as ReturnType<typeof useGameSimulationStore.getState>).celebrations
    ).toMatchObject({
      milestoneQueue: [],
      celebrationActive: false,
    });
    expect(indexedReads).toBe(50);
  });
});

describe('one time model: pace migration and clock holds', () => {
  afterEach(() => useGameSimulationStore.getState().resetGameState());

  it('starts at standard pace and maps a version-1 "Standard, 1x" (180) save to it', async () => {
    expect(useGameSimulationStore.getState().gameSpeed).toBe(STANDARD_GAME_SPEED);
    await safeJSONStorage.setItem('millos-autonomous-simulation', {
      version: 1,
      state: { gameTime: 11, gameSpeed: 180 },
    });
    await useGameSimulationStore.persist.rehydrate();
    expect(useGameSimulationStore.getState().gameSpeed).toBe(STANDARD_GAME_SPEED);
  });

  it('releases only the hold each holder made, newest first', () => {
    const store = useGameSimulationStore.getState();
    store.setGameSpeed(60);
    store.holdClock('tour');
    store.holdClock('shortcut');
    expect(selectClockHolder(useGameSimulationStore.getState())).toBe('shortcut');
    // An older holder releasing does not restart the clock under a newer one.
    expect(store.releaseClock('tour')).toBe(true);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    expect(store.releaseClock('layout')).toBe(false);
    expect(store.releaseClock('shortcut')).toBe(true);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(60);
  });

  it('releases the exact acquisition beneath newer holds from the same holder', () => {
    const store = useGameSimulationStore.getState();
    store.setGameSpeed(60);
    store.holdClock('workplace');
    const acquired = useGameSimulationStore.getState().clockHolds.at(-1)!;
    store.holdClock('shortcut');
    store.holdClock('workplace');
    const later = useGameSimulationStore.getState().clockHolds.at(-1)!;
    expect(store.releaseClock('workplace', acquired)).toBe(true);
    expect(useGameSimulationStore.getState().clockHolds).toEqual([
      { holder: 'shortcut', resumeSpeed: 60 },
      later,
    ]);
    expect(useGameSimulationStore.getState().clockHolds.at(-1)).toBe(later);
    expect(store.releaseClock('workplace', acquired)).toBe(false);
    expect(store.releaseClock('workplace', later)).toBe(true);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    store.releaseClock('shortcut');
    expect(useGameSimulationStore.getState().gameSpeed).toBe(60);
  });

  it('lets an explicit pace choice override every hold, and keeps a player pause', () => {
    const store = useGameSimulationStore.getState();
    store.holdClock('workplace');
    store.setGameSpeed(0);
    expect(selectClockHolder(useGameSimulationStore.getState())).toBe('player');
    store.setGameSpeed(120);
    expect(useGameSimulationStore.getState()).toMatchObject({ gameSpeed: 120, clockHolds: [] });
  });

  it('keeps a derived handoff hold under any pace choice, and resumes at the pace chosen', () => {
    const store = useGameSimulationStore.getState();
    store.setGameSpeed(30);
    store.holdClock('handoff');
    store.setGameSpeed(0);
    // A pace chosen while the handoff decision holds the plant waits as its
    // resume pace: the clock stays held and the player's pause is replaced.
    store.setGameSpeed(60);
    expect(useGameSimulationStore.getState()).toMatchObject({
      gameSpeed: 0,
      clockHolds: [{ holder: 'handoff', resumeSpeed: 60 }],
    });
    expect(selectClockHolder(useGameSimulationStore.getState())).toBe('handoff');
    expect(persistedGameSpeed(useGameSimulationStore.getState())).toBe(60);
    expect(store.releaseClock('tour')).toBe(false);
    expect(useGameSimulationStore.getState().gameSpeed).toBe(0);
    expect(store.releaseClock('handoff')).toBe(true);
    expect(useGameSimulationStore.getState()).toMatchObject({ gameSpeed: 60, clockHolds: [] });
  });

  it('persists the pace under a session hold, never the hold itself', () => {
    const store = useGameSimulationStore.getState();
    store.setGameSpeed(60);
    store.holdClock('tour');
    expect(persistedGameSpeed(useGameSimulationStore.getState())).toBe(60);
    store.setGameSpeed(0);
    expect(persistedGameSpeed(useGameSimulationStore.getState())).toBe(0);
  });

  it('starts the clock from a holder control when it is still stopped underneath', () => {
    const store = useGameSimulationStore.getState();
    store.setGameSpeed(0);
    store.holdClock('workplace');
    store.resumeClockFrom('workplace');
    expect(useGameSimulationStore.getState().gameSpeed).toBe(STANDARD_GAME_SPEED);
  });
});

describe('Reset to 10 AM', () => {
  afterEach(() => useGameSimulationStore.getState().resetGameState());

  it.each([0, 15, 30, 60, 120])(
    'rewinds the clock to 10:00 but keeps the pace the operator chose (%i)',
    (pace) => {
      const store = useGameSimulationStore.getState();
      store.setGameTime(17.5);
      store.setWeather('storm');
      store.setGameSpeed(pace);
      useGameSimulationStore.getState().clearPersistedState();
      const state = useGameSimulationStore.getState();
      expect(state.gameTime).toBe(10);
      expect(state.gameDay).toBe(0);
      expect(state.weather).toBe('clear');
      // A paused (or save-halted) shift must not silently restart at Standard 1x.
      expect(state.gameSpeed).toBe(pace);
    }
  );
});
