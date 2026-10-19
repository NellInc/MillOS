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

  describe('Polite notices', () => {
    const notice = (id: string, announce?: 'polite') => ({
      id,
      type: 'info' as const,
      title: `${id} title`,
      message: `${id} message.`,
      timestamp: new Date(),
      acknowledged: false,
      ...(announce ? { announce } : {}),
    });
    const politeRegion = () => document.querySelector('[role="status"][aria-live="polite"]');

    it('reads an alert marked polite once, and leaves routine info alerts silent', async () => {
      // Present before mount: already filed, so not news.
      useUIStore.getState().addAlert(notice('restored', 'polite'));
      render(<AlertSystem />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      expect(politeRegion()).toBeInTheDocument();
      expect(politeRegion()).toHaveClass('sr-only');
      expect(politeRegion()).toHaveTextContent('');

      act(() => useUIStore.getState().addAlert(notice('routine')));
      expect(politeRegion()).toHaveTextContent('');

      act(() => useUIStore.getState().addAlert(notice('shift-review-1', 'polite')));
      expect(politeRegion()).toHaveTextContent('shift-review-1 title. shift-review-1 message.');
      // The assertive region stays for safety, critical and warning alerts.
      expect(document.querySelector('[role="alert"]')).toHaveTextContent('');

      // Acknowledging it in the bell changes the list but is not a new notice.
      act(() => useUIStore.getState().acknowledgeAlert('shift-review-1'));
      act(() => useUIStore.getState().addAlert(notice('routine-2')));
      expect(politeRegion()).toHaveTextContent('shift-review-1 title. shift-review-1 message.');
    });

    it('reads a notice again when the next one has the same words', () => {
      render(<AlertSystem />);
      const same = (id: string) => ({
        id,
        type: 'info' as const,
        title: 'Afternoon shift closed: grade A',
        message: 'Its review is in Overview.',
        timestamp: new Date(),
        acknowledged: false,
        announce: 'polite' as const,
      });
      act(() => useUIStore.getState().addAlert(same('shift-review-2')));
      const first = politeRegion()!.textContent;
      act(() => useUIStore.getState().addAlert(same('shift-review-3')));
      const second = politeRegion()!.textContent;
      // A live region whose text does not change is not read again.
      expect(second).not.toBe(first);
      expect(politeRegion()).toHaveTextContent(
        'Afternoon shift closed: grade A. Its review is in Overview.'
      );
      act(() => useUIStore.getState().addAlert(same('shift-review-4')));
      expect(politeRegion()!.textContent).not.toBe(second);
    });
  });

  // Breakdowns, wear warnings and quality holds are read from the bell itself,
  // so a player who muted game audio (which silences the PA) still hears them.
  describe('Production faults reach a screen reader whatever the audio', () => {
    const fault = (
      id: string,
      type: 'critical' | 'warning',
      announce?: 'polite' | 'assertive'
    ) => ({
      id,
      type,
      title: `${id} title`,
      message: `${id} message.`,
      machineId: 'rm-103',
      timestamp: new Date(),
      acknowledged: false,
      ...(announce ? { announce } : {}),
    });
    const assertiveRegion = () => document.querySelector('[role="alert"]');
    const politeRegion = () => document.querySelector('[role="status"][aria-live="polite"]');

    it('reads a breakdown assertively and a wear warning politely as they are filed', () => {
      useUIStore.getState().addAlert(fault('breakdown-before-mount', 'critical', 'assertive'));
      render(<AlertSystem />);
      // Already in the bell at mount: not news.
      expect(assertiveRegion()).toHaveTextContent('');

      act(() => useUIStore.getState().addAlert(fault('breakdown-rm-103', 'critical', 'assertive')));
      expect(assertiveRegion()).toHaveTextContent(
        'breakdown-rm-103 title. breakdown-rm-103 message.'
      );
      expect(politeRegion()).toHaveTextContent('');

      act(() => useUIStore.getState().addAlert(fault('wear-warning-rm-103', 'warning', 'polite')));
      expect(politeRegion()).toHaveTextContent(
        'wear-warning-rm-103 title. wear-warning-rm-103 message.'
      );
      // Unmarked alerts (SCADA alarms, sample traffic) stay in the bell only.
      act(() => useUIStore.getState().addAlert(fault('scada-1', 'critical')));
      expect(assertiveRegion()).toHaveTextContent(
        'breakdown-rm-103 title. breakdown-rm-103 message.'
      );
    });

    it('reads two faults filed in one tick, and re-reads an identical later one', () => {
      render(<AlertSystem />);
      act(() =>
        useUIStore.setState((state) => ({
          alerts: [
            // Newest first, as addAlert files them: a, then b.
            fault('breakdown-b', 'critical', 'assertive'),
            fault('breakdown-a', 'critical', 'assertive'),
            ...state.alerts,
          ],
        }))
      );
      expect(assertiveRegion()).toHaveTextContent(
        'breakdown-a title. breakdown-a message. breakdown-b title. breakdown-b message.'
      );
      const first = assertiveRegion()!.textContent;
      act(() =>
        useUIStore.setState((state) => ({
          alerts: [
            { ...fault('breakdown-b', 'critical', 'assertive'), id: 'breakdown-b2' },
            { ...fault('breakdown-a', 'critical', 'assertive'), id: 'breakdown-a2' },
            ...state.alerts,
          ],
        }))
      );
      expect(assertiveRegion()!.textContent).not.toBe(first);
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
