import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CameraPresetMenu } from './CameraPresetMenu';
import { CAMERA_PRESETS, useCameraStore } from '../CameraController';

afterEach(() => {
  cleanup();
  useCameraStore.getState().cancelAnimation();
});

describe('compact camera disclosure', () => {
  it('keeps all seven touch targets in a viewport-bounded scroll region', () => {
    render(<CameraPresetMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Open camera menu' }));
    const group = screen.getByRole('group', { name: 'Camera views' });
    expect(group.style.maxHeight).toContain('100dvh');
    for (const preset of CAMERA_PRESETS) {
      const option = screen.getByRole('button', { name: preset.name });
      expect(option).toHaveClass('min-h-11', 'touch-pan-y');
      expect(option.parentElement).toHaveClass('overflow-y-auto', 'overscroll-contain');
    }
    expect(screen.getByRole('button', { name: 'Close camera menu' })).toHaveAttribute(
      'aria-controls',
      group.id
    );
  });

  it('announces the chosen view and returns focus when selecting a new one', () => {
    useCameraStore.getState().setPreset(0);
    render(<CameraPresetMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Open camera menu' }));
    expect(screen.getByRole('button', { name: 'Overview' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    const receiving = screen.getByRole('button', { name: 'Receiving' });
    receiving.focus();
    fireEvent.click(receiving);
    expect(useCameraStore.getState().activePreset).toBe(6);
    expect(screen.getByRole('button', { name: 'Open camera menu' })).toHaveFocus();
  });

  it('returns focus on Escape without passing it to the scene', () => {
    render(<CameraPresetMenu />);
    fireEvent.click(screen.getByRole('button', { name: 'Open camera menu' }));
    const option = screen.getByRole('button', { name: 'Shipping' });
    option.focus();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    fireEvent(option, event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByRole('button', { name: 'Open camera menu' })).toHaveFocus();
  });
});
