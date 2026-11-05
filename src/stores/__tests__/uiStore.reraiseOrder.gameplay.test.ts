import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../uiStore';
import type { AlertData } from '../../types';

const notice = (id: string, type: AlertData['type'] = 'info'): AlertData => ({
  id,
  type,
  title: id,
  message: id,
  timestamp: new Date(),
  acknowledged: false,
});

// A SCADA alarm that returns to normal keeps its row; when the condition comes
// back the row is raised again at the plant time now. It stayed where it was,
// so the bell (newest first) listed the fresh alarm below older notices, and a
// warning that had sunk to the bottom was the very row the next routine notice
// pushed out of the ten-row bell.
// Working if a condition that comes back is listed first and survives the next
// notice.
describe('an alert whose condition comes back', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('is listed first, as a newly raised alert is', () => {
    const ui = useUIStore.getState();
    ui.addAlert(notice('scada-temp', 'warning'));
    ui.setAlertReturnedToNormal('scada-temp', true);
    for (let i = 0; i < 9; i += 1) ui.addAlert(notice(`routine-${i}`));
    ui.setAlertReturnedToNormal('scada-temp', false);
    expect(useUIStore.getState().alerts[0].id).toBe('scada-temp');
  });

  it('is not the row the next routine notice pushes out of the bell', () => {
    const ui = useUIStore.getState();
    ui.addAlert(notice('scada-temp', 'warning'));
    ui.setAlertReturnedToNormal('scada-temp', true);
    for (let i = 0; i < 9; i += 1) ui.addAlert(notice(`routine-${i}`));
    ui.setAlertReturnedToNormal('scada-temp', false);
    ui.addAlert(notice('routine-next'));
    const ids = useUIStore.getState().alerts.map((alert) => alert.id);
    expect(ids).toContain('scada-temp');
    expect(ids).toHaveLength(10);
  });

  it('keeps its place when it returns to normal', () => {
    const ui = useUIStore.getState();
    ui.addAlert(notice('scada-temp', 'warning'));
    ui.addAlert(notice('routine-a'));
    ui.setAlertReturnedToNormal('scada-temp', true);
    expect(useUIStore.getState().alerts.map((alert) => alert.id)).toEqual([
      'routine-a',
      'scada-temp',
    ]);
  });
});
