import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ZoneCustomizationPanel } from '../ZoneCustomizationPanel';
import { useSafetyStore } from '../../../stores/safetyStore';
import { setLocale } from '../../../i18n';

describe('ZoneCustomizationPanel zone geometry copy', () => {
  let savedZones: ReturnType<typeof useSafetyStore.getState>['speedZones'];
  beforeEach(() => {
    savedZones = useSafetyStore.getState().speedZones;
    useSafetyStore.setState({
      speedZones: [{ id: 'zone-half', x: -12.5, z: 3, radius: 2.5, name: 'Dock apron' }],
    });
  });
  afterEach(() => {
    act(() => setLocale('en'));
    useSafetyStore.setState({ speedZones: savedZones });
  });

  // Numbers in copy go through the locale formatter: pt-BR reads "2.5" as
  // twenty-five tenths written wrongly, and a decimal comma beside the list
  // comma would make "(-12,5, 3)" ambiguous.
  it('writes a zone position and radius in the active language', () => {
    act(() => setLocale('en'));
    render(<ZoneCustomizationPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Speed Zones/ }));
    expect(screen.getByText('(-12.5, 3) r=2.5m')).toBeInTheDocument();

    act(() => setLocale('pt-BR'));
    expect(screen.getByText('(-12,5; 3) r=2,5 m')).toBeInTheDocument();
  });
});
