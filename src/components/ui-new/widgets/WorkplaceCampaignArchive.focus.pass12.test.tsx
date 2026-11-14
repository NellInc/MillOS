import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperationsPlayCard } from '../onboarding/PlayableShift';
import { useCameraStore } from '../../CameraController';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useWorkplaceReplayStore } from '../../../stores/workplaceReplayStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { setLocale } from '../../../i18n';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';

vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useCameraStore.setState(useCameraStore.getInitialState(), true);
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
    leftCampaigns: [],
  });
  useWorkplaceReplayStore.setState({ activeRunId: null });
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useGameSimulationStore.getState().setGameSpeed(30);
});
afterEach(cleanup);

const nextFrame = () =>
  act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));

// On the play card, leaving a season removes the whole agreement summary, the
// Leave button with it, while it holds focus. Focus fell to <body>, where Space
// is the forklift emergency stop. Working if focus stays on a control of the
// card that hosted the button.
describe('leaving a season keeps focus, twelfth pass', () => {
  it('moves focus to a control of the play card when Leave removes itself', async () => {
    fulfilFirstDelivery();
    expect(useWorkplaceStore.getState().startMission('toe-dip').changed).toBe(true);
    const { container } = render(<OperationsPlayCard />);
    const leave = screen.getByRole('button', { name: 'Leave this season' });
    leave.focus();
    fireEvent.click(leave);
    expect(useWorkplaceStore.getState().workplace.campaign).toBeNull();
    expect(leave.isConnected).toBe(false);
    await nextFrame();
    expect(document.activeElement).not.toBe(document.body);
    expect(container.contains(document.activeElement)).toBe(true);
  });
});
