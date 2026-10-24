import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { MachineType, type MachineData } from '../../types';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { deriveOperationsPlay } from '../../simulation/operationsPlay';
import type { TickContext } from '../CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';

const context: TickContext = {
  deltaSeconds: 0.5,
  gameTime: 0,
  gameSpeed: 1,
  elapsedTime: 0,
  tickCount: 1,
};

const wornPacker: MachineData = {
  id: 'packer-0',
  name: 'Pack Line 1',
  type: MachineType.PACKER,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 60, temperature: 30, vibration: 1, load: 85, wear: 89, efficiency: 61 },
  lastMaintenance: '2026-08-01',
  nextMaintenance: '2026-08-08',
};

describe('a wear breakdown is surfaced with a route to the repair', () => {
  beforeEach(() => {
    resetUnifiedTickState();
    useBreakdownStore.getState().resetBreakdownStore();
    useMaterialFlowStore.getState().resetMaterialFlow();
    useOperationsCampaignStore.getState().resetCampaign();
    useProductionStore.setState({ machines: [wornPacker], productionSpeed: 1 });
    useUIStore.setState({ alerts: [] });
  });

  it('names the stopped machine on the shift card and makes the repair the next action', () => {
    unifiedGameTick(context);
    expect(useProductionStore.getState().machines[0].status).toBe('critical');
    // The work order opens after this tick's campaign pass; the next one reads it.
    unifiedGameTick({ ...context, tickCount: 2 });

    const campaign = useOperationsCampaignStore.getState();
    const queue = campaign.constraints.find((c) => c.id === 'maintenance-queue');
    // One open work order is a stopped machine, not background information.
    expect(queue?.severity).toBe('warning');
    expect(queue?.detail).toContain('Pack Line 1');
    expect(queue?.detail).toContain('Maintenance');
    expect(queue?.relatedId).toBe('packer-0');

    const play = deriveOperationsPlay(campaign);
    expect(play.blockers.map((c) => c.id)).toContain('maintenance-queue');
    expect(play.nextAction.kind).toBe('repair');
    expect(play.nextAction.targetId).toBe('packer-0');

    const alert = useUIStore.getState().alerts.find((a) => a.id.startsWith('breakdown-'));
    expect(alert?.message).toContain('Mill Overview');
    expect(alert?.message).toContain('£90.00 per game hour');
    expect(alert?.message).toContain('Maintenance');
    // Read to screen readers from the bell, not only through the mutable PA.
    expect(alert?.announce).toBe('assertive');
  });

  it('returns the card to ordinary production once the machine is back in service', () => {
    unifiedGameTick(context);
    const breakdownId = useBreakdownStore.getState().activeBreakdowns[0].id;
    const maintenance = useBreakdownStore.getState();
    maintenance.startRepair(breakdownId);
    maintenance.updateRepairProgress(breakdownId, 100);
    maintenance.verifyRepair(breakdownId);
    maintenance.requestMachineRestart(breakdownId);
    unifiedGameTick({ ...context, tickCount: 2 });
    unifiedGameTick({ ...context, tickCount: 3 });
    const campaign = useOperationsCampaignStore.getState();
    expect(campaign.constraints.some((c) => c.id === 'maintenance-queue')).toBe(false);
    expect(deriveOperationsPlay(campaign).nextAction.kind).not.toBe('repair');
  });

  describe('names the machine type in words, never the enum', () => {
    afterEach(() => setLocale('en'));

    it('reads "(packer)" in English', () => {
      unifiedGameTick(context);
      const alert = useUIStore.getState().alerts.find((a) => a.id.startsWith('breakdown-'));
      expect(alert?.message).toContain('Pack Line 1 (packer) has broken down');
      expect(alert?.message).not.toContain('PACKER');
    });

    it('reads "(ensacadeira)" in Portuguese', () => {
      setLocale('pt-BR');
      unifiedGameTick(context);
      const alert = useUIStore.getState().alerts.find((a) => a.id.startsWith('breakdown-'));
      expect(alert?.message).toContain('Pack Line 1 (ensacadeira) entrou em pane');
    });
  });
});
