import React, { useEffect, useRef, useState } from 'react';
import { audioManager } from '../utils/audioManager';
import { useSafetyStore } from '../stores/safetyStore';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';
import type { AlertData } from '../types';
import { translate } from '../i18n';
import { alertSystemMessages } from './AlertSystem.messages';

type PlainMessageKey = Exclude<keyof typeof alertSystemMessages.en, 'typedLiveRegion'>;
const m = (key: PlainMessageKey): string => translate(alertSystemMessages, key);

// Sample alerts for random rotation (shift changes handled by PA system in GameFeatures)
const getSampleAlerts = (): Omit<AlertData, 'id' | 'timestamp' | 'acknowledged'>[] => [
  {
    type: 'success',
    title: m('maintenanceCompleteTitle'),
    message: m('maintenanceCompleteMessage'),
    machineId: 'rm-103',
  },
  {
    type: 'warning',
    title: m('temperatureRisingTitle'),
    message: m('temperatureRisingMessage'),
    machineId: 'sifter-b',
  },
  { type: 'info', title: m('qualityCheckTitle'), message: m('qualityCheckMessage') },
  { type: 'success', title: m('targetMetTitle'), message: m('targetMetMessage') },
  { type: 'warning', title: m('lowStockTitle'), message: m('lowStockMessage') },
  { type: 'info', title: m('conveyorCheckTitle'), message: m('conveyorCheckMessage') },
];

// Keys, not text: resolved when the alert is raised, in the language active then.
const NEAR_MISS_MESSAGE_KEYS = [
  'nearMissBlockedAisle',
  'nearMissUnexpectedLoad',
  'nearMissProximity',
  'nearMissSafetySystem',
] as const;

/**
 * AlertSystem - Generates alerts and pushes them to uiStore
 * Alerts are displayed via the StatusHUD notification dropdown
 */
export const AlertSystem: React.FC = () => {
  const [liveRegionMessage, setLiveRegionMessage] = useState('');
  const [politeMessage, setPoliteMessage] = useState('');
  const isInitialMount = useRef(true);
  const safetyMetrics = useSafetyStore((state) => state.safetyMetrics);
  const prevSafetyStopsRef = useRef(safetyMetrics.safetyStops);
  const addAlert = useUIStore((state) => state.addAlert);

  // Watch for safety stops and create near-miss alerts
  useEffect(() => {
    if (isInitialMount.current) return;

    // A forklift halting for an operator E-stop, the Space-bar stop or the
    // egress drill is obeying an order, not avoiding a near miss.
    const deliberateHold =
      useSafetyStore.getState().forkliftEmergencyStop ||
      useGameSimulationStore.getState().emergencyActive;
    if (safetyMetrics.safetyStops > prevSafetyStopsRef.current && !deliberateHold) {
      const message = m(
        NEAR_MISS_MESSAGE_KEYS[Math.floor(Math.random() * NEAR_MISS_MESSAGE_KEYS.length)]
      );
      const newAlert: AlertData = {
        id: `safety-${Date.now()}`,
        type: 'safety',
        title: m('nearMissTitle'),
        message,
        timestamp: new Date(),
        acknowledged: false,
      };

      // Play distinct safety alert sound
      audioManager.playAlert();

      // Announce to screen readers
      setLiveRegionMessage(
        translate(alertSystemMessages, 'safetyLiveRegion', {
          title: newAlert.title,
          message: newAlert.message,
        })
      );

      // Push to uiStore for StatusHUD display
      addAlert(newAlert);
    }
    prevSafetyStopsRef.current = safetyMetrics.safetyStops;
  }, [safetyMetrics.safetyStops, addAlert]);

  // An alert filed with announce: 'polite' (a closed shift, say) is read once
  // as it is filed. Alerts already in the bell at mount are not news, and
  // routine info and success alerts stay silent.
  // Working if a closed shift reaches a screen reader with the PA off or muted.
  useEffect(() => {
    let seen = new Set(useUIStore.getState().alerts.map((alert) => alert.id));
    return useUIStore.subscribe(({ alerts }) => {
      const fresh = alerts.filter((alert) => !seen.has(alert.id) && alert.announce === 'polite');
      seen = new Set(alerts.map((alert) => alert.id));
      const notice = fresh[0];
      if (notice)
        setPoliteMessage(
          translate(alertSystemMessages, 'politeLiveRegion', {
            title: notice.title,
            message: notice.message,
          })
        );
    });
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) {
      isInitialMount.current = false;
      return;
    }

    // Add initial alerts (no sound on mount)
    const sampleAlerts = getSampleAlerts();
    const initial = sampleAlerts.slice(0, 2).map((a, i) => ({
      ...a,
      id: `alert-${i}`,
      timestamp: new Date(),
      acknowledged: false,
    }));
    initial.forEach((a) => addAlert(a));

    // Periodically add new alerts (dev/demo only)
    const interval = setInterval(() => {
      const alerts = getSampleAlerts();
      const template = alerts[Math.floor(Math.random() * alerts.length)];
      const newAlert: AlertData = {
        ...template,
        id: `alert-${Date.now()}`,
        timestamp: new Date(),
        acknowledged: false,
      };

      // Play alert sound for new alerts
      if (newAlert.type === 'critical' || newAlert.type === 'warning') {
        audioManager.playAlert();
      }

      // Announce critical and warning alerts to screen readers
      if (newAlert.type === 'critical' || newAlert.type === 'warning') {
        setLiveRegionMessage(
          translate(alertSystemMessages, 'typedLiveRegion', {
            type: newAlert.type,
            title: newAlert.title,
            message: newAlert.message,
          })
        );
      }

      // Push to uiStore for StatusHUD display
      addAlert(newAlert);
    }, 8000);

    isInitialMount.current = false;
    return () => clearInterval(interval);
  }, [addAlert]);

  // Only render screen reader live region - no visible UI
  // Alerts are displayed via StatusHUD notification dropdown
  return (
    <>
      <div role="alert" aria-atomic="true" className="sr-only">
        {liveRegionMessage}
      </div>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {politeMessage}
      </div>
    </>
  );
};
