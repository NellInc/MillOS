import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AICommandCenter } from '../AICommandCenter';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { setLocale } from '../../i18n';

vi.mock('../../utils/onDeviceOperator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/onDeviceOperator')>()),
  initializeOnDeviceOperator: () => () => {},
}));
vi.mock('../AISettingsModal', () => ({ AISettingsModal: () => null }));
vi.mock('./JevAdvisoryPanel', () => ({ JevAdvisoryPanel: () => null }));
vi.mock('./OnDeviceOperatorRecord', () => ({ OnDeviceOperatorRecord: () => null }));
vi.mock('./StrategicPriorityCards', () => ({ StrategicPriorityCards: () => null }));
vi.mock('./VCLDebugPanel', () => ({ VCLDebugPanel: () => null }));
vi.mock('./VCLDiffPanel', () => ({ VCLDiffPanel: () => null }));
vi.mock('./DecisionHistoryPanel', () => ({ DecisionHistoryPanel: () => null }));
vi.mock('./DecisionReplay', () => ({ DecisionReplay: () => null }));

// The plant clock writes gameTime every half second, and the AI Partner panel
// re-renders with it. Each re-render handed the timeline a new steps array,
// which restarted its one-second interval before it ever fired: with the
// Strategic tab open the countdown never moved. Working if the countdown keeps
// shift-clock seconds while the panel around it re-renders.
describe('the action plan countdown inside the AI Partner panel', () => {
  const original = useAIConfigStore.getState().strategic;
  const originalClock = useGameSimulationStore.getState();

  beforeEach(() => {
    vi.useFakeTimers();
    setLocale('en');
    useGameSimulationStore.setState({ gameSpeed: 1, gameTime: 10, isTabVisible: true });
    useAIConfigStore.setState({
      strategic: {
        ...original,
        isThinking: false,
        actionPlan: ['Cool RM-201', 'Rebalance line two', 'Stage spare sieves'],
      },
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useAIConfigStore.setState({ strategic: original });
    useGameSimulationStore.setState({
      gameSpeed: originalClock.gameSpeed,
      gameTime: originalClock.gameTime,
      isTabVisible: originalClock.isTabVisible,
    });
  });

  it('counts down while the plant clock ticks under it', async () => {
    render(<AICommandCenter isOpen onClose={() => {}} embedded />);
    fireEvent.click(screen.getByRole('tab', { name: /strategic/i }));
    expect(screen.getByText('5:00')).toBeInTheDocument();

    // Ten seconds of the plant clock's half-second ticks.
    for (let half = 0; half < 20; half += 1) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
        useGameSimulationStore.setState({
          gameTime: useGameSimulationStore.getState().gameTime + 0.01,
        });
      });
    }

    expect(screen.getByText(/^\d+:\d\d$/)).toHaveTextContent('4:50');
  });
});
