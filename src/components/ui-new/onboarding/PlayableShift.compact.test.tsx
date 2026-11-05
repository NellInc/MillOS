import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FirstDeliveryJourney } from './PlayableShift';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

beforeEach(() => {
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useUIStore.getState().startDeliveryJourney(useOperationsCampaignStore.getState().activeOrderId);
});
afterEach(cleanup);

const mount = () =>
  render(<FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />);

// The host unmounts the card for the compact inspector, the phone sheet, walk
// mode, safety states and the shortcuts modal. A compact choice kept in the
// card's own state came back expanded over the scene after every visit.
it('keeps the compact delivery guide after the host unmounts and remounts the card', () => {
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Compact delivery guide' }));
  expect(screen.getByRole('button', { name: 'Expand delivery guide' })).toBeInTheDocument();
  view.unmount();
  mount();
  expect(screen.getByRole('button', { name: 'Expand delivery guide' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Compact delivery guide' })).not.toBeInTheDocument();
});

it('opens a newly started guided delivery expanded', () => {
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Compact delivery guide' }));
  view.unmount();
  // Replay guided delivery from the sheet while the card is unmounted: same order.
  act(() => useUIStore.getState().startDeliveryJourney(useUIStore.getState().journeyOrderId));
  mount();
  expect(screen.getByRole('button', { name: 'Compact delivery guide' })).toBeInTheDocument();
});

it('opens expanded again after the player closes the compact guide', () => {
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Compact delivery guide' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close guided delivery' }));
  view.unmount();
  act(() => useUIStore.getState().setJourneyVisible(true));
  mount();
  expect(screen.getByRole('button', { name: 'Compact delivery guide' })).toBeInTheDocument();
});

it('keeps the expand control on the scene, not stealing focus, when remounted compact', () => {
  const view = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Compact delivery guide' }));
  view.unmount();
  const elsewhere = document.createElement('button');
  document.body.append(elsewhere);
  elsewhere.focus();
  mount();
  expect(elsewhere).toHaveFocus();
  elsewhere.remove();
});
