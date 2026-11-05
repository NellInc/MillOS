import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZoneCustomizationPanel } from '../ZoneCustomizationPanel';
import { useSafetyStore } from '../../../stores/safetyStore';

// Add Speed Zone swaps itself for the form, Add and Cancel swap the form back,
// and Confirm removes the zone's row. Each removed the focused control, so
// focus fell to <body> and a keyboard user lost their place.
// Working if focus lands on the name field when the form opens, on Add Speed
// Zone when it closes, and on the Speed Zones toggle after a removal.
describe('ZoneCustomizationPanel focus when a control replaces itself', () => {
  let savedZones: ReturnType<typeof useSafetyStore.getState>['speedZones'];
  beforeEach(() => {
    savedZones = useSafetyStore.getState().speedZones;
    useSafetyStore.setState({
      speedZones: [{ id: 'zone-a', x: 0, z: 0, radius: 4, name: 'Alpha' }],
    });
  });
  afterEach(() => {
    cleanup();
    useSafetyStore.setState({ speedZones: savedZones });
  });

  const expand = () => fireEvent.click(screen.getByRole('button', { name: /Speed Zones/ }));
  const press = (name: string | RegExp) => {
    const button = screen.getByRole('button', { name });
    button.focus();
    fireEvent.click(button);
  };

  it('focuses the zone name field when the form opens', () => {
    render(<ZoneCustomizationPanel />);
    expand();
    press('Add Speed Zone');
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Zone name' }));
  });

  it('returns focus to Add Speed Zone on Cancel and after adding', () => {
    render(<ZoneCustomizationPanel />);
    expand();
    press('Add Speed Zone');
    press('Cancel');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Speed Zone' }));

    press('Add Speed Zone');
    fireEvent.change(screen.getByRole('textbox', { name: 'Zone name' }), {
      target: { value: 'Bravo' },
    });
    press('Add Zone');
    expect(useSafetyStore.getState().speedZones).toHaveLength(2);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Add Speed Zone' }));
  });

  it('moves focus to the Speed Zones toggle after a zone is removed', () => {
    render(<ZoneCustomizationPanel />);
    expand();
    press('Remove zone Alpha');
    press('Confirm removing zone Alpha');
    expect(useSafetyStore.getState().speedZones).toHaveLength(0);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /Speed Zones/ }));
  });
});
