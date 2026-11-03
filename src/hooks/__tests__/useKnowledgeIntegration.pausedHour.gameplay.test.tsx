import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useKnowledgeIntegration } from '../useKnowledgeIntegration';
import { useAINarrationStore, type NarrationEntry } from '../../stores/aiNarrationStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

// The note reads "The simulation has been running for an hour" and suggests
// reviewing wear before raising the time scale. It was timed on the wall clock,
// so an hour spent paused (P, a planner, the pace menu) earned it too.
// Working if paused minutes do not count and running minutes still do.
describe('extended-play narration and a paused plant', () => {
  let savedSpeed: number;
  beforeEach(() => {
    vi.useFakeTimers();
    savedSpeed = useGameSimulationStore.getState().gameSpeed;
    useAINarrationStore.setState({
      enabled: true,
      shownNarrations: new Set(['welcome-autonomous-mill']),
    });
  });

  afterEach(() => {
    useGameSimulationStore.setState({ gameSpeed: savedSpeed });
    vi.useRealTimers();
  });

  const advanceMinutes = (minutes: number) => {
    for (let minute = 0; minute < minutes; minute++) {
      act(() => {
        vi.advanceTimersByTime(60000);
      });
    }
  };

  it('does not count an hour spent paused as an hour running', () => {
    const shown: NarrationEntry[] = [];
    const hook = renderHook(() =>
      useKnowledgeIntegration((narration) => {
        shown.push(narration);
      })
    );
    useGameSimulationStore.setState({ gameSpeed: 0 });
    advanceMinutes(61);
    expect(shown.map((narration) => narration.id)).not.toContain('extended-autonomous-session');

    useGameSimulationStore.setState({ gameSpeed: savedSpeed > 0 ? savedSpeed : 30 });
    advanceMinutes(61);
    expect(shown.map((narration) => narration.id)).toContain('extended-autonomous-session');
    hook.unmount();
  });
});
