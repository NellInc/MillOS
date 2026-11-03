/**
 * The bell keeps a Maintenance Complete notice (and the physical session
 * restores it), so its words must follow the language active when it is read,
 * decimal comma included, not the one it was filed in. Working if a notice
 * filed in English reads in Portuguese through alertText after a switch.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useProductionStore } from '../productionStore';
import { useGameSimulationStore } from '../gameSimulationStore';
import { useBreakdownStore } from '../breakdownStore';
import { useUIStore } from '../uiStore';
import { setLocale } from '../../i18n';
import { alertText } from '../../i18n/alertCopy';
import { MachineType, type MachineData } from '../../types';

const mill = (id: string, wear: number): MachineData => ({
  id,
  name: id,
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'running',
  metrics: { rpm: 0, temperature: 45, vibration: 1, load: 60, wear, efficiency: 80 },
  lastMaintenance: '',
  nextMaintenance: '',
});

describe('maintenance notice follows the language', () => {
  let machines: MachineData[];
  let alerts: ReturnType<typeof useUIStore.getState>['alerts'];

  beforeEach(() => {
    setLocale('en');
    machines = useProductionStore.getState().machines;
    alerts = useUIStore.getState().alerts;
    useUIStore.setState({ alerts: [] });
    useBreakdownStore.getState().resetBreakdownStore();
    useGameSimulationStore.getState().resetGameState();
  });

  afterEach(() => {
    setLocale('en');
    useGameSimulationStore.getState().resetGameState();
    useProductionStore.setState({ machines });
    useUIStore.setState({ alerts });
  });

  it('reads a wear-reducing service notice in pt-BR after a switch', () => {
    useProductionStore.getState().setMachines([mill('RM-LANG', 62.3)]);
    expect(useProductionStore.getState().performMaintenance('RM-LANG').success).toBe(true);
    const notice = useUIStore
      .getState()
      .alerts.find((a) => a.id.startsWith('maintenance-RM-LANG'))!;
    expect(alertText(notice).title).toBe('Maintenance Complete');
    expect(alertText(notice).message).toMatch(/Wear reduced by 50\.0%, now at 12\.3%/);

    setLocale('pt-BR');
    const text = alertText(notice);
    expect(text.title).toBe('Manutenção concluída');
    expect(text.message).toMatch(
      /^Manutenção feita em RM-LANG\. Desgaste reduzido em 50,0%, agora em 12,3%/
    );
  });

  it('reads a restored-to-service notice in pt-BR after a switch', () => {
    // A broken-down unit at zero wear: restored, nothing to reduce.
    useProductionStore.getState().setMachines([{ ...mill('RM-ZERO', 0), status: 'critical' }]);
    expect(useProductionStore.getState().performMaintenance('RM-ZERO').success).toBe(true);
    const notice = useUIStore
      .getState()
      .alerts.find((a) => a.id.startsWith('maintenance-RM-ZERO'))!;
    expect(alertText(notice).message).toMatch(/^RM-ZERO restored to service/);

    setLocale('pt-BR');
    expect(alertText(notice).message).toMatch(/^RM-ZERO voltou a operar\. Eficiência: \d+%/);
  });
});
