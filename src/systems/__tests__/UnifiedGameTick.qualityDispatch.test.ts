import { beforeEach, describe, expect, it } from 'vitest';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import type { TickContext } from '../CentralTickSystem';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useUIStore } from '../../stores/uiStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';

const tickContext: TickContext = {
  deltaSeconds: 0.1,
  gameTime: 0,
  gameSpeed: 1,
  elapsedTime: 0,
  tickCount: 0,
};

describe('UnifiedGameTick shipping quality interlock', () => {
  beforeEach(() => {
    resetUnifiedTickState();
    useMaterialFlowStore.getState().resetMaterialFlow();
    useOperationsCampaignStore.getState().resetCampaign();
    useTruckScheduleStore.getState().resetTruckSchedule();
    useQCLabStore.setState((state) => ({
      qcLab: {
        ...state.qcLab,
        isRunning: false,
        currentTest: null,
        testHistory: [],
        certificationStatus: 'valid',
        contaminationAlerts: [],
      },
    }));
    useUIStore.setState({ alerts: [] });

    // Synchronize the module-level dock edge detector to an undocked state.
    unifiedGameTick(tickContext);

    // Build genuine packed output so batch identity and source genealogy are
    // present. Untracked aggregate flour is intentionally not dispatchable.
    useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
  });

  it('holds a docked shipping truck when certification has expired', () => {
    useQCLabStore.setState((state) => ({
      qcLab: { ...state.qcLab, certificationStatus: 'expired' },
    }));
    useTruckScheduleStore.getState().setTruckDocked('shipping', true);
    useTruckScheduleStore.getState().setTruckTransferReady('shipping', true);

    unifiedGameTick(tickContext);

    expect(useMaterialFlowStore.getState().shippedKg).toBe(0);
    expect(useUIStore.getState().alerts[0]).toMatchObject({
      type: 'warning',
      title: 'Dispatch Quality Hold',
    });
  });

  it('loads released goods while docked and dispatches them on departure', () => {
    useTruckScheduleStore.getState().setTruckDocked('shipping', true);
    useTruckScheduleStore.getState().setTruckTransferReady('shipping', true);

    for (let index = 0; index < 20; index += 1) {
      unifiedGameTick({ ...tickContext, deltaSeconds: 0.5, tickCount: index + 1 });
    }

    expect(useMaterialFlowStore.getState().shippedKg).toBe(0);
    expect(useOperationsCampaignStore.getState().execution.dispatchLoad.loadedKg).toBeGreaterThan(
      0
    );

    useTruckScheduleStore.getState().setTruckDocked('shipping', false);
    useTruckScheduleStore.getState().setTruckLifecycle('shipping', 'departing');
    unifiedGameTick({ ...tickContext, tickCount: 29 });
    expect(useMaterialFlowStore.getState().shippedKg).toBe(0);

    useTruckScheduleStore.getState().recordTruckDeparture('shipping', 30);
    unifiedGameTick({ ...tickContext, tickCount: 30 });

    expect(useMaterialFlowStore.getState().shippedKg).toBeGreaterThan(0);
    expect(useMaterialFlowStore.getState().manifests.at(-1)).toMatchObject({
      kind: 'shipping',
      dock: 'shipping',
    });
    const shippedKg = useMaterialFlowStore.getState().shippedKg;
    unifiedGameTick({ ...tickContext, tickCount: 31 });
    expect(useMaterialFlowStore.getState().shippedKg).toBe(shippedKg);
  });

  it('retains the same load through closing, a readiness interruption and pull-out', () => {
    const trucks = useTruckScheduleStore.getState();
    trucks.setTruckDocked('shipping', true);
    trucks.setTruckTransferReady('shipping', true);
    for (let index = 0; index < 20; index++)
      unifiedGameTick({ ...tickContext, deltaSeconds: 0.5, tickCount: index + 1 });
    const load = useOperationsCampaignStore.getState().execution.dispatchLoad;
    expect(load.loadedKg).toBeGreaterThan(0);

    trucks.setTruckTransferReady('shipping', false);
    unifiedGameTick({ ...tickContext, tickCount: 21 });
    expect(useMaterialFlowStore.getState().shippedKg).toBe(0);
    expect(useOperationsCampaignStore.getState().execution.dispatchLoad).toEqual(load);

    trucks.setTruckTransferReady('shipping', true);
    unifiedGameTick({ ...tickContext, deltaSeconds: 0, tickCount: 22 });
    expect(useOperationsCampaignStore.getState().execution.dispatchLoad.loadedKg).toBe(
      load.loadedKg
    );
    expect(useMaterialFlowStore.getState().shippedKg).toBe(0);

    trucks.setTruckDocked('shipping', false);
    trucks.setTruckLifecycle('shipping', 'departing');
    unifiedGameTick({ ...tickContext, tickCount: 23 });
    expect(useMaterialFlowStore.getState().shippedKg).toBe(0);
    trucks.recordTruckDeparture('shipping', 30);
    unifiedGameTick({ ...tickContext, tickCount: 24 });
    expect(useMaterialFlowStore.getState().shippedKg).toBeCloseTo(load.loadedKg, 6);
  });

  it('rechecks quality release at actual departure after the load was prepared', () => {
    const trucks = useTruckScheduleStore.getState();
    trucks.setTruckDocked('shipping', true);
    trucks.setTruckTransferReady('shipping', true);
    for (let index = 0; index < 20; index++)
      unifiedGameTick({ ...tickContext, deltaSeconds: 0.5, tickCount: index + 1 });
    expect(useOperationsCampaignStore.getState().execution.dispatchLoad.loadedKg).toBeGreaterThan(
      0
    );
    useQCLabStore.getState().updateCertificationStatus('expired');
    trucks.setTruckTransferReady('shipping', false);
    unifiedGameTick({ ...tickContext, tickCount: 21 });
    trucks.recordTruckDeparture('shipping', 30);
    unifiedGameTick({ ...tickContext, tickCount: 22 });
    expect(useMaterialFlowStore.getState().shippedKg).toBe(0);
    expect(useMaterialFlowStore.getState().manifests.some((m) => m.kind === 'shipping')).toBe(
      false
    );
    expect(useOperationsCampaignStore.getState().execution.dispatchLoad).toMatchObject({
      status: 'departed',
      lastDispatchKg: 0,
      blockReason: 'Quality certification is expired.',
    });
    expect(Math.abs(useMaterialFlowStore.getState().getMaterialBalance().errorKg)).toBeLessThan(
      0.001
    );
  });

  it('describes unavailable recipe stock as a supply wait rather than a quality alarm', () => {
    useOperationsCampaignStore.getState().activateOrder('order-002');
    useTruckScheduleStore.getState().setTruckDocked('shipping', true);
    useTruckScheduleStore.getState().setTruckTransferReady('shipping', true);

    unifiedGameTick(tickContext);

    expect(useOperationsCampaignStore.getState().execution).toMatchObject({
      stage: 'milling',
      qualityReleased: true,
      dispatchLoad: { status: 'held', loadedKg: 0 },
    });
    expect(useUIStore.getState().alerts).toContainEqual(
      expect.objectContaining({ type: 'info', title: 'Shipping Awaiting Product' })
    );
    expect(useUIStore.getState().alerts.some((a) => a.title === 'Dispatch Quality Hold')).toBe(
      false
    );

    // A later genuine hold must still warn even though this same truck was
    // already waiting for supply. An unchanged hold must not repeat the alert.
    useQCLabStore.getState().updateCertificationStatus('expired');
    unifiedGameTick({ ...tickContext, tickCount: 1 });
    unifiedGameTick({ ...tickContext, tickCount: 2 });
    expect(
      useUIStore.getState().alerts.filter((a) => a.title === 'Dispatch Quality Hold')
    ).toHaveLength(1);
  });
});
