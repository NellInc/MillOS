import { beforeEach, describe, expect, it } from 'vitest';
import { useBreakdownStore } from '../breakdownStore';

const metrics = { vibration: 5, temperature: 60, load: 70 };
const openAlerts = (machineId: string) =>
  useBreakdownStore
    .getState()
    .predictiveAlerts.filter((alert) => alert.machineId === machineId && !alert.acknowledged);

describe('predictive alerts across a repair', () => {
  beforeEach(() => useBreakdownStore.getState().resetBreakdownStore());

  // An open prediction blocks every later one for its machine. Once the
  // predicted fault has been repaired and the machine returned to service, the
  // old window is false, and leaving it open would swallow the next warning.
  it('closes the prediction when the repaired machine returns to service', () => {
    const store = useBreakdownStore.getState;
    store().addPredictiveAlert('rm-1', 'Mill 1', metrics, 90);
    expect(openAlerts('rm-1')).toHaveLength(1);

    const fault = store().triggerBreakdown('rm-1', 'Mill 1', 'vibration_failure')!;
    expect(store().startRepair(fault.id).started).toBe(true);
    store().updateRepairProgress(fault.id, 100);
    expect(store().verifyRepair(fault.id)).toBe(true);
    expect(store().requestMachineRestart(fault.id)).toBe(true);
    expect(store().confirmMachineRestart(fault.id)).toBe(true);

    expect(openAlerts('rm-1')).toHaveLength(0);
    store().addPredictiveAlert('rm-1', 'Mill 1', metrics, 45);
    expect(openAlerts('rm-1')).toHaveLength(1);
    expect(openAlerts('rm-1')[0].predictedTimeToFailure).toBe(45);
  });

  it('leaves other machines predictions open', () => {
    const store = useBreakdownStore.getState;
    store().addPredictiveAlert('rm-2', 'Mill 2', metrics, 90);
    const fault = store().triggerBreakdown('rm-1', 'Mill 1', 'vibration_failure')!;
    store().startRepair(fault.id);
    store().updateRepairProgress(fault.id, 100);
    store().verifyRepair(fault.id);
    store().requestMachineRestart(fault.id);
    store().confirmMachineRestart(fault.id);
    expect(openAlerts('rm-2')).toHaveLength(1);
  });
});
