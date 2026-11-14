import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { crewAwayMinutes } from '../../../simulation/workplaceCrew';
import type { CrewRole } from '../../../simulation/workplaceCampaign';
import { formatPlantStamp, readPlantClock } from '../../../utils/timeFormatting';

/** The plant-clock stamp `minutes` of game time from now ("Day 3, 14:30"), or null. */
export function crewBackStamp(minutes: number): string | null {
  const clock = readPlantClock();
  if (!clock) return null;
  const total = clock.hour + minutes / 60;
  const days = Math.floor(total / 24);
  return formatPlantStamp({ day: clock.day + days, hour: total - days * 24 });
}

/**
 * 5.4: when the season has `role` away with no cover doing its work, the
 * plant-clock time it is back, for the readout of the work that waits for it;
 * null when it is at work. Re-renders as the season's minutes run.
 */
export function useCrewAway(role: CrewRole): string | null {
  const minutes = useWorkplaceStore(() => crewAwayMinutes(role));
  return minutes > 0 ? crewBackStamp(minutes) : null;
}
