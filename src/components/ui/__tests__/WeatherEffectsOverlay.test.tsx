import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../../stores/uiStore';
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
});
