import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import {
  useOperationsCampaignStore,
  type CampaignConstraint,
  type OperationalIncident,
} from '../../stores/operationsCampaignStore';
import { useUIStore } from '../../stores/uiStore';
import { openRepairWorkspace } from '../ui-new/openRepairWorkspace';
import { deriveOperationsPlay } from '../../simulation/operationsPlay';
import { deriveDeliveryJourney } from '../ui-new/onboarding/deliveryJourney';
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

const initial = useOperationsCampaignStore.getState();
beforeEach(() =>
  useOperationsCampaignStore.setState({
    execution: { ...initial.execution, stage: 'quality_hold', qualityReleased: false },
    // An alarm raised during the hold ranks above quality on the shift card.
    incidents: [{ id: 'incident-1', phase: 'raised' } as OperationalIncident],
  })
);
afterEach(() => {
  cleanup();
  useOperationsCampaignStore.setState({
    execution: initial.execution,
    incidents: initial.incidents,
  });
});

// The guided delivery reads the hold from the line itself, so with an alarm
// up it still says 'Review the QC batch hold in Overview', and on a phone its
// button opens this sheet. The sheet unfolded its batches only when quality
// was the shift card's next action, which the alarm outranks: the batches the
// guide named were folded away.
it('opens the batch section the guide sends the player to while an alarm is up', () => {
  const state = useOperationsCampaignStore.getState();
  const order = state.orders.find((item) => item.id === state.activeOrderId) ?? null;
  expect(
    deriveDeliveryJourney(
      { ...order!, status: 'active' },
      { ...state.execution, orderId: order!.id },
      true
    ).quality
  ).toBe(true);
  expect(deriveOperationsPlay(state).nextAction.kind).toBe('acknowledge');
  render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
  const details = screen
    .getByText('Batch quality and traceability')
    .closest('details') as HTMLDetailsElement;
  expect(details.open).toBe(true);
});

// The same open-Overview event carries the repair route; during a hold with a
// machine down the batches unfold too, but the work orders keep the focus.
it('still lands a repair on the maintenance section during a quality hold', async () => {
  useOperationsCampaignStore.setState({
    incidents: [],
    constraints: [
      {
        id: 'maintenance-queue',
        severity: 'warning',
        label: 'Maintenance',
        detail: 'R.M. 101 is down',
        relatedId: 'rm-101',
      } as CampaignConstraint,
    ],
  });
  expect(deriveOperationsPlay(useOperationsCampaignStore.getState()).nextAction.kind).toBe(
    'repair'
  );
  render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
  act(() => openRepairWorkspace());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
  expect(document.activeElement).toBe(document.getElementById('overview-maintenance'));
  useOperationsCampaignStore.setState({ constraints: initial.constraints });
  useUIStore.getState().clearMaintenanceFocus();
});
