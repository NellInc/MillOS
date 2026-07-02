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
        workerEvasions: 0,
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
  });

  describe('Rendering', () => {
    it('should render the screen reader alert container', () => {
      render(<AlertSystem />);

      const alertContainer = document.querySelector('[role="alert"]');
      expect(alertContainer).toBeInTheDocument();
    });

    it('should have accessible screen reader region', () => {
      render(<AlertSystem />);

      // role="alert" is an implicitly assertive live region
      const liveRegion = document.querySelector('[role="alert"]');
      expect(liveRegion).toBeInTheDocument();
      expect(liveRegion).toHaveClass('sr-only');
    });

    it('should not render any visible alert UI', () => {
      render(<AlertSystem />);

      // AlertSystem only renders an sr-only screen reader region
      const alertElements = document.querySelectorAll('[role="alert"]');
      expect(alertElements.length).toBe(1);
      expect(alertElements[0]).toHaveClass('sr-only');
    });
  });

  describe('uiStore Integration', () => {
    it('should push alerts to uiStore in dev mode', async () => {
      render(<AlertSystem />);

      // Wait for initial alerts to be set up
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Check that alerts were added to uiStore
      const alerts = useUIStore.getState().alerts;
      expect(alerts.length).toBeGreaterThan(0);
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
      expect(newCount).toBeGreaterThan(initialCount);
    });
  });

  describe('Safety Integration', () => {
    it('should create safety alert when safety stop occurs', async () => {
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

      // Check that a safety alert was added
      const alerts = useUIStore.getState().alerts;
      const safetyAlerts = alerts.filter((a) => a.type === 'safety');

      // Safety alert should be added
      expect(alerts.length).toBeGreaterThan(initialAlertCount);
      expect(safetyAlerts.length).toBeGreaterThan(0);
    });

    it('should increment safety stops correctly', () => {
      const { recordSafetyStop } = useSafetyStore.getState();

      recordSafetyStop();
      recordSafetyStop();
      recordSafetyStop();

      const state = useSafetyStore.getState();
      expect(state.safetyMetrics.safetyStops).toBe(3);
    });
  });

  describe('Accessibility', () => {
    it('should update live region for critical alerts', async () => {
      render(<AlertSystem />);

      // role="alert" is an implicitly assertive live region
      const liveRegion = document.querySelector('[role="alert"]');
      expect(liveRegion).toBeInTheDocument();
      expect(liveRegion).toHaveAttribute('aria-atomic', 'true');
    });
  });
});
