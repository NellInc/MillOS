import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineType, type MachineData } from '../../types';
import { useProductionStore } from '../../stores/productionStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { updateOfflineMachineMetrics } from './MachineSimulationController';

const silo = (wear: number): MachineData => ({
  id: 'silo-0',
  name: 'Silo Alpha',
  type: MachineType.SILO,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 0, temperature: 22, vibration: 1, load: 60, wear, efficiency: 80 },
  lastMaintenance: '2026-09-01',
  nextMaintenance: '2026-10-01',
});

describe('offline machine metrics and wear warnings', () => {
  let saved: MachineData[];
  beforeEach(() => {
    saved = useProductionStore.getState().machines;
  });
  afterEach(() => useProductionStore.setState({ machines: saved }));

  it('keeps a wear warning while wear stays above the warning threshold', () => {
    // A cool, quiet silo used to be flipped back to running every two seconds,
    // and the wear tick then re-raised the warning and its predictive alert.
    useProductionStore.setState({ machines: [silo(75)], productionSpeed: 1 });
    updateOfflineMachineMetrics();
    expect(useProductionStore.getState().machines[0].status).toBe('warning');
  });

  it('still clears a metric-only warning once temperature and vibration settle', () => {
    useProductionStore.setState({ machines: [silo(10)], productionSpeed: 1 });
    updateOfflineMachineMetrics();
    expect(useProductionStore.getState().machines[0].status).toBe('running');
  });
});

// A dust-filter pressure incident warns its sifter until it is mitigated; the
// offline cool-off cleared it within two seconds, so the warning barely showed.
describe('offline machine metrics and incident warnings', () => {
  let saved: MachineData[];
  beforeEach(() => {
    saved = useProductionStore.getState().machines;
    useOperationsCampaignStore.getState().resetCampaign();
  });
  afterEach(() => {
    useProductionStore.setState({ machines: saved });
    useOperationsCampaignStore.getState().resetCampaign();
  });

  it('keeps an open incident warning on a cool, quiet sifter', () => {
    const sifter: MachineData = {
      ...silo(10),
      id: 'sifter-b',
      name: 'Plansifter B',
      type: MachineType.PLANSIFTER,
    };
    useProductionStore.setState({ machines: [sifter], productionSpeed: 1 });
    useOperationsCampaignStore.getState().triggerIncident('dust_filter_pressure');
    updateOfflineMachineMetrics();
    expect(useProductionStore.getState().machines[0].status).toBe('warning');
  });
});

describe('offline machine metrics never lift a breakdown', () => {
  let saved: MachineData[];
  let savedBreakdowns: ReturnType<typeof useBreakdownStore.getState>['activeBreakdowns'];
  beforeEach(() => {
    saved = useProductionStore.getState().machines;
    savedBreakdowns = useBreakdownStore.getState().activeBreakdowns;
  });
  afterEach(() => {
    useProductionStore.setState({ machines: saved });
    useBreakdownStore.setState({ activeBreakdowns: savedBreakdowns });
  });

  it('keeps a worn-out silo critical even though it runs cool and quiet', () => {
    // A silo runs at ~36 C and ~1.2 mm/s, below the 40 C / 2 mm/s cool-down
    // gate, so the first offline update after a wear breakdown restarted it.
    const broken: MachineData = {
      ...silo(96),
      status: 'critical',
      metrics: { rpm: 0, temperature: 36, vibration: 1.2, load: 80, wear: 96, efficiency: 0 },
    };
    useProductionStore.setState({ machines: [broken], productionSpeed: 1 });
    updateOfflineMachineMetrics();
    expect(useProductionStore.getState().machines[0].status).toBe('critical');
  });

  it('keeps a machine with an open breakdown critical however cool it is', () => {
    // A bearing overheat can trip an idle, cold mill at low wear.
    const mill: MachineData = {
      ...silo(5),
      id: 'rm-101',
      name: 'R.M. 101',
      type: MachineType.ROLLER_MILL,
      status: 'critical',
      metrics: { rpm: 0, temperature: 20, vibration: 0.2, load: 0, wear: 5, efficiency: 100 },
    };
    useProductionStore.setState({ machines: [mill], productionSpeed: 1 });
    useBreakdownStore.getState().triggerBreakdown('rm-101', 'R.M. 101', 'overheating');
    updateOfflineMachineMetrics();
    expect(useProductionStore.getState().machines[0].status).toBe('critical');
  });
});
