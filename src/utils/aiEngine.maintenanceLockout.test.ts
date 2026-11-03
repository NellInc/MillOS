import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyDecisionEffects } from './aiEngine';
import { useProductionStore } from '../stores/productionStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useBreakdownStore } from '../stores/breakdownStore';
import { useSafetyStore } from '../stores/safetyStore';
import { mockMachines } from '../test/fixtures/mockMachines';
import type { AIDecision } from '../types';

// An accepted maintenance decision eases a tripped unit back to 'warning', a
// running state. On a unit locked out for repair, or during a facility stop,
// that started it with its work order open or under the stop.
// Working if only a tripped unit with no open fault resumes, and a stop holds
// it until the stop's release starts it.
const decision: AIDecision = {
  id: 'ai-maint-1',
  type: 'maintenance',
  status: 'pending',
  machineId: 'rm-101',
} as AIDecision;

const status = () => useProductionStore.getState().machines.find((m) => m.id === 'rm-101')?.status;

describe('maintenance decision on a tripped unit', () => {
  beforeEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useBreakdownStore.getState().resetBreakdownStore();
    useProductionStore
      .getState()
      .setMachines(
        mockMachines.map((m) =>
          m.id === 'rm-101'
            ? { ...m, status: 'critical' as const, metrics: { ...m.metrics, wear: 20 } }
            : { ...m }
        )
      );
  });
  afterEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useProductionStore.getState().setMachines([]);
  });

  it('eases a tripped unit with no open fault back to warning', () => {
    applyDecisionEffects(decision, 'accepted');
    expect(status()).toBe('warning');
  });

  it('leaves a unit locked out for repair stopped', () => {
    useBreakdownStore.getState().triggerBreakdown('rm-101', 'Roller Mill 101', 'mechanical');
    applyDecisionEffects(decision, 'accepted');
    expect(status()).toBe('critical');
  });

  it('holds a cleared unit through a facility stop and starts it on release', () => {
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    applyDecisionEffects(decision, 'accepted');
    expect(status()).toBe('idle');
    useGameSimulationStore.getState().resolveEmergency();
    expect(status()).toBe('warning');
  });
});
