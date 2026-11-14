import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { EmergencyOverlay } from '../EmergencyOverlay';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { useMobileControlStore } from '../../stores/mobileControlStore';

// The capture pass: the forklift-stop and drill banners sat at top-4, over the
// HUD row, hiding the programme and the commitment. Working if the banner sits
// below the row (48 px) on a desktop-width screen.

const reset = () => {
  useGameSimulationStore.setState({
    emergencyActive: false,
    emergencyDrillMode: false,
    emergencyMachineId: null,
  });
  useSafetyStore.setState({ forkliftEmergencyStop: false });
  useMobileControlStore.setState({ mobilePanelVisible: false });
};
beforeEach(reset);
afterEach(() => {
  cleanup();
  reset();
});

it.each([
  ['forklift stop', () => useSafetyStore.setState({ forkliftEmergencyStop: true }), 'FORKLIFT'],
  [
    'drill',
    () =>
      useGameSimulationStore.setState({
        emergencyActive: true,
        emergencyDrillMode: true,
        emergencyMachineId: 'DRILL',
      }),
    'Egress',
  ],
] as const)('places the %s banner below the HUD row', (_name, raise, _title) => {
  render(<EmergencyOverlay />);
  act(() => raise());
  const banner = screen.getByTestId('emergency-banner');
  expect(banner.className).toMatch(/\bsm:top-16\b/);
});

// On a phone the compact HUD's bell row runs from the safe-area top to 48 px
// below it; the banner at top-4 covered it. Working if, below the sm
// breakpoint, the banner starts under the bell row and the guidance under it.
it('places the phone banner under the bell row, and its guidance under the banner', () => {
  render(<EmergencyOverlay />);
  act(() => useSafetyStore.setState({ forkliftEmergencyStop: true }));
  const banner = screen.getByTestId('emergency-banner');
  expect(banner.className).toContain('top-[calc(max(0.75rem,env(safe-area-inset-top))+3.5rem)]');
  expect(banner.className).not.toMatch(/(^|\s)top-4(\s|$)/);
  const guidance = banner.nextElementSibling as HTMLElement;
  expect(guidance.className).toContain('top-[calc(max(0.75rem,env(safe-area-inset-top))+7rem)]');
});

// Seen on a landscape phone: STOP FORKLIFTS pressed in the Safety sheet put the
// banner over the sheet's tabs and the guidance and Release over its controls
// (the overlay is z-[60], the sheet z-50). While a sheet is open the sheet is
// what is read: the banner and guidance step aside and return when it closes,
// as they do for a Chronicle dialog; the border and the spoken alert stay.
it('steps the banner and guidance aside while a phone sheet is open', () => {
  useMobileControlStore.setState({ mobilePanelVisible: true });
  render(<EmergencyOverlay />);
  act(() => useSafetyStore.setState({ forkliftEmergencyStop: true }));
  expect(screen.queryByTestId('emergency-banner')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Release forklift stop' })).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent('Forklift emergency stop');
  act(() => useMobileControlStore.setState({ mobilePanelVisible: false }));
  expect(screen.getByTestId('emergency-banner')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Release forklift stop' })).toBeInTheDocument();
});

// Seen on a landscape phone (844 x 390): wide enough for sm, so the banner took
// top-16 and covered the soundtrack card's controls (64 to 117 px). On a short
// screen it drops into the clear centre, above the guidance at bottom-28.
it('drops the banner below the soundtrack card on a short screen', () => {
  render(<EmergencyOverlay />);
  act(() => useSafetyStore.setState({ forkliftEmergencyStop: true }));
  const banner = screen.getByTestId('emergency-banner');
  expect(banner.className).toContain(
    '[@media(min-width:640px)_and_(max-height:480px)]:top-[7.5rem]'
  );
  // At top-32 the Portuguese forklift guidance (two lines) rose into the
  // banner; a wider guidance then ran over the walk D-pad. The banner is
  // compact there instead (120 to about 146 px), the guidance unchanged.
  const pill = banner.firstElementChild as HTMLElement;
  expect(pill).toHaveClass('[@media(max-height:480px)]:py-1');
  expect(pill.querySelector('span')).toHaveClass('[@media(max-height:480px)]:text-xs');
  const guidance = (banner.nextElementSibling as HTMLElement).firstElementChild;
  expect(guidance).toHaveClass('max-w-md');
  expect(guidance!.parentElement!.className).not.toContain('36rem');
});
