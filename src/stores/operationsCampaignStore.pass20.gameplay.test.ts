import { beforeEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore, type CampaignTickContext } from './operationsCampaignStore';
import { useQCLabStore } from './qcLabStore';
import { useTruckScheduleStore } from './truckScheduleStore';
import { setLocale } from '../i18n';
import { deriveOperationsPlay } from '../simulation/operationsPlay';

// Twentieth-pass campaign defects, through the real store actions.

function context(overrides: Partial<CampaignTickContext> = {}): CampaignTickContext {
  return {
    shiftKey: 'day-0-morning',
    shiftLabel: 'Morning',
    manifests: [],
    productionBatches: [],
    totalEnergyKw: 450,
    averageQuality: 99,
    wasteKg: 0,
    storageUtilization: 0.2,
    shippingDocked: false,
    receivingDocked: false,
    dispatchReleased: true,
    sourceInventoryKg: 50000,
    finishedAvailableKg: 0,
    releasedFinishedKg: 0,
    dispatchLoad: {
      cycleId: 'shipping-0',
      status: 'away',
      loadedKg: 0,
      capacityKg: 5000,
      materialType: 'flour',
      blockReason: null,
      lastDispatchKg: 0,
    },
    openWorkOrders: 0,
    ...overrides,
  };
}
const store = () => useOperationsCampaignStore.getState();
const tick = (minutes: number, overrides: Partial<CampaignTickContext> = {}) =>
  store().tickCampaign(minutes * 60, context(overrides));

const qcInitial = useQCLabStore.getState().qcLab;
const trucksInitial = useTruckScheduleStore.getState().truckSchedule;

beforeEach(() => {
  setLocale('en');
  store().resetCampaign();
  useQCLabStore.setState({ qcLab: structuredClone(qcInitial) });
  useTruckScheduleStore.setState({ truckSchedule: structuredClone(trucksInitial) });
});

/*
 * No tick runs while the shift is paused. Mitigating the contamination that
 * isolates dispatch drops the card's Blocked line at once (pass 19), but the
 * execution kept the isolation: the card's next step went on reading "Review
 * the quality hold" because "An active operational incident requires dispatch
 * isolation", the incident the player had just mitigated.
 */
describe('a paused mitigation of the dispatch-isolating incident', () => {
  const isolate = () => {
    const incident = store().triggerIncident('supplier_contamination')!;
    // The tick that applied it: QC itself released, the truck held at the dock.
    tick(1, {
      shippingDocked: true,
      dispatchReleased: true,
      releasedFinishedKg: 2000,
      finishedAvailableKg: 2000,
      dispatchLoad: {
        cycleId: 'shipping-1',
        status: 'held',
        loadedKg: 0,
        capacityKg: 5000,
        materialType: 'flour',
        blockReason: 'An active operational incident requires dispatch isolation.',
        blockCode: 'incidentDispatchIsolation',
        lastDispatchKg: 0,
      },
    });
    useTruckScheduleStore.setState((state) => ({
      truckSchedule: {
        ...state.truckSchedule,
        shipping: { ...state.truckSchedule.shipping, truckDocked: true },
      },
    }));
    expect(store().execution.stage).toBe('quality_hold');
    expect(store().costRates.demurrage).toBeGreaterThan(0);
    store().acknowledgeIncident(incident.id, 'operator');
    return incident;
  };

  it('stops naming the isolation as the reason for the hold', () => {
    const incident = isolate();
    store().mitigateIncident(incident.id, 'operator');
    const play = deriveOperationsPlay(store());
    expect(play.nextAction.consequence).not.toContain('dispatch isolation');
    expect(store().execution.dispatchLoad.blockCode).not.toBe('incidentDispatchIsolation');
  });

  it('leaves the quality step once nothing else holds dispatch', () => {
    const incident = isolate();
    store().mitigateIncident(incident.id, 'operator');
    expect(store().execution.qualityReleased).toBe(true);
    expect(deriveOperationsPlay(store()).nextAction.kind).not.toBe('quality');
    // The docked truck is no longer held, so it no longer costs demurrage.
    expect(store().costRates.demurrage).toBe(0);
    // The stage it moved is narrated, as a tick narrates one.
    expect(store().execution.stage).toBe('ready_to_load');
    expect(store().logbook.at(-1)?.message).toBe(
      'Released finished goods are ready at the shipping bay.'
    );
    // The next tick, finding the same stage, adds nothing more.
    const lines = store().logbook.length;
    tick(1, {
      shippingDocked: true,
      dispatchReleased: true,
      releasedFinishedKg: 2000,
      finishedAvailableKg: 2000,
    });
    expect(store().logbook).toHaveLength(lines);
  });

  it('names the contamination alert that still holds dispatch, as the next tick will', () => {
    const incident = isolate();
    useQCLabStore.setState((state) => ({
      qcLab: {
        ...state.qcLab,
        contaminationAlerts: [
          {
            id: 'alert-1',
            type: 'supplier_notification',
            severity: 'high',
            timestamp: new Date(0),
            sourceLotIds: ['lot-1'],
            batchIds: [],
            controlNote: '',
            resolved: false,
            resolution: null,
            resolvedAt: null,
          },
        ],
      },
    }));
    store().mitigateIncident(incident.id, 'operator');
    const play = deriveOperationsPlay(store());
    expect(play.nextAction.kind).toBe('quality');
    expect(play.nextAction.consequence).toBe('A contamination alert remains unresolved.');
    expect(store().costRates.demurrage).toBeGreaterThan(0);
  });

  it('keeps the hold, and the step, while the incident still isolates dispatch', () => {
    const incident = isolate();
    store().triggerIncident('severe_rain');
    store().mitigateIncident(store().incidents.at(-1)!.id, 'operator');
    expect(store().incidents.find((candidate) => candidate.id === incident.id)?.phase).toBe(
      'acknowledged'
    );
    expect(store().execution.dispatchLoad.blockCode).toBe('incidentDispatchIsolation');
    expect(store().execution.stage).toBe('quality_hold');
  });

  it('also lifts it when the incident is resolved', () => {
    const incident = isolate();
    store().resolveIncident(incident.id, 'operator');
    expect(deriveOperationsPlay(store()).nextAction.kind).not.toBe('quality');
  });
});

/*
 * The same paused gap from the QC lab: a contamination alert resolved (or a
 * failed batch recalled) while the shift is paused left the card reading
 * "Review the quality hold" because "A contamination alert remains
 * unresolved", and pricing the docked truck as held, until the clock ran.
 */
describe('a quality hold lifted in the QC lab while paused', () => {
  const alert = (resolved: boolean) => ({
    id: 'alert-1',
    type: 'supplier_notification',
    severity: 'high' as const,
    timestamp: new Date(0),
    sourceLotIds: ['lot-1'],
    batchIds: [],
    controlNote: '',
    resolved,
    resolution: resolved ? ('released' as const) : null,
    resolvedAt: resolved ? new Date(0) : null,
  });
  const hold = () => {
    useQCLabStore.setState((state) => ({
      qcLab: { ...state.qcLab, contaminationAlerts: [alert(false)] },
    }));
    useTruckScheduleStore.setState((state) => ({
      truckSchedule: {
        ...state.truckSchedule,
        shipping: { ...state.truckSchedule.shipping, truckDocked: true },
      },
    }));
    tick(1, {
      shippingDocked: true,
      dispatchReleased: false,
      releasedFinishedKg: 0,
      finishedAvailableKg: 2000,
      dispatchLoad: {
        cycleId: 'shipping-1',
        status: 'held',
        loadedKg: 0,
        capacityKg: 5000,
        materialType: 'flour',
        blockReason: 'A contamination alert remains unresolved.',
        blockCode: 'unresolvedContamination',
        lastDispatchKg: 0,
      },
    });
    expect(deriveOperationsPlay(store()).nextAction.kind).toBe('quality');
    expect(store().costRates.demurrage).toBeGreaterThan(0);
  };

  it('stops asking to review a hold that is no longer there', () => {
    hold();
    useQCLabStore.setState((state) => ({
      qcLab: { ...state.qcLab, contaminationAlerts: [alert(true)] },
    }));
    const play = deriveOperationsPlay(store());
    expect(play.nextAction.kind).not.toBe('quality');
    expect(store().execution.qualityReleased).toBe(true);
    expect(store().execution.dispatchLoad.blockCode).toBeNull();
    expect(store().costRates.demurrage).toBe(0);
  });

  it('names the hold that remains when another one still stands', () => {
    hold();
    useQCLabStore.setState((state) => ({
      qcLab: {
        ...state.qcLab,
        certificationStatus: 'expired',
        contaminationAlerts: [alert(true)],
      },
    }));
    const play = deriveOperationsPlay(store());
    expect(play.nextAction.kind).toBe('quality');
    expect(play.nextAction.consequence).toBe('Quality certification is expired.');
  });

  it('changes nothing while the hold still stands', () => {
    hold();
    const before = store().execution;
    useQCLabStore.setState((state) => ({ qcLab: { ...state.qcLab } }));
    expect(store().execution).toBe(before);
  });
});
