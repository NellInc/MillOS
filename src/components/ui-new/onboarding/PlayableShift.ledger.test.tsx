import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShiftDebrief } from './PlayableShift';
import { describeProposalRecord, proposalRecordOf } from '../../../simulation/shiftReview';
import type { PartnerProposal } from '../../../simulation/partnerProposals';
import { useUIStore } from '../../../stores/uiStore';
import {
  useOperationsCampaignStore,
  type CampaignTickContext,
} from '../../../stores/operationsCampaignStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import type { MaterialManifest, ProductionBatch } from '../../../stores/materialFlowStore';
import { setLocale } from '../../../i18n';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

// Phase 3 on screen and plan 7.6: the debrief, from reports the real
// tickCampaign wrote, states OEE and the margin per kilogram, the purchase
// lines, and the partner's compared proposals once each.

function shipment(id: string, kg: number): [MaterialManifest, ProductionBatch] {
  const batch: ProductionBatch = {
    id: `batch-${id}`,
    packerId: 'packer-0',
    materialType: 'flour',
    producedKg: kg,
    availableKg: 0,
    simulationTime: 10,
    sourceContributions: [{ lotId: 'lot-0001', amount: kg, path: ['silo-0', 'packer-0'] }],
    disposition: 'shipped',
    dispositionReason: 'Fully dispatched',
    qcTestIds: ['qc-1'],
    dispatchManifestIds: [id],
    sealed: true,
  };
  return [
    {
      id,
      kind: 'shipping',
      dock: 'shipping',
      requestedKg: kg,
      actualKg: kg,
      materials: [{ type: 'flour', amount: kg }],
      sourceLots: [{ lotId: 'lot-0001', amount: kg, path: ['silo-0', 'packer-0'] }],
      productBatches: [{ batchId: batch.id, amount: kg }],
      simulationTime: 20,
    },
    batch,
  ];
}

function context(overrides: Partial<CampaignTickContext> = {}): CampaignTickContext {
  return {
    shiftKey: 'day-0-morning',
    shiftLabel: 'Morning',
    manifests: [],
    productionBatches: [],
    totalEnergyKw: 450,
    averageQuality: 99,
    wasteKg: 0,
    storageUtilization: 0.5,
    shippingDocked: false,
    receivingDocked: false,
    dispatchReleased: true,
    sourceInventoryKg: 50000,
    finishedAvailableKg: 0,
    releasedFinishedKg: 0,
    dispatchLoad: {
      cycleId: 'shipping-0',
      status: 'away',
      loadedKg: 0,
      capacityKg: 5000,
      materialType: 'flour',
      blockReason: null,
      lastDispatchKg: 0,
    },
    openWorkOrders: 0,
    ...overrides,
  };
}
const tick = (minutes: number, overrides: Partial<CampaignTickContext> = {}) =>
  useOperationsCampaignStore.getState().tickCampaign(minutes * 60, context(overrides));

const OEE_TICK = { unitCount: 10, packedKg: 50, ratedKg: 50 };

/** A Morning with one 6 t delivery, OEE recorded every tick. */
function morning() {
  tick(240, { oee: OEE_TICK });
  const [manifest, batch] = shipment('shipping-0001', 6000);
  tick(1, { manifests: [manifest], productionBatches: [batch], oee: OEE_TICK });
  useOperationsCampaignStore.getState().bookPurchase({ grainCost: 440, partsCost: 25 });
  tick(1, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
}

const service = {
  id: 'proposal-1',
  kind: 'service',
  facts: { machineName: 'R.M. 102' },
  resolution: { optionId: 'service', decidedBy: 'partner', atMinute: 40, ran: true },
  comparison: {
    atMinute: 100,
    prices: [
      {
        id: 'service',
        price: {
          currency: 0,
          parts: { bearings: 1 },
          kg: 0,
          minutes: 45,
          quality: 99,
          gradeRisk: false,
        },
      },
      {
        id: 'run-on',
        price: {
          currency: 66.75,
          parts: { bearings: 1, belts: 1 },
          kg: 0,
          minutes: null,
          quality: 94,
          gradeRisk: true,
        },
      },
    ],
    chosenOptionId: 'service',
    bestOptionId: 'service',
  },
} as unknown as PartnerProposal;

beforeEach(() => {
  setLocale('en');
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useUIStore.setState(useUIStore.getInitialState(), true);
  useOperationsCampaignStore.getState().resetCampaign();
  useOperationsCampaignStore.getState().initializeCampaign();
  useGameSimulationStore.setState({ gameTime: 10 });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

describe('the debrief states OEE, the purchases and the proposals', () => {
  it('records OEE on the real tick and states it with the purchase lines, in both languages', () => {
    morning();
    const report = useOperationsCampaignStore.getState().reports.at(-1)!;
    expect(report.metrics.oee).toMatchObject({ unitMinutes: 2410, downUnitMinutes: 0 });
    render(<ShiftDebrief />);
    expect(
      screen.getByText(
        /^OEE 100\.0%: availability 100\.0% × performance 100\.0% × conforming 100\.0%\. Margin £/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /^Grain bought £440\.00; parts bought £25\.00; grain held as stock [+−]£[\d,]+\.\d\d\.$/
      )
    ).toBeInTheDocument();
    act(() => setLocale('pt-BR'));
    expect(
      screen.getByText(
        /^OEE 100,0%: disponibilidade 100,0% × desempenho 100,0% × conformidade 100,0%\. Margem de £/
      )
    ).toBeInTheDocument();
  });

  it("lists the partner's proposals once, with who decided and the comparison", () => {
    morning();
    const record = proposalRecordOf(service)!;
    const wording = { key: 'proposalRecord' as const, record };
    const text = describeProposalRecord(service, 'en')!;
    useOperationsCampaignStore.setState((state) => ({
      reports: state.reports.map((report, index, all) =>
        index === all.length - 1
          ? {
              ...report,
              proposals: [record],
              narration: [...(report.narration ?? []), text],
              narrationWording: [...(report.narrationWording ?? []), wording],
            }
          : report
      ),
    }));
    render(<ShiftDebrief />);
    expect(screen.getByRole('heading', { name: "The partner's proposals" })).toBeInTheDocument();
    expect(screen.getAllByText(text)).toHaveLength(1);
    expect(text).toMatch(/^The partner/);
  });
});
