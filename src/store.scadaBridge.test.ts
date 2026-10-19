import { describe, expect, it } from 'vitest';
import { getTagById, OPERATION_TAG_IDS, VEHICLE_TAG_IDS } from './scada/tagDatabase';
import type { Alarm } from './scada/types';
import {
  buildOperationalTelemetry,
  formatAlarmMessage,
  selectSCADAAlarmsToAlert,
  storeOwnedLoad,
} from './store';
import { useBreakdownStore } from './stores/breakdownStore';
import { useMaterialFlowStore } from './stores/materialFlowStore';
import { useQCLabStore } from './stores/qcLabStore';

const alarm = (overrides: Partial<Alarm> = {}): Alarm => ({
  id: 'TRUCK_SHIPPING.PT001.PV-HIHI',
  tagId: 'TRUCK_SHIPPING.PT001.PV',
  tagName: 'Shipping Truck Articulation',
  type: 'HIHI',
  state: 'UNACK',
  priority: 'CRITICAL',
  value: 38.1,
  threshold: 38,
  timestamp: 1_000,
  lastOccurrenceAt: 1_000,
  occurrenceCount: 1,
  unit: 'deg',
  disposition: 'IN_SERVICE',
  ...overrides,
});

describe('selectSCADAAlarmsToAlert', () => {
  it('forwards a new occurrence once, so a dismissed or evicted alert stays gone', () => {
    const announced = new Set<string>();
    const first = alarm();

    expect(selectSCADAAlarmsToAlert([first], new Set(), announced)).toEqual([first]);
    // The presenter clicks X (or the 10-slot cap evicts it): the alert list no
    // longer holds it, but the alarm is still standing. It must not come back.
    expect(selectSCADAAlarmsToAlert([first], new Set(), announced)).toEqual([]);
    expect(selectSCADAAlarmsToAlert([{ ...first }], new Set(), announced)).toEqual([]);
  });

  it('alerts again on a genuine new occurrence of the same alarm', () => {
    const announced = new Set<string>();
    selectSCADAAlarmsToAlert([alarm()], new Set(), announced);

    // Condition clears while unacknowledged: RTN_UNACK is not forwarded.
    const returned = alarm({ state: 'RTN_UNACK' });
    expect(selectSCADAAlarmsToAlert([returned], new Set(), announced)).toEqual([]);

    // Next truck visit re-raises it in place: a new occurrence.
    const recurred = alarm({ occurrenceCount: 2, lastOccurrenceAt: 9_000 });
    expect(selectSCADAAlarmsToAlert([recurred], new Set(), announced)).toEqual([recurred]);
  });

  it('alerts again when an archived alarm is raised afresh', () => {
    const announced = new Set<string>();
    selectSCADAAlarmsToAlert([alarm()], new Set(), announced);
    // Acknowledged and cleared: archived, gone from the active list.
    selectSCADAAlarmsToAlert([], new Set(), announced);
    expect(announced.size).toBe(0);

    const fresh = alarm({ timestamp: 20_000, lastOccurrenceAt: 20_000 });
    expect(selectSCADAAlarmsToAlert([fresh], new Set(), announced)).toEqual([fresh]);
  });

  it('does not re-add an occurrence whose alert is already listed', () => {
    const announced = new Set<string>();
    const listed = new Set([`scada-${alarm().id}`]);
    expect(selectSCADAAlarmsToAlert([alarm()], listed, announced)).toEqual([]);
    // Dismissing it later must still stick.
    expect(selectSCADAAlarmsToAlert([alarm()], new Set(), announced)).toEqual([]);
  });

  it('skips non-annunciating alarms and forwards the rest of a burst on later notifies', () => {
    const announced = new Set<string>();
    const burst = Array.from({ length: 5 }, (_, i) =>
      alarm({ id: `TAG${i}-HI`, priority: 'HIGH' })
    );
    const ignored = [
      alarm({ id: 'LOW-HI', priority: 'MEDIUM' }),
      alarm({ id: 'ACK-HIHI', state: 'ACKED' }),
    ];

    expect(selectSCADAAlarmsToAlert([...ignored, ...burst], new Set(), announced)).toEqual(
      burst.slice(0, 3)
    );
    expect(selectSCADAAlarmsToAlert([...ignored, ...burst], new Set(), announced)).toEqual(
      burst.slice(3)
    );
  });
});

describe('formatAlarmMessage', () => {
  it('prints integer count tags without decimals and says the limit is inclusive', () => {
    const tag = getTagById(OPERATION_TAG_IDS.openWorkOrders)!;
    const message = formatAlarmMessage(
      alarm({
        id: `${tag.id}-HI`,
        tagId: tag.id,
        tagName: tag.name,
        type: 'HI',
        priority: 'HIGH',
        value: 1,
        threshold: 1,
        unit: tag.engUnit,
      })
    );
    expect(message).toBe(`${tag.name}: 1 ${tag.engUnit}, at or above the 1 ${tag.engUnit} limit`);
  });

  it('describes a boolean interlock as on or off instead of a fraction', () => {
    const tag = getTagById(OPERATION_TAG_IDS.shippingReleased)!;
    const message = formatAlarmMessage(
      alarm({
        id: `${tag.id}-LO`,
        tagId: tag.id,
        tagName: tag.name,
        type: 'LO',
        priority: 'HIGH',
        value: 0,
        threshold: 0.5,
        unit: tag.engUnit,
      })
    );
    expect(message).toBe(`${tag.name}: off, expected on`);
  });

  it('keeps one decimal for analogue tags', () => {
    expect(formatAlarmMessage(alarm())).toBe(
      'Shipping Truck Articulation: 38.1 deg, at or above the 38.0 deg limit'
    );
    expect(formatAlarmMessage(alarm({ type: 'LO', value: 7.95, threshold: 10, unit: 't' }))).toBe(
      'Shipping Truck Articulation: 8.0 t, at or below the 10.0 t limit'
    );
  });
});

describe('storeOwnedLoad', () => {
  const machine = (status: 'running' | 'idle' | 'warning' | 'critical', load: number) => ({
    status,
    metrics: { load },
  });

  it('holds the designed load at nominal pace instead of climbing to the clamp', () => {
    // Before: SCADA fed feed-derived load back into the store, and for RM-101
    // L' = 58.3 + 0.5 L converged on the 100% clamp within seconds.
    let load = 80;
    for (let i = 0; i < 120; i++) load = storeOwnedLoad(machine('running', load), 1);
    expect(load).toBeCloseTo(80, 5);

    load = 100;
    for (let i = 0; i < 120; i++) load = storeOwnedLoad(machine('running', load), 1);
    expect(load).toBeCloseTo(80, 1);
  });

  it('follows pace, idles to zero and holds a critical machine where it is', () => {
    expect(storeOwnedLoad(machine('running', 80), 0.5)).toBeCloseTo(80 + (65 - 80) * 0.1, 5);
    expect(storeOwnedLoad(machine('idle', 50), 1)).toBeCloseTo(45, 5);
    expect(storeOwnedLoad(machine('critical', 63), 1)).toBe(63);
    expect(storeOwnedLoad(machine('running', 70), 0)).toBe(70);
  });

  it('never returns a non-finite load', () => {
    expect(storeOwnedLoad(machine('running', Number.NaN), 1)).toBe(80);
  });
});

describe('vehicle Motion Phase tag range', () => {
  it('carries the unchocking and departure-ready codes without clamping', () => {
    const phaseTag = getTagById(VEHICLE_TAG_IDS['shipping-truck'].phase)!;
    for (const phase of ['dock-unlocking', 'unchocking', 'departure-ready']) {
      const telemetry = buildOperationalTelemetry(
        useMaterialFlowStore.getState(),
        useBreakdownStore.getState().partsInventory,
        useQCLabStore.getState().qcLab,
        [],
        [],
        [
          {
            id: 'shipping-truck',
            type: 'truck',
            speedMps: 0,
            steeringRadians: 0,
            phase,
            stopReason: 'docked',
            articulationRadians: 0,
            transferReady: false,
          },
        ]
      );
      const code = telemetry[VEHICLE_TAG_IDS['shipping-truck'].phase];
      expect(code).toBeGreaterThan(0);
      expect(code).toBeLessThanOrEqual(phaseTag.engHigh);
    }
  });
});
