import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsPlayCard, ShiftDebrief } from './PlayableShift';
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

describe('decisions in the debrief', () => {
  it('lists the operator choice under its own heading and plant narration apart', () => {
    tick(1);
    useOperationsCampaignStore.getState().activateOrder('order-002', 'operator');
    for (let i = 0; i < 10; i++)
      tick(1, {
        dispatchLoad: { ...context().dispatchLoad, status: i % 2 ? 'ready' : 'loading' },
      });
    tick(1, { shiftKey: 'day-0-afternoon' });
    render(<ShiftDebrief />);
    expect(screen.getByRole('heading', { name: 'Your decisions this shift' })).toBeInTheDocument();
    expect(
      screen.getByText('Community Pasta Works: Fine corn semolina is now the active commitment.')
    ).toBeVisible();
    const narration = screen.getByText('What the mill did');
    expect(narration.closest('details')).not.toHaveAttribute('open');
    expect(screen.getAllByText('Shipping load is 0 of 5000 kg.')[0].closest('details')).toBe(
      narration.closest('details')
    );
  });
});

it("tags a customer switch in the commitment card as the operator's choice", () => {
  render(<OperationsPlayCard />);
  fireEvent.change(screen.getByLabelText('Active customer commitment', { exact: false }), {
    target: { value: 'order-002' },
  });
  expect(useOperationsCampaignStore.getState().logbook.at(-1)).toMatchObject({
    actor: 'operator',
    relatedId: 'order-002',
  });
});

describe('this shift so far (row 22)', () => {
  it('shows the deliveries of the window still open when the programme completes', () => {
    tick(1);
    tick(250, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
    const [flour, flourBatch] = shipment('shipping-0001', 14000);
    const [semolina, semolinaBatch] = shipment('shipping-0002', 4000);
    const semolinaManifest = {
      ...semolina,
      materials: [{ type: 'semolina' as const, amount: 4000 }],
    };
    tick(1, {
      shiftKey: 'day-0-afternoon',
      shiftLabel: 'Afternoon',
      manifests: [flour, semolinaManifest],
      productionBatches: [flourBatch, { ...semolinaBatch, materialType: 'semolina' }],
    });
    expect(
      useOperationsCampaignStore.getState().orders.every((o) => o.status === 'fulfilled')
    ).toBe(true);
    render(<ShiftDebrief />);
    expect(
      screen.getByRole('heading', { name: /^Afternoon so far: provisional grade [A-F]$/ })
    ).toBeVisible();
    expect(
      screen.getByText('Community Pasta Works: 4,000 of 4,000 kg, delivered on time.')
    ).toBeVisible();
    expect(
      screen.getByText('County School Meals: 8,000 of 8,000 kg, delivered on time.')
    ).toBeVisible();
  });
});

describe('the end of a shift is in view (row 21)', () => {
  it('shows the newest saved report open and keeps older ones collapsed', () => {
    lateMorning();
    tick(480, { shiftKey: 'day-0-afternoon', shiftLabel: 'Afternoon' });
    tick(1, { shiftKey: 'day-0-night', shiftLabel: 'Night' });
    render(<ShiftDebrief />);
    expect(screen.getByRole('heading', { name: /^Afternoon: / })).toBeVisible();
    expect(screen.getByText('Read 1 earlier report')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Morning: grade B', hidden: true })
    ).not.toBeVisible();
    fireEvent.click(screen.getByText('Read 1 earlier report'));
    expect(screen.getByRole('heading', { name: 'Morning: grade B' })).toBeVisible();
  });

  it('names the time the open shift closes before any report exists', () => {
    useGameSimulationStore.getState().setGameTime(10);
    render(<ShiftDebrief />);
    expect(
      screen.getByText(/Morning report is saved when the shift closes at 14:00/)
    ).toBeVisible();
    cleanup();
    act(() => setLocale('pt-BR'));
    render(<ShiftDebrief />);
    expect(screen.getByText(/fecha às 14:00/)).toBeVisible();
  });
});

describe('the review persists across reload', () => {
  // The store's own persist storage (in-memory under test), and its own
  // migrate and merge, exactly as a page load would run them.
  const KEY = 'millos-autonomous-operations';
  const storage = () => useOperationsCampaignStore.persist.getOptions().storage!;
  afterEach(() => storage().removeItem(KEY));

  it('rehydrates a version 2 save and still renders its reports', async () => {
    const metrics = { ...useOperationsCampaignStore.getState().shiftMetrics } as Record<
      string,
      number
    >;
    delete metrics.commitmentMinutes;
    storage().setItem(
      KEY,
      JSON.parse(
        JSON.stringify({
          version: 2,
          state: {
            initialized: true,
            elapsedMinutes: 300,
            shiftMetrics: metrics,
            currentShiftKey: 'day-0-afternoon',
            currentShiftLabel: 'Afternoon',
            shiftStartedAtMinute: 240,
            logbook: [
              {
                id: 'log-0001',
                simulationMinute: 10,
                source: 'Order scheduler',
                category: 'operation',
                message: 'Old line without an actor.',
                relatedId: null,
              },
            ],
            reports: [
              {
                id: 'period-report-0007',
                shiftKey: 'day-0-morning',
                shiftLabel: 'Morning',
                startedAtMinute: 0,
                endedAtMinute: 240,
                metrics,
                completedOrderIds: ['order-001'],
                openRisks: [],
                grade: 'C',
                summary: 'Saved summary.',
                gradeReasons: ['Saved reason one.', 'Saved reason two.'],
                decisions: ['Shipping load is 0 of 5000 kg.'],
              },
            ],
          },
        })
      )
    );
    await useOperationsCampaignStore.persist.rehydrate();
    const state = useOperationsCampaignStore.getState();
    expect(state.reports.map((report) => report.id)).toEqual(['period-report-0007']);
    expect(state.shiftMetrics.commitmentMinutes).toBe(0);
    render(<ShiftDebrief />);
    expect(screen.getByRole('heading', { name: 'Morning: grade C' })).toBeVisible();
    expect(screen.getByText('Saved summary.')).toBeVisible();
    expect(screen.getByText('Saved reason two.')).toBeVisible();
    fireEvent.click(screen.getByText('Shift log'));
    expect(screen.getByText('Shipping load is 0 of 5000 kg.')).toBeVisible();
    // An old untagged entry is narration, never the player's decision.
    tick(1, { shiftKey: 'day-0-night', shiftLabel: 'Night' });
    expect(useOperationsCampaignStore.getState().reports.at(-1)?.choices).toEqual([]);
  });

  it('saves a version 3 report and renders the same review after reload', async () => {
    lateMorning();
    const before = useOperationsCampaignStore.getState().reports.at(-1)!;
    // The real persist write, then a fresh store state read back from it.
    useOperationsCampaignStore.setState({});
    const saved = JSON.parse(JSON.stringify(await storage().getItem(KEY)));
    expect(saved.version).toBe(3);
    useOperationsCampaignStore.getState().resetCampaign();
    storage().setItem(KEY, saved);
    await useOperationsCampaignStore.persist.rehydrate();
    expect(useOperationsCampaignStore.getState().reports.at(-1)).toEqual(before);
    act(() => setLocale('pt-BR'));
    render(<ShiftDebrief />);
    expect(screen.getByRole('heading', { name: 'Manhã: nota B' })).toBeVisible();
    expect(
      screen.getByText(
        "Riverside Bakers' Cooperative: 6.000 de 6.000 kg, entregue com 10min de atraso."
      )
    ).toBeVisible();
  });
});
