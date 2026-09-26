import React from 'react';
import { OctagonX } from 'lucide-react';
import { useSafetyStore } from '../../stores/safetyStore';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { audioManager } from '../../utils/audioManager';
import { FORKLIFT_STOP_ANNOUNCEMENTS } from '../GameFeatures';

export const EmergencyStopButton: React.FC = () => {
  const forkliftEmergencyStop = useSafetyStore((state) => state.forkliftEmergencyStop);
  const setForkliftEmergencyStop = useSafetyStore((state) => state.setForkliftEmergencyStop);
  const addSafetyIncident = useSafetyStore((state) => state.addSafetyIncident);
  const addAnnouncement = useProductionStore((state) => state.addAnnouncement);
  const theme = useUIStore((state) => state.theme);
  const emergencyDrillMode = useGameSimulationStore((state) => state.emergencyDrillMode);
  const emergencyActive = useGameSimulationStore((state) => state.emergencyActive);
  // Same interlock as the Space key: a drill holds the forklifts whatever this
  // flag says, and an active facility emergency owns the release. Engaging the
  // stop outside a drill is always allowed.
  const emergencyInterlock = !emergencyDrillMode && emergencyActive && forkliftEmergencyStop;
  const locked = emergencyDrillMode || emergencyInterlock;

  const handleEmergencyStop = () => {
    const sim = useGameSimulationStore.getState();
    if (sim.emergencyDrillMode || (sim.emergencyActive && forkliftEmergencyStop)) return;
    const newState = !forkliftEmergencyStop;
    setForkliftEmergencyStop(newState);
    if (newState) {
      // Play one-shot sound and start continuous alarm
      audioManager.playEmergencyStop();
      audioManager.startEmergencyStopAlarm();
      // Forklift-only stop: the PA must not claim the mill has stopped.
      const announcement =
        FORKLIFT_STOP_ANNOUNCEMENTS[Math.floor(Math.random() * FORKLIFT_STOP_ANNOUNCEMENTS.length)];
      addAnnouncement({
        type: 'emergency',
        message: announcement.message,
        priority: 4,
      });
      addSafetyIncident({
        type: 'emergency',
        description: 'Emergency stop activated - all forklifts halted',
      });
    } else {
      // Release is refused above while a facility emergency owns the alarm.
      audioManager.stopEmergencyStopAlarm();
    }
  };

  return (
    <button
      onClick={handleEmergencyStop}
      disabled={locked}
      title={
        emergencyDrillMode
          ? 'End the active egress verification drill before using the emergency stop'
          : emergencyInterlock
            ? 'Clear the facility emergency interlock from the Safety panel to release the forklifts'
            : undefined
      }
      aria-label={
        emergencyDrillMode
          ? 'Fire drill interlock active - emergency stop cannot be changed'
          : emergencyInterlock
            ? 'Emergency interlock active - clear it from the Safety panel to release the forklifts'
            : 'Emergency stop - halt all forklifts'
      }
      aria-checked={forkliftEmergencyStop}
      role="switch"
      className={`w-full py-2.5 rounded-lg font-bold text-sm transition-all flex items-center justify-center gap-2 ${
        locked
          ? 'cursor-not-allowed border border-amber-500/50 bg-amber-900/30 text-amber-200'
          : forkliftEmergencyStop
            ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse motion-reduce:animate-none'
            : theme === 'light'
              ? 'bg-white text-red-600 hover:bg-red-50 border border-red-300'
              : 'bg-slate-800 text-red-400 hover:bg-red-900/50 border border-red-800'
      }`}
    >
      <OctagonX className="w-5 h-5" aria-hidden="true" />
      {emergencyDrillMode
        ? 'DRILL INTERLOCK ACTIVE'
        : emergencyInterlock
          ? 'INTERLOCK ACTIVE'
          : forkliftEmergencyStop
            ? 'RELEASE E-STOP'
            : 'EMERGENCY STOP'}
    </button>
  );
};
