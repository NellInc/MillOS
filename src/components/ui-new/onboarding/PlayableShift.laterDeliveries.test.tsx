import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FirstDeliveryJourney, OperationsPlayCard } from './PlayableShift';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { setLocale } from '../../../i18n';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

// The guided card after the first delivery: what a player reads for the rest
// of the day, once order-001 is in (or long gone from the order list).

beforeEach(() => {
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

function fulfilFirstAndRunSecond() {
  const state = useOperationsCampaignStore.getState();
  const [first, second] = state.orders;
  useOperationsCampaignStore.setState({
    orders: state.orders.map((order) =>
      order.id === first.id
        ? {
            ...order,
            status: 'fulfilled' as const,
            shippedKg: order.requiredKg,
            completedAtMinute: 142,
          }
        : order.id === second.id
          ? { ...order, status: 'active' as const, shippedKg: 1000 }
          : order
    ),
    activeOrderId: second.id,
    elapsedMinutes: second.dueAtMinute - 60,
    execution: { ...state.execution, orderId: second.id, stage: 'milling' },
  });
  return { first, second };
}

it('keeps Shift pace on the fulfilled card, outside the collapsed receipt', () => {
  const { first } = fulfilFirstAndRunSecond();
  useUIStore.getState().startDeliveryJourney(first.id);
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
  expect(screen.getByRole('heading', { name: 'Delivery fulfilled' })).toBeInTheDocument();
  const pace = screen.getByRole('combobox', { name: 'Shift pace' });
  expect(pace.closest('details')).toBeNull();
  expect(pace).toBeVisible();
  // It sits with the current order it is read against, ahead of the next step.
  const now = screen.getByText(/^Now: Community Pasta Works/);
  const next = screen.getByText(/ in SCADA$/);
  expect(now.compareDocumentPosition(pace) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(pace.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // Exactly one pace control on the card.
  expect(screen.getAllByRole('combobox', { name: 'Shift pace' })).toHaveLength(1);
});

it.each([
  ['en', 'Your first delivery', 'Delivery for Community Pasta Works'],
  ['pt-BR', 'Sua primeira entrega', 'Entrega para Community Pasta Works'],
] as const)(
  'titles a replayed guide with its customer, not "first delivery" (%s)',
  (locale, firstTitle, laterTitle) => {
    setLocale(locale);
    const { second } = fulfilFirstAndRunSecond();
    // Replay guide from Overview points the card at the live order.
    useUIStore.getState().startDeliveryJourney(second.id);
    render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
    expect(screen.getByRole('heading', { name: laterTitle })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: firstTitle })).not.toBeInTheDocument();
    cleanup();
    // The tour's own first order keeps its title.
    useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
    useUIStore.getState().startDeliveryJourney('order-001');
    render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
    expect(screen.getByRole('heading', { name: firstTitle })).toBeInTheDocument();
  }
);

it('reads the live order when the guided order has been trimmed from the list', () => {
  // Eleven programmes on, order-001 is no longer kept (the list holds the last
  // 30 orders) but the persisted guide still points at it.
  useUIStore.getState().startDeliveryJourney('order-001');
  for (let programme = 0; programme < 11; programme++) {
    const state = useOperationsCampaignStore.getState();
    useOperationsCampaignStore.setState({
      orders: state.orders.map((order) => ({
        ...order,
        status: 'fulfilled' as const,
        shippedKg: order.requiredKg,
        completedAtMinute: order.completedAtMinute ?? state.elapsedMinutes,
      })),
    });
    expect(useOperationsCampaignStore.getState().acceptNextProgramme()).toBe(true);
  }
  const state = useOperationsCampaignStore.getState();
  expect(state.orders.some((order) => order.id === 'order-001')).toBe(false);
  const active = state.orders.find((order) => order.id === state.activeOrderId)!;
  expect(active.status).not.toBe('fulfilled');
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
  expect(screen.queryByText('Awaiting an order')).not.toBeInTheDocument();
  expect(screen.queryByText('Choose a delivery')).not.toBeInTheDocument();
  expect(screen.getByText(new RegExp(`^Now: ${active.customer}, 0 of `))).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Shift pace' })).toBeVisible();
});

it.each([
  [
    'en',
    'Rush: Community Pasta Works pays 30% more for 2,500 kg Fine corn semolina. Due in 2h 30m (simulated). The controller runs it first; choosing another commitment first may make it late, at double the usual late penalty. It is the only order on corn grain, so running it first changes the line over to it and back.',
  ],
  [
    'pt-BR',
    'Urgente: Community Pasta Works paga 30% a mais por 2.500 kg de Semolina fina de milho. Vence em 2h 30min (tempo simulado). O controlador o executa primeiro; escolher outro compromisso antes pode atrasá-lo, com o dobro da multa usual por atraso. É o único pedido de grão de milho, então executá-lo primeiro troca a linha para ele e de volta.',
  ],
] as const)("names the programme's choice on the shift card (%s)", (locale, copy) => {
  setLocale(locale);
  const state = useOperationsCampaignStore.getState();
  useOperationsCampaignStore.setState({
    orders: state.orders.map((order) => ({
      ...order,
      status: 'fulfilled' as const,
      shippedKg: order.requiredKg,
      completedAtMinute: 400,
    })),
    activeOrderId: null,
    elapsedMinutes: 480,
  });
  expect(useOperationsCampaignStore.getState().acceptNextProgramme()).toBe(true);
  render(<OperationsPlayCard />);
  expect(screen.getByText(copy)).toBeInTheDocument();
  // The choice is made in the commitment select right above it.
  expect(
    screen.getByRole('combobox', {
      name: /^(Active customer commitment|Compromisso ativo com o cliente)/,
    })
  ).toBeEnabled();
});
