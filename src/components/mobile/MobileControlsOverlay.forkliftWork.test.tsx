import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useUIStore } from '../../stores/uiStore';
import {
  manualForkliftWork,
  resetManualForkliftInput,
  useForkliftDriveStore,
} from '../../stores/forkliftDriveStore';
import { setLocale } from '../../i18n';
import { MobileControlsOverlay } from './MobileControlsOverlay';

vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ camera: null, gl: { domElement: document.createElement('canvas') } }),
  useFrame: () => undefined,
}));
// The overlay's slide-up panel is not under test here.
vi.mock('./MobilePanel', () => ({ MobilePanel: () => null }));

beforeEach(() => {
  useUIStore.getState().setFpsMode(true);
  useForkliftDriveStore.setState({ drivenId: 'forklift-2', workOffer: null, workRefusal: null });
});
afterEach(() => {
  cleanup();
  setLocale('en');
  resetManualForkliftInput();
  useForkliftDriveStore.setState({
    drivenId: null,
    inReachId: null,
    workOffer: null,
    workRefusal: null,
  });
  useUIStore.getState().setFpsMode(false);
});

// The phone's Drive row runs the driver's pick or drop as E does in the cab
// (mechanics 6.2), and shows why a refused one was refused.
it('offers the pick at a station, asks for it, and shows a refusal', () => {
  render(<MobileControlsOverlay />);
  expect(screen.queryByTestId('forklift-touch-work')).toBeNull();

  act(() => useForkliftDriveStore.getState().setWorkOffer('pickup'));
  const button = screen.getByTestId('forklift-touch-work');
  expect(button.textContent).toContain('Pick up pallet');
  fireEvent.click(button);
  expect(manualForkliftWork.requested).toBe(true);

  act(() => useForkliftDriveStore.getState().setWorkRefusal('forksRaised'));
  expect(screen.getByRole('alert').textContent).toBe('Lower the forks first');
  // The step-down button stays beside it.
  expect(screen.getByTestId('forklift-touch-leave')).toBeTruthy();
});

it('reads in Portuguese, and offers the drop when loaded', () => {
  setLocale('pt-BR');
  useForkliftDriveStore.setState({ workOffer: 'dropoff', workRefusal: 'forksLow' });
  render(<MobileControlsOverlay />);
  expect(screen.getByTestId('forklift-touch-work').textContent).toContain('Deixar o palete');
  expect(screen.getByRole('alert').textContent).toBe('Erga os garfos até a plataforma primeiro');
});
