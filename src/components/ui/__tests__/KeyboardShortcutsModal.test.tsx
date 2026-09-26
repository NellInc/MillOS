import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardShortcutsModal } from '../KeyboardShortcutsModal';
import { CAMERA_PRESETS } from '../../CameraController';

describe('keyboard help contract', () => {
  it('documents the real preset range and the scope of pause and stop', () => {
    render(<KeyboardShortcutsModal isOpen onClose={vi.fn()} />);
    expect(screen.getByText(`1-${CAMERA_PRESETS.length}`)).toBeInTheDocument();
    expect(screen.getByText('Pause/resume production')).toBeInTheDocument();
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
});
