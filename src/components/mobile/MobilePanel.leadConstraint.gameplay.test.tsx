import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import {
  useOperationsCampaignStore,
  type CampaignConstraint,
} from '../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useQCLabStore } from '../../stores/qcLabStore';
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('../knowledge/LearningNote', () => ({ LearningNote: () => null }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

beforeEach(() => {
  useOperationsCampaignStore.getState().resetCampaign();
  useMaterialFlowStore.getState().resetMaterialFlow();
  useQCLabStore.getState().resetQCLab();
});
afterEach(cleanup);

// The tick lists storage before an empty feed, so the sheet's campaign box
// named the storage warning while the shift card above it on the same sheet
// read 'Blocked' for the feed. Working if both name the constraint that stops
// the line.
it('names the same lead constraint as the shift card on the phone Overview sheet', () => {
  const storage: CampaignConstraint = {
    id: 'storage-high',
    severity: 'warning',
    label: 'Storage high',
    detail: 'Finished storage is 88% full.',
    relatedId: null,
  };
  const feed: CampaignConstraint = {
    id: 'recipe-feed-test',
    severity: 'critical',
    label: 'Recipe feed empty',
    detail: 'No wheat grain is in the route.',
    relatedId: null,
  };
  useOperationsCampaignStore.setState({ constraints: [storage, feed] });
  render(<MobilePanel isVisible content="overview" onClose={vi.fn()} />);
  // The shift card leads with the critical stop...
  expect(screen.getByText(/Blocked: Recipe feed empty\./)).toBeInTheDocument();
  // ...and the campaign box below it names the same one.
  expect(
    screen.getByText('Recipe feed empty: No wheat grain is in the route.')
  ).toBeInTheDocument();
  expect(screen.queryByText('Storage high: Finished storage is 88% full.')).not.toBeInTheDocument();
});
