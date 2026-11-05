import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { deriveOperationsPlay } from '../../simulation/operationsPlay';
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

const initialExecution = useOperationsCampaignStore.getState().execution;
beforeEach(() =>
  useOperationsCampaignStore.setState({
    execution: { ...initialExecution, stage: 'quality_hold', qualityReleased: false },
  })
);
afterEach(() => {
  cleanup();
  useOperationsCampaignStore.setState({ execution: initialExecution });
});

const batchDisclosure = () =>
  screen.getByText('Batch quality and traceability').closest('details') as HTMLDetailsElement;

// Under 768 px the batch section sits in a collapsed disclosure. The shift
// card's 'Review the quality hold in Overview', and the guide's QC step, land
// the player on this sheet, where the quality hold was folded out of sight:
// pressing the next action from the sheet changed nothing on screen.
it('opens the batch section when the quality hold is the next action', () => {
  expect(deriveOperationsPlay(useOperationsCampaignStore.getState()).nextAction.kind).toBe(
    'quality'
  );
  render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
  expect(batchDisclosure().open).toBe(true);
});

it('reopens the batch section when the quality next action is pressed in the sheet', () => {
  render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
  const details = batchDisclosure();
  details.open = false;
  fireEvent(details, new Event('toggle'));
  expect(details.open).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Review the quality hold in Overview' }));
  expect(batchDisclosure().open).toBe(true);
});
