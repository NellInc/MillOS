import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ChronicleOverview } from './ChronicleOverview';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useProductionStore } from '../../stores/productionStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { DEFAULT_CHARTER } from '../../chronicle/charter';
import { createInitialState, signCharter, type ChronicleState } from '../../chronicle/engine';
import type { ImprovementProgress } from '../../chronicle/types';
import { MachineType, type MachineData } from '../../types';
import { setLocale } from '../../i18n';

// Fix-up b (plan item 4c): the margin was read from the 99.5 ceiling, but a
// serviced line stamps 97.6 to 99.2 (the measured plant), so the card could
// show strong white green while its flour would not load. The margin reads the
// stamp the tick puts on flour now (productPathQuality of the line), and a
// recipe that only wear puts out of reach names servicing as its way back.
const baseline = { reportId: null, qcTestIds: [], challengeIds: [], orders: [] };

const meters: ImprovementProgress = {
  id: 'moisture-meters',
  phase: 'installed',
  contractorId: null,
  startedShift: 0,
  completesShift: 2,
  paidFund: 110,
  effectScale: 1,
  initiatedBy: 'player',
};

function wetYearWithMeters(): ChronicleState {
  const state = signCharter(createInitialState(), DEFAULT_CHARTER, 7, baseline).state;
  return {
    ...state,
    shift: 11,
    crop: { index: 1, kind: 'wet', treated: false },
    improvements: [meters],
  };
}

/** A product path whose units run at this efficiency: 99.5 - (100 - e) x 0.2. */
function line(efficiency: number): MachineData[] {
  return [MachineType.ROLLER_MILL, MachineType.PLANSIFTER, MachineType.PACKER].map(
    (type, i) =>
      ({
        id: `unit-${i}`,
        name: `Unit ${i}`,
        type,
        status: 'running',
        metrics: { efficiency, wear: 0 },
      }) as unknown as MachineData
  );
}

describe('the margin reads the line’s own stamp', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState(), quiz: null });
  });
  afterEach(() => {
    cleanup();
    useProductionStore.setState({ machines: [] });
    setLocale('en');
  });

  it('a worn line in a wet year with meters shows strong white short, and servicing as a way back', () => {
    // 99.5 - 8 x 0.2 = 97.9 on the line; the wet year takes 5, the meters give 1.
    useProductionStore.setState({ machines: line(92) });
    render(<ChronicleOverview state={wetYearWithMeters()} />);
    const crop = screen.getByRole('region', { name: 'Wet harvest' });
    expect(within(crop).getByText(/Strong white 93\.9 \/ 95/)).toBeInTheDocument();
    expect(within(crop).getByText(/To restore: service the line/)).toBeInTheDocument();
  });

  it('an unworn line reads the ceiling, as before', () => {
    useProductionStore.setState({ machines: line(100) });
    render(<ChronicleOverview state={wetYearWithMeters()} />);
    const crop = screen.getByRole('region', { name: 'Wet harvest' });
    expect(within(crop).getByText(/Strong white 95\.5 \/ 95/)).toBeInTheDocument();
  });

  it('never calls strong white out of reach while sound grain is in the silos', () => {
    // Under a charter each portion is stamped from its own grain (lotQuality.ts):
    // the line is milling wet lots, the silos hold sound ones.
    const flow = useMaterialFlowStore.getState();
    const lot = (id: string, moisturePct: number, fallingNumberS: number) =>
      [
        id,
        { ...flow.sourceLots.get(id), id, crop: { moisturePct, proteinPct: 12, fallingNumberS } },
      ] as const;
    const grain = (lotId: string) => ({
      type: 'wheat_grain',
      amount: 1000,
      sourceContributions: [{ lotId, amount: 1000 }],
    });
    useMaterialFlowStore.setState({
      machineBuffers: new Map([
        ['silo-x', { machineType: 'silo', inputBuffer: [], outputBuffer: [grain('lot-sound')] }],
        [
          'mill-x',
          { machineType: 'roller_mill', inputBuffer: [grain('lot-wet')], outputBuffer: [] },
        ],
      ]) as unknown as typeof flow.machineBuffers,
      network: { ...flow.network, segments: [] },
      sourceLots: new Map([
        lot('lot-sound', 13.2, 320),
        lot('lot-wet', 15.6, 260),
      ]) as unknown as typeof flow.sourceLots,
    });
    useProductionStore.setState({ machines: line(100) });
    const state = { ...wetYearWithMeters(), improvements: [] };
    render(<ChronicleOverview state={state} />);
    const crop = screen.getByRole('region', { name: 'Wet harvest' });
    expect(within(crop).getByText(/Strong white 94\.5 \/ 95/)).toBeInTheDocument();
    expect(within(crop).queryByText(/out of reach/)).toBeNull();
    expect(within(crop).getByText(/mill the grain in the silos/)).toBeInTheDocument();
    useMaterialFlowStore.setState({
      machineBuffers: flow.machineBuffers,
      network: flow.network,
      sourceLots: flow.sourceLots,
    });
  });

  it('names servicing in Brazilian Portuguese', () => {
    setLocale('pt-BR');
    useProductionStore.setState({ machines: line(92) });
    render(<ChronicleOverview state={wetYearWithMeters()} />);
    expect(screen.getAllByText(/93,9 \/ 95/).length).toBeGreaterThan(0);
    expect(screen.getByText(/fazer manutenção na linha/)).toBeInTheDocument();
  });
});
