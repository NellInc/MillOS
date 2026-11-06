import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingGuide } from './OnboardingGuide';
import { useUIStore } from '../../../stores/uiStore';

afterEach(() => {
  cleanup();
  useUIStore.getState().setFpsMode(false);
});

describe('tour Escape in first-person', () => {
  // Before the first click there is no pointer lock, and Escape is the
  // documented way out of the walk overlay (useKeyboardShortcuts, a window
  // listener). The tour's capture listener used to take the press and stop it,
  // so Escape dismissed the hidden tour and left the player in walk mode.
  it('leaves Escape to the walk overlay instead of closing the tour', () => {
    useUIStore.getState().setFpsMode(true);
    const onClose = vi.fn();
    const shortcuts = vi.fn((event: KeyboardEvent) => {
      if (event.key === 'Escape') useUIStore.getState().setFpsMode(false);
    });
    window.addEventListener('keydown', shortcuts);
    try {
      render(
        <OnboardingGuide
          step={{ title: 'Grain', content: 'Follow the grain.', icon: 'factory' }}
          stepIndex={0}
          stepCount={3}
          onNext={vi.fn()}
          onBack={vi.fn()}
          onSkip={vi.fn()}
          onClose={onClose}
        />
      );
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onClose).not.toHaveBeenCalled();
      expect(shortcuts).toHaveBeenCalledOnce();
      expect(useUIStore.getState().fpsMode).toBe(false);

      // Back in the orbit view, Escape closes the tour as before.
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('keydown', shortcuts);
    }
  });
});
