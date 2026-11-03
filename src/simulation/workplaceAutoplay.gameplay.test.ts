import { beforeEach, expect, it } from 'vitest';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { createWorkplace, restoreWorkplace, saveWorkplace } from './bilateralWorkplace';
import { autoplayWorkplaceStep, useWorkplaceAutoplay } from './workplaceAutoplay';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { endReplayClock } from './workplaceReplayRuntime';
import { useGameSimulationStore } from '../stores/gameSimulationStore';

beforeEach(() => {
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
});

it('a reload during the first deliberation resumes that shift instead of skipping it', () => {
  expect(autoplayWorkplaceStep('team').changed).toBe(true);
  for (let i = 0; i < 4; i++) autoplayWorkplaceStep('team');
  const before = useWorkplaceStore.getState().workplace;
  expect(before.phase).toBe('deliberating');
  expect(before.minute).toBe(0);
  // The page reloads before the fictional roles approved the first shift.
  useWorkplaceStore.setState({ workplace: restoreWorkplace(saveWorkplace(before)) });
  expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
  autoplayWorkplaceStep('team');
  const after = useWorkplaceStore.getState().workplace;
  expect(after.campaign?.shift).toBe(0);
  expect(after.campaign?.history).toHaveLength(0);
  expect(after.phase).toBe('deliberating');
});
