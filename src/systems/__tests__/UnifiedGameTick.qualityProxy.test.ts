import { beforeEach, describe, expect, it } from 'vitest';
import { MachineType, type MachineData } from '../../types';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import {
  calculateEfficiency,
  getWearConfig,
  useProductionStore,
} from '../../stores/productionStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useUIStore } from '../../stores/uiStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import type { TickContext } from '../CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';

const context: TickContext = {
  deltaSeconds: 0.5,
  gameTime: 0,
  gameSpeed: 1,
  elapsedTime: 0,
  tickCount: 1,
};

const unit = (id: string, type: MachineType, wear = 0): MachineData => ({
  id,
  name: id,
  type,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: {
    rpm: 100,
    temperature: 30,
    vibration: 1,
    load: 75,
    wear,
    efficiency: calculateEfficiency(wear, type),
  },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
});

/** The live roster: five silos, four mills, three sifters, three packers. */
function plant(wearFor: (type: MachineType) => number = () => 0): MachineData[] {
  const of = (type: MachineType, ids: string[]) => ids.map((id) => unit(id, type, wearFor(type)));
  return [
    ...of(MachineType.SILO, ['silo-0', 'silo-1', 'silo-2', 'silo-3', 'silo-4']),
    ...of(MachineType.ROLLER_MILL, ['rm-101', 'rm-102', 'rm-103', 'rm-104']),
    ...of(MachineType.PLANSIFTER, ['sifter-a', 'sifter-b', 'sifter-c']),
    ...of(MachineType.PACKER, ['packer-0', 'packer-1', 'packer-2']),
  ];
}

const quality = () => useProductionStore.getState().metrics.quality;

describe('product quality follows the running product path', () => {
  beforeEach(() => {
    resetUnifiedTickState();
    useBreakdownStore.getState().resetBreakdownStore();
    useMaterialFlowStore.getState().resetMaterialFlow();
    useOperationsCampaignStore.getState().resetCampaign();
    useQCLabStore.getState().resetQCLab();
    useUIStore.setState({ alerts: [] });
    useProductionStore.setState({ machines: plant(), productionSpeed: 1 });
  });

  it('does not fail Strong White because one stopped mill reads 0% efficiency', () => {
    useProductionStore.setState({
      machines: plant().map((m) =>
        m.id === 'rm-101'
          ? { ...m, status: 'critical', metrics: { ...m.metrics, wear: 90, efficiency: 0 } }
          : m
      ),
    });
    unifiedGameTick(context);
    expect(quality()).toBeGreaterThanOrEqual(95);
  });

  it('keeps a plant short of its first warnings above the Strong White minimum', () => {
    useProductionStore.setState({
      machines: plant((type) => getWearConfig(type).warningThreshold - 1),
    });
    unifiedGameTick(context);
    expect(quality()).toBeGreaterThanOrEqual(95);
  });

  it('still lets heavy wear on the whole line drag quality under the minimum', () => {
    useProductionStore.setState({
      machines: plant((type) => getWearConfig(type).breakdownThreshold - 1),
    });
    unifiedGameTick(context);
    expect(quality()).toBeLessThan(95);
  });

  it('is not pinned at 100 by one passing lab test', () => {
    useQCLabStore.getState().completeQCTest({
      machineId: 'packer-0',
      grade: 'A',
      moistureContent: 13,
      proteinLevel: 12,
      ashContent: 0.5,
      particleSize: 120,
      passed: true,
    });
    useProductionStore.setState({
      machines: plant((type) => getWearConfig(type).breakdownThreshold - 1),
    });
    unifiedGameTick(context);
    expect(quality()).toBeLessThan(95);
  });

  it('stamps each packed batch with the quality it was made at', () => {
    useProductionStore.setState({
      machines: plant((type) => getWearConfig(type).breakdownThreshold - 1),
    });
    unifiedGameTick({ ...context, deltaSeconds: 1, gameSpeed: 120 });
    const batches = useMaterialFlowStore.getState().productionBatches;
    expect(batches.length).toBeGreaterThan(0);
    for (const batch of batches) expect(batch.qualityScore).toBeCloseTo(quality(), 1);
  });
});
