import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';
import { AlertData } from '../types';
import { sanitizeUIState, type PersistedUIState } from './persistenceMigrations';
import { readPlantClock, type PlantClock } from '../utils/timeFormatting';

/**
 * An alert as the bell keeps it: stamped with the plant clock when it is filed
 * (or raised again), which is the time the notifications list shows.
 */
export type UIAlert = AlertData & { gameClock?: PlantClock };

/**
 * The alert with the plant clock now. Where the clock cannot be read, any older
 * stamp is cleared so the list falls back to the alert's own wall time.
 */
const stampPlantClock = (alert: UIAlert): UIAlert => {
  const gameClock = readPlantClock();
  if (gameClock) return { ...alert, gameClock };
  return alert.gameClock ? { ...alert, gameClock: undefined } : alert;
};

/**
 * A saved millos-ui record as the store restores it. legendPosition and
 * panelMinimized are no longer saved (nothing reads either), so an older
 * record's values are ignored here, as showAIPanel's are.
 */
function restorableUIState(persisted: unknown): PersistedUIState {
  const state = sanitizeUIState(persisted);
  delete state.legendPosition;
  delete state.panelMinimized;
  return state;
}

/** A critical alert whose condition still stands and is not yet acknowledged. */
/** The persisted UI preferences record (Reset Simulation carries its scale across). */
export const UI_STORAGE_KEY = 'millos-ui';
export const UI_STORAGE_VERSION = 2;

export const isStandingCriticalAlert = (alert: AlertData): boolean =>
  alert.type === 'critical' && !alert.acknowledged && !alert.returnedToNormal;

interface AlertIndices {
  alertsByPriority: Map<'info' | 'warning' | 'critical', AlertData[]>;
}

const MAX_ALERTS = 10;

/**
 * Newest first, at most MAX_ALERTS. Over the cap the oldest notice that is not
 * a standing critical makes way: a plain slice dropped an unacknowledged
 * breakdown under ten routine notices, which also released the quiet hold it
 * keeps on the music, PA flavour and AI reflection.
 * Working if a breakdown stays in the bell until acknowledged or back to normal.
 */
function capAlerts(alerts: UIAlert[]): UIAlert[] {
  const kept = [...alerts];
  while (kept.length > MAX_ALERTS) {
    let routine = kept.length - 1;
    while (routine >= 0 && isStandingCriticalAlert(kept[routine])) routine -= 1;
    // Eleven standing criticals: the oldest goes, as before.
    kept.splice(routine === -1 ? kept.length - 1 : routine, 1);
  }
  return kept;
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
  alerts: UIAlert[];
  addAlert: (alert: AlertData) => void;
  dismissAlert: (alertId: string) => void;
  acknowledgeAlert: (alertId: string) => void;
  /** Mark (or clear) an alert's condition as returned to normal, keeping it listed. */
  setAlertReturnedToNormal: (
    alertId: string,
    returned: boolean,
    message?: string,
    copy?: AlertData['copy']
  ) => void;
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

  // Guided delivery receipts are UI history, never production evidence.
  journeyVisible: boolean;
  journeyOrderId: string | null;
  inspectedMachineIds: string[];
  startDeliveryJourney: (orderId: string | null) => void;
  setJourneyVisible: (visible: boolean) => void;
  recordMachineInspection: (machineId: string) => void;

  // One-shot scene-to-workspace navigation, never persisted.
  operationalFocusId: string | null;
  setOperationalFocusId: (id: string | null) => void;
  // One-shot request for Mill Overview to bring its maintenance section into
  // view and focus (the repair next action). Never persisted.
  maintenanceFocusRequested: boolean;
  requestMaintenanceFocus: () => void;
  clearMaintenanceFocus: () => void;
  // One-shot request for the desktop context sidebar to focus its heading once
  // it is open: the control that opened it (Take over, a companion's Open)
  // has unmounted. Never persisted.
  panelFocusRequested: boolean;
  requestPanelFocus: () => void;
  clearPanelFocus: () => void;

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
          // One entry per id: the bell's rows, Acknowledge and Dismiss are all
          // keyed by it. An id raised again (a truck hold whose reason changed)
          // replaces its entry at the top instead of listing it twice.
          const updatedAlerts = capAlerts([
            stampPlantClock(alert),
            ...state.alerts.filter((existing) => existing.id !== alert.id),
          ]);
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
      setAlertReturnedToNormal: (alertId, returned, message, copy) =>
        set((state) => {
          if (!state.alerts.some((a) => a.id === alertId && !!a.returnedToNormal !== returned))
            return {};
          // A condition that comes back is raised again, at the plant time now,
          // and listed first as any newly raised alert is: left in place, a
          // row that had sunk to the bottom was the next one capAlerts dropped.
          const updated = state.alerts.map((a) => {
            if (a.id !== alertId) return a;
            const next = {
              ...a,
              returnedToNormal: returned,
              ...(message !== undefined ? { message } : {}),
              ...(copy !== undefined ? { copy } : {}),
              ...(returned ? {} : { acknowledged: false, timestamp: new Date() }),
            };
            return returned ? next : stampPlantClock(next);
          });
          const updatedAlerts = returned
            ? updated
            : [
                ...updated.filter((a) => a.id === alertId),
                ...updated.filter((a) => a.id !== alertId),
              ];
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

      journeyVisible: false,
      journeyOrderId: null,
      inspectedMachineIds: [],
      startDeliveryJourney: (orderId) =>
        set({ journeyVisible: true, journeyOrderId: orderId, inspectedMachineIds: [] }),
      setJourneyVisible: (visible) => set({ journeyVisible: visible }),
      recordMachineInspection: (machineId) => {
        if (get().inspectedMachineIds.includes(machineId)) return;
        set((state) => ({
          inspectedMachineIds: [...state.inspectedMachineIds, machineId].slice(-100),
        }));
      },

      operationalFocusId: null,
      setOperationalFocusId: (id) => set({ operationalFocusId: id }),
      maintenanceFocusRequested: false,
      requestMaintenanceFocus: () => set({ maintenanceFocusRequested: true }),
      clearMaintenanceFocus: () => set({ maintenanceFocusRequested: false }),
      panelFocusRequested: false,
      requestPanelFocus: () => set({ panelFocusRequested: true }),
      clearPanelFocus: () => set({ panelFocusRequested: false }),

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
      name: UI_STORAGE_KEY,
      storage: safeJSONStorage,
      version: UI_STORAGE_VERSION,
      migrate: (persisted, version) => {
        // First-person and blueprint are view modes, not preferences: the
        // sanitiser drops them, so a reload always opens on the overview.
        const state = restorableUIState(persisted);
        // v1 persisted showZones while it defaulted to true; drop it so existing
        // users pick up the off-by-default overlays.
        if (version < 2) delete state.showZones;
        return state as UIStore;
      },
      merge: (persisted, current) => ({
        ...current,
        ...restorableUIState(persisted),
      }),
      partialize: (state) => ({
        hasSeenIntro: state.hasSeenIntro,
        journeyVisible: state.journeyVisible,
        journeyOrderId: state.journeyOrderId,
        inspectedMachineIds: state.inspectedMachineIds,
        showZones: state.showZones,
        // showAIPanel is not saved: App owns the AI panel's open state and
        // opens every load closed, so a saved flag would restore nothing.
        // panelMinimized and legendPosition are not saved: nothing reads them.
        // theme is not saved: nothing offers a theme choice, so a saved light
        // theme could never be undone. Every load opens dark.
        uiScale: state.uiScale,
        showMiniMap: state.showMiniMap,
        showFPSCounter: state.showFPSCounter,
      }),
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          // Set error flag
          if (state) {
            state.rehydrationError = true;
          }
          return;
        }
      },
    }
  )
);
