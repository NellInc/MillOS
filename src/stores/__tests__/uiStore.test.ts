/**
 * UI Store Tests
 *
 * Tests for alerts, visibility toggles, theme, panel state,
 * and other UI-related state management.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useUIStore } from '../uiStore';
import { AlertData } from '../../types';

// Helper to create mock alert
const createMockAlert = (overrides: Partial<AlertData> = {}): AlertData => ({
  id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  type: 'info',
  title: 'Test Alert',
  message: 'Test message',
  timestamp: new Date(),
  acknowledged: false,
  ...overrides,
});

describe('UIStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useUIStore.setState({
      rehydrationError: false,
      scadaSyncError: false,
      _alertIndices: {
        alertsByPriority: new Map([
          ['info', []],
          ['warning', []],
          ['critical', []],
        ]),
      },
      alerts: [],
      showZones: true,
      showAIPanel: true,
      panelMinimized: false,
      theme: 'dark',
      showShortcuts: false,
      legendPosition: { x: -1, y: -1 },
      showGamificationBar: false,
      showMiniMap: false,
      fpsMode: false,
      showSPCCharts: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Alerts', () => {
    it('should initialize with empty alerts', () => {
      const { alerts } = useUIStore.getState();
      expect(alerts).toHaveLength(0);
    });

    it('should add alert to the front of the array', () => {
      const { addAlert } = useUIStore.getState();

      const alert1 = createMockAlert({ id: 'alert-1', title: 'First' });
      const alert2 = createMockAlert({ id: 'alert-2', title: 'Second' });

      addAlert(alert1);
      addAlert(alert2);

      const { alerts } = useUIStore.getState();
      expect(alerts[0].title).toBe('Second');
      expect(alerts[1].title).toBe('First');
    });

    it('should limit alerts to 10 items', () => {
      const { addAlert } = useUIStore.getState();

      for (let i = 0; i < 15; i++) {
        addAlert(createMockAlert({ id: `alert-${i}` }));
      }

      const { alerts } = useUIStore.getState();
      expect(alerts.length).toBe(10);
    });

    it('should dismiss alert by id', () => {
      const { addAlert, dismissAlert } = useUIStore.getState();

      addAlert(createMockAlert({ id: 'alert-to-dismiss' }));
      addAlert(createMockAlert({ id: 'alert-to-keep' }));

      dismissAlert('alert-to-dismiss');

      const { alerts } = useUIStore.getState();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].id).toBe('alert-to-keep');
    });

    it('should rebuild priority index when adding alerts', () => {
      const { addAlert } = useUIStore.getState();

      addAlert(createMockAlert({ type: 'critical' }));
      addAlert(createMockAlert({ type: 'warning' }));
      addAlert(createMockAlert({ type: 'info' }));

      const { _alertIndices } = useUIStore.getState();
      expect(_alertIndices.alertsByPriority.get('critical')).toHaveLength(1);
      expect(_alertIndices.alertsByPriority.get('warning')).toHaveLength(1);
      expect(_alertIndices.alertsByPriority.get('info')).toHaveLength(1);
    });

    it('should rebuild priority index when dismissing alerts', () => {
      const { addAlert, dismissAlert } = useUIStore.getState();

      addAlert(createMockAlert({ id: 'critical-1', type: 'critical' }));
      addAlert(createMockAlert({ id: 'critical-2', type: 'critical' }));

      dismissAlert('critical-1');

      const { _alertIndices } = useUIStore.getState();
      expect(_alertIndices.alertsByPriority.get('critical')).toHaveLength(1);
    });

    it('should get alerts by priority', () => {
      const { addAlert, getAlertsByPriority } = useUIStore.getState();

      addAlert(createMockAlert({ type: 'critical', title: 'Critical 1' }));
      addAlert(createMockAlert({ type: 'critical', title: 'Critical 2' }));
      addAlert(createMockAlert({ type: 'warning', title: 'Warning 1' }));
      addAlert(createMockAlert({ type: 'info', title: 'Info 1' }));

      const criticalAlerts = getAlertsByPriority('critical');
      const warningAlerts = getAlertsByPriority('warning');
      const infoAlerts = getAlertsByPriority('info');

      expect(criticalAlerts).toHaveLength(2);
      expect(warningAlerts).toHaveLength(1);
      expect(infoAlerts).toHaveLength(1);
    });

    it('should map success/safety types to info priority', () => {
      const { addAlert, getAlertsByPriority } = useUIStore.getState();

      addAlert(createMockAlert({ type: 'success' }));
      addAlert(createMockAlert({ type: 'safety' }));

      const infoAlerts = getAlertsByPriority('info');
      expect(infoAlerts).toHaveLength(2);
    });
  });

  describe('Error Tracking', () => {
    it('should initialize without rehydration error', () => {
      const { rehydrationError } = useUIStore.getState();
      expect(rehydrationError).toBe(false);
    });

    it('should clear rehydration error', () => {
      useUIStore.setState({ rehydrationError: true });
      const { clearRehydrationError } = useUIStore.getState();

      clearRehydrationError();

      expect(useUIStore.getState().rehydrationError).toBe(false);
    });

    it('should initialize without SCADA sync error', () => {
      const { scadaSyncError } = useUIStore.getState();
      expect(scadaSyncError).toBe(false);
    });

    it('should clear SCADA sync error', () => {
      useUIStore.setState({ scadaSyncError: true });
      const { clearScadaSyncError } = useUIStore.getState();

      clearScadaSyncError();

      expect(useUIStore.getState().scadaSyncError).toBe(false);
    });
  });

  describe('Visibility Toggles', () => {
    it('should initialize with zones visible', () => {
      const { showZones } = useUIStore.getState();
      expect(showZones).toBe(true);
    });

    it('should toggle zones visibility', () => {
      const { setShowZones } = useUIStore.getState();

      setShowZones(false);
      expect(useUIStore.getState().showZones).toBe(false);

      setShowZones(true);
      expect(useUIStore.getState().showZones).toBe(true);
    });

    it('should initialize with AI panel visible', () => {
      const { showAIPanel } = useUIStore.getState();
      expect(showAIPanel).toBe(true);
    });

    it('should toggle AI panel visibility', () => {
      const { setShowAIPanel } = useUIStore.getState();

      setShowAIPanel(false);
      expect(useUIStore.getState().showAIPanel).toBe(false);

      setShowAIPanel(true);
      expect(useUIStore.getState().showAIPanel).toBe(true);
    });

    it('should toggle shortcuts modal', () => {
      const { setShowShortcuts } = useUIStore.getState();

      setShowShortcuts(true);
      expect(useUIStore.getState().showShortcuts).toBe(true);

      setShowShortcuts(false);
      expect(useUIStore.getState().showShortcuts).toBe(false);
    });

    it('should toggle gamification bar', () => {
      const { setShowGamificationBar } = useUIStore.getState();

      setShowGamificationBar(true);
      expect(useUIStore.getState().showGamificationBar).toBe(true);

      setShowGamificationBar(false);
      expect(useUIStore.getState().showGamificationBar).toBe(false);
    });

    it('should toggle mini-map', () => {
      const { setShowMiniMap } = useUIStore.getState();

      setShowMiniMap(true);
      expect(useUIStore.getState().showMiniMap).toBe(true);

      setShowMiniMap(false);
      expect(useUIStore.getState().showMiniMap).toBe(false);
    });
  });

  describe('FPS Mode', () => {
    it('should initialize with FPS mode disabled', () => {
      const { fpsMode } = useUIStore.getState();
      expect(fpsMode).toBe(false);
    });

    it('should set FPS mode', () => {
      const { setFpsMode } = useUIStore.getState();

      setFpsMode(true);
      expect(useUIStore.getState().fpsMode).toBe(true);

      setFpsMode(false);
      expect(useUIStore.getState().fpsMode).toBe(false);
    });

    it('should toggle FPS mode', () => {
      const { toggleFpsMode } = useUIStore.getState();

      toggleFpsMode();
      expect(useUIStore.getState().fpsMode).toBe(true);

      toggleFpsMode();
      expect(useUIStore.getState().fpsMode).toBe(false);
    });
  });

  describe('SPC Charts', () => {
    it('should initialize with SPC charts hidden', () => {
      const { showSPCCharts } = useUIStore.getState();
      expect(showSPCCharts).toBe(false);
    });

    it('should set SPC charts visibility', () => {
      const { setShowSPCCharts } = useUIStore.getState();

      setShowSPCCharts(true);
      expect(useUIStore.getState().showSPCCharts).toBe(true);
    });

    it('should toggle SPC charts', () => {
      const { toggleSPCCharts } = useUIStore.getState();

      toggleSPCCharts();
      expect(useUIStore.getState().showSPCCharts).toBe(true);

      toggleSPCCharts();
      expect(useUIStore.getState().showSPCCharts).toBe(false);
    });
  });

  describe('Panel State', () => {
    it('should initialize with panel not minimized', () => {
      const { panelMinimized } = useUIStore.getState();
      expect(panelMinimized).toBe(false);
    });

    it('should set panel minimized state', () => {
      const { setPanelMinimized } = useUIStore.getState();

      setPanelMinimized(true);
      expect(useUIStore.getState().panelMinimized).toBe(true);

      setPanelMinimized(false);
      expect(useUIStore.getState().panelMinimized).toBe(false);
    });
  });

  describe('Theme', () => {
    it('should initialize with dark theme', () => {
      const { theme } = useUIStore.getState();
      expect(theme).toBe('dark');
    });

    it('should toggle theme', () => {
      const { toggleTheme } = useUIStore.getState();

      toggleTheme();
      expect(useUIStore.getState().theme).toBe('light');

      toggleTheme();
      expect(useUIStore.getState().theme).toBe('dark');
    });
  });

  describe('Legend Position', () => {
    it('should initialize with default legend position', () => {
      const { legendPosition } = useUIStore.getState();
      expect(legendPosition).toEqual({ x: -1, y: -1 });
    });

    it('should set legend position', () => {
      const { setLegendPosition } = useUIStore.getState();

      setLegendPosition({ x: 100, y: 200 });
      expect(useUIStore.getState().legendPosition).toEqual({ x: 100, y: 200 });
    });

    it('should reset legend position', () => {
      const { setLegendPosition, resetLegendPosition } = useUIStore.getState();

      setLegendPosition({ x: 100, y: 200 });
      resetLegendPosition();

      expect(useUIStore.getState().legendPosition).toEqual({ x: -1, y: -1 });
    });
  });

  describe('Performance', () => {
    it('should handle rapid alert additions efficiently', () => {
      const { addAlert } = useUIStore.getState();

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        addAlert(createMockAlert({ id: `alert-${i}` }));
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should handle rapid alert dismissals efficiently', () => {
      const { addAlert, dismissAlert } = useUIStore.getState();

      // Add alerts first
      for (let i = 0; i < 10; i++) {
        addAlert(createMockAlert({ id: `alert-${i}` }));
      }

      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        dismissAlert(`alert-${i}`);
      }
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50); // Should complete in under 50ms
    });
  });
});
