import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CameraPresetMenu } from './CameraPresetMenu';
import { useCameraStore } from '../CameraController';
import { OnboardingGuide } from '../ui-new/onboarding/OnboardingGuide';

afterEach(() => {
  cleanup();
  useCameraStore.getState().cancelAnimation();
});

describe('compact camera menu owns its Escape', () => {
  // The tour and the guided-delivery card close on any Escape no dialog, menu
  // or sidebar owns, from a document capture listener. The menu is a group, so
  // the same press used to close the menu and dismiss the tour behind it.
  it('closes only the menu when the tour is open behind it', async () => {
    const onClose = vi.fn();
    render(
      <>
        <OnboardingGuide
          step={{ title: 'Grain', content: 'Follow the grain.', icon: 'factory' }}
          stepIndex={0}
          stepCount={3}
          onNext={vi.fn()}
          onBack={vi.fn()}
          onSkip={vi.fn()}
          onClose={onClose}
        />
        <CameraPresetMenu />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open camera menu' }));
    const option = screen.getByRole('button', { name: 'Shipping' });
    option.focus();
    fireEvent.keyDown(option, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Open camera menu' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Camera views' })).toBeNull());

    // With the menu closed, Escape reaches the tour again.
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
