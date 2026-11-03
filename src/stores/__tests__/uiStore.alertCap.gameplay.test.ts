import { beforeEach, describe, expect, it } from 'vitest';
import { isStandingCriticalAlert, useUIStore } from '../uiStore';
import type { AlertData } from '../../types';

const alert = (id: string, type: AlertData['type']): AlertData => ({
  id,
  type,
  title: id,
  message: id,
  timestamp: new Date(),
  acknowledged: false,
});

describe('uiStore alert cap', () => {
  beforeEach(() => {
    useUIStore.setState({ alerts: [] });
  });

  it('keeps a standing breakdown alert while routine notices fill the bell', () => {
    const { addAlert } = useUIStore.getState();
    addAlert({ ...alert('breakdown-rm-101', 'critical'), machineId: 'rm-101' });
    for (let index = 0; index < 12; index += 1) addAlert(alert(`shift-review-${index}`, 'info'));

    const { alerts } = useUIStore.getState();
    expect(alerts).toHaveLength(10);
    expect(alerts.some((entry) => entry.id === 'breakdown-rm-101')).toBe(true);
    expect(alerts.some(isStandingCriticalAlert)).toBe(true);
    // The newest notice is first and the oldest routine ones made way.
    expect(alerts[0].id).toBe('shift-review-11');
    expect(alerts.some((entry) => entry.id === 'shift-review-0')).toBe(false);
  });

  it('lets an acknowledged critical age out like any other notice', () => {
    const { addAlert, acknowledgeAlert } = useUIStore.getState();
    addAlert(alert('breakdown-rm-102', 'critical'));
    acknowledgeAlert('breakdown-rm-102');
    for (let index = 0; index < 10; index += 1) addAlert(alert(`notice-${index}`, 'info'));

    const { alerts } = useUIStore.getState();
    expect(alerts).toHaveLength(10);
    expect(alerts.some((entry) => entry.id === 'breakdown-rm-102')).toBe(false);
  });
});
