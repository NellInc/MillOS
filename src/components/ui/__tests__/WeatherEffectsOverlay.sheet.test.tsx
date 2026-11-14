import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, expect, it } from 'vitest';
import { useUIStore } from '../../../stores/uiStore';
import { useMobileControlStore } from '../../../stores/mobileControlStore';
import { WeatherEffectsOverlay } from '../WeatherEffectsOverlay';

// Seen in the capture pass: the rain badge drew over an open phone sheet. Its
// layer and the sheet's sit in different stacking contexts, so, as the
// crosshair does, the weather overlay steps aside while a sheet is open.

afterEach(() => {
  cleanup();
  useUIStore.setState({ alerts: [] });
  useMobileControlStore.setState({ mobilePanelVisible: false });
});

it('hides the weather badge and rain while a phone sheet is open', () => {
  useUIStore.setState({
    alerts: [
      {
        id: 'rain',
        type: 'warning',
        title: 'Severe rain',
        message: 'Heavy rain over the receiving yard',
        timestamp: new Date(),
        acknowledged: false,
      },
    ],
  });
  useMobileControlStore.setState({ mobilePanelVisible: true });
  render(<WeatherEffectsOverlay />);
  expect(screen.queryByText('rain Warning')).toBeNull();
  act(() => useMobileControlStore.setState({ mobilePanelVisible: false }));
  expect(screen.getByText('rain Warning')).toBeInTheDocument();
});

it('steps aside for a modal dialog and returns when it closes', async () => {
  useUIStore.setState({
    alerts: [
      {
        id: 'rain',
        type: 'warning',
        title: 'Severe rain',
        message: 'Heavy rain over the receiving yard',
        timestamp: new Date(),
        acknowledged: false,
      },
    ],
  });
  render(<WeatherEffectsOverlay />);
  expect(screen.getByText('rain Warning')).toBeInTheDocument();
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  await act(async () => {
    document.body.appendChild(dialog);
  });
  expect(screen.queryByText('rain Warning')).toBeNull();
  await act(async () => {
    dialog.remove();
  });
  expect(screen.getByText('rain Warning')).toBeInTheDocument();
});
