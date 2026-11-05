import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StatusHUD } from './StatusHUD';
import { KeyboardShortcutsModal } from '../../ui/KeyboardShortcutsModal';
import { useUIStore } from '../../../stores/uiStore';
import type { AlertData } from '../../../types';

const alert = (id: string, title: string): AlertData => ({
  id,
  type: 'warning',
  title,
  message: `${title} message`,
  timestamp: new Date(),
  acknowledged: false,
});

const flushFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });

// GameInterface mounts the keyboard help beside the HUD, driven by the store.
const Shell = () => {
  const showShortcuts = useUIStore((state) => state.showShortcuts);
  return (
    <>
      <StatusHUD />
      <KeyboardShortcutsModal
        isOpen={showShortcuts}
        onClose={() => useUIStore.getState().setShowShortcuts(false)}
      />
    </>
  );
};

describe('StatusHUD notifications under a modal dialog', () => {
  beforeEach(() => {
    useUIStore.setState({ alerts: [alert('a', 'First')] });
  });
  afterEach(() => {
    cleanup();
    useUIStore.getState().setShowShortcuts(false);
    useUIStore.setState({ alerts: [] });
  });

  it.each([
    ['its Close button', () => screen.getByRole('button', { name: 'Close keyboard shortcuts' })],
    [
      'its backdrop',
      () => screen.getByRole('dialog', { name: 'Keyboard Shortcuts' }).parentElement as HTMLElement,
    ],
  ])('keeps the list, and focus in it, under a click on the help (%s)', async (_, target) => {
    render(<Shell />);
    fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    await flushFrame();
    const acknowledge = screen.getByRole('button', { name: 'Acknowledge First' });
    acknowledge.focus();

    // ? on the focused row button opens the keyboard help (useKeyboardShortcuts).
    act(() => useUIStore.getState().setShowShortcuts(true));
    const element = target();
    fireEvent.mouseDown(element);
    fireEvent.click(element);
    await flushFrame();

    expect(screen.queryByRole('dialog', { name: 'Keyboard Shortcuts' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Notifications' })).toBeInTheDocument();
    expect(acknowledge).toHaveFocus();
  });
});
