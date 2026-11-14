import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';

/**
 * The control-network incident and a tripped mill (plan tail, after item 7.4).
 * During the incident about a quarter of read-only tags read UNCERTAIN and hold
 * the last value that got through; the bridge takes GOOD readings only. In
 * simulation mode the store owns machine status and the offline machine model
 * is off, so a tripped mill whose temperature tag was held kept its trip-time
 * temperature and never read cooled: it stayed tripped until the incident
 * closed. Working if, on the real SCADA service and bridge, the mill cools and
 * comes back while the incident is still open, and the SCADA view still shows
 * the held reading UNCERTAIN. The control is a mill whose readings get through.
 */
const holder = vi.hoisted(() => ({ service: null as unknown }));
vi.mock('./scada/SCADAService', async (original) => {
  const actual = await original<typeof import('./scada/SCADAService')>();
  return {
    ...actual,
    initializeSCADA: async () => holder.service,
    shutdownSCADA: () => undefined,
    getSCADAService: () => holder.service,
    peekSCADAService: () => holder.service,
  };
});

import { SCADAService } from './scada/SCADAService';
import { initializeSCADASync } from './store';
import { useProductionStore } from './stores/productionStore';
import { useOperationsCampaignStore } from './stores/operationsCampaignStore';
import { useGameSimulationStore } from './stores/gameSimulationStore';
import { STANDARD_GAME_SPEED } from './simulation/pace';
import { MachineType, type MachineData } from './types';

const MILLS = ['101', '102', '103', '104'];
const mill = (num: string): MachineData =>
  ({
    id: `rm-${num}`,
    name: `R.M. ${num}`,
    type: MachineType.ROLLER_MILL,
    status: 'running',
    position: [0, 0, 0],
    size: [1, 1, 1],
    rotation: 0,
    lastMaintenance: '',
    nextMaintenance: '',
    metrics: { rpm: 1200, temperature: 45, vibration: 1.2, load: 70, wear: 10, efficiency: 100 },
  }) as unknown as MachineData;

let service: SCADAService;
// The bridge keeps its last machine push time at module level, so each test's
// clock starts after the last one's ended.
let clockBase = Date.parse('2026-11-13T12:00:00Z');
let gameBefore: ReturnType<typeof useGameSimulationStore.getState>;

beforeEach(async () => {
  // IndexedDB setup uses real timeouts (as integration.test.ts): fake the clock
  // and the adapter's interval only.
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
  clockBase += 24 * 3_600_000;
  vi.setSystemTime(clockBase);
  gameBefore = useGameSimulationStore.getState();
  useGameSimulationStore.setState({ gameSpeed: STANDARD_GAME_SPEED, emergencyActive: false });
  useOperationsCampaignStore.getState().resetCampaign();
  useProductionStore.setState({
    machines: MILLS.map(mill),
    productionSpeed: 1,
    scadaLive: false,
  });
  service = new SCADAService({ mode: 'simulation', connection: { type: 'simulation' } });
  holder.service = service;
  await service.start();
});

afterEach(async () => {
  await service.stop();
  vi.useRealTimers();
  useGameSimulationStore.setState(gameBefore, true);
});

describe('a tripped mill during the control-network incident', () => {
  async function tripDuringIncident(wantHeld: boolean) {
    onTestFinished(initializeSCADASync());
    await vi.advanceTimersByTimeAsync(10_000);
    expect(useProductionStore.getState().scadaLive).toBe(true);

    // Raise the incident until its seeded subset holds (or, for the control,
    // leaves) a mill's temperature and vibration as asked.
    const campaign = () => useOperationsCampaignStore.getState();
    let heldMill: string | undefined;
    for (let attempt = 0; attempt < 40 && !heldMill; attempt++) {
      expect(campaign().triggerIncident('control_network_degraded')).toBeTruthy();
      await vi.advanceTimersByTimeAsync(0);
      const held = new Set(service.getNetworkUncertainTagIds());
      heldMill = MILLS.find((num) =>
        wantHeld
          ? held.has(`RM${num}.TT001.PV`)
          : !held.has(`RM${num}.TT001.PV`) && !held.has(`RM${num}.VT001.PV`)
      );
      if (!heldMill) {
        const open = campaign().incidents.find((i) => i.phase !== 'resolved')!;
        campaign().resolveIncident(open.id);
        await vi.advanceTimersByTimeAsync(0);
      }
    }
    expect(heldMill).toBeDefined();
    const id = `rm-${heldMill}`;
    const tagId = `RM${heldMill}.TT001.PV`;

    // A metric-only trip on the mill: hot and shaking, as a trip leaves it.
    await vi.advanceTimersByTimeAsync(2_000);
    const frozen = service.getValue(tagId)?.value;
    let liftedAt: number | null = null;
    const watch = useProductionStore.subscribe((state) => {
      const status = state.machines.find((m) => m.id === id)?.status;
      if (liftedAt === null && status !== undefined && status !== 'critical') liftedAt = Date.now();
    });
    try {
      useProductionStore.setState((state) => ({
        machines: state.machines.map((m) =>
          m.id === id
            ? {
                ...m,
                status: 'critical',
                metrics: { ...m.metrics, rpm: 0, temperature: 85, vibration: 8.5, load: 0 },
              }
            : m
        ),
      }));
      liftedAt = null;

      // Ten real minutes at standard pace: far longer than a stopped mill needs to cool.
      await vi.advanceTimersByTimeAsync(600_000);
      expect(campaign().incidents.some((i) => i.phase !== 'resolved')).toBe(true);
      // The SCADA view is still degraded: a held reading still reads UNCERTAIN, unmoved.
      if (wantHeld)
        expect(service.getValue(tagId)).toMatchObject({ quality: 'UNCERTAIN', value: frozen });
      else expect(service.getValue(tagId)?.quality).toBe('GOOD');
      // The trip lifted while the incident was open, and the mill runs again.
      expect(liftedAt).not.toBeNull();
      expect(useProductionStore.getState().machines.find((m) => m.id === id)?.status).not.toBe(
        'critical'
      );

      // Closing the incident serves the plant's own figure again.
      const open = campaign().incidents.find((i) => i.phase !== 'resolved')!;
      campaign().resolveIncident(open.id);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(service.getValue(tagId)?.quality).toBe('GOOD');
    } finally {
      watch();
    }
  }

  it.each([
    // The control: a mill whose temperature reaches the panel came back before.
    { held: false },
    { held: true },
  ])('cools and comes back while the incident is open (temperature tag held: $held)', ({ held }) =>
    tripDuringIncident(held)
  );
});
