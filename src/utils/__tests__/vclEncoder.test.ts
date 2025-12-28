/**
 * VCL Encoder Unit Tests
 *
 * Tests for the Values Communication Layer encoder that compresses
 * factory context into emoji-based format for Gemini prompts.
 */

import { describe, it, expect } from 'vitest';
import {
  encodeWorkerVCL,
  encodeWorkersVCL,
  encodeMachineVCL,
  encodeMachinesVCL,
  encodeFactoryContextVCL,
  getVCLLegend,
} from '../vclEncoder';
import { WorkerData, MachineData, MachineType } from '../../types';

// Mock worker data for testing - matches WorkerData interface
const createMockWorker = (overrides: Partial<WorkerData> = {}): WorkerData => ({
  id: 'worker-1',
  name: 'Test Worker',
  gender: 'male',
  status: 'working',
  role: 'Operator',
  icon: 'operator',
  position: [0, 0, 0],
  speed: 1,
  direction: 1,
  currentTask: 'Operating Mill',
  experience: 5, // years (not yearsExperience)
  certifications: ['OSHA', 'Forklift'],
  shiftStart: '06:00',
  color: '#4A90D9',
  skills: {
    machineOperation: 4,
    safetyProtocols: 3,
    qualityControl: 3,
    troubleshooting: 3,
    teamwork: 4,
  },
  ...overrides,
});

// Mock machine data for testing - matches MachineData interface
const createMockMachine = (overrides: Partial<MachineData> = {}): MachineData => ({
  id: 'rm-101',
  name: 'Test Mill',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [2, 2, 2],
  rotation: 0,
  status: 'running',
  metrics: {
    rpm: 1200,
    temperature: 55,
    vibration: 2.0,
    load: 75,
    wear: 15,
    efficiency: 92,
  },
  lastMaintenance: new Date().toISOString(),
  nextMaintenance: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  ...overrides,
});

describe('VCL Encoder', () => {
  describe('encodeWorkerVCL', () => {
    it('should encode a working expert operator', () => {
      const worker = createMockWorker({
        role: 'Operator',
        status: 'working',
        experience: 12,
      });

      const encoded = encodeWorkerVCL(worker, 0.5);

      // Should contain emojis for role, status, experience, fatigue
      expect(encoded).toContain('⚙️'); // Working status
      expect(encoded.length).toBeGreaterThan(0);
    });

    it('should encode a tired supervisor on break', () => {
      const worker = createMockWorker({
        role: 'Supervisor',
        status: 'break',
        experience: 15,
      });

      const encoded = encodeWorkerVCL(worker, 0.75);

      expect(encoded).toContain('👑'); // Supervisor role
      expect(encoded.length).toBeGreaterThan(0);
    });

    it('should encode a novice engineer', () => {
      const worker = createMockWorker({
        role: 'Engineer',
        status: 'idle',
        experience: 1,
      });

      const encoded = encodeWorkerVCL(worker, 0.25);

      expect(encoded.length).toBeGreaterThan(0);
    });
  });

  describe('encodeWorkersVCL', () => {
    it('should encode multiple workers into summary format', () => {
      const workers = [
        createMockWorker({ id: 'w1', name: 'Alice', role: 'Operator' }),
        createMockWorker({ id: 'w2', name: 'Bob', role: 'Engineer' }),
        createMockWorker({ id: 'w3', name: 'Carol', role: 'Supervisor' }),
      ];

      const encoded = encodeWorkersVCL(workers, 0.5);

      expect(encoded).toBeDefined();
      expect(encoded.length).toBeGreaterThan(0);
    });

    it('should handle empty worker array', () => {
      const encoded = encodeWorkersVCL([], 0.5);

      expect(encoded).toBeDefined();
    });
  });

  describe('encodeMachineVCL', () => {
    it('should encode a running mill with medium load', () => {
      const machine = createMockMachine({
        id: 'rm-101', // Must contain 'rm-' for mill detection
        type: MachineType.ROLLER_MILL,
        status: 'running',
        metrics: { rpm: 1200, temperature: 55, vibration: 2.0, load: 65, wear: 15, efficiency: 92 },
      });

      const encoded = encodeMachineVCL(machine);

      expect(encoded).toContain('⚙️'); // Mill type (from 'rm-' pattern)
      expect(encoded).toContain('✅'); // Running status
      expect(encoded.length).toBeGreaterThan(0);
    });

    it('should encode a warning silo with high load', () => {
      const machine = createMockMachine({
        id: 'silo-alpha', // Must contain 'silo' for detection
        type: MachineType.SILO,
        status: 'warning',
        metrics: { rpm: 0, temperature: 65, vibration: 3.0, load: 88, wear: 45, efficiency: 75 },
      });

      const encoded = encodeMachineVCL(machine);

      expect(encoded).toContain('🏛️'); // Silo type
      expect(encoded).toContain('⚠️'); // Warning status
    });

    it('should encode a critical packer with critical load', () => {
      const machine = createMockMachine({
        id: 'packer-line-1', // Must contain 'pack' or 'line' for detection
        type: MachineType.PACKER,
        status: 'critical',
        metrics: { rpm: 0, temperature: 75, vibration: 4.0, load: 95, wear: 75, efficiency: 45 },
      });

      const encoded = encodeMachineVCL(machine);

      expect(encoded).toContain('📦'); // Packer type
      expect(encoded).toContain('🔴'); // Critical status or load
    });
  });

  describe('encodeMachinesVCL', () => {
    it('should encode machines grouped by zone', () => {
      const machines = [
        createMockMachine({ id: 'silo-1', type: MachineType.SILO }),
        createMockMachine({ id: 'silo-2', type: MachineType.SILO }),
        createMockMachine({ id: 'rm-101', type: MachineType.ROLLER_MILL }),
        createMockMachine({ id: 'sifter-1', type: MachineType.PLANSIFTER }),
        createMockMachine({ id: 'packer-1', type: MachineType.PACKER }),
      ];

      const encoded = encodeMachinesVCL(machines);

      expect(encoded).toBeDefined();
      expect(encoded.length).toBeGreaterThan(0);
      // Should have zone separators or groupings
      expect(encoded).toContain('→'); // Production flow arrow
    });

    it('should handle empty machine array', () => {
      const encoded = encodeMachinesVCL([]);

      expect(encoded).toBeDefined();
    });
  });

  describe('encodeFactoryContextVCL', () => {
    it('should encode complete factory context', () => {
      const machines = [createMockMachine({ id: 'rm-101', type: MachineType.ROLLER_MILL })];
      const workers = [createMockWorker({ id: 'w1', name: 'Test' })];
      const alerts = [{ type: 'warning' }];

      const encoded = encodeFactoryContextVCL(
        machines,
        workers,
        'morning',
        'clear',
        10.5, // 10:30 AM
        0.56, // 56% through shift
        alerts
      );

      expect(encoded).toBeDefined();
      expect(encoded.length).toBeGreaterThan(0);
      // Should contain shift/time indicators
      expect(encoded).toContain('🌅'); // Morning shift
    });

    it('should encode night shift with storm', () => {
      const machines = [createMockMachine()];
      const workers = [createMockWorker()];
      const alerts: { type: string }[] = [];

      const encoded = encodeFactoryContextVCL(
        machines,
        workers,
        'night',
        'storm',
        2.0, // 2:00 AM
        0.25,
        alerts
      );

      expect(encoded).toContain('🌙'); // Night shift
      expect(encoded).toContain('⛈️'); // Storm weather
    });
  });

  describe('getVCLLegend', () => {
    it('should return a non-empty legend string', () => {
      const legend = getVCLLegend();

      expect(legend).toBeDefined();
      expect(typeof legend).toBe('string');
      expect(legend.length).toBeGreaterThan(0);
    });

    it('should contain emoji explanations', () => {
      const legend = getVCLLegend();

      // Legend should explain key emojis
      expect(legend).toContain('👑'); // Supervisor
      expect(legend).toContain('⚙️'); // Operator/Mill
    });
  });
  describe('Extreme Edge Cases', () => {
    it('should handle machine on fire (!critical)', () => {
      const fireMachine = createMockMachine({
        id: 'oven-1',
        status: 'critical',
        metrics: { temperature: 300, vibration: 10, load: 0, rpm: 0, wear: 95, efficiency: 10 }, // Extreme temp
      });

      const encoded = encodeMachineVCL(fireMachine);

      // Should flag extreme danger
      expect(encoded).toContain('🔴');
      // In a real VCL this might trigger special fire emojis if implemented
    });

    it('should handle negative values gracefully', () => {
      const weirdMachine = createMockMachine({
        metrics: { load: -50, temperature: -20, rpm: -100, vibration: -1, wear: 0, efficiency: 0 },
      });

      const encoded = encodeMachineVCL(weirdMachine);
      expect(encoded).toBeDefined();
      // Should not crash
    });

    it('should handle massive worker lists with truncation', () => {
      // Create 250 workers (limit is 200)
      const hugeWorkerList = Array.from({ length: 250 }, (_, i) =>
        createMockWorker({ id: `w-${i}`, name: `Worker ${i}` })
      );

      const encoded = encodeWorkersVCL(hugeWorkerList, 0.5);

      // Should show the capped count for the role (200)
      expect(encoded).toContain('200');
      // Should verify it didn't process all 250 in the counts
      expect(encoded).not.toContain('250');
      // Should indicate truncation
      expect(encoded).toContain('(truncated)');
    });

    it('should handle undefined/null properties safely', () => {
      // Force type casting to test runtime safety
      const brokenMachine = {
        id: 'broken',
        type: 'unknown',
        // missing metrics
      } as unknown as MachineData;

      // Should not throw
      expect(() => encodeMachineVCL(brokenMachine)).not.toThrow();
    });
  });
});
