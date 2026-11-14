import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MachineInspector } from '../sidebar/MachineInspector';
import { BatchGenealogySection } from '../panels/OverviewPanel';
import { MachineType, type MachineData } from '../../../types';
import { useProductionStore } from '../../../stores/productionStore';
import { useBreakdownStore } from '../../../stores/breakdownStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useMaterialFlowStore, type ProductionBatch } from '../../../stores/materialFlowStore';
import { useQCLabStore } from '../../../stores/qcLabStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { provideCrewAvailability } from '../../../simulation/workplaceCrew';
import { beginUnitService, resetUnitWork } from '../../../systems/unitService';
import { setLocale } from '../../../i18n';

// Plan item 5.4, the follow-up. Work that waits for a season member who is
// away showed no reason. Working if the service's own readout in the Inspector
// and the bench's readout in the Overview's lab say who is away and the game
// time they are back, in both languages.

const mill: MachineData = {
  id: 'rm-101',
  name: 'R.M. 101',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 1400, temperature: 50, vibration: 2, load: 74, wear: 70, efficiency: 73 },
  lastMaintenance: '2026-08-01',
  nextMaintenance: '2026-08-08',
};
const awaiting: ProductionBatch = {
  id: 'batch-00007',
  disposition: 'released',
  packerId: 'packer-0',
  materialType: 'flour',
  producedKg: 800,
  availableKg: 800,
  simulationTime: 1,
  sourceContributions: [{ lotId: 'lot-00001', amount: 800, path: ['silo-0', 'packer-0'] }],
  dispositionReason: null,
  qcTestIds: [],
  dispatchManifestIds: [],
  sealed: true,
  qualityScore: 96,
  awaitingTest: true,
};
/** The season has `role` away for six more game minutes; the clock reads Day 3, 08:00. */
const away = (role: 'quality' | 'maintenance') => {
  provideCrewAvailability((asked) => (asked === role ? 6 : 0));
  // The readout re-renders as the season's state changes.
  useWorkplaceStore.setState({ workplace: { ...useWorkplaceStore.getState().workplace } });
};

describe('who the waiting work waits for', () => {
  beforeEach(() => {
    resetUnitWork();
    useGameSimulationStore.setState({ gameDay: 2, gameTime: 8, emergencyActive: false });
    useProductionStore.setState({ machines: [mill] });
    useBreakdownStore.getState().resetBreakdownStore();
    useQCLabStore.getState().resetQCLab();
    useOperationsCampaignStore.getState().resetCampaign();
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
    provideCrewAvailability(null);
    resetUnitWork();
  });

  it.each([
    ['en', 'Service waits for Maintenance · back at Day 3, 08:06'],
    ['pt-BR', 'Manutenção à espera da equipe · volta em Dia 3, 08:06'],
  ] as const)('the Inspector names a service waiting for Maintenance (%s)', (locale, text) => {
    setLocale(locale);
    away('maintenance');
    expect(beginUnitService('rm-101')).toEqual({ started: false, reason: 'awaiting-crew' });
    render(<MachineInspector machine={mill} />);
    expect(screen.getByRole('button', { name: text })).toBeDisabled();
  });

  it.each([
    ['en', 'Service paused · Maintenance away, back at Day 3, 08:06'],
    ['pt-BR', 'Manutenção pausada · a equipe de Manutenção volta em Dia 3, 08:06'],
  ] as const)('the Inspector names a paused service (%s)', (locale, text) => {
    setLocale(locale);
    expect(beginUnitService('rm-101').started).toBe(true);
    away('maintenance');
    render(<MachineInspector machine={mill} />);
    expect(screen.getByRole('button', { name: text })).toBeInTheDocument();
  });

  it.each([
    ['en', 'Awaiting test · Quality away, back at Day 3, 08:06'],
    ['pt-BR', 'Aguardando teste · Qualidade ausente, volta em Dia 3, 08:06'],
  ] as const)('the lab names a test waiting for Quality (%s)', (locale, text) => {
    setLocale(locale);
    useMaterialFlowStore.setState({ productionBatches: [awaiting] });
    away('quality');
    render(<BatchGenealogySection />);
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
