import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ZoneCustomizationPanel } from '../ZoneCustomizationPanel';
import { useSafetyStore } from '../../../stores/safetyStore';

// The first press on a zone's remove button swaps it for Confirm, and Confirm
// swaps back by itself after 3 s. Both are one <button> in one place, so React
// keeps the element and its focus through each swap. A change that gives the two
// different element types or keys would drop a keyboard user on <body>.
// Working if focus moves onto Confirm when it appears, and back onto the
// zone's remove button when the confirmation lapses.
describe('ZoneCustomizationPanel focus through the remove confirmation', () => {
  let savedZones: ReturnType<typeof useSafetyStore.getState>['speedZones'];
  beforeEach(() => {
    vi.useFakeTimers();
    savedZones = useSafetyStore.getState().speedZones;
    useSafetyStore.setState({
      speedZones: [
        { id: 'zone-a', x: 0, z: 0, radius: 4, name: 'Alpha' },
        { id: 'zone-b', x: 5, z: 5, radius: 4, name: 'Bravo' },
      ],
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    useSafetyStore.setState({ speedZones: savedZones });
  });

  it('lands on Confirm when Remove arms it, and on Remove when it lapses', () => {
    render(<ZoneCustomizationPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Speed Zones/ }));
    const remove = screen.getByRole('button', { name: 'Remove zone Bravo' });
    remove.focus();
    fireEvent.click(remove);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Confirm removing zone Bravo' })
    );

    act(() => {
      vi.advanceTimersByTime(3100);
    });
    expect(screen.queryByRole('button', { name: 'Confirm removing zone Bravo' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove zone Bravo' }));
    expect(useSafetyStore.getState().speedZones).toHaveLength(2);
  });
});
