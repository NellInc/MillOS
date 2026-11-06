import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Dock } from './Dock';

vi.mock('../../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isMobile: false, isCompactLayout: false }),
}));

const flushFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  });

describe('Dock More menu under the keyboard', () => {
  it('lets the arrow keys work outside the menu once focus has left it', async () => {
    render(
      <>
        <Dock activeMode="overview" onModeChange={() => {}} />
        <input type="range" aria-label="Production speed" />
      </>
    );
    fireEvent.click(screen.getByRole('button', { name: 'More workspaces and view controls' }));
    await flushFrame();
    const slider = screen.getByRole('slider', { name: 'Production speed' });
    slider.focus();
    const event = fireEvent.keyDown(slider, { key: 'ArrowDown' });
    expect(event).toBe(true);
    expect(slider).toHaveFocus();
  });

  it('closes the menu when Tab moves focus out of it', async () => {
    render(<Dock activeMode="overview" onModeChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'More workspaces and view controls' }));
    await flushFrame();
    const first = screen.getAllByRole('menuitem')[0];
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: 'Tab' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
