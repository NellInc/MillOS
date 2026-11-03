import { beforeEach, describe, expect, it } from 'vitest';
import { useBreakdownStore } from '../breakdownStore';

const metrics = { vibration: 5, temperature: 60, load: 70 };
const openAlerts = (machineId: string) =>
  useBreakdownStore
    .getState()
    .predictiveAlerts.filter((alert) => alert.machineId === machineId && !alert.acknowledged);

describe('open predictions', () => {
  beforeEach(() => useBreakdownStore.getState().resetBreakdownStore());

  // The list kept the ten newest predictions, open or not. Ten predictions
  // raised and acknowledged on other units evicted a still-open one, so a
  // machine in warning vanished from Predictive Alerts. Working if no open
  // prediction is dropped to make room for closed ones.
  it('keeps an open prediction when ten later ones are raised and acknowledged', () => {
    const store = useBreakdownStore.getState;
    store().addPredictiveAlert('rm-0', 'Mill 0', metrics, 90);
    for (let i = 1; i <= 10; i += 1) {
      store().addPredictiveAlert(`m-${i}`, `Unit ${i}`, metrics, 60);
      const raised = store().predictiveAlerts.find((alert) => alert.machineId === `m-${i}`)!;
      store().acknowledgePredictiveAlert(raised.id);
    }
    expect(openAlerts('rm-0')).toHaveLength(1);
    expect(store().predictiveAlerts.length).toBeLessThanOrEqual(10);
  });

  // A fault is the predicted failure happening: its countdown is false from
  // then on, and Schedule would book a service for a unit under repair.
  // Working if the fault closes the machine's open prediction, and only its.
  it('closes the machine prediction when the machine breaks down', () => {
    const store = useBreakdownStore.getState;
    store().addPredictiveAlert('rm-1', 'Mill 1', metrics, 30);
    store().addPredictiveAlert('rm-2', 'Mill 2', metrics, 30);
    store().triggerBreakdown('rm-1', 'Mill 1', 'vibration_failure');
    expect(openAlerts('rm-1')).toHaveLength(0);
    expect(openAlerts('rm-2')).toHaveLength(1);
  });
});
