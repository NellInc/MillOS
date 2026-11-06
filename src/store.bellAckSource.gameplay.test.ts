import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alarm } from './scada/types';
import type { AlertData } from './types';

/**
 * A SCADA bell row acknowledged in the bell acknowledges its alarm, and the
 * SCADA panel shows who did it ("Reconhecido por {who}"). The bridge recorded
 * the hard-coded English 'Operator (alert bell)', so a Portuguese player read
 * "Reconhecido por Operator (alert bell)". Working if the identity is worded
 * through the catalogue, like the panel's own default acknowledger.
 */
const acknowledgeAlarm = vi.fn((_id: string, _source: string) => true);
const fakeService = {
  subscribeToValues: () => () => undefined,
  subscribeToAlarms: (callback: (alarms: Alarm[]) => void) => {
    callback([]);
    return () => undefined;
  },
  getActiveAlarms: () => [],
  getState: () => ({ mode: 'simulation', connected: true }),
  updateMachineStates: () => undefined,
  updateOperationalValues: () => undefined,
  acknowledgeAlarm,
  stop: async () => undefined,
};

vi.mock('./scada/SCADAService', () => ({
  initializeSCADA: async () => fakeService,
  shutdownSCADA: () => undefined,
  getSCADAService: () => fakeService,
  peekSCADAService: () => fakeService,
}));

import { initializeSCADASync } from './store';
import { useUIStore } from './stores/uiStore';
import { setLocale } from './i18n';

const row = (): AlertData => ({
  id: 'scada-TT1-HI',
  type: 'warning',
  title: 'SCADA: HI',
  message: 'high',
  timestamp: new Date(0),
  acknowledged: false,
});

describe('bell acknowledgement of a SCADA row', () => {
  let saved: AlertData[];
  beforeEach(() => {
    saved = useUIStore.getState().alerts;
    useUIStore.setState({ alerts: [row()] });
    acknowledgeAlarm.mockClear();
  });
  afterEach(() => {
    useUIStore.setState({ alerts: saved });
    setLocale('en');
  });

  it('records the acknowledger in the language active now', async () => {
    setLocale('pt-BR');
    const stop = initializeSCADASync();
    // Let initializeSCADA resolve and the bridge subscribe.
    await new Promise((resolve) => setTimeout(resolve, 0));
    useUIStore.getState().acknowledgeAlert('scada-TT1-HI');
    expect(acknowledgeAlarm).toHaveBeenCalledTimes(1);
    const source = acknowledgeAlarm.mock.calls[0][1];
    expect(source).not.toBe('Operator (alert bell)');
    expect(source).toMatch(/sino/i);
    stop();
  });
});
