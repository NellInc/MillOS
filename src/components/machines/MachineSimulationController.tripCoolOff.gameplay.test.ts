/**
 * Offline, a metric-only trip (a unit tripped 'critical' on temperature or
 * vibration, with no breakdown and wear under its breakdown line) is meant to
 * cool off and come back. The model drove a tripped unit toward its base
 * temperature + 40 C and 7 mm/s, while the lift needed under 40 C and under
 * 2 mm/s, so no machine type could ever leave 'critical' that way. Working if
 * every type's metric-only trip cools toward a stopped unit's readings and
 * lifts once back within a margin of its own base temperature, while a wear
 * breakdown keeps its hot signature and stays down for maintenance.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineType, type MachineData } from '../../types';
import { getWearConfig, useProductionStore } from '../../stores/productionStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { updateOfflineMachineMetrics } from './MachineSimulationController';

const tripped = (type: MachineType, wear = 5): MachineData => ({
  id: `unit-${type}`,
  name: type,
  type,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'critical',
  metrics: { rpm: 0, temperature: 85, vibration: 8.5, load: 80, wear, efficiency: 90 },
  lastMaintenance: '',
  nextMaintenance: '',
});

const TYPES = [
  MachineType.SILO,
  MachineType.ROLLER_MILL,
  MachineType.PLANSIFTER,
  MachineType.PACKER,
  MachineType.CONTROL_ROOM,
];

describe('offline cool-off of a metric-only trip', () => {
  let saved: MachineData[];
  beforeEach(() => {
    saved = useProductionStore.getState().machines;
    useBreakdownStore.getState().resetBreakdownStore();
    useGameSimulationStore.getState().resetGameState();
    useMaterialFlowStore.getState().resetMaterialFlow();
  });
  afterEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useProductionStore.setState({ machines: saved });
  });

  it.each(TYPES)('a tripped %s cools off and leaves critical', (type) => {
    useProductionStore.setState({ machines: [tripped(type)], productionSpeed: 1 });
    // Twenty plant minutes.
    for (let i = 0; i < 600; i++) updateOfflineMachineMetrics(2);
    const unit = useProductionStore.getState().machines[0];
    expect(
      unit.status,
      `${type}: ${unit.metrics.temperature} C, ${unit.metrics.vibration} mm/s`
    ).not.toBe('critical');
  });

  it('a wear breakdown keeps its hot signature and stays critical for maintenance', () => {
    const wear = getWearConfig(MachineType.ROLLER_MILL).breakdownThreshold;
    useProductionStore.setState({
      machines: [tripped(MachineType.ROLLER_MILL, wear)],
      productionSpeed: 1,
    });
    for (let i = 0; i < 600; i++) updateOfflineMachineMetrics(2);
    const unit = useProductionStore.getState().machines[0];
    expect(unit.status).toBe('critical');
    expect(unit.metrics.temperature).toBeGreaterThan(75);
    expect(unit.metrics.vibration).toBeGreaterThan(6);
  });
});
