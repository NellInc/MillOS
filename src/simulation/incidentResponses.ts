/**
 * Two answers to every incident (plan item 3.5). Pure, and importing only
 * types, so the campaign store's combined effect can read it.
 *
 * Each answer is how an incident is met once it is answered (its "mitigated"
 * phase): which parts of the incident's own effect still apply, as a share of
 * each part's departure from normal (INCIDENT_DEFINITIONS), and what the answer
 * does on the plant, if anything. Nothing here is a new effect size: a share of
 * 1 is the incident's own figure, 0 removes it, and the answers' costs are
 * priced from what the ledger charges (simulation/incidentProposal.ts).
 *
 * The first answer of each kind does nothing on the plant but choose its
 * shares; it is what the guide's free Mitigate and the agent's mitigate command
 * give a plant-raised incident, so that no button beats both costed answers.
 * A Chronicle-raised incident met without an answer keeps today's halving.
 */
import type { IncidentKind } from '../stores/operationsCampaignStore';

export interface IncidentShares {
  production: number;
  energy: number;
  quality: number;
  dispatch: number;
  vehicle: number;
}

/** What an answer does on the plant beside its shares. */
export type IncidentAction =
  | 'none'
  /** delayed_truck: hire a relief lorry; the shipping delay is cancelled. */
  | 'relief'
  /** dust_filter_pressure: change the filter now (one filter from stores). */
  | 'filter'
  /** supplier_contamination: recall what the supplier alert holds. */
  | 'recall';

export interface IncidentResponse {
  id: string;
  shares: IncidentShares;
  action: IncidentAction;
}

const share = (
  production: number,
  energy: number,
  quality: number,
  dispatch: number,
  vehicle: number
): IncidentShares => ({ production, energy, quality, dispatch, vehicle });

/**
 * Per kind, [the answer the free Mitigate maps to, the other]. Production is a
 * throughput share: measured, it costs this plant no tonnes (the dock binds),
 * so it is shown and never ranked. A vehicle slowdown for weather is kept by
 * both answers: the yard drives to the conditions.
 */
export const INCIDENT_RESPONSES: Record<
  IncidentKind,
  readonly [IncidentResponse, IncidentResponse]
> = {
  // The failed mill: isolate it (the line runs without it) or push its
  // neighbours to cover (throughput kept, at the energy the overload draws).
  bearing_overheat: [
    { id: 'isolate', shares: share(1, 0, 0, 0, 0), action: 'none' },
    { id: 'cover', shares: share(0, 1, 0, 0, 0), action: 'none' },
  ],
  // Run the sifter at pressure (its quality loss and energy stay), or change
  // the filter now (a filter from stores; the effect ends).
  dust_filter_pressure: [
    { id: 'run-on', shares: share(0, 1, 1, 0, 0), action: 'none' },
    { id: 'change-filter', shares: share(0, 0, 0, 0, 0), action: 'filter' },
  ],
  // Shed load (throughput falls, the sag's lower draw stays, no quality loss)
  // or ride through (full rate and draw, the sag's quality loss stays).
  power_sag: [
    { id: 'shed', shares: share(1, 1, 0, 0, 0), action: 'none' },
    { id: 'ride', shares: share(0, 0, 1, 0, 0), action: 'none' },
  ],
  // Wait for the late truck (its delay stands) or hire relief (it is cancelled).
  delayed_truck: [
    { id: 'wait', shares: share(0, 0, 0, 0, 0), action: 'none' },
    { id: 'relief', shares: share(0, 0, 0, 0, 0), action: 'relief' },
  ],
  // Test first (the lab's hold isolates the notified flour; dispatch reopens)
  // or recall now (the held flour is scrapped and the quality loss ends).
  supplier_contamination: [
    { id: 'test-first', shares: share(0.5, 0.5, 0.5, 0, 0), action: 'none' },
    { id: 'recall', shares: share(0.5, 0.5, 0, 0, 0), action: 'recall' },
  ],
  // Pack slower (throughput falls with the shortage, the lower draw stays) or
  // reroute to the other packers (half the loss, half the saving).
  packaging_shortage: [
    { id: 'slow', shares: share(1, 1, 0, 0, 0), action: 'none' },
    { id: 'reroute', shares: share(0.5, 0.5, 0, 0, 0), action: 'none' },
  ],
  // Slow the line and close the intake (throughput falls, no quality loss)
  // or keep milling (the wet intake's quality loss stays).
  severe_rain: [
    { id: 'slow-line', shares: share(1, 1, 0, 0, 1), action: 'none' },
    { id: 'keep-milling', shares: share(0, 0, 1, 0, 1), action: 'none' },
  ],
  // Manual control at a safe rate (throughput falls, no quality loss) or run
  // on degraded control (full rate, its quality loss stays).
  control_network_degraded: [
    { id: 'manual', shares: share(1, 1, 0, 0, 1), action: 'none' },
    { id: 'ride', shares: share(0, 0, 1, 0, 1), action: 'none' },
  ],
};

/** Every answer id any incident offers, for the registry. */
export const INCIDENT_OPTION_IDS: readonly string[] = [
  ...new Set(
    Object.values(INCIDENT_RESPONSES).flatMap((pair) => pair.map((response) => response.id))
  ),
];

/** A kind's answer by id; null for an id it does not offer (an old save, a typo). */
export function incidentResponse(kind: IncidentKind, id: unknown): IncidentResponse | null {
  const pair = INCIDENT_RESPONSES[kind];
  return pair?.find((response) => response.id === id) ?? null;
}

/**
 * Game minutes a plant-raised incident lasts once answered (a game rule): two
 * game hours, about a shift's quarter. It then resolves by itself.
 */
export const PLANT_INCIDENT_MINUTES = 120;
