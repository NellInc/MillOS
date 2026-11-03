import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { targetSlotHeld } from '../productionTargetSlot';
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

afterEach(() => {
  cleanup();
  useMobileControlStore.getState().closeMobilePanel();
});

// The sheet is mounted only on a compact layout (MobileControlsOverlay). A
// window widened past 768 px, or a tablet turned, with a sheet open unmounted
// it but left mobilePanelVisible true: on the desktop layout the production
// target card and the AI reflections stayed hidden behind a sheet nobody could
// see or close.
it('lets go of the sheet flag when the compact layout unmounts the sheet', () => {
  useMobileControlStore.getState().openMobilePanel('settings');
  const { unmount } = render(<MobilePanel isVisible content="settings" onClose={vi.fn()} />);
  expect(targetSlotHeld()).toBe(true);
  unmount();
  expect(useMobileControlStore.getState().mobilePanelVisible).toBe(false);
  expect(targetSlotHeld()).toBe(false);
});
