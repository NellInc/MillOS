import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useProductionStore } from '../../stores/productionStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useUIStore } from '../../stores/uiStore';
import { mockMachines } from '../../test/fixtures/mockMachines';
import type { TickContext } from '../CentralTickSystem';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import { alertText } from '../../i18n/alertCopy';
import { setLocale } from '../../i18n';
import { dispositionReasonText } from '../../components/ui-new/panels/OverviewPanel';

const context: TickContext = {
  deltaSeconds: 0.5,
  gameTime: 0,
  gameSpeed: 1,
  elapsedTime: 0,
  tickCount: 1,
};

const sifterStatus = () =>
  useProductionStore.getState().machines.find((m) => m.id === 'sifter-b')?.status;

function setSifter(status: 'running' | 'idle' | 'critical') {
  useProductionStore
    .getState()
    .setMachines(
      mockMachines.map((m) =>
        m.id === 'sifter-b'
          ? { ...m, status, metrics: { ...m.metrics, wear: 10, efficiency: 98 } }
          : { ...m }
      )
    );
}

// A dust-filter pressure incident (raised by a recovery challenge or a Chronicle
// forecast) warns on its sifter. 'warning' is a running state, so writing it
// over a stopped or broken-down sifter started that sifter.
// Working if the incident warns a running sifter and leaves a stopped or
// locked-out one as it was.
describe('campaign incident consequences respect machine state', () => {
  beforeEach(() => {
    resetUnifiedTickState();
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useOperationsCampaignStore.getState().resetCampaign();
    useTruckScheduleStore.getState().resetTruckSchedule();
    useMaterialFlowStore.getState().resetMaterialFlow();
    useBreakdownStore.getState().resetBreakdownStore();
    useQCLabStore.getState().resetQCLab();
    useUIStore.setState({ alerts: [] });
  });
  afterEach(() => {
    useGameSimulationStore.getState().resetGameState();
    useSafetyStore.getState().setForkliftEmergencyStop(false);
    useProductionStore.getState().setMachines([]);
  });

  // The tick holds stock for a supplier contamination incident with a canned
  // note; Batch Genealogy reads the hold reason through its key.
  // Working if the reason follows a switch to pt-BR.
  it('files the supplier contamination hold note by key', () => {
    useMaterialFlowStore.getState().tickMaterialFlow(1, 1);
    useOperationsCampaignStore.getState().triggerIncident('supplier_contamination');
    unifiedGameTick(context);
    const held = useMaterialFlowStore
      .getState()
      .productionBatches.find((batch) => batch.disposition === 'hold');
    expect(held).toBeDefined();
    setLocale('pt-BR');
    try {
      expect(dispositionReasonText(held!.dispositionReason!, held!.dispositionReasonKey)).toContain(
        'A notificação do fornecedor exige revisão de rastreabilidade'
      );
    } finally {
      setLocale('en');
    }
  });

  it('warns a running sifter', () => {
    setSifter('running');
    useOperationsCampaignStore.getState().triggerIncident('dust_filter_pressure');
    unifiedGameTick(context);
    expect(sifterStatus()).toBe('warning');
  });

  // With SCADA on (the default) nothing but maintenance lifted the incident's
  // warning; with it off the cool-off cleared it within seconds. Working if the
  // warning lasts until the incident is mitigated, then clears, in either mode.
  it('clears the incident warning once the incident is mitigated', () => {
    setSifter('running');
    useProductionStore
      .getState()
      .updateMachineMetrics('sifter-b', { temperature: 40, vibration: 1 });
    const incident = useOperationsCampaignStore.getState().triggerIncident('dust_filter_pressure');
    unifiedGameTick(context);
    expect(sifterStatus()).toBe('warning');
    unifiedGameTick(context);
    expect(sifterStatus()).toBe('warning');
    useOperationsCampaignStore.getState().acknowledgeIncident(incident!.id);
    useOperationsCampaignStore.getState().mitigateIncident(incident!.id);
    unifiedGameTick(context);
    expect(sifterStatus()).toBe('running');
  });

  it('does not start a sifter that is locked out for repair', () => {
    setSifter('critical');
    useBreakdownStore.getState().triggerBreakdown('sifter-b', 'Plansifter B', 'vibration_failure');
    useOperationsCampaignStore.getState().triggerIncident('dust_filter_pressure');
    unifiedGameTick(context);
    expect(sifterStatus()).toBe('critical');
  });

  it('does not start a sifter held by a facility stop, and the stop restores it', () => {
    setSifter('running');
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    expect(sifterStatus()).toBe('idle');
    useOperationsCampaignStore.getState().triggerIncident('dust_filter_pressure');
    unifiedGameTick(context);
    expect(sifterStatus()).toBe('idle');
    useGameSimulationStore.getState().resolveEmergency();
    expect(sifterStatus()).toBe('running');
  });

  // A repaired machine's queued restart must wait out a facility stop: the
  // stop idles everything and its release restores only what it idled.
  // Working if the restart stays queued through the stop and applies after it.
  it('holds a queued repair restart until the facility stop clears', () => {
    setSifter('critical');
    const breakdowns = useBreakdownStore.getState();
    const breakdown = breakdowns.triggerBreakdown('sifter-b', 'Plansifter B', 'vibration_failure')!;
    useBreakdownStore.getState().startRepair(breakdown.id);
    useBreakdownStore.getState().updateRepairProgress(breakdown.id, 100);
    useBreakdownStore.getState().verifyRepair(breakdown.id);
    useBreakdownStore.getState().requestMachineRestart(breakdown.id);
    useGameSimulationStore.getState().triggerEmergency('E-STOP');

    unifiedGameTick(context);
    expect(useGameSimulationStore.getState().emergencyActive).toBe(true);
    expect(sifterStatus()).not.toBe('running');

    useGameSimulationStore.getState().resolveEmergency();
    unifiedGameTick({ ...context, tickCount: 2 });
    expect(sifterStatus()).toBe('running');
  });

  // 'Days safe' (Overview, mobile) only ever reset: nothing live counted days.
  it('counts a safe day at each day rollover', () => {
    useSafetyStore.setState((s) => ({
      safetyMetrics: { ...s.safetyMetrics, daysSinceIncident: 0 },
    }));
    useGameSimulationStore.setState({ gameTime: 23.9999, gameDay: 3 });
    unifiedGameTick({ ...context, gameSpeed: 60 });
    expect(useGameSimulationStore.getState().gameDay).toBe(4);
    expect(useSafetyStore.getState().safetyMetrics.daysSinceIncident).toBe(1);
  });
});

// The tick filed its incident, breakdown and wear notices as text only, so the
// bell (which a reload restores) kept them in the filing language. Working if
// each reads in Portuguese after a switch, the breakdown's cost with a comma.
describe('the tick files its bell notices with keys', () => {
  beforeEach(() => {
    resetUnifiedTickState();
    useGameSimulationStore.getState().resetGameState();
    useOperationsCampaignStore.getState().resetCampaign();
    useBreakdownStore.getState().resetBreakdownStore();
    useUIStore.setState({ alerts: [] });
    setLocale('en');
  });
  afterEach(() => {
    setLocale('en');
    useProductionStore.getState().setMachines([]);
    useUIStore.setState({ alerts: [] });
  });

  const portuguese = (idPrefix: string) => {
    const notice = useUIStore.getState().alerts.find((a) => a.id.startsWith(idPrefix));
    expect(notice).toBeDefined();
    setLocale('pt-BR');
    const text = alertText(notice!);
    setLocale('en');
    return { notice: notice!, text };
  };

  it('keys the incident notice', () => {
    setSifter('running');
    useOperationsCampaignStore.getState().triggerIncident('dust_filter_pressure');
    unifiedGameTick(context);
    const { notice, text } = portuguese('campaign-');
    expect(text.title).not.toBe(notice.title);
  });

  it('keys the breakdown notice, formatting its cost in the active language', () => {
    useProductionStore
      .getState()
      .setMachines(
        mockMachines.map((m) =>
          m.id === 'sifter-b'
            ? { ...m, status: 'running' as const, metrics: { ...m.metrics, wear: 99.9 } }
            : { ...m }
        )
      );
    unifiedGameTick(context);
    const { notice, text } = portuguese('breakdown-');
    expect(text.title).not.toBe(notice.title);
    expect(text.message).toMatch(/£\d+,\d{2}/);
  });

  it('keys the wear warning notice', () => {
    useProductionStore
      .getState()
      .setMachines(
        mockMachines.map((m) =>
          m.id === 'sifter-b'
            ? { ...m, status: 'running' as const, metrics: { ...m.metrics, wear: 64.999 } }
            : { ...m }
        )
      );
    for (let i = 0; i < 40; i++) unifiedGameTick({ ...context, tickCount: i + 2 });
    const { notice, text } = portuguese('wear-warning-');
    expect(text.title).not.toBe(notice.title);
  });
});
