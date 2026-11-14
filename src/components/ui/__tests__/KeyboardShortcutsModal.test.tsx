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

  // F is only fullscreen; E or a click drives a forklift in first person
  // (Nell, 2026-11-07: "F is fullscreen, but you use it for forklift also?").
  it('keeps F for fullscreen and lists E for the forklift', () => {
    render(<KeyboardShortcutsModal isOpen onClose={vi.fn()} />);
    const row = screen.getByText('F', { selector: 'kbd' }).parentElement;
    expect(row).toHaveTextContent('Toggle fullscreen');
    expect(row).not.toHaveTextContent('forklift');
    const forklift = screen.getByText(/^E \//, { selector: 'kbd' }).parentElement;
    expect(forklift).toHaveTextContent('forklift');
  });

  // The help listed "M: Minimize/Expand panel", a key that changed nothing.
  // M now opens the Chronicle (plan 2.10).
  it('advertises M for the Chronicle, not the old minimise', () => {
    render(<KeyboardShortcutsModal isOpen onClose={vi.fn()} />);
    expect(screen.queryByText('Minimize/Expand panel')).not.toBeInTheDocument();
    expect(screen.getByText('M', { selector: 'kbd' }).parentElement).toHaveTextContent(
      'Mill Chronicle'
    );
  });
});
