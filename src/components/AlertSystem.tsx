import React, { useEffect, useRef, useState } from 'react';
import { audioManager } from '../utils/audioManager';
import { useSafetyStore } from '../stores/safetyStore';
import { useUIStore } from '../stores/uiStore';
import type { AlertData } from '../types';

// Sample alerts for random rotation (shift changes handled by PA system in GameFeatures)
const getSampleAlerts = (): Omit<AlertData, 'id' | 'timestamp' | 'acknowledged'>[] => [
  {
    type: 'success',
    title: 'Maintenance Complete',
    message: 'Roller Mill RM-103 back online',
    machineId: 'rm-103',
  },
  {
    type: 'warning',
    title: 'Temperature Rising',
    message: 'Plansifter B bearing temperature elevated',
    machineId: 'sifter-b',
  },
  { type: 'info', title: 'Quality Check', message: 'Hourly sample collection in progress' },
  { type: 'success', title: 'Target Met', message: 'Daily production target achieved at 94%' },
  { type: 'warning', title: 'Low Stock', message: 'Packaging supplies below reorder threshold' },
  { type: 'info', title: 'Conveyor Check', message: 'Belt tension within normal parameters' },
];

const NEAR_MISS_MESSAGES = [
  'Forklift stopped for pedestrian - safety protocol activated',
  'Worker detected in forklift path - collision averted',
  'Emergency stop triggered - all clear',
  'Proximity alert - forklift yielded to personnel',
  'Safety system engaged - near-miss avoided',
];

/**
 * AlertSystem - Generates alerts and pushes them to uiStore
 * Alerts are displayed via the StatusHUD notification dropdown
 */
export const AlertSystem: React.FC = () => {
  const [liveRegionMessage, setLiveRegionMessage] = useState('');
  const isInitialMount = useRef(true);
  const safetyMetrics = useSafetyStore((state) => state.safetyMetrics);
  const prevSafetyStopsRef = useRef(safetyMetrics.safetyStops);
  const addAlert = useUIStore((state) => state.addAlert);

  // Watch for safety stops and create near-miss alerts
  useEffect(() => {
    if (isInitialMount.current) return;

    if (safetyMetrics.safetyStops > prevSafetyStopsRef.current) {
      const message = NEAR_MISS_MESSAGES[Math.floor(Math.random() * NEAR_MISS_MESSAGES.length)];
      const newAlert: AlertData = {
        id: `safety-${Date.now()}`,
        type: 'safety',
        title: 'Near-Miss Avoided',
        message,
        timestamp: new Date(),
        acknowledged: false,
      };

      // Play distinct safety alert sound
      audioManager.playAlert();

      // Announce to screen readers
      setLiveRegionMessage(`Safety alert: ${newAlert.title}. ${newAlert.message}`);

      // Push to uiStore for StatusHUD display
      addAlert(newAlert);
    }
    prevSafetyStopsRef.current = safetyMetrics.safetyStops;
  }, [safetyMetrics.safetyStops, addAlert]);

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
        setLiveRegionMessage(`${newAlert.type} alert: ${newAlert.title}. ${newAlert.message}`);
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
    <div role="alert" aria-atomic="true" className="sr-only">
      {liveRegionMessage}
    </div>
  );
};
