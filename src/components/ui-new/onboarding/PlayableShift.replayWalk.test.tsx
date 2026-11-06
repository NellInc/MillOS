import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OperationsPlayCard } from './PlayableShift';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

beforeEach(() => {
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useUIStore.setState(useUIStore.getInitialState(), true);
  useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
});
afterEach(cleanup);

// The host hides the guided card while walking (GameInterface mounts it only
// when !fpsMode), and the dock stays open in walk mode. Replay from Overview
// while walking set the guide visible behind the walk view, so the press
// showed nothing. It leaves walk mode first, as the tour and the number keys do.
it('leaves walk mode so a replayed guide is on screen', () => {
  useUIStore.setState({ fpsMode: true });
  render(<OperationsPlayCard />);
  fireEvent.click(screen.getByRole('button', { name: 'Replay guided delivery' }));
  expect(useUIStore.getState().journeyVisible).toBe(true);
  expect(useUIStore.getState().fpsMode).toBe(false);
});
