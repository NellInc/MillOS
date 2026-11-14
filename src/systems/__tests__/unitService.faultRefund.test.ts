import { beforeEach, describe, expect, it } from 'vitest';
import { MachineType, type MachineData } from '../../types';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { getWearConfig, useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import type { TickContext } from '../CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import { beginUnitService, unitInService } from '../unitService';
import { machineInspectorMessages } from '../../components/ui-new/sidebar/MachineInspector.messages';
import { translate } from '../../i18n';

// Plan wave 3c: a service takes its part when it starts. A fault that ends the
// service before its minutes have run leaves the unit unserviced, so the part
// was never fitted: it goes back to stock, and the bell says so. Working if a
// fault mid-service returns exactly the part taken, and the Maintain button's
// cost line says so in both languages.

const tick = (gameSeconds: number, n = 1): void => {
  for (let i = 0; i < n; i++)
    unifiedGameTick({
      deltaSeconds: 0.5,
      gameTime: useGameSimulationStore.getState().gameTime,
      gameSpeed: gameSeconds / 0.5,
      elapsedTime: 0,
      tickCount: i + 1,
    } satisfies TickContext);
};

const mill = (overrides: Partial<MachineData> = {}): MachineData => ({
  id: 'rm-101',
  name: 'R.M. 101',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 1400, temperature: 50, vibration: 2, load: 74, wear: 70, efficiency: 73 },
  lastMaintenance: '2026-08-01T00:00:00.000Z',
  nextMaintenance: '2026-08-08T00:00:00.000Z',
  ...overrides,
});
const unit = () => useProductionStore.getState().machines.find((m) => m.id === 'rm-101')!;

describe('a fault that ends a service returns its part', () => {
  beforeEach(() => {
    resetUnifiedTickState();
    useGameSimulationStore.getState().resetGameState();
    useBreakdownStore.getState().resetBreakdownStore();
    useMaterialFlowStore.getState().resetMaterialFlow();
    useOperationsCampaignStore.getState().resetCampaign();
    useProductionStore.setState({ machines: [mill()], productionSpeed: 1 });
    useUIStore.setState({ alerts: [] });
  });

  it('puts the part back in stock and rings the bell when a fault ends the service', () => {
    const before = { ...useBreakdownStore.getState().partsInventory };
    const result = beginUnitService('rm-101');
    expect(result).toMatchObject({ started: true, part: 'filters' });
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(before.filters - 1);

    tick(60, 10);
    expect(unitInService('rm-101')).toBe(true);

    // An electrical fault holds no filter, so the stock reads exactly.
    useBreakdownStore.getState().triggerBreakdown('rm-101', 'R.M. 101', 'electrical');
    tick(60);

    expect(unitInService('rm-101')).toBe(false);
    // Never serviced: the wear the service would have cleared is still there.
    expect(unit().metrics.wear).toBeGreaterThanOrEqual(70);
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(before.filters);
    const closed = useBreakdownStore
      .getState()
      .maintenanceSchedule.find((task) => task.machineId === 'rm-101');
    expect(closed?.completed).toBe(true);
    expect(closed?.servicePartUsed).toBeUndefined();

    const notice = useUIStore
      .getState()
      .alerts.find((alert) => alert.id.startsWith('service-ended-rm-101'));
    expect(notice?.title).toBe('Service ended by a fault');
    expect(notice?.message).toBe(
      'R.M. 101 faulted during its service. Its spare part (filters) went back to stock; the repair takes over.'
    );
    expect(notice?.copy?.catalog).toBe('machine-inspector');
    expect(
      machineInspectorMessages['pt-BR'].serviceEndedByFaultMessage({
        name: 'R.M. 101',
        part: 'filters',
      })
    ).toBe(
      'R.M. 101 falhou durante a manutenção. A peça de reposição (filtros) voltou ao estoque; o reparo assume.'
    );
  });

  it('a service that runs its minutes keeps its part spent', () => {
    const filters = useBreakdownStore.getState().partsInventory.filters;
    expect(beginUnitService('rm-101').started).toBe(true);
    tick(60, getWearConfig(MachineType.ROLLER_MILL).serviceMinutes);
    expect(unitInService('rm-101')).toBe(false);
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(filters - 1);
    expect(useUIStore.getState().alerts.some((a) => a.id.startsWith('service-ended-'))).toBe(false);
  });

  it("says on the Maintain button's cost line what a fault does to the part, in both languages", () => {
    const en = translate(machineInspectorMessages, 'maintenanceCost', {
      part: 'filters',
      count: '11',
    });
    expect(en).toBe(
      'Uses 1 spare part: filters (11 in stock), returned if a fault ends the service.'
    );
    const held = translate(machineInspectorMessages, 'maintenanceCostHeld', {
      part: 'filters',
      count: '11',
      held: '2',
    });
    expect(held).toMatch(/returned if a fault ends the service\.$/);
    const pt = machineInspectorMessages['pt-BR'].maintenanceCost({ part: 'filters', count: '11' });
    expect(pt).toBe(
      'Usa 1 peça de reposição: filtros (11 em estoque), devolvida se uma falha interromper a manutenção.'
    );
    expect(
      machineInspectorMessages['pt-BR'].maintenanceCostHeld({
        part: 'filters',
        count: '11',
        held: '2',
      })
    ).toMatch(/devolvida se uma falha interromper a manutenção\.$/);
  });
});
