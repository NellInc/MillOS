import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../../stores/uiStore';
import { FEATURE_FLAGS } from '../../../config/featureFlags';
import { useMotionPreferenceStore } from '../../../stores/motionPreferenceStore';
import type { AlertData } from '../../../types';
import { WeatherEffectsOverlay } from '../WeatherEffectsOverlay';

const alert = (title: string, message: string, type: AlertData['type'] = 'warning'): AlertData => ({
  id: `${title}-${message}`,
  type,
  title,
  message,
  timestamp: new Date(),
  acknowledged: false,
});

describe('WeatherEffectsOverlay', () => {
  afterEach(() => {
    cleanup();
    useUIStore.setState({ alerts: [] });
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = false;
    useMotionPreferenceStore.setState({ mode: 'system' });
  });

  it('ignores alerts that only contain weather words inside other words', () => {
    useUIStore.setState({
      alerts: [
        alert('Raw Grain Inventory: 8.0 t, below the 10.0 t limit', 'LOLO alarm', 'critical'),
        alert('Service Windows', 'Achievement unlocked', 'info'),
        alert('Drainage check', 'Strain gauge recalibrated'),
      ],
    });
    render(<WeatherEffectsOverlay />);
    expect(screen.queryByText(/Warning$/)).not.toBeInTheDocument();
  });

  it('shows the overlay for a real weather alert', () => {
    useUIStore.setState({ alerts: [alert('Severe rain', 'Heavy rain over the receiving yard')] });
    render(<WeatherEffectsOverlay />);
    expect(screen.getByText('rain Warning')).toBeInTheDocument();
  });

  it('stops the falling rain when the in-app Reduce motion is On', () => {
    useUIStore.setState({ alerts: [alert('Severe rain', 'Heavy rain over the receiving yard')] });
    const view = render(<WeatherEffectsOverlay />);
    expect(view.container.ownerDocument.querySelectorAll('.bg-gradient-to-b').length).toBe(25);
    cleanup();

    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = true;
    useMotionPreferenceStore.setState({ mode: 'reduce' });
    const reduced = render(<WeatherEffectsOverlay />);
    expect(screen.getByText('rain Warning')).toBeInTheDocument();
    expect(reduced.container.ownerDocument.querySelectorAll('.bg-gradient-to-b').length).toBe(0);
  });
});
