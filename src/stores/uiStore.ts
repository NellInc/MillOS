import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import { AlertData } from '../types';

interface AlertIndices {
  alertsByPriority: Map<'info' | 'warning' | 'critical', AlertData[]>;
}

function rebuildAlertIndex(alerts: AlertData[]): Map<'info' | 'warning' | 'critical', AlertData[]> {
  const index = new Map<'info' | 'warning' | 'critical', AlertData[]>([
    ['info', []],
    ['warning', []],
    ['critical', []],
  ]);
  alerts.forEach((alert) => {
    const priority =
      alert.type === 'critical' ? 'critical' : alert.type === 'warning' ? 'warning' : 'info';
    const priorityAlerts = index.get(priority);
    if (priorityAlerts) {
      priorityAlerts.push(alert);
    }
  });
  return index;
}

interface UIStore {
  // Rehydration error tracking
  rehydrationError: boolean;
  clearRehydrationError: () => void;

  // SCADA sync error tracking
  scadaSyncError: boolean;
  clearScadaSyncError: () => void;

  // Alerts
  _alertIndices: AlertIndices;
  alerts: AlertData[];
  addAlert: (alert: AlertData) => void;
  dismissAlert: (alertId: string) => void;
  acknowledgeAlert: (alertId: string) => void;
  removeAlert: (alertId: string) => void;
  getAlertsByPriority: (priority: 'info' | 'warning' | 'critical') => AlertData[];

  // UI visibility toggles
  showZones: boolean;
  setShowZones: (show: boolean) => void;
  showAIPanel: boolean;
  setShowAIPanel: (show: boolean) => void;

  // Panel collapse state
  panelMinimized: boolean;
  setPanelMinimized: (minimized: boolean) => void;

  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  // Keyboard shortcuts modal
  showShortcuts: boolean;
  setShowShortcuts: (show: boolean) => void;

  // Legend position (for draggable legend)
  legendPosition: { x: number; y: number };
  setLegendPosition: (pos: { x: number; y: number }) => void;
  resetLegendPosition: () => void;

  // Gamification bar visibility
  showGamificationBar: boolean;
  setShowGamificationBar: (show: boolean) => void;

  // Mini-map visibility
  showMiniMap: boolean;
  setShowMiniMap: (show: boolean) => void;

  // First-person mode
  fpsMode: boolean;
  setFpsMode: (enabled: boolean) => void;
  toggleFpsMode: () => void;

  // SPC Charts
  showSPCCharts: boolean;
  setShowSPCCharts: (show: boolean) => void;
  toggleSPCCharts: () => void;

  // FPS Counter
  showFPSCounter: boolean;
  setShowFPSCounter: (show: boolean) => void;
  toggleFPSCounter: () => void;

  // Blueprint Mode (Ctrl+B toggle)
  blueprintMode: boolean;
  blueprintTransition: number; // 0-1 for animation lerp
  setBlueprintMode: (enabled: boolean) => void;
  toggleBlueprintMode: () => void;
  setBlueprintTransition: (value: number) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set, get) => ({
      // Rehydration error tracking
      rehydrationError: false,
      clearRehydrationError: () => set({ rehydrationError: false }),

      // SCADA sync error tracking
      scadaSyncError: false,
      clearScadaSyncError: () => set({ scadaSyncError: false }),

      // Alerts
      _alertIndices: {
        alertsByPriority: new Map([
          ['info', []],
          ['warning', []],
          ['critical', []],
        ]),
      },
      alerts: [],
      addAlert: (alert) =>
        set((state) => {
          const updatedAlerts = [alert, ...state.alerts].slice(0, 10);
          return {
            alerts: updatedAlerts,
            _alertIndices: {
              alertsByPriority: rebuildAlertIndex(updatedAlerts),
            },
          };
        }),
      dismissAlert: (alertId) =>
        set((state) => {
          const updatedAlerts = state.alerts.filter((a) => a.id !== alertId);
          return {
            alerts: updatedAlerts,
            _alertIndices: {
              alertsByPriority: rebuildAlertIndex(updatedAlerts),
            },
          };
        }),
      acknowledgeAlert: (alertId) =>
        set((state) => {
          const updatedAlerts = state.alerts.map((a) =>
            a.id === alertId ? { ...a, acknowledged: true } : a
          );
          return {
            alerts: updatedAlerts,
            _alertIndices: {
              alertsByPriority: rebuildAlertIndex(updatedAlerts),
            },
          };
        }),
      removeAlert: (alertId) =>
        set((state) => {
          const updatedAlerts = state.alerts.filter((a) => a.id !== alertId);
          return {
            alerts: updatedAlerts,
            _alertIndices: {
              alertsByPriority: rebuildAlertIndex(updatedAlerts),
            },
          };
        }),
      getAlertsByPriority: (priority: 'info' | 'warning' | 'critical'): AlertData[] => {
        const state = get();
        return state._alertIndices.alertsByPriority.get(priority) || [];
      },

      showZones: true,
      setShowZones: (show: boolean) => set({ showZones: show }),
      showAIPanel: true,
      setShowAIPanel: (show: boolean) => set({ showAIPanel: show }),

      // Panel collapse state
      panelMinimized: false,
      setPanelMinimized: (minimized: boolean) => set({ panelMinimized: minimized }),

      // Theme
      theme: 'dark' as const,
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),

      // Keyboard shortcuts modal
      showShortcuts: false,
      setShowShortcuts: (show: boolean) => set({ showShortcuts: show }),

      // Legend position
      legendPosition: { x: -1, y: -1 }, // -1 means use default position
      setLegendPosition: (pos: { x: number; y: number }) => set({ legendPosition: pos }),
      resetLegendPosition: () => set({ legendPosition: { x: -1, y: -1 } }),

      // Gamification bar visibility
      showGamificationBar: false,
      setShowGamificationBar: (show: boolean) => set({ showGamificationBar: show }),

      // Mini-map visibility
      showMiniMap: false,
      setShowMiniMap: (show: boolean) => set({ showMiniMap: show }),

      // First-person mode
      fpsMode: false,
      setFpsMode: (enabled: boolean) => set({ fpsMode: enabled }),
      toggleFpsMode: () => set((state) => ({ fpsMode: !state.fpsMode })),

      // SPC Charts
      showSPCCharts: false,
      setShowSPCCharts: (show: boolean) => set({ showSPCCharts: show }),
      toggleSPCCharts: () => set((state) => ({ showSPCCharts: !state.showSPCCharts })),

      // FPS Counter
      showFPSCounter: false,
      setShowFPSCounter: (show: boolean) => set({ showFPSCounter: show }),
      toggleFPSCounter: () => set((state) => ({ showFPSCounter: !state.showFPSCounter })),

      // Blueprint Mode (Ctrl+B toggle)
      blueprintMode: false,
      blueprintTransition: 0,
      setBlueprintMode: (enabled: boolean) => set({ blueprintMode: enabled }),
      toggleBlueprintMode: () => set((state) => ({ blueprintMode: !state.blueprintMode })),
      setBlueprintTransition: (value: number) => set({ blueprintTransition: value }),
    }),
    {
      name: 'millos-ui',
      storage: safeJSONStorage,
      partialize: (state) => ({
        showZones: state.showZones,
        showAIPanel: state.showAIPanel,
        panelMinimized: state.panelMinimized,
        theme: state.theme,
        legendPosition: state.legendPosition,
        showMiniMap: state.showMiniMap,
        fpsMode: state.fpsMode,
        showSPCCharts: state.showSPCCharts,
        showFPSCounter: state.showFPSCounter,
        blueprintMode: state.blueprintMode,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('Failed to rehydrate UI state:', error);
          // Set error flag
          if (state) {
            state.rehydrationError = true;
          }
          return;
        }

        // Validate theme
        if (state && state.theme && state.theme !== 'dark' && state.theme !== 'light') {
          console.warn('Invalid theme detected, resetting to dark');
          state.theme = 'dark' as const;
        }
      },
    }
  )
);
