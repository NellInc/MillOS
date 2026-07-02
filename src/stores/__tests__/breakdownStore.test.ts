/**
 * Breakdown Store Tests
 *
 * Tests for the equipment failure/repair state machine, predictive alerts,
 * and parts inventory consume/restock behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useBreakdownStore } from '../breakdownStore';
import type { PartsInventory } from '../breakdownStore';

const DEFAULT_INVENTORY: PartsInventory = {
  bearings: 10,
  belts: 8,
  filters: 15,
  motors: 3,
  sensors: 12,
};

describe('BreakdownStore', () => {
  beforeEach(() => {
    useBreakdownStore.setState({
      activeBreakdowns: [],
      breakdownHistory: [],
      predictiveAlerts: [],
      partsInventory: { ...DEFAULT_INVENTORY },
      maintenanceSchedule: [],
      lastBreakdownTime: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Failure/Repair State Machine', () => {
    it('should create a breakdown with the requested type and zero progress', () => {
      const { triggerBreakdown } = useBreakdownStore.getState();
      const breakdown = triggerBreakdown('rm-101', 'Roller Mill 101', 'overheating');

      expect(breakdown).not.toBeNull();
      expect(breakdown!.machineId).toBe('rm-101');
      expect(breakdown!.type).toBe('overheating');
      expect(breakdown!.repairProgress).toBe(0);
      expect(breakdown!.resolved).toBe(false);
      expect(breakdown!.estimatedRepairTime).toBeGreaterThanOrEqual(30);
      expect(breakdown!.estimatedRepairTime).toBeLessThanOrEqual(60);
      expect(useBreakdownStore.getState().activeBreakdowns).toHaveLength(1);
    });

    it('should not allow two active breakdowns on the same machine', () => {
      const { triggerBreakdown } = useBreakdownStore.getState();
      const first = triggerBreakdown('rm-101', 'Roller Mill 101', 'mechanical');
      const second = triggerBreakdown('rm-101', 'Roller Mill 101', 'electrical');

      expect(first).not.toBeNull();
      expect(second).toBeNull();
      expect(useBreakdownStore.getState().activeBreakdowns).toHaveLength(1);
    });

    it('should assign a repair worker to a breakdown', () => {
      const { triggerBreakdown, assignRepairWorker } = useBreakdownStore.getState();
      const breakdown = triggerBreakdown('rm-102', 'Roller Mill 102', 'mechanical')!;

      assignRepairWorker(breakdown.id, 'worker-7', 'Maria Santos');

      const active = useBreakdownStore.getState().activeBreakdowns[0];
      expect(active.assignedWorkerId).toBe('worker-7');
      expect(active.assignedWorkerName).toBe('Maria Santos');
    });

    it('should accumulate repair progress without exceeding 100', () => {
      const { triggerBreakdown, updateRepairProgress } = useBreakdownStore.getState();
      const breakdown = triggerBreakdown('rm-103', 'Roller Mill 103', 'electrical')!;

      updateRepairProgress(breakdown.id, 40);
      expect(useBreakdownStore.getState().activeBreakdowns[0].repairProgress).toBe(40);

      updateRepairProgress(breakdown.id, 30);
      expect(useBreakdownStore.getState().activeBreakdowns[0].repairProgress).toBe(70);
    });

    it('should auto-resolve into history when repair progress reaches 100', () => {
      const { triggerBreakdown, updateRepairProgress } = useBreakdownStore.getState();
      const breakdown = triggerBreakdown('rm-104', 'Roller Mill 104', 'vibration_failure')!;

      updateRepairProgress(breakdown.id, 60);
      updateRepairProgress(breakdown.id, 60); // 120 -> clamps to 100 -> resolves

      const state = useBreakdownStore.getState();
      expect(state.activeBreakdowns).toHaveLength(0);
      expect(state.breakdownHistory).toHaveLength(1);
      expect(state.breakdownHistory[0].id).toBe(breakdown.id);
      expect(state.breakdownHistory[0].resolved).toBe(true);
      expect(state.breakdownHistory[0].repairProgress).toBe(100);
    });

    it('should resolve a breakdown directly and record history', () => {
      const { triggerBreakdown, resolveBreakdown } = useBreakdownStore.getState();
      const breakdown = triggerBreakdown('sifter-a', 'Plansifter A', 'mechanical')!;

      resolveBreakdown(breakdown.id);

      const state = useBreakdownStore.getState();
      expect(state.activeBreakdowns).toHaveLength(0);
      expect(state.breakdownHistory[0].resolved).toBe(true);
    });

    it('should ignore progress/resolve calls for unknown breakdown ids', () => {
      const { triggerBreakdown, updateRepairProgress, resolveBreakdown } =
        useBreakdownStore.getState();
      triggerBreakdown('rm-101', 'Roller Mill 101', 'mechanical');

      updateRepairProgress('no-such-id', 50);
      resolveBreakdown('no-such-id');

      const state = useBreakdownStore.getState();
      expect(state.activeBreakdowns).toHaveLength(1);
      expect(state.activeBreakdowns[0].repairProgress).toBe(0);
      expect(state.breakdownHistory).toHaveLength(0);
    });

    it('should allow a new breakdown on a machine after the previous one resolves', () => {
      const { triggerBreakdown, resolveBreakdown } = useBreakdownStore.getState();
      const first = triggerBreakdown('rm-101', 'Roller Mill 101', 'mechanical')!;
      resolveBreakdown(first.id);

      const second = triggerBreakdown('rm-101', 'Roller Mill 101', 'overheating');
      expect(second).not.toBeNull();
      expect(useBreakdownStore.getState().activeBreakdowns).toHaveLength(1);
    });

    it('should find the active breakdown for a machine', () => {
      const { triggerBreakdown, getBreakdownForMachine } = useBreakdownStore.getState();
      triggerBreakdown('packer-0', 'Packer Line 1', 'electrical');

      expect(getBreakdownForMachine('packer-0')?.machineId).toBe('packer-0');
      expect(getBreakdownForMachine('packer-1')).toBeUndefined();
    });
  });

  describe('triggerRandomBreakdown', () => {
    const machines = [
      { id: 'rm-101', name: 'Roller Mill 101', status: 'running' },
      { id: 'rm-102', name: 'Roller Mill 102', status: 'idle' },
    ];

    it('should rate-limit breakdowns to one per 2 real minutes', () => {
      useBreakdownStore.setState({ lastBreakdownTime: Date.now() });
      vi.spyOn(Math, 'random').mockReturnValue(0);

      const result = useBreakdownStore.getState().triggerRandomBreakdown(machines);
      expect(result).toBeNull();
      expect(useBreakdownStore.getState().activeBreakdowns).toHaveLength(0);
    });

    it('should only ever pick running machines', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0); // Forces the 0.3% chance to hit

      const result = useBreakdownStore.getState().triggerRandomBreakdown(machines);
      expect(result).not.toBeNull();
      expect(result!.machineId).toBe('rm-101'); // The only running machine

      const idleOnly = useBreakdownStore
        .getState()
        .triggerRandomBreakdown([{ id: 'rm-102', name: 'RM 102', status: 'idle' }]);
      expect(idleOnly).toBeNull();
    });

    it('should usually skip (random chance gate)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5); // Above the 0.003 threshold
      const result = useBreakdownStore.getState().triggerRandomBreakdown(machines);
      expect(result).toBeNull();
    });
  });

  describe('Parts Inventory', () => {
    it('should consume a part and report success while stock remains', () => {
      const { consumePart } = useBreakdownStore.getState();

      expect(consumePart('motors')).toBe(true);
      expect(useBreakdownStore.getState().partsInventory.motors).toBe(2);
    });

    it('should refuse to consume a depleted part and never go negative', () => {
      const { consumePart } = useBreakdownStore.getState();

      expect(consumePart('motors')).toBe(true); // 3 -> 2
      expect(consumePart('motors')).toBe(true); // 2 -> 1
      expect(consumePart('motors')).toBe(true); // 1 -> 0
      expect(consumePart('motors')).toBe(false); // depleted
      expect(useBreakdownStore.getState().partsInventory.motors).toBe(0);
    });

    it('should restock parts', () => {
      const { restockPart } = useBreakdownStore.getState();
      restockPart('belts', 5);
      expect(useBreakdownStore.getState().partsInventory.belts).toBe(13);
    });

    it('should flag low inventory when any part drops below 3', () => {
      const { consumePart, hasLowInventory, restockPart } = useBreakdownStore.getState();

      expect(hasLowInventory()).toBe(false); // motors=3 is the minimum, not < 3

      consumePart('motors'); // motors -> 2
      expect(hasLowInventory()).toBe(true);

      restockPart('motors', 5); // motors -> 7
      expect(useBreakdownStore.getState().hasLowInventory()).toBe(false);
    });

    it('should map breakdown types to required parts', () => {
      const { getPartsForBreakdown } = useBreakdownStore.getState();
      expect(getPartsForBreakdown('mechanical')).toEqual(['bearings', 'belts']);
      expect(getPartsForBreakdown('electrical')).toEqual(['sensors', 'motors']);
      expect(getPartsForBreakdown('overheating')).toEqual(['filters', 'sensors']);
      expect(getPartsForBreakdown('vibration_failure')).toEqual(['bearings', 'belts']);
    });
  });

  describe('Predictive Alerts', () => {
    it('should classify high vibration as vibration_failure', () => {
      const { addPredictiveAlert } = useBreakdownStore.getState();
      addPredictiveAlert('rm-101', 'Roller Mill 101', { vibration: 5, temperature: 40, load: 60 });

      const alert = useBreakdownStore.getState().predictiveAlerts[0];
      expect(alert.predictedFailureType).toBe('vibration_failure');
      expect(alert.confidence).toBeGreaterThan(0);
      expect(alert.confidence).toBeLessThanOrEqual(95);
      expect(alert.acknowledged).toBe(false);
    });

    it('should classify high temperature as overheating', () => {
      const { addPredictiveAlert } = useBreakdownStore.getState();
      addPredictiveAlert('rm-102', 'Roller Mill 102', { vibration: 1, temperature: 80, load: 60 });

      expect(useBreakdownStore.getState().predictiveAlerts[0].predictedFailureType).toBe(
        'overheating'
      );
    });

    it('should not duplicate unacknowledged alerts for the same machine', () => {
      const { addPredictiveAlert } = useBreakdownStore.getState();
      addPredictiveAlert('rm-101', 'Roller Mill 101', { vibration: 5, temperature: 40, load: 60 });
      addPredictiveAlert('rm-101', 'Roller Mill 101', { vibration: 6, temperature: 40, load: 60 });

      expect(useBreakdownStore.getState().predictiveAlerts).toHaveLength(1);
    });

    it('should acknowledge an alert by id', () => {
      const { addPredictiveAlert } = useBreakdownStore.getState();
      addPredictiveAlert('rm-101', 'Roller Mill 101', { vibration: 5, temperature: 40, load: 60 });
      const alertId = useBreakdownStore.getState().predictiveAlerts[0].id;

      useBreakdownStore.getState().acknowledgePredictiveAlert(alertId);
      expect(useBreakdownStore.getState().predictiveAlerts[0].acknowledged).toBe(true);
    });

    it('should list alerts per machine', () => {
      const { addPredictiveAlert, getAlertsForMachine } = useBreakdownStore.getState();
      addPredictiveAlert('rm-101', 'Roller Mill 101', { vibration: 5, temperature: 40, load: 60 });
      addPredictiveAlert('rm-102', 'Roller Mill 102', { vibration: 1, temperature: 80, load: 60 });

      expect(getAlertsForMachine('rm-101')).toHaveLength(1);
      expect(getAlertsForMachine('rm-103')).toHaveLength(0);
    });
  });

  describe('Maintenance Schedule', () => {
    it('should schedule and complete maintenance tasks', () => {
      const { scheduleMaintenanceTask, completeMaintenanceTask } = useBreakdownStore.getState();
      scheduleMaintenanceTask({
        machineId: 'rm-101',
        machineName: 'Roller Mill 101',
        scheduledTime: 14,
        type: 'preventive',
        priority: 'medium',
        partsNeeded: ['bearings'],
      });

      const task = useBreakdownStore.getState().maintenanceSchedule[0];
      expect(task.completed).toBe(false);

      completeMaintenanceTask(task.id);
      expect(useBreakdownStore.getState().maintenanceSchedule[0].completed).toBe(true);
    });
  });
});
