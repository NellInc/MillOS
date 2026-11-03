import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ActionPlanTimeline } from './ActionPlanTimeline';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

// F32: the plan's countdown ran on wall time while the game was paused, so a
// held clock (P, Paused, tour, handoff) burned through the plan's steps.
describe('the action plan countdown', () => {
  const original = useAIConfigStore.getState().strategic;
  const originalSpeed = useGameSimulationStore.getState().gameSpeed;

  beforeEach(() => {
    vi.useFakeTimers();
    useGameSimulationStore.setState({ gameSpeed: 1 });
    useAIConfigStore.setState({
      strategic: {
        ...original,
        isThinking: false,
        actionPlan: ['Cool RM-101', 'Rebalance the line', 'Stage spare rolls'],
      },
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useAIConfigStore.setState({ strategic: original });
    useGameSimulationStore.setState({ gameSpeed: originalSpeed });
  });

  const tick = async (ms: number) => {
    for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
  };

  it('holds while the game clock is held and resumes with it', async () => {
    render(<ActionPlanTimeline />);
    expect(screen.getByText('5:00')).toBeInTheDocument();
    await tick(2000);
    expect(screen.getByText('4:58')).toBeInTheDocument();

    act(() => useGameSimulationStore.setState({ gameSpeed: 0 }));
    await tick(5000);
    expect(screen.getByText('4:58')).toBeInTheDocument();

    act(() => useGameSimulationStore.setState({ gameSpeed: 1 }));
    await tick(1000);
    expect(screen.getByText('4:57')).toBeInTheDocument();
  });

  // The Strategic tab unmounts the timeline when the player switches tabs, and
  // the remount started the same plan over at 5:00, so a player who looked
  // away never saw it past its first step. Working if the same plan resumes
  // where it was left and a new plan starts at its first step.
  it('keeps its place in the same plan across a tab switch, and restarts for a new plan', async () => {
    const first = render(<ActionPlanTimeline />);
    await tick(3000);
    expect(screen.getByText('4:57')).toBeInTheDocument();
    first.unmount();

    render(<ActionPlanTimeline />);
    expect(screen.getByText('4:57')).toBeInTheDocument();
    await tick(1000);
    expect(screen.getByText('4:56')).toBeInTheDocument();

    act(() =>
      useAIConfigStore.setState({
        strategic: {
          ...useAIConfigStore.getState().strategic,
          actionPlan: ['Purge the dust filter', 'Hold line 2', 'Order filter bags'],
        },
      })
    );
    expect(screen.getByText('5:00')).toBeInTheDocument();
  });

  // Pass 7: every strategic decision re-issues the plan (about every 45 s with
  // an LLM connected) as a fresh array, so the timeline restarted at step 1 and
  // no plan ever got past its first five minutes. Working if a re-issued plan
  // with the same steps keeps its place and a plan with new steps restarts.
  it('keeps its place when a strategic decision re-issues the same plan', async () => {
    render(<ActionPlanTimeline />);
    await tick(3000);
    expect(screen.getByText('4:57')).toBeInTheDocument();

    act(() =>
      useAIConfigStore.getState().setStrategicPriorities(['Keep RM-101 cool'], {
        actionPlan: ['Cool RM-101', 'Rebalance the line', 'Stage spare rolls'],
      })
    );
    expect(screen.getByText('4:57')).toBeInTheDocument();
    await tick(1000);
    expect(screen.getByText('4:56')).toBeInTheDocument();

    act(() =>
      useAIConfigStore.getState().setStrategicPriorities(['Purge the filter'], {
        actionPlan: ['Purge the dust filter', 'Hold line 2', 'Order filter bags'],
      })
    );
    expect(screen.getByText('5:00')).toBeInTheDocument();
  });

  // Pass 7: a hidden browser tab freezes the plant (no frames), but the plan
  // kept counting down on wall time. Working if it holds with the plant.
  it('holds while the browser tab is hidden', async () => {
    const visible = useGameSimulationStore.getState().isTabVisible;
    try {
      render(<ActionPlanTimeline />);
      await tick(1000);
      expect(screen.getByText('4:59')).toBeInTheDocument();
      act(() => useGameSimulationStore.setState({ isTabVisible: false }));
      await tick(5000);
      expect(screen.getByText('4:59')).toBeInTheDocument();
      act(() => useGameSimulationStore.setState({ isTabVisible: true }));
      await tick(1000);
      expect(screen.getByText('4:58')).toBeInTheDocument();
    } finally {
      useGameSimulationStore.setState({ isTabVisible: visible });
    }
  });

  // When the last step's countdown ran out the plan stopped, but the last step
  // still read as the active one (pulsing, play icon) with no countdown left.
  it('reads every step as done once the last countdown ends', async () => {
    render(<ActionPlanTimeline />);
    await tick((5 + 15 + 30) * 60 * 1000 + 2000);
    for (const label of ['Immediate', 'Short-term', 'Preparation']) {
      expect(screen.getByText(label)).toHaveClass('text-green-400');
    }
    // Fifty minutes of one-second renders: slow on a loaded machine, not stuck.
  }, 300_000);
});
