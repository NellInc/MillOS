import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShiftDebrief } from './PlayableShift';
import { useUIStore } from '../../../stores/uiStore';
import {
  useOperationsCampaignStore,
  type CampaignTickContext,
} from '../../../stores/operationsCampaignStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import type { MaterialManifest, ProductionBatch } from '../../../stores/materialFlowStore';
import { setLocale } from '../../../i18n';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

// The debrief rendered from reports the real tickCampaign wrote.

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

/** A Morning in which the bakery order arrives ten minutes late. */
function lateMorning() {
  tick(249);
  const [manifest, batch] = shipment('shipping-0001', 6000);
  tick(1, { manifests: [manifest], productionBatches: [batch] });
  tick(1, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
}

beforeEach(() => {
  setLocale('en');
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useUIStore.setState(useUIStore.getInitialState(), true);
  useOperationsCampaignStore.getState().resetCampaign();
  useOperationsCampaignStore.getState().initializeCampaign();
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

describe('shift debrief', () => {
  it('says which orders were on time, what held the grade back and what to try next', () => {
    lateMorning();
    render(<ShiftDebrief />);
    expect(screen.getByRole('heading', { name: 'Morning: grade B' })).toBeInTheDocument();
    expect(
      screen.getByText("Riverside Bakers' Cooperative: 6,000 of 6,000 kg, delivered 10m late.")
    ).toBeInTheDocument();
    expect(screen.getByText('A needs every delivery on time; 1 arrived late.')).toBeInTheDocument();
    expect(
      screen.getByText(/^Try next: serve the earliest-due customer first/)
    ).toBeInTheDocument();
    // The headline is not the reasons again.
    expect(screen.getAllByText(/6,000 kg dispatched; net contribution/)).toHaveLength(1);
  });

  it('reads the same saved report in Brazilian Portuguese', () => {
    lateMorning();
    act(() => setLocale('pt-BR'));
    render(<ShiftDebrief />);
    expect(screen.getByRole('heading', { name: 'Manhã: nota B' })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Riverside Bakers' Cooperative: 6.000 de 6.000 kg, entregue com 10min de atraso."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('A exige todas as entregas no prazo; 1 chegou atrasada.')
    ).toBeInTheDocument();
    expect(screen.getByText(/^Tente a seguir: /)).toBeInTheDocument();
  });
});
