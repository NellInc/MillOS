import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dock } from './Dock';
import { KeyboardShortcutsModal } from '../../ui/KeyboardShortcutsModal';
import { useUIStore } from '../../../stores/uiStore';

vi.mock('../../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isMobile: false, isCompactLayout: false }),
}));

const flushFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });

// GameInterface mounts the keyboard help beside the dock, driven by the store.
const Shell = () => {
  const showShortcuts = useUIStore((state) => state.showShortcuts);
  return (
    <>
      <Dock activeMode="overview" onModeChange={() => {}} />
      <KeyboardShortcutsModal
        isOpen={showShortcuts}
        onClose={() => useUIStore.getState().setShowShortcuts(false)}
      />
    </>
  );
};

describe('Dock More menu under a modal dialog', () => {
  afterEach(() => {
    cleanup();
    useUIStore.getState().setShowShortcuts(false);
  });

  it('leaves Escape to the keyboard help opened over the open menu', async () => {
    render(<Shell />);
    fireEvent.click(screen.getByRole('button', { name: 'More workspaces and view controls' }));
    await flushFrame();
    const item = screen.getAllByRole('menuitem')[0];
    expect(item).toHaveFocus();

    // ? on the focused menu item opens the keyboard help (useKeyboardShortcuts).
    act(() => useUIStore.getState().setShowShortcuts(true));
    const dialog = screen.getByRole('dialog', { name: 'Keyboard Shortcuts' });
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' });
    await flushFrame();

    // The dialog on top takes the Escape; focus goes back to the menu item.
    expect(screen.queryByRole('dialog', { name: 'Keyboard Shortcuts' })).not.toBeInTheDocument();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(item).toHaveFocus();
  });

  it('keeps the menu, and so the help close focus target, under a click in the help', async () => {
    render(<Shell />);
    fireEvent.click(screen.getByRole('button', { name: 'More workspaces and view controls' }));
    await flushFrame();
    const item = screen.getAllByRole('menuitem')[0];
    act(() => useUIStore.getState().setShowShortcuts(true));

    const close = screen.getByRole('button', { name: 'Close keyboard shortcuts' });
    fireEvent.mouseDown(close);
    fireEvent.click(close);
    await flushFrame();

    expect(screen.queryByRole('dialog', { name: 'Keyboard Shortcuts' })).not.toBeInTheDocument();
    expect(item.isConnected).toBe(true);
    expect(item).toHaveFocus();
  });

  it('keeps the menu under a click on the help backdrop', async () => {
    render(<Shell />);
    fireEvent.click(screen.getByRole('button', { name: 'More workspaces and view controls' }));
    await flushFrame();
    const item = screen.getAllByRole('menuitem')[0];
    act(() => useUIStore.getState().setShowShortcuts(true));

    const backdrop = screen.getByRole('dialog', { name: 'Keyboard Shortcuts' })
      .parentElement as HTMLElement;
    fireEvent.mouseDown(backdrop);
    fireEvent.click(backdrop);
    await flushFrame();

    expect(screen.queryByRole('dialog', { name: 'Keyboard Shortcuts' })).not.toBeInTheDocument();
    expect(item.isConnected).toBe(true);
    expect(item).toHaveFocus();
  });
});
