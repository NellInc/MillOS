import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardShortcutsModal } from '../KeyboardShortcutsModal';
import { CAMERA_PRESETS } from '../../CameraController';

describe('keyboard help contract', () => {
  it('documents the real preset range and the scope of pause and stop', () => {
    render(<KeyboardShortcutsModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText(`1-${CAMERA_PRESETS.length}`)).toBeInTheDocument();
    expect(screen.getByText('Pause/resume simulation')).toBeInTheDocument();
    expect(
      screen.getByText('Forklift emergency stop / release (scene focused)')
    ).toBeInTheDocument();
  });

  it('keeps the documented question-mark close action inside the modal', () => {
    const close = vi.fn();
    render(<KeyboardShortcutsModal isOpen onClose={close} />);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Close keyboard shortcuts' }), {
      key: '?',
    });
    expect(close).toHaveBeenCalledOnce();
  });

  // In first person beside a forklift, F boards it (FirstPersonController) and
  // the fullscreen shortcut stands aside; the help said only "Toggle fullscreen".
  it('says what F does beside a forklift in first person', () => {
    render(<KeyboardShortcutsModal isOpen onClose={vi.fn()} />);
    const row = screen.getByText('F', { selector: 'kbd' }).parentElement;
    expect(row).toHaveTextContent('forklift');
  });

  // The help listed "M: Minimize/Expand panel", a key that changed nothing.
  it('advertises no M shortcut', () => {
    render(<KeyboardShortcutsModal isOpen onClose={vi.fn()} />);
    expect(screen.queryByText('M')).not.toBeInTheDocument();
    expect(screen.queryByText('Minimize/Expand panel')).not.toBeInTheDocument();
  });
});
