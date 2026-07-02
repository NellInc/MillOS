/**
 * Game Simulation Store Tests
 *
 * Tests for time progression, shift management, weather system,
 * emergency drills, crisis events, and celebrations.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameSimulationStore } from '../gameSimulationStore';

describe('GameSimulationStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useGameSimulationStore.getState().resetGameState();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Game Time', () => {
    it('should initialize with game time at 10am', () => {
      const { gameTime } = useGameSimulationStore.getState();
      expect(gameTime).toBe(10);
    });

    it('should initialize with default game speed of 180', () => {
      const { gameSpeed } = useGameSimulationStore.getState();
      expect(gameSpeed).toBe(180); // 1 game day = 8 real minutes
    });

    it('should set game time correctly', () => {
      const { setGameTime } = useGameSimulationStore.getState();
      setGameTime(12);
      expect(useGameSimulationStore.getState().gameTime).toBe(12);
    });

    it('should wrap game time at 24 hours', () => {
      const { setGameTime } = useGameSimulationStore.getState();
      setGameTime(25);
      expect(useGameSimulationStore.getState().gameTime).toBe(1);
    });

    it('should handle negative time wrap', () => {
      const { setGameTime } = useGameSimulationStore.getState();
      setGameTime(-2);
      expect(useGameSimulationStore.getState().gameTime).toBe(22);
    });

    it('should set game speed correctly', () => {
      const { setGameSpeed } = useGameSimulationStore.getState();
      setGameSpeed(120);
      expect(useGameSimulationStore.getState().gameSpeed).toBe(120);
    });

    it('should pause when speed is 0', () => {
      const { setGameSpeed, tickGameTime } = useGameSimulationStore.getState();
      setGameSpeed(0);

      // Advance past throttle interval
      vi.advanceTimersByTime(200);
      tickGameTime(1);

      expect(useGameSimulationStore.getState().gameTime).toBe(10); // Unchanged (10am default)
    });

    it('should advance time exactly by delta * speed', () => {
      const { setGameSpeed, tickGameTime } = useGameSimulationStore.getState();
      setGameSpeed(3600); // 1 real second = 1 game hour

      // Two 0.5s ticks at 3600x = exactly 1 game hour: 10 -> 11
      tickGameTime(0.5);
      expect(useGameSimulationStore.getState().gameTime).toBe(10.5);

      tickGameTime(0.5);
      expect(useGameSimulationStore.getState().gameTime).toBe(11);
    });

    it('should wrap at midnight and increment gameDay', () => {
      const { setGameTime, setGameSpeed, tickGameTime } = useGameSimulationStore.getState();
      setGameTime(23);
      setGameSpeed(3600);
      expect(useGameSimulationStore.getState().gameDay).toBe(0);

      // 2 real seconds at 3600x = 2 game hours: 23 -> 1 (crosses midnight)
      tickGameTime(2);

      const state = useGameSimulationStore.getState();
      expect(state.gameTime).toBe(1);
      expect(state.gameDay).toBe(1);
    });

    it('should not increment gameDay when no midnight crossing occurs', () => {
      const { setGameTime, setGameSpeed, tickGameTime } = useGameSimulationStore.getState();
      setGameTime(12);
      setGameSpeed(3600);

      tickGameTime(2); // 12 -> 14, no wrap

      const state = useGameSimulationStore.getState();
      expect(state.gameTime).toBe(14);
      expect(state.gameDay).toBe(0);
    });

    it('should auto-change shift when tick crosses a shift boundary', () => {
      const { setGameTime, setGameSpeed, tickGameTime } = useGameSimulationStore.getState();
      setGameTime(13.75); // late morning shift
      setGameSpeed(3600);
      expect(useGameSimulationStore.getState().currentShift).toBe('morning');
      const supervisorBefore = useGameSimulationStore.getState().shiftData.incomingSupervisor;

      tickGameTime(0.5); // 13.75 -> 14.25, crosses the 14:00 boundary

      const state = useGameSimulationStore.getState();
      expect(state.gameTime).toBe(14.25);
      expect(state.currentShift).toBe('afternoon');
      expect(state.shiftData.currentShift).toBe('afternoon');
      // Handover: previous incoming supervisor becomes outgoing
      expect(state.shiftData.outgoingSupervisor).toBe(supervisorBefore);
      expect(state.shiftData.priorities).toContain('Peak production targets');
    });

    it('should auto-change to night shift when crossing midnight', () => {
      const { setGameTime, setGameSpeed, tickGameTime, setShift } =
        useGameSimulationStore.getState();
      setShift('afternoon');
      setGameTime(21.9);
      setGameSpeed(3600);

      tickGameTime(0.5); // 21.9 -> 22.4, crosses the 22:00 boundary

      expect(useGameSimulationStore.getState().currentShift).toBe('night');
    });
  });

  describe('Fire Drill Evacuation', () => {
    it('should track evacuations without double-counting duplicate worker ids', () => {
      const { startEmergencyDrill, markWorkerEvacuated } = useGameSimulationStore.getState();
      startEmergencyDrill(3);

      markWorkerEvacuated('worker-1');
      markWorkerEvacuated('worker-1'); // duplicate - must not double-count
      markWorkerEvacuated('worker-2');

      const { drillMetrics } = useGameSimulationStore.getState();
      expect(drillMetrics.evacuatedWorkerIds).toEqual(['worker-1', 'worker-2']);
      expect(drillMetrics.evacuationComplete).toBe(false);
      expect(drillMetrics.finalTimeSeconds).toBeNull();
    });

    it('should ignore evacuations when no drill is active', () => {
      const { markWorkerEvacuated } = useGameSimulationStore.getState();
      markWorkerEvacuated('worker-1');

      const { drillMetrics } = useGameSimulationStore.getState();
      expect(drillMetrics.evacuatedWorkerIds).toHaveLength(0);
    });

    it('should flip evacuationComplete exactly once and compute finalTimeSeconds', () => {
      const { startEmergencyDrill, markWorkerEvacuated } = useGameSimulationStore.getState();
      startEmergencyDrill(2);

      // 45 seconds elapse (fake timers drive Date.now)
      vi.advanceTimersByTime(45_000);
      markWorkerEvacuated('worker-1');
      expect(useGameSimulationStore.getState().drillMetrics.evacuationComplete).toBe(false);

      vi.advanceTimersByTime(45_000);
      markWorkerEvacuated('worker-2');

      const afterComplete = useGameSimulationStore.getState().drillMetrics;
      expect(afterComplete.evacuationComplete).toBe(true);
      expect(afterComplete.finalTimeSeconds).toBe(90);

      // Re-marking an already-evacuated worker after completion changes nothing
      vi.advanceTimersByTime(30_000);
      markWorkerEvacuated('worker-2');
      const afterDuplicate = useGameSimulationStore.getState().drillMetrics;
      expect(afterDuplicate.evacuationComplete).toBe(true);
      expect(afterDuplicate.finalTimeSeconds).toBe(90); // Unchanged
      expect(afterDuplicate.evacuatedWorkerIds).toHaveLength(2);
    });

    it('should not start a drill during an active crisis', () => {
      const { triggerCrisis, startEmergencyDrill } = useGameSimulationStore.getState();
      triggerCrisis('fire', 'high');

      startEmergencyDrill(5);

      const state = useGameSimulationStore.getState();
      expect(state.drillMetrics.active).toBe(false);
      expect(state.emergencyDrillMode).toBe(false);
    });

    it('should return the geometrically nearest exit per quadrant', () => {
      const { getNearestExit } = useGameSimulationStore.getState();

      // Exits: front (0, 52), back (0, -52), west (-62, 0), east (62, 0)
      expect(getNearestExit(0, 30).id).toBe('front');
      expect(getNearestExit(0, -30).id).toBe('back');
      expect(getNearestExit(-40, 0).id).toBe('west');
      expect(getNearestExit(40, 0).id).toBe('east');
      // Off-axis point: (10, 20) is ~33.5 from front, farther from all others
      expect(getNearestExit(10, 20).id).toBe('front');
      // Center is equidistant-ish; front (dist 52) beats west/east (dist 62)
      expect(getNearestExit(0, 0).id).toBe('front');
    });
  });

  describe('Shift Management', () => {
    it('should initialize with morning shift', () => {
      const { currentShift } = useGameSimulationStore.getState();
      expect(currentShift).toBe('morning');
    });

    it('should return morning shift for hours 6-13', () => {
      const { setGameTime, setShift } = useGameSimulationStore.getState();

      setGameTime(6);
      setShift('morning');
      expect(useGameSimulationStore.getState().currentShift).toBe('morning');

      setGameTime(13);
      // Shift should still be morning until handover
    });

    it('should return afternoon shift for hours 14-21', () => {
      const { setShift } = useGameSimulationStore.getState();
      setShift('afternoon');
      expect(useGameSimulationStore.getState().currentShift).toBe('afternoon');
    });

    it('should return night shift for hours 22-5', () => {
      const { setShift } = useGameSimulationStore.getState();
      setShift('night');
      expect(useGameSimulationStore.getState().currentShift).toBe('night');
    });

    it('should trigger shift change', () => {
      const { triggerShiftChange } = useGameSimulationStore.getState();
      triggerShiftChange();

      const state = useGameSimulationStore.getState();
      expect(state.shiftChangeActive).toBe(true);
      expect(state.shiftChangePhase).toBe('leaving');
    });

    it('should complete shift change', () => {
      const { setGameTime, triggerShiftChange, completeShiftChange } =
        useGameSimulationStore.getState();

      setGameTime(14); // Afternoon time
      triggerShiftChange();
      completeShiftChange();

      const state = useGameSimulationStore.getState();
      expect(state.shiftChangeActive).toBe(false);
      expect(state.shiftChangePhase).toBe('idle');
      expect(state.currentShift).toBe('afternoon');
    });

    it('should update shift data on shift change', () => {
      const { setShift } = useGameSimulationStore.getState();
      setShift('afternoon');

      const { shiftData } = useGameSimulationStore.getState();
      expect(shiftData.currentShift).toBe('afternoon');
      expect(shiftData.incomingSupervisor).toBeDefined();
    });
  });

  describe('Shift Handover Phases', () => {
    it('should start shift briefing', () => {
      const { startShiftBriefing } = useGameSimulationStore.getState();
      startShiftBriefing();

      const { shiftData } = useGameSimulationStore.getState();
      expect(shiftData.handoverPhase).toBe('briefing');
    });

    it('should complete shift briefing', () => {
      const { startShiftBriefing, completeShiftBriefing } = useGameSimulationStore.getState();
      startShiftBriefing();
      completeShiftBriefing();

      const { shiftData } = useGameSimulationStore.getState();
      expect(shiftData.handoverPhase).toBe('idle');
    });

    it('should start shift handover', () => {
      const { startShiftHandover } = useGameSimulationStore.getState();
      startShiftHandover();

      const state = useGameSimulationStore.getState();
      expect(state.shiftChangeActive).toBe(true);
      expect(state.shiftData.handoverPhase).toBe('handover');
    });

    it('should complete shift handover and reset production data', () => {
      const { updateShiftProduction, startShiftHandover, completeShiftHandover, setGameTime } =
        useGameSimulationStore.getState();

      setGameTime(14);
      updateShiftProduction(500);
      startShiftHandover();
      completeShiftHandover();

      const { shiftData } = useGameSimulationStore.getState();
      expect(shiftData.shiftProduction.actual).toBe(0); // Reset
      expect(shiftData.shiftIncidents).toHaveLength(0); // Reset
    });

    it('should show and close shift summary', () => {
      const { showShiftSummary, closeShiftSummary } = useGameSimulationStore.getState();

      showShiftSummary();
      expect(useGameSimulationStore.getState().shiftData.handoverPhase).toBe('summary');

      closeShiftSummary();
      expect(useGameSimulationStore.getState().shiftData.handoverPhase).toBe('idle');
    });
  });

  describe('Shift Data Management', () => {
    it('should add shift notes', () => {
      const { addShiftNote } = useGameSimulationStore.getState();
      addShiftNote('Test note 1');
      addShiftNote('Test note 2');

      const { shiftData } = useGameSimulationStore.getState();
      expect(shiftData.previousShiftNotes).toContain('Test note 1');
      expect(shiftData.previousShiftNotes).toContain('Test note 2');
    });

    it('should add shift incidents', () => {
      const { addShiftIncident } = useGameSimulationStore.getState();
      addShiftIncident({
        type: 'machine_failure',
        machineId: 'rm-101',
        description: 'Motor overheated',
        resolved: false,
        severity: 'high',
      });

      const { shiftData } = useGameSimulationStore.getState();
      expect(shiftData.shiftIncidents).toHaveLength(1);
      expect(shiftData.shiftIncidents[0].type).toBe('machine_failure');
      expect(shiftData.shiftIncidents[0].timestamp).toBeDefined();
    });

    it('should resolve shift incidents', () => {
      const { addShiftIncident, resolveShiftIncident } = useGameSimulationStore.getState();
      addShiftIncident({
        type: 'safety_alert',
        description: 'Spill in Zone 2',
        resolved: false,
        severity: 'medium',
      });

      resolveShiftIncident(0);

      const { shiftData } = useGameSimulationStore.getState();
      expect(shiftData.shiftIncidents[0].resolved).toBe(true);
    });

    it('should update shift production metrics', () => {
      const { updateShiftProduction } = useGameSimulationStore.getState();
      updateShiftProduction(600);

      const { shiftData } = useGameSimulationStore.getState();
      expect(shiftData.shiftProduction.actual).toBe(600);
      expect(shiftData.shiftProduction.efficiency).toBe(50); // 600/1200 * 100
    });

    it('should add shift priorities', () => {
      const { addShiftPriority } = useGameSimulationStore.getState();
      addShiftPriority('Custom priority');

      const { shiftData } = useGameSimulationStore.getState();
      expect(shiftData.priorities).toContain('Custom priority');
    });
  });

  describe('Weather System', () => {
    it('should initialize with clear weather', () => {
      const { weather } = useGameSimulationStore.getState();
      expect(weather).toBe('clear');
    });

    it('should set weather correctly', () => {
      const { setWeather } = useGameSimulationStore.getState();

      setWeather('cloudy');
      expect(useGameSimulationStore.getState().weather).toBe('cloudy');

      setWeather('rain');
      expect(useGameSimulationStore.getState().weather).toBe('rain');

      setWeather('storm');
      expect(useGameSimulationStore.getState().weather).toBe('storm');
    });
  });

  describe('Emergency System', () => {
    it('should trigger emergency', () => {
      const { triggerEmergency } = useGameSimulationStore.getState();
      triggerEmergency('rm-101');

      const state = useGameSimulationStore.getState();
      expect(state.emergencyActive).toBe(true);
      expect(state.emergencyMachineId).toBe('rm-101');
    });

    it('should resolve emergency', () => {
      const { triggerEmergency, resolveEmergency } = useGameSimulationStore.getState();
      triggerEmergency('rm-101');
      resolveEmergency();

      const state = useGameSimulationStore.getState();
      expect(state.emergencyActive).toBe(false);
      expect(state.emergencyMachineId).toBeNull();
    });

    it('should start emergency drill', () => {
      const { startEmergencyDrill } = useGameSimulationStore.getState();
      startEmergencyDrill(10); // Pass worker count

      const state = useGameSimulationStore.getState();
      expect(state.emergencyActive).toBe(true);
      expect(state.emergencyMachineId).toBe('DRILL');
      expect(state.emergencyDrillMode).toBe(true);
      expect(state.drillMetrics.active).toBe(true);
      expect(state.drillMetrics.totalWorkers).toBe(10);
    });

    it('should end emergency drill', () => {
      const { startEmergencyDrill, endEmergencyDrill } = useGameSimulationStore.getState();
      startEmergencyDrill(10);
      endEmergencyDrill();

      const state = useGameSimulationStore.getState();
      expect(state.emergencyActive).toBe(false);
      expect(state.emergencyDrillMode).toBe(false);
    });
  });

  describe('Crisis System', () => {
    it('should trigger crisis', () => {
      const { triggerCrisis } = useGameSimulationStore.getState();
      triggerCrisis('fire', 'high', { affectedMachineId: 'rm-102' });

      const { crisisState } = useGameSimulationStore.getState();
      expect(crisisState.active).toBe(true);
      expect(crisisState.type).toBe('fire');
      expect(crisisState.severity).toBe('high');
      expect(crisisState.affectedMachineId).toBe('rm-102');
    });

    it('should not allow multiple simultaneous crises', () => {
      const { triggerCrisis } = useGameSimulationStore.getState();
      triggerCrisis('fire', 'high');
      triggerCrisis('power_outage', 'critical'); // Should be ignored

      const { crisisState } = useGameSimulationStore.getState();
      expect(crisisState.type).toBe('fire'); // First crisis still active
    });

    it('should resolve crisis', () => {
      const { triggerCrisis, resolveCrisis } = useGameSimulationStore.getState();
      triggerCrisis('inspection', 'medium');
      resolveCrisis();

      const { crisisState } = useGameSimulationStore.getState();
      expect(crisisState.active).toBe(false);
    });

    it('should support all crisis types', () => {
      const crisisTypes = ['fire', 'power_outage', 'supply_emergency', 'inspection', 'weather'];

      crisisTypes.forEach((type) => {
        useGameSimulationStore.getState().resolveCrisis(); // Clear any existing
        useGameSimulationStore
          .getState()
          .triggerCrisis(
            type as 'fire' | 'power_outage' | 'supply_emergency' | 'inspection' | 'weather',
            'medium'
          );

        const { crisisState } = useGameSimulationStore.getState();
        expect(crisisState.type).toBe(type);
        expect(crisisState.active).toBe(true);
      });
    });
  });

  describe('Celebrations System', () => {
    it('should trigger milestone celebration', () => {
      const { triggerCelebration } = useGameSimulationStore.getState();
      triggerCelebration('milestone', { value: 1000 });

      const { celebrations } = useGameSimulationStore.getState();
      expect(celebrations.celebrationActive).toBe(true);
      expect(celebrations.lastMilestone).toBe(1000);
      expect(celebrations.milestoneQueue).toHaveLength(1);
    });

    it('should trigger zero incident celebration', () => {
      const { triggerCelebration } = useGameSimulationStore.getState();
      triggerCelebration('zero_incident');

      const { celebrations } = useGameSimulationStore.getState();
      expect(celebrations.celebrationActive).toBe(true);
    });

    it('should clear celebration', () => {
      const { triggerCelebration, clearCelebration } = useGameSimulationStore.getState();
      triggerCelebration('target_met');
      clearCelebration();

      const { celebrations } = useGameSimulationStore.getState();
      expect(celebrations.celebrationActive).toBe(false);
    });

    it('should update zero incident streak', () => {
      const { updateZeroIncidentStreak } = useGameSimulationStore.getState();
      updateZeroIncidentStreak(30);

      const { celebrations } = useGameSimulationStore.getState();
      expect(celebrations.zeroIncidentStreak).toBe(30);
    });

    it('should toggle packer bell', () => {
      const { setPackerBellEnabled } = useGameSimulationStore.getState();
      setPackerBellEnabled(false);

      expect(useGameSimulationStore.getState().celebrations.packerBellEnabled).toBe(false);

      setPackerBellEnabled(true);
      expect(useGameSimulationStore.getState().celebrations.packerBellEnabled).toBe(true);
    });

    it('should limit milestone queue to 5 items', () => {
      const { triggerCelebration } = useGameSimulationStore.getState();

      for (let i = 0; i < 10; i++) {
        triggerCelebration('milestone', { value: i * 100 });
      }

      const { celebrations } = useGameSimulationStore.getState();
      expect(celebrations.milestoneQueue.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Tab Visibility', () => {
    it('should initialize with tab visible', () => {
      const { isTabVisible } = useGameSimulationStore.getState();
      expect(isTabVisible).toBe(true);
    });

    it('should set tab visibility', () => {
      const { setTabVisible } = useGameSimulationStore.getState();

      setTabVisible(false);
      expect(useGameSimulationStore.getState().isTabVisible).toBe(false);

      setTabVisible(true);
      expect(useGameSimulationStore.getState().isTabVisible).toBe(true);
    });
  });

  describe('Reset State', () => {
    it('should reset game state to defaults', () => {
      const { setGameTime, setGameSpeed, setWeather, triggerCrisis, resetGameState } =
        useGameSimulationStore.getState();

      // Modify state
      setGameTime(18);
      setGameSpeed(300);
      setWeather('storm');
      triggerCrisis('fire', 'high');

      // Reset
      resetGameState();

      const state = useGameSimulationStore.getState();
      expect(state.gameTime).toBe(10); // 10am default
      expect(state.gameSpeed).toBe(180); // 1 game day = 8 real minutes
      expect(state.currentShift).toBe('morning');
      expect(state.crisisState.active).toBe(false);
    });
  });
});
