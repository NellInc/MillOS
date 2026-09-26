/**
 * Tests for AlertSystem Component
 *
 * Tests cover:
 * - Alert generation and uiStore integration
 * - Safety alert integration with safety store
 * - Screen reader accessibility
 *
 * Note: AlertSystem no longer renders visible alerts directly.
 * Alerts are pushed to uiStore and displayed via StatusHUD.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AlertSystem } from '../AlertSystem';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';
import { audioManager } from '../../utils/audioManager';

// Mock audio manager
vi.mock('../../utils/audioManager', () => ({
  audioManager: {
    playAlert: vi.fn(),
  },
}));

describe('AlertSystem', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset safety store
    useSafetyStore.setState({
      safetyMetrics: {
        nearMisses: 0,
        safetyStops: 0,
        routeConflicts: 0,
        lastIncidentTime: null,
        daysSinceIncident: 127,
      },
    });
    // Reset UI store alerts
    useUIStore.setState({
      alerts: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('should render exactly one atomic, screen-reader-only alert region', () => {
      render(<AlertSystem />);

      const alertElements = document.querySelectorAll('[role="alert"]');
      expect(alertElements).toHaveLength(1);
      expect(alertElements[0]).toHaveClass('sr-only');
      expect(alertElements[0]).toHaveAttribute('aria-atomic', 'true');
    });
  });

  describe('uiStore Integration', () => {
    it('should push alerts to uiStore in dev mode', async () => {
      render(<AlertSystem />);

      // Wait for initial alerts to be set up
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const alerts = useUIStore.getState().alerts;
      expect(alerts).toHaveLength(2);
      expect(alerts.map(({ id, type, title }) => ({ id, type, title }))).toEqual([
        { id: 'alert-1', type: 'warning', title: 'Temperature Rising' },
        { id: 'alert-0', type: 'success', title: 'Maintenance Complete' },
      ]);
    });

    it('should generate periodic alerts in dev mode', async () => {
      render(<AlertSystem />);

      // Wait for initial alerts
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const initialCount = useUIStore.getState().alerts.length;

      // Wait for periodic alert (8000ms interval)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });

      const newCount = useUIStore.getState().alerts.length;
      expect(newCount).toBe(initialCount + 1);
    });
  });

  describe('Safety Integration', () => {
    it('should create safety alert when safety stop occurs', async () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);
      render(<AlertSystem />);

      // Wait for initial mount
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const initialAlertCount = useUIStore.getState().alerts.length;

      // Trigger a safety stop
      const { recordSafetyStop } = useSafetyStore.getState();

      await act(async () => {
        recordSafetyStop();
        await vi.advanceTimersByTimeAsync(100);
      });

      const alerts = useUIStore.getState().alerts;
      const safetyAlerts = alerts.filter((a) => a.type === 'safety');

      expect(alerts).toHaveLength(initialAlertCount + 1);
      expect(safetyAlerts).toHaveLength(1);
      expect(safetyAlerts[0]).toMatchObject({
        title: 'Near-Miss Avoided',
        message: 'Forklift stopped for a blocked aisle - safety protocol activated',
        acknowledged: false,
      });
      expect(audioManager.playAlert).toHaveBeenCalledTimes(1);
      expect(document.querySelector('[role="alert"]')).toHaveTextContent(
        'Safety alert: Near-Miss Avoided. Forklift stopped for a blocked aisle - safety protocol activated'
      );
    });

    it('does not report a near miss when forklifts halt for a deliberate emergency stop', async () => {
      render(<AlertSystem />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      const initialAlertCount = useUIStore.getState().alerts.length;

      useSafetyStore.setState({ forkliftEmergencyStop: true });
      await act(async () => {
        useSafetyStore.getState().recordSafetyStop();
        await vi.advanceTimersByTimeAsync(100);
      });
      useSafetyStore.setState({ forkliftEmergencyStop: false });

      expect(useUIStore.getState().alerts).toHaveLength(initialAlertCount);
      expect(audioManager.playAlert).not.toHaveBeenCalled();
    });
  });
});
