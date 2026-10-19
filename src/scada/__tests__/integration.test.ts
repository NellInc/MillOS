import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCADAService } from '../SCADAService';
import { MILL_TAGS } from '../tagDatabase';

describe('SCADA integration', () => {
  let service: SCADAService;

  beforeEach(async () => {
    // IndexedDB setup uses real timeouts. Fake only the simulation clock and
    // interval so startup remains a genuine asynchronous integration path.
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-08-20T12:00:00Z'));
    service = new SCADAService({
      mode: 'simulation',
      connection: { type: 'simulation' },
      historyRetention: 60_000,
      historySampleRate: 100,
      alarmsEnabled: true,
    });
    await service.start();
  });

  afterEach(async () => {
    await service.stop();
    vi.useRealTimers();
  });

  it('starts with the complete unique registry and a populated value cache', () => {
    expect(MILL_TAGS).toHaveLength(122);
    expect(new Set(MILL_TAGS.map((tag) => tag.id)).size).toBe(MILL_TAGS.length);
    expect(
      MILL_TAGS.filter((tag) => tag.id.endsWith('.MT001.PV')).map(
        (tag) => tag.simulation?.baseValue
      )
    ).toEqual([12.4, 13.1, 12.7, 13.6, 12.2]);

    expect(service.getState()).toMatchObject({
      connected: true,
      mode: 'simulation',
      tagCount: 122,
    });
    expect(service.getAllValues()).toHaveLength(122);
    expect(service.getValue('RM101.TT001.PV')).toMatchObject({
      tagId: 'RM101.TT001.PV',
      quality: 'GOOD',
    });
  });

  it('queries authored tags by machine and group without cross-contamination', () => {
    const machineTags = service.getTagsForMachine('rm-101');
    expect(machineTags).toHaveLength(6);
    expect(machineTags.every((tag) => tag.machineId === 'rm-101')).toBe(true);

    const temperatureTags = service.getTagsForGroup('TEMPERATURE');
    expect(temperatureTags).not.toHaveLength(0);
    expect(temperatureTags.every((tag) => tag.group === 'TEMPERATURE')).toBe(true);
  });

  it('delivers current and periodic snapshots, then stops exactly at unsubscribe', async () => {
    const callback = vi.fn();
    const unsubscribe = service.subscribeToValues(callback);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0]).toHaveLength(122);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(callback).toHaveBeenCalledTimes(3);

    unsubscribe();
    const countAtUnsubscribe = callback.mock.calls.length;
    await vi.advanceTimersByTimeAsync(3_000);
    expect(callback).toHaveBeenCalledTimes(countAtUnsubscribe);
  });

  it('routes an injected high temperature through simulation and alarm acknowledgement', async () => {
    await vi.advanceTimersByTimeAsync(5_001);
    service.injectFault({
      tagId: 'RM101.TT001.PV',
      faultType: 'spike',
      severity: 1,
    });

    const alarm = service.getActiveAlarms().find((item) => item.tagId === 'RM101.TT001.PV');
    expect(alarm).toMatchObject({
      state: 'UNACK',
      priority: 'CRITICAL',
      type: 'HIHI',
      disposition: 'IN_SERVICE',
    });

    expect(service.acknowledgeAlarm(alarm!.id, 'TestOperator', 'Verified spike')).toBe(true);
    expect(service.getActiveAlarms().find((item) => item.id === alarm!.id)).toMatchObject({
      state: 'ACKED',
      acknowledgedBy: 'TestOperator',
      acknowledgementNote: 'Verified spike',
    });
  });

  it('writes setpoints immediately and rejects writes to read-only values', async () => {
    await expect(service.writeSetpoint('RM101.ST001.SP', 1500)).resolves.toBe(true);
    expect(service.getValue('RM101.ST001.SP')).toMatchObject({
      value: 1500,
      quality: 'GOOD',
    });

    const readOnlyBefore = service.getValue('RM101.TT001.PV');
    expect(readOnlyBefore).toBeDefined();
    await expect(service.writeSetpoint('RM101.TT001.PV', 100)).resolves.toBe(false);
    expect(service.getValue('RM101.TT001.PV')).toEqual(readOnlyBefore);
  });

  it('refuses a setpoint outside the tag engineering range, so its readback cannot lie', async () => {
    const before = service.getValue('RM101.ST001.SP');
    await expect(service.writeSetpoint('RM101.ST001.SP', 2500)).resolves.toBe(false);
    await expect(service.writeSetpoint('RM101.ST001.SP', -1)).resolves.toBe(false);
    await expect(service.writeSetpoint('RM101.ST001.SP', Number.NaN)).resolves.toBe(false);
    expect(service.getValue('RM101.ST001.SP')).toEqual(before);
    await expect(service.writeSetpoint('RM101.ST001.SP', 2000)).resolves.toBe(true);
  });

  it('publishes updated machine state on the next simulation sample', async () => {
    service.updateMachineStates([
      {
        id: 'rm-101',
        status: 'idle',
        metrics: { load: 0, rpm: 0 },
      },
    ]);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(service.getValue('RM101.ST001.PV')).toMatchObject({
      value: 0,
      quality: 'UNCERTAIN',
    });
  });

  it('stops idempotently and clears runtime state', async () => {
    service.injectFault({ tagId: 'RM101.TT001.PV', faultType: 'spike' });
    expect(service.getActiveFaults()).toHaveLength(1);

    await service.stop();
    await service.stop();

    expect(service.getState()).toMatchObject({
      connected: false,
      tagCount: 0,
      activeAlarmCount: 0,
    });
    expect(service.getAllValues()).toEqual([]);
    expect(service.getActiveFaults()).toEqual([]);
  });
});
