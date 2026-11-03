/**
 * The Machine Inspector's maintenance log lists each service record's date,
 * notes and service unit. They were worded once, when the service was done,
 * so after a language switch every earlier record stayed in the old language
 * beside a translated panel. Working if a record reads in the current language
 * (decimal comma included), and a record saved before it carried its figures
 * keeps the text stored with it.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as production from '../productionStore';
import { useProductionStore } from '../productionStore';
import { useGameSimulationStore } from '../gameSimulationStore';
import { useBreakdownStore } from '../breakdownStore';
import { useUIStore } from '../uiStore';
import { setLocale } from '../../i18n';
import { MachineType, type MachineData, type MaintenanceRecord } from '../../types';

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

type RecordText = Pick<MaintenanceRecord, 'date' | 'notes' | 'serviceUnit'>;
/** The text the inspector shows: the store's reader when it has one, else the stored text. */
const shown = (record: MaintenanceRecord): RecordText => {
  const reader = (production as unknown as Record<string, unknown>).maintenanceRecordText as
    | ((r: MaintenanceRecord) => RecordText)
    | undefined;
  return reader
    ? reader(record)
    : { date: record.date, notes: record.notes, serviceUnit: record.serviceUnit };
};

describe('maintenance records follow the language', () => {
  let machines: MachineData[];
  let alerts: ReturnType<typeof useUIStore.getState>['alerts'];

  beforeEach(() => {
    setLocale('en');
    machines = useProductionStore.getState().machines;
    alerts = useUIStore.getState().alerts;
    useBreakdownStore.getState().resetBreakdownStore();
    useGameSimulationStore.getState().resetGameState();
    useGameSimulationStore.setState({ gameDay: 1, gameTime: 14 + 5 / 60 });
  });

  afterEach(() => {
    setLocale('en');
    useGameSimulationStore.getState().resetGameState();
    useProductionStore.setState({ machines });
    useUIStore.setState({ alerts });
  });

  it('re-words a routine service record after a switch to pt-BR', () => {
    useProductionStore.getState().setMachines([mill('lang-mill', 62.3)]);
    expect(useProductionStore.getState().performMaintenance('lang-mill').success).toBe(true);
    const record = useProductionStore.getState().machines[0].maintenanceHistory![0];
    expect(shown(record)).toEqual({
      date: 'Day 2, 14:05',
      notes: 'Wear reduced from 62.3% to 12.3%.',
      serviceUnit: 'Line maintenance',
    });

    setLocale('pt-BR');
    expect(shown(record)).toEqual({
      date: 'Dia 2, 14:05',
      notes: 'Desgaste reduzido de 62,3% para 12,3%.',
      serviceUnit: 'Manutenção de linha',
    });
  });

  it('keeps the stored text of a record saved without its figures', () => {
    const saved: MaintenanceRecord = {
      id: 'old',
      date: 'Day 1, 06:00',
      type: 'preventive',
      serviceUnit: 'Line maintenance',
      notes: 'Wear reduced from 40.0% to 0.0%.',
      duration: 0,
    };
    setLocale('pt-BR');
    expect(shown(saved)).toEqual({
      date: saved.date,
      notes: saved.notes,
      serviceUnit: saved.serviceUnit,
    });
  });
});
