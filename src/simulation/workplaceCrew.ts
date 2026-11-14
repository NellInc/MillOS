/**
 * 5.4: the plant's one reader of the cooperative season's crew.
 *
 * On the one season shift whose drawn pressure is an absence, one authored
 * role is away for its first minutes (workplaceCampaign `crewAway`), and its
 * plant work waits for it unless cover is agreed: the lab's bench starts no
 * new test while Quality is away; a service asked for while Maintenance is
 * away starts when it is back, and one already under way pauses. The workplace
 * store provides the answer; the bench (qcLabStore) and the service clock
 * (unitService) ask it through this module, which imports nothing, so neither
 * imports the workplace store (which imports qcLabStore).
 *
 * With no season, no provider, or a provider that throws, every role is at
 * work: the plant runs exactly as it does without the cooperative layer, in
 * benchmarks and in every test that does not load the workplace store.
 */
import type { CrewRole } from './workplaceCampaign';

/** Game minutes until the role is back at work; 0 when it is at work. */
let reader: ((role: CrewRole) => number) | null = null;

/** Set by the workplace store; null clears it. */
export function provideCrewAvailability(next: ((role: CrewRole) => number) | null): void {
  reader = next;
}

/** Game minutes until this role is back: 0 unless the season has it away, uncovered. */
export function crewAwayMinutes(role: CrewRole): number {
  if (!reader) return 0;
  try {
    const minutes = reader(role);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
  } catch {
    return 0;
  }
}

/** True unless the season has this role away now with no cover doing its work. */
export const crewAtWork = (role: CrewRole): boolean => crewAwayMinutes(role) <= 0;
