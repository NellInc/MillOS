import { copy } from './longNight.messages';
import { localizedMarkLabel } from './record';
import { localizedStakeholderPhrase } from './stakeholders';
import { getImprovements } from './plans';
/**
 * The long night (docs/CHRONICLE.md, system 21), after Awakening's choice of
 * Amaranthine or Vigil's Keep: the mill can put its own hands on one front;
 * the other holds on what was built for it ("the sturdy dwarven walls proved
 * impervious", `DAA:` Epilogue). Preparation is read from the real state, and
 * the same function feeds the telegraph card and the resolution.
 */
import { relationshipTier } from './customers';
import { improvementById } from './plans';
import { stakeholderPhrase } from './stakeholders';
import { MARKS, hasMark } from './record';
import type { RecordContext } from './record';
import type { ForecastKind, FrontId, ImprovementId, StakeholderId } from './types';

export const LONG_NIGHT_EVENT_ID = 'evt-long-night';
export const LONG_NIGHT_SHIFT = 54;
export const LONG_NIGHT_TELEGRAPH_SHIFTS = 2;
/** Preparation weight a front needs to hold without the mill's own hands. */
export const FRONT_HOLD_THRESHOLD = 2;
/** Score points for holding the front the mill did not choose. */
export const LONG_NIGHT_SCORE = 3;

export const FRONTS: Record<
  FrontId,
  {
    label: string;
    /** The front as the subject of a sentence, and its pronoun. */
    subject: string;
    pronoun: string;
    hazard: ForecastKind;
    plans: ImprovementId[];
    parties: StakeholderId[];
  }
> = {
  intake: {
    label: 'The intake and grain stores',
    subject: 'the intake and grain stores',
    pronoun: 'them',
    hazard: 'severe_rain',
    plans: ['drainage-works', 'grain-dryer'],
    parties: ['village', 'growers'],
  },
  floor: {
    label: 'The roller floor',
    subject: 'the roller floor',
    pronoun: 'it',
    hazard: 'power_sag',
    plans: ['standby-generator', 'vibration-monitoring'],
    parties: ['federation', 'haulier'],
  },
};

export function otherFront(front: FrontId): FrontId {
  return front === 'intake' ? 'floor' : 'intake';
}

export interface PreparationSource {
  id: string;
  label: string;
  weight: number;
  met: boolean;
}

/** Every source that counts for a front, met or not, for the card and the resolution. */
export function frontSources(context: RecordContext, front: FrontId): PreparationSource[] {
  const sources: PreparationSource[] = [];
  for (const [id, definition] of Object.entries(MARKS)) {
    for (const prepare of definition.prepares ?? []) {
      if (prepare.front !== front) continue;
      sources.push({
        id: `mark:${id}`,
        label: definition.label,
        weight: prepare.weight,
        met: hasMark(context, id),
      });
    }
  }
  const definition = FRONTS[front];
  const plan = definition.plans.find((id) =>
    context.improvements.some((p) => p.id === id && p.phase === 'installed')
  );
  sources.push({
    id: `plan:${definition.plans.join('|')}`,
    label: `${definition.plans.map((id, index) => (index === 0 ? planLabel(id) : planLabel(id).toLowerCase())).join(' or ')} installed`,
    weight: 1,
    met: plan !== undefined,
  });
  for (const party of definition.parties) {
    const value = context.stakeholders.find((s) => s.id === party)?.value ?? 50;
    sources.push({
      id: `party:${party}`,
      label: `${capitalise(stakeholderPhrase(party))} warm`,
      weight: 1,
      met: relationshipTier(value) === 'warm',
    });
  }
  return sources;
}

function planLabel(id: ImprovementId): string {
  return improvementById(id)?.label ?? id;
}

export function frontPreparation(context: RecordContext, front: FrontId): number {
  return frontSources(context, front).reduce(
    (sum, source) => sum + (source.met ? source.weight : 0),
    0
  );
}

export function frontHolds(context: RecordContext, front: FrontId): boolean {
  return frontPreparation(context, front) >= FRONT_HOLD_THRESHOLD;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function localizedFrontSources(context: RecordContext, front: FrontId): PreparationSource[] {
  const sources: PreparationSource[] = [];
  for (const [id, definition] of Object.entries(MARKS)) {
    for (const prepare of definition.prepares ?? []) {
      if (prepare.front !== front) continue;
      sources.push({
        id: `mark:${id}`,
        label: localizedMarkLabel(id),
        weight: prepare.weight,
        met: hasMark(context, id),
      });
    }
  }
  const definition = FRONTS[front];
  const plan = definition.plans.find((id) =>
    context.improvements.some((p) => p.id === id && p.phase === 'installed')
  );
  sources.push({
    id: `plan:${definition.plans.join('|')}`,
    label: copy('{plans} installed', {
      plans: definition.plans
        .map((id, index) =>
          index === 0
            ? (getImprovements().find((plan) => plan.id === id)?.label ?? id)
            : (getImprovements().find((plan) => plan.id === id)?.label ?? id).toLowerCase()
        )
        .join(copy(' or ')),
    }),
    weight: 1,
    met: plan !== undefined,
  });
  for (const party of definition.parties) {
    const value = context.stakeholders.find((s) => s.id === party)?.value ?? 50;
    sources.push({
      id: `party:${party}`,
      label: copy('{party} warm', { party: capitalise(localizedStakeholderPhrase(party)) }),
      weight: 1,
      met: relationshipTier(value) === 'warm',
    });
  }
  return sources;
}

export function getFronts(): typeof FRONTS {
  return Object.fromEntries(
    Object.entries(FRONTS).map(([id, front]) => [
      id,
      {
        ...front,
        label: copy(front.label),
        subject: copy(front.subject),
        pronoun: copy(front.pronoun),
      },
    ])
  ) as typeof FRONTS;
}
