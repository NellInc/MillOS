import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dock } from './Dock';
import { useMobileControlStore } from '../../../stores/mobileControlStore';

vi.mock('../../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isMobile: true, isCompactLayout: true }),
}));

// In the compact layout a dock tap opens a sheet and never changes the
// sidebar's activeMode, which stays 'overview'. The dock stays drawn above the
// sheet (inert while it is open), so with the Safety sheet open it still lit
// Overview as the current page and Safety as not; aria-pressed carries the
// same flag as the highlight. Working if the dock lights the open sheet's
// item, and none while no sheet is open.
describe('Compact dock marks the open sheet', () => {
  afterEach(() => {
    cleanup();
    useMobileControlStore.setState({ mobilePanelVisible: false, mobilePanelContent: null });
  });

  it('marks Safety, not Overview, while the Safety sheet is open', () => {
    render(<Dock activeMode="overview" onModeChange={() => {}} />);
    act(() => useMobileControlStore.getState().openMobilePanel('safety'));
    expect(screen.getByRole('button', { name: 'Safety & Emergency' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Mill Overview' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('marks nothing once the sheet is closed', () => {
    render(<Dock activeMode="overview" onModeChange={() => {}} />);
    act(() => useMobileControlStore.getState().openMobilePanel('settings'));
    act(() => useMobileControlStore.getState().closeMobilePanel());
    for (const button of screen.getAllByRole('button')) {
      expect(button).not.toHaveAttribute('aria-pressed', 'true');
    }
  });

  it('lights More for a sheet opened from it (Autonomy)', () => {
    render(<Dock activeMode="overview" onModeChange={() => {}} />);
    const more = screen.getByRole('button', { name: 'More workspaces and view controls' });
    expect(more.className).not.toContain('text-cyan-300');
    act(() => useMobileControlStore.getState().openMobilePanel('management'));
    expect(more.className).toContain('text-cyan-300');
  });
});
