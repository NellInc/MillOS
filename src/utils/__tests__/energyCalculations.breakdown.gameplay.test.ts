import { describe, expect, it } from 'vitest';
import { MachineType, type MachineData } from '../../types';
import { getMachineEnergy, getMachineEnergyByType } from '../energyCalculations';

const mill = (status: MachineData['status'], maintenanceCountdown?: number): MachineData => ({
  id: `rm-${status}`,
  name: `R.M. ${status}`,
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status,
  metrics: { rpm: 0, temperature: 40, vibration: 1, load: 80, wear: 100, efficiency: 40 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
  maintenanceCountdown,
});

// A breakdown stops the unit: productionStore freezes it, materialFlowStore
// stops it processing, and the per-type table counts it with the idle units.
describe('a broken-down machine is billed as the stopped unit it is', () => {
  it('draws standby demand, not 80% of running demand', () => {
    expect(getMachineEnergy(mill('critical'))).toBe(getMachineEnergy(mill('idle')));
  });

  it('takes no running maintenance penalty while stopped', () => {
    expect(getMachineEnergy(mill('critical', 0))).toBe(getMachineEnergy(mill('idle', 0)));
  });

  it('keeps a type row that counts it idle consistent with its idle demand', () => {
    const [row] = getMachineEnergyByType([mill('critical')]);
    expect(row.runningCount).toBe(0);
    expect(row.idleCount).toBe(1);
    expect(row.totalEnergy).toBe(row.nominalIdle);
  });
});
