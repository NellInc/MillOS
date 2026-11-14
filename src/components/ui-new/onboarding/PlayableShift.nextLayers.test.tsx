import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FirstDeliveryJourney, OperationsPlayCard } from './PlayableShift';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useChronicleStore } from '../../../stores/chronicleStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import {
  FUNNEL_STORAGE_KEY,
  installChronicleFunnel,
  parseFunnelLog,
} from '../../../chronicle/funnel';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

let uninstall: (() => void) | null = null;
const opened: unknown[] = [];
const onOpen = (event: Event) => opened.push((event as CustomEvent<unknown>).detail);

beforeEach(() => {
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
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
  opened.length = 0;
  window.addEventListener('millos:open-operations-workspace', onOpen);
});
afterEach(() => {
  window.removeEventListener('millos:open-operations-workspace', onOpen);
  uninstall?.();
  uninstall = null;
  cleanup();
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

// A completed programme hands over the next layers: the next programme, the
// cooperative season and the Chronicle charter, each opening its workspace.
// Working if the guide card offers all three and the charter press is counted.
it('offers the next programme, the cooperative season and the Chronicle charter on the completed guide', () => {
  const storage = memoryStorage();
  uninstall = installChronicleFunnel(useChronicleStore, storage);
  const openWorkspace = vi.fn();
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={openWorkspace} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review shift and next programme' }));
  expect(openWorkspace).toHaveBeenCalledWith('overview');
  fireEvent.click(screen.getByRole('button', { name: 'Cooperative season' }));
  expect(opened).toEqual(['autonomy']);
  const before = parseFunnelLog(storage.getItem(FUNNEL_STORAGE_KEY)).charterOffersOpened;
  expect(before).toBe(0);
  fireEvent.click(screen.getByRole('button', { name: 'Chronicle charter' }));
  expect(opened).toEqual(['autonomy', 'chronicle']);
  expect(parseFunnelLog(storage.getItem(FUNNEL_STORAGE_KEY)).charterOffersOpened).toBe(1);
});

it('offers the same three on the shift commitment card', () => {
  const storage = memoryStorage();
  uninstall = installChronicleFunnel(useChronicleStore, storage);
  render(<OperationsPlayCard />);
  expect(
    screen.getByRole('button', { name: 'Accept next delivery programme' })
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cooperative season' }));
  fireEvent.click(screen.getByRole('button', { name: 'Chronicle charter' }));
  expect(opened).toEqual(['autonomy', 'chronicle']);
  expect(parseFunnelLog(storage.getItem(FUNNEL_STORAGE_KEY)).charterOffersOpened).toBe(1);
});

it('counts nothing where the funnel is not installed, as in a benchmark run', () => {
  const setItem = vi.spyOn(Storage.prototype, 'setItem');
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Chronicle charter' }));
  expect(opened).toEqual(['chronicle']);
  expect(setItem.mock.calls.some(([key]) => key === FUNNEL_STORAGE_KEY)).toBe(false);
  setItem.mockRestore();
});

it('offers no next layer while the programme is still running', () => {
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  render(<OperationsPlayCard />);
  expect(screen.queryByRole('button', { name: 'Cooperative season' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Chronicle charter' })).not.toBeInTheDocument();
});
