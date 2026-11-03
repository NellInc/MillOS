import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { MiniMap } from './MiniMap';
import { useUIStore } from '../../stores/uiStore';

/** As OverviewPanel hosts it: a Mini-map toggle, and the map rendered elsewhere. */
function Host() {
  const showMiniMap = useUIStore((state) => state.showMiniMap);
  return (
    <div>
      <button
        type="button"
        aria-pressed={showMiniMap}
        onClick={() => useUIStore.getState().setShowMiniMap(!showMiniMap)}
      >
        Mini-map
      </button>
      <MiniMap />
    </div>
  );
}

describe('MiniMap close focus', () => {
  afterEach(() => {
    cleanup();
    useUIStore.getState().setShowMiniMap(false);
  });

  it("returns focus to the toggle that opened it when the map's close button is used", () => {
    useUIStore.getState().setShowMiniMap(false);
    render(<Host />);
    const toggle = screen.getByRole('button', { name: 'Mini-map' });
    toggle.focus();
    fireEvent.click(toggle);
    const close = screen.getByRole('button', { name: 'Close mini map' });
    close.focus();
    fireEvent.click(close);
    expect(screen.queryByRole('button', { name: 'Close mini map' })).not.toBeInTheDocument();
    // On <body>, the next Space engages the forklift emergency stop.
    expect(document.activeElement).toBe(toggle);
  });
});
