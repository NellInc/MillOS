import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CameraPresetIndicator, useCameraStore } from './CameraController';
import { useUIStore } from '../stores/uiStore';
import { useAnnouncementsStore } from '../stores/announcementsStore';

const layout = vi.hoisted(() => ({ compact: false }));
vi.mock('../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isCompactLayout: layout.compact }),
}));

beforeEach(() => {
  layout.compact = false;
  useUIStore.getState().setJourneyVisible(false);
  useAnnouncementsStore.getState().setContext({ onboarding: false });
  useCameraStore.getState().setPreset(0);
});
afterEach(() => {
  cleanup();
  useCameraStore.getState().cancelAnimation();
});

describe('camera preset readout', () => {
  it('keeps the selected view and keyboard route in the scene-side header slot', () => {
    render(<CameraPresetIndicator />);
    const readout = screen.getByRole('status', { name: 'Camera view' });
    expect(readout).toHaveTextContent('Overview');
    expect(readout).toHaveTextContent('Whole mill and logistics site');
    expect(readout).toHaveClass('top-32', 'left-4');
    expect(readout).not.toHaveClass('top-16', 'bottom-4', 'right-4');
    for (const key of ['0', '1', '2', '3', '4', '5', '6', '7']) {
      expect(screen.getAllByText(key).length).toBeGreaterThan(0);
    }
  });

  it.each(['tour', 'delivery'] as const)('yields its readout to the %s guide', (guide) => {
    if (guide === 'tour') useAnnouncementsStore.getState().setContext({ onboarding: true });
    else useUIStore.getState().setJourneyVisible(true);
    render(<CameraPresetIndicator />);
    expect(screen.queryByRole('status', { name: 'Camera view' })).not.toBeInTheDocument();
  });

  it('leaves compact layouts to their camera menu, including touch landscape', () => {
    layout.compact = true;
    render(<CameraPresetIndicator />);
    expect(screen.queryByRole('status', { name: 'Camera view' })).not.toBeInTheDocument();
  });
});
