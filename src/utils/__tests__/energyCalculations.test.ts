import { describe, expect, it } from 'vitest';
import { MachineType, type MachineData } from '../../types';
import {
  getEmergencyLoad,
  getFacilityBaseLoad,
  getMachineEnergy,
  getSiteDemandKw,
} from '../energyCalculations';

function makeMachine(
  overrides: Partial<Omit<MachineData, 'metrics'>> & { load?: number } = {}
): MachineData {
  const { load = 50, ...rest } = overrides;
  return {
    id: 'rm-101',
    name: 'R.M. 101',
    type: MachineType.ROLLER_MILL,
    position: [0, 0, 0],
    size: [2, 2, 2],
    rotation: 0,
    status: 'running',
    metrics: { rpm: 1200, temperature: 40, vibration: 1, load, wear: 10, efficiency: 95 },
    lastMaintenance: '2026-09-01',
    nextMaintenance: '2026-10-01',
    ...rest,
  };
}

describe('getMachineEnergy', () => {
  it('charges a warning machine the running load curve plus 10%', () => {
    for (const load of [10, 55, 100]) {
      const running = getMachineEnergy(makeMachine({ status: 'running', load }));
      const warning = getMachineEnergy(makeMachine({ status: 'warning', load }));
      expect(warning).toBeCloseTo(running * 1.1, 10);
    }
    // At the productionStore floor (load 10) a warning mill is not a +51% jump.
    expect(getMachineEnergy(makeMachine({ status: 'warning', load: 10 }))).toBeCloseTo(
      45 * 0.73 * 1.1,
      10
    );
  });

  it('exempts idle machines from the maintenance penalty', () => {
    const idle = getMachineEnergy(makeMachine({ status: 'idle', maintenanceCountdown: -5 }));
    expect(idle).toBe(2);
  });

  it('scales running demand with maintenance due-ness', () => {
    const base = getMachineEnergy(makeMachine({ load: 100 }));
    expect(base).toBeCloseTo(45, 10);
    expect(getMachineEnergy(makeMachine({ load: 100, maintenanceCountdown: 0 }))).toBeCloseTo(
      45 * 1.25,
      10
    );
    expect(getMachineEnergy(makeMachine({ load: 100, maintenanceCountdown: 12 }))).toBeCloseTo(
      45 * 1.15,
      10
    );
    expect(getMachineEnergy(makeMachine({ load: 100, maintenanceCountdown: 24 }))).toBeCloseTo(
      45,
      10
    );
  });

  it('never turns a non-finite load into a NaN demand', () => {
    for (const load of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      for (const status of ['running', 'warning'] as const) {
        expect(Number.isFinite(getMachineEnergy(makeMachine({ status, load })))).toBe(true);
      }
    }
  });
});

describe('getSiteDemandKw', () => {
  const line = [
    makeMachine({ id: 'rm-101', load: 80 }),
    makeMachine({ id: 'rm-102', load: 80 }),
    makeMachine({ id: 'ps-a', type: MachineType.PLANSIFTER, load: 80 }),
  ];

  it('bills machines plus facility load in normal operation', () => {
    const machines = line.reduce((sum, machine) => sum + getMachineEnergy(machine), 0);
    expect(getSiteDemandKw(line, 14, false)).toBeCloseTo(
      machines + getFacilityBaseLoad(14).total,
      10
    );
  });

  it('drops to the emergency load the dashboard shows during an emergency', () => {
    for (const hour of [0, 9, 14, 20]) {
      const emergency = getSiteDemandKw(line, hour, true);
      expect(emergency).toBe(getEmergencyLoad(getFacilityBaseLoad(hour)).total);
      expect(emergency).toBeLessThan(getSiteDemandKw(line, hour, false));
    }
  });
});

describe('getEmergencyLoad', () => {
  it('stays within the documented 42-53 kW band across the day', () => {
    for (let hour = 0; hour < 24; hour += 1) {
      const total = getEmergencyLoad(getFacilityBaseLoad(hour)).total;
      expect(total).toBeGreaterThanOrEqual(42);
      expect(total).toBeLessThanOrEqual(53);
    }
  });
});
