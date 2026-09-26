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
      workOrders: [],
      predictiveAlerts: [],
      partsInventory: { ...DEFAULT_INVENTORY },
      maintenanceSchedule: [],
      lastBreakdownTime: 0,
      idSequence: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Failure/Repair State Machine', () => {
    const createRepair = (
      type: 'mechanical' | 'electrical' | 'overheating' | 'vibration_failure' = 'mechanical'
    ) => {
      return useBreakdownStore.getState().triggerBreakdown('rm-101', 'Roller Mill 101', type)!;
    };

    it('creates deterministic breakdown and work-order identities', () => {
      const first = useBreakdownStore
        .getState()
        .triggerBreakdown('rm-101', 'Roller Mill 101', 'overheating')!;
      const second = useBreakdownStore
        .getState()
        .triggerBreakdown('rm-102', 'Roller Mill 102', 'electrical')!;

      expect(first.id).toBe('breakdown-00001');
      expect(first.workOrderId).toBe('wo-00001');
      expect(second.id).toBe('breakdown-00002');
      expect(first.repairProgress).toBe(0);
      expect(first.resolved).toBe(false);
      expect(useBreakdownStore.getState().workOrders[0]).toMatchObject({
        id: 'wo-00001',
        breakdownId: first.id,
        phase: 'diagnosed',
        cause: 'overheating',
        requiredParts: ['filters', 'sensors'],
      });
    });

    it('does not allow two active breakdowns on the same machine', () => {
      const first = useBreakdownStore
        .getState()
        .triggerBreakdown('rm-101', 'Roller Mill 101', 'mechanical');
      const second = useBreakdownStore
        .getState()
        .triggerBreakdown('rm-101', 'Roller Mill 101', 'electrical');

      expect(first).not.toBeNull();
      expect(second).toBeNull();
      expect(useBreakdownStore.getState().activeBreakdowns).toHaveLength(1);
      expect(useBreakdownStore.getState().workOrders).toHaveLength(1);
    });

    it('starts an autonomous repair when all required parts are available', () => {
      const breakdown = useBreakdownStore
        .getState()
        .triggerBreakdown('rm-101', 'Roller Mill 101', 'mechanical')!;

      const result = useBreakdownStore.getState().startRepair(breakdown.id);

      expect(result).toEqual({ started: true, missingParts: [] });
      expect(useBreakdownStore.getState().partsInventory).toEqual({
        ...DEFAULT_INVENTORY,
        bearings: 9,
        belts: 7,
      });
    });

    it('atomically consumes all required parts when repair starts', () => {
      const breakdown = createRepair('mechanical');
      const result = useBreakdownStore.getState().startRepair(breakdown.id);
      const state = useBreakdownStore.getState();

      expect(result.started).toBe(true);
      expect(state.partsInventory.bearings).toBe(9);
      expect(state.partsInventory.belts).toBe(7);
      expect(state.workOrders[0]).toMatchObject({
        phase: 'repairing',
        consumedParts: ['bearings', 'belts'],
      });
    });

    it('keeps the work order blocked when any required part is missing', () => {
      useBreakdownStore.setState((state) => ({
        partsInventory: { ...state.partsInventory, motors: 0 },
      }));
      const breakdown = createRepair('electrical');

      const result = useBreakdownStore.getState().startRepair(breakdown.id);

      expect(result).toEqual({
        started: false,
        reason: 'missing_parts',
        missingParts: ['motors'],
      });
      expect(useBreakdownStore.getState().workOrders[0].phase).toBe('awaiting_parts');
      expect(useBreakdownStore.getState().partsInventory.sensors).toBe(12);
    });

    it('requires repair completion, verification, and explicit restart in order', () => {
      const breakdown = createRepair();
      const state = useBreakdownStore.getState();
      expect(state.startRepair(breakdown.id).started).toBe(true);

      state.updateRepairProgress(breakdown.id, 120);
      let current = useBreakdownStore.getState();
      expect(current.activeBreakdowns[0].repairProgress).toBe(100);
      expect(current.workOrders[0].phase).toBe('verification');
      expect(current.activeBreakdowns).toHaveLength(1);
      expect(current.breakdownHistory).toHaveLength(0);

      expect(current.requestMachineRestart(breakdown.id)).toBe(false);
      expect(current.verifyRepair(breakdown.id)).toBe(true);
      expect(useBreakdownStore.getState().requestMachineRestart(breakdown.id)).toBe(true);
      expect(useBreakdownStore.getState().confirmMachineRestart(breakdown.id)).toBe(true);

      current = useBreakdownStore.getState();
      expect(current.activeBreakdowns).toHaveLength(0);
      expect(current.breakdownHistory[0]).toMatchObject({
        id: breakdown.id,
        resolved: true,
        repairProgress: 100,
      });
      expect(current.workOrders[0].phase).toBe('returned_to_service');
      expect(current.workOrders[0].audit.map((entry) => entry.phase)).toEqual([
        'diagnosed',
        'repairing',
        'verification',
        'ready_to_restart',
        'restart_requested',
        'returned_to_service',
      ]);
    });

    it('keeps only the most recent closed work orders', () => {
      useBreakdownStore.setState({
        partsInventory: { bearings: 100, belts: 100, filters: 100, motors: 100, sensors: 100 },
      });
      for (let cycle = 0; cycle < 32; cycle += 1) {
        const breakdown = createRepair();
        const state = useBreakdownStore.getState();
        state.startRepair(breakdown.id);
        state.updateRepairProgress(breakdown.id, 100);
        state.verifyRepair(breakdown.id);
        state.requestMachineRestart(breakdown.id);
        state.confirmMachineRestart(breakdown.id);
      }
      const open = createRepair();

      const workOrders = useBreakdownStore.getState().workOrders;
      expect(workOrders).toHaveLength(31);
      expect(workOrders[0].id).toBe('wo-00003');
      expect(workOrders.at(-1)).toMatchObject({ breakdownId: open.id, phase: 'diagnosed' });
    });

    it('tracks downtime on active faults and freezes it after restart', () => {
      const breakdown = createRepair();
      const state = useBreakdownStore.getState();
      state.tickDowntime(12.5);
      state.startRepair(breakdown.id);
      state.updateRepairProgress(breakdown.id, 100);
      state.verifyRepair(breakdown.id);
      state.requestMachineRestart(breakdown.id);
      state.confirmMachineRestart(breakdown.id);
      state.tickDowntime(10);

      const current = useBreakdownStore.getState();
      expect(current.workOrders[0].downtimeSeconds).toBe(12.5);
      expect(current.breakdownHistory[0].downtimeSeconds).toBe(12.5);
    });

    it('does not let the compatibility resolve action bypass causality', () => {
      const breakdown = createRepair();
      useBreakdownStore.getState().resolveBreakdown(breakdown.id);

      expect(useBreakdownStore.getState().activeBreakdowns).toHaveLength(1);
      expect(useBreakdownStore.getState().workOrders[0].phase).toBe('diagnosed');
    });

    it('finds active faults and work orders by identity', () => {
      const breakdown = useBreakdownStore
        .getState()
        .triggerBreakdown('packer-0', 'Packer Line 1', 'electrical')!;
      const state = useBreakdownStore.getState();

      expect(state.getBreakdownForMachine('packer-0')?.id).toBe(breakdown.id);
      expect(state.getBreakdownForMachine('packer-1')).toBeUndefined();
      expect(state.getWorkOrderForBreakdown(breakdown.id)?.id).toBe(breakdown.workOrderId);
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

    it('should top up depleted parts toward default stock on a truck delivery', () => {
      const { consumePart, restockDelivery } = useBreakdownStore.getState();

      consumePart('motors'); // 3 -> 2
      consumePart('motors'); // 2 -> 1
      consumePart('belts'); // 8 -> 7

      restockDelivery();
      const inv = useBreakdownStore.getState().partsInventory;
      expect(inv.motors).toBe(3); // 1 + 2, capped at default 3
      expect(inv.belts).toBe(8); // 7 + 2 would exceed default 8, capped
      expect(inv.bearings).toBe(10); // untouched part stays at default cap
    });

    it('should never grow inventory beyond default stock via deliveries', () => {
      const { restockDelivery } = useBreakdownStore.getState();

      restockDelivery();
      restockDelivery();
      const inv = useBreakdownStore.getState().partsInventory;
      expect(inv).toEqual({ bearings: 10, belts: 8, filters: 15, motors: 3, sensors: 12 });
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
      expect(useBreakdownStore.getState().partsInventory.bearings).toBe(9);
    });

    it('refuses completion when required parts are unavailable', () => {
      useBreakdownStore.setState((state) => ({
        partsInventory: { ...state.partsInventory, motors: 0 },
      }));
      const { scheduleMaintenanceTask, completeMaintenanceTask } = useBreakdownStore.getState();
      scheduleMaintenanceTask({
        machineId: 'rm-102',
        machineName: 'Roller Mill 102',
        scheduledTime: 15,
        type: 'predictive',
        priority: 'high',
        partsNeeded: ['motors'],
      });

      const task = useBreakdownStore.getState().maintenanceSchedule[0];
      completeMaintenanceTask(task.id);
      expect(useBreakdownStore.getState().maintenanceSchedule[0].completed).toBe(false);
      expect(useBreakdownStore.getState().partsInventory.motors).toBe(0);
    });

    it('keeps one pending maintenance task per machine', () => {
      const schedule = useBreakdownStore.getState().scheduleMaintenanceTask;
      const task = {
        machineId: 'rm-103',
        machineName: 'Roller Mill 103',
        scheduledTime: 16,
        type: 'predictive' as const,
        priority: 'medium' as const,
        partsNeeded: ['sensors' as const],
      };

      schedule(task);
      schedule({ ...task, scheduledTime: 17 });
      expect(useBreakdownStore.getState().maintenanceSchedule).toHaveLength(1);
    });
  });
});
