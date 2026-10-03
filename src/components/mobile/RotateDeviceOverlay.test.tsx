import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { RotateDeviceOverlay } from './RotateDeviceOverlay';

afterEach(cleanup);

it('holds keyboard focus in the orientation notice until it is released', () => {
  const view = render(<RotateDeviceOverlay visible />);
  const dialog = screen.getByRole('dialog', { name: 'Rotate to landscape' });
  expect(dialog).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Tab' });
  expect(dialog).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
  expect(dialog).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(dialog).toBeInTheDocument();
  view.rerender(<RotateDeviceOverlay visible={false} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('restores the originating control when the viewport is rotated', () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const view = render(<RotateDeviceOverlay visible />);
  expect(screen.getByRole('dialog')).toHaveFocus();
  view.rerender(<RotateDeviceOverlay visible={false} />);
  expect(trigger).toHaveFocus();
  trigger.remove();
});
