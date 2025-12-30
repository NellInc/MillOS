import { useEffect, useRef } from 'react';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useSafetyStore } from '../stores/safetyStore';
import { useProductionStore } from '../stores/productionStore';

/**
 * Hook that simulates realistic safety metrics:
 * - Syncs game days to "days since incident" counter
 * - Generates occasional random safety events during operations
 */
export function useSafetySimulation() {
  const gameDay = useGameSimulationStore((state) => state.gameDay);
  const gameSpeed = useGameSimulationStore((state) => state.gameSpeed);
  const incrementDaysSafe = useSafetyStore((state) => state.incrementDaysSafe);
  const recordWorkerEvasion = useSafetyStore((state) => state.recordWorkerEvasion);
  const recordNearMiss = useSafetyStore((state) => state.recordNearMiss);
  const addSafetyIncident = useSafetyStore((state) => state.addSafetyIncident);
  const machines = useProductionStore((state) => state.machines);

  const prevGameDayRef = useRef(gameDay);
  const lastEventCheckRef = useRef(Date.now());

  // Sync game days to days since incident
  useEffect(() => {
    if (gameDay > prevGameDayRef.current) {
      // A new day has passed - increment days safe counter
      const daysElapsed = gameDay - prevGameDayRef.current;
      for (let i = 0; i < daysElapsed; i++) {
        incrementDaysSafe();
      }
    }
    prevGameDayRef.current = gameDay;
  }, [gameDay, incrementDaysSafe]);

  // Generate random safety events during active simulation
  useEffect(() => {
    if (gameSpeed === 0) return; // Paused - no events

    const interval = setInterval(() => {
      const now = Date.now();
      const timeSinceLastCheck = now - lastEventCheckRef.current;
      lastEventCheckRef.current = now;

      // Only check every ~30 real seconds to avoid spam
      if (timeSinceLastCheck < 25000) return;

      // Count running machines - more activity = more chance of events
      const runningMachines = machines.filter((m) => m.status === 'running').length;
      if (runningMachines === 0) return; // No activity, no events

      // Base probability: ~1% per check, scaled by activity level
      const activityMultiplier = Math.min(1.5, runningMachines / 10);
      const eventChance = 0.01 * activityMultiplier;

      const roll = Math.random();

      if (roll < eventChance * 0.3) {
        // Rare: Near miss event (~0.3% base chance)
        recordNearMiss();
        addSafetyIncident({
          type: 'near_miss',
          description: getRandomNearMissDescription(),
        });
      } else if (roll < eventChance) {
        // More common: Worker evasion (~0.7% base chance)
        recordWorkerEvasion();
        addSafetyIncident({
          type: 'evasion',
          description: getRandomEvasionDescription(),
        });
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(interval);
  }, [gameSpeed, machines, recordWorkerEvasion, recordNearMiss, addSafetyIncident]);
}

// Random descriptions for variety
function getRandomNearMissDescription(): string {
  const descriptions = [
    'Forklift narrowly avoided pedestrian in aisle',
    'Loose material fell from conveyor - no injuries',
    'Worker stepped back into moving equipment zone',
    'Pallet shifted during transport - caught in time',
    'Spill on floor created slip hazard - quickly cleaned',
    'Machine guard briefly disengaged during operation',
    'Worker reached into active conveyor path',
    'Heavy load shifted during crane operation',
  ];
  return descriptions[Math.floor(Math.random() * descriptions.length)];
}

function getRandomEvasionDescription(): string {
  const descriptions = [
    'Worker moved aside for approaching forklift',
    'Pedestrian yielded to material transport',
    'Team member stepped back from loading zone',
    'Worker paused to let conveyor clear',
    'Staff moved away from active equipment',
    'Employee cleared packer output area',
  ];
  return descriptions[Math.floor(Math.random() * descriptions.length)];
}
