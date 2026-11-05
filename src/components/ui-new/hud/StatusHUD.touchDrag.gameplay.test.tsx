import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatusHUD } from './StatusHUD';
import { useUIStore } from '../../../stores/uiStore';

const viewport = { width: window.innerWidth, height: window.innerHeight };

// A tablet at 768 px or wider gets the desktop header. Its grip listened for
// mouse events only: a finger drag sends none, so the bar never moved, and a
// tap's compatibility mousedown detached it into a floating card that touch
// could neither move nor put back (only Home on a keyboard re-docks it).
// Working if a finger drags the bar, and a tap that does not move leaves it docked.
describe('StatusHUD grip under touch', () => {
  beforeEach(() => {
    useUIStore.setState({ alerts: [] });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: viewport.width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: viewport.height });
  });

  const setup = () => {
    render(<StatusHUD />);
    const hud = screen.getByRole('banner');
    vi.spyOn(hud, 'getBoundingClientRect').mockReturnValue({ width: 400, height: 48 } as DOMRect);
    return { hud, grip: screen.getByRole('button', { name: /Reposition status bar/ }) };
  };

  it('moves the bar with a finger drag', () => {
    const { hud, grip } = setup();
    fireEvent.pointerDown(grip, { pointerType: 'touch', pointerId: 7, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(window, { pointerType: 'touch', pointerId: 7, clientX: 80, clientY: 90 });
    fireEvent.pointerUp(window, { pointerType: 'touch', pointerId: 7, clientX: 80, clientY: 90 });
    expect(hud).toHaveStyle({ left: '76px', top: '86px' });
  });

  it('leaves the bar docked after a tap on the grip', () => {
    const { hud, grip } = setup();
    // A tap: the pointer events, then the browser's compatibility mouse events.
    fireEvent.pointerDown(grip, { pointerType: 'touch', pointerId: 8, clientX: 20, clientY: 20 });
    fireEvent.pointerUp(window, { pointerType: 'touch', pointerId: 8, clientX: 20, clientY: 20 });
    fireEvent.mouseDown(grip, { clientX: 20, clientY: 20 });
    fireEvent.mouseUp(window, { clientX: 20, clientY: 20 });
    expect(hud).toHaveClass('w-full');
    expect(hud).toHaveStyle({ left: '0px', top: '0px' });
  });
});
