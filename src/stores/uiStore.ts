import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import { AlertData } from '../types';
import { sanitizeUIState } from './persistenceMigrations';

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

  // Interface scale. Browser zoom remains supported independently.
  uiScale: number;
  setUIScale: (scale: number) => void;

  // Keyboard shortcuts modal
  showShortcuts: boolean;
  setShowShortcuts: (show: boolean) => void;

  // First-load onboarding intro (persisted)
  hasSeenIntro: boolean;
  setHasSeenIntro: (seen: boolean) => void;

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

  // FPS Counter
  showFPSCounter: boolean;
  setShowFPSCounter: (show: boolean) => void;
  // One achievements panel, whichever button opened it (not persisted).
  showAchievements: boolean;
  setShowAchievements: (show: boolean) => void;
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

      showZones: false,
      setShowZones: (show: boolean) => set({ showZones: show }),
      showAIPanel: true,
      setShowAIPanel: (show: boolean) => set({ showAIPanel: show }),

      // Panel collapse state
      panelMinimized: false,
      setPanelMinimized: (minimized: boolean) => set({ panelMinimized: minimized }),

      // Theme
      theme: 'dark' as const,
      toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
      uiScale: 1,
      setUIScale: (scale: number) =>
        set({ uiScale: Math.min(1.5, Math.max(0.9, Number.isFinite(scale) ? scale : 1)) }),

      // Keyboard shortcuts modal
      showShortcuts: false,
      setShowShortcuts: (show: boolean) => set({ showShortcuts: show }),

      // First-load onboarding intro
      hasSeenIntro: false,
      setHasSeenIntro: (seen: boolean) => set({ hasSeenIntro: seen }),

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

      // FPS Counter
      showFPSCounter: false,
      setShowFPSCounter: (show: boolean) => set({ showFPSCounter: show }),
      showAchievements: false,
      setShowAchievements: (show: boolean) => set({ showAchievements: show }),
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
      version: 2,
      migrate: (persisted, version) => {
        const state = sanitizeUIState(persisted);
        // v1 persisted showZones while it defaulted to true; drop it so existing
        // users pick up the off-by-default overlays.
        if (version < 2) delete state.showZones;
        return state as UIStore;
      },
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeUIState(persisted),
      }),
      partialize: (state) => ({
        hasSeenIntro: state.hasSeenIntro,
        showZones: state.showZones,
        showAIPanel: state.showAIPanel,
        panelMinimized: state.panelMinimized,
        theme: state.theme,
        uiScale: state.uiScale,
        legendPosition: state.legendPosition,
        showMiniMap: state.showMiniMap,
        fpsMode: state.fpsMode,
        showFPSCounter: state.showFPSCounter,
        blueprintMode: state.blueprintMode,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          // Set error flag
          if (state) {
            state.rehydrationError = true;
          }
          return;
        }

        // Validate theme
        if (state && state.theme && state.theme !== 'dark' && state.theme !== 'light') {
          state.theme = 'dark' as const;
        }
      },
    }
  )
);
