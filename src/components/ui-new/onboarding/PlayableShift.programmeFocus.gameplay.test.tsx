import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OperationsPlayCard } from './PlayableShift';
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
});
afterEach(cleanup);

// With a linked season open, the programme's last order going out turned the
// focused next-action button into a disabled 'Accept next production
// programme': keyboard focus sat on a dead control (and fell to <body> in
// Firefox). It stays focusable and inert until the review is done.
// Working if Tab carries on from the button after the last delivery.
it('keeps the next-action button usable under focus when the programme completes during a linked season', () => {
  expect(useWorkplaceStore.getState().startMission('team').changed).toBe(true);
  render(<OperationsPlayCard />);
  // The next-action button follows its 'Next:' line and the consequence below it.
  const next = screen.getByText(/^Next: /).nextElementSibling!.nextElementSibling as HTMLElement;
  expect(next.tagName).toBe('BUTTON');
  next.focus();
  expect(next).toHaveFocus();
  act(() => {
    const state = useOperationsCampaignStore.getState();
    useOperationsCampaignStore.setState({
      orders: state.orders.map((order) => ({
        ...order,
        status: 'fulfilled' as const,
        shippedKg: order.requiredKg,
      })),
      activeOrderId: null,
    });
  });
  const accept = screen.getByRole('button', { name: 'Accept next production programme' });
  expect(accept).toBe(next);
  expect(accept).toHaveFocus();
  expect(accept).not.toBeDisabled();
  expect(accept).toHaveAttribute('aria-disabled', 'true');
  // The inert press says why: every order is in, so the customer select (and
  // its review hint) is gone from the card.
  expect(accept).toHaveAccessibleDescription(/linked final review/);
  const before = useOperationsCampaignStore.getState();
  fireEvent.click(accept);
  // Still inert: the review comes first.
  expect(useOperationsCampaignStore.getState()).toBe(before);
});
