/**
 * Contractors with paired traits, after Egypt: Old Kingdom's architects
 * (architect_features.txt): one strength and one weakness from different
 * groups, each magnitude rolled within the original range. Contractors are
 * firms; nothing here describes or rates a person.
 */
import { chronicleStream, rollRange } from './rng';
import type { Contractor, ContractorTrait, TraitGroup, TraitId } from './types';

interface TraitDefinition {
  id: TraitId;
  group: TraitGroup;
  positive: boolean;
  label: string;
  min: number;
  max: number;
}

export const TRAIT_DEFINITIONS: readonly TraitDefinition[] = [
  { id: 'thrifty', group: 'cost', positive: true, label: 'Thrifty', min: 10, max: 30 },
  { id: 'diligent', group: 'effect', positive: true, label: 'Diligent', min: 10, max: 30 },
  { id: 'careful', group: 'risk', positive: true, label: 'Careful', min: 20, max: 60 },
  { id: 'expeditious', group: 'speed', positive: true, label: 'Expeditious', min: 10, max: 30 },
  { id: 'wasteful', group: 'cost', positive: false, label: 'Wasteful', min: 5, max: 15 },
  { id: 'neglectful', group: 'effect', positive: false, label: 'Neglectful', min: 5, max: 15 },
  { id: 'reckless', group: 'risk', positive: false, label: 'Reckless', min: 10, max: 30 },
  { id: 'passive', group: 'speed', positive: false, label: 'Passive', min: 5, max: 15 },
];

export function traitLabel(trait: ContractorTrait): string {
  const definition = TRAIT_DEFINITIONS.find((d) => d.id === trait.id);
  const name = definition?.label ?? trait.id;
  switch (trait.group) {
    case 'cost':
      return `${name}: install cost ${trait.positive ? '-' : '+'}${trait.magnitude}%`;
    case 'effect':
      return `${name}: plan effect ${trait.positive ? '+' : '-'}${trait.magnitude}%`;
    case 'risk':
      return `${name}: snag chance ${trait.positive ? '-' : '+'}${trait.magnitude}%`;
    case 'speed':
      return `${name}: install time ${trait.positive ? '-' : '+'}${trait.magnitude}%`;
  }
}

const FIRM_NAMES = [
  'Harrow and Daughters Millwrights',
  'Fenland Mechanical Cooperative',
  'Weirside Engineering',
  'Kestrel Roll Works',
  'Marsh Lane Fabrication',
  'Old Quay Millwrighting',
  'Brindle Valley Engineers',
  'Saltings Process Services',
  'Thornbury Mill Services',
  'Upper Weir Workshop',
  'Greyfriars Plant Company',
  'Lockkeeper Engineering',
] as const;

/** Snag chance at install completion before contractor traits. */
export const BASE_SNAG_CHANCE = 0.15;
/** The in-house crew installs at baseline cost and this duration multiplier. */
export const IN_HOUSE_DURATION_MULTIPLIER = 1.5;

/** Three firms for a crop year, each with one strength and one weakness from different groups. */
export function contractorCandidates(seed: number, cropYear: number): Contractor[] {
  const next = chronicleStream(seed, 'contractors', cropYear);
  const positives = TRAIT_DEFINITIONS.filter((t) => t.positive);
  const negatives = TRAIT_DEFINITIONS.filter((t) => !t.positive);
  const usedNames = new Set<string>();
  const result: Contractor[] = [];
  for (let i = 0; i < 3; i++) {
    const strength = positives[Math.floor(next() * positives.length) % positives.length];
    const eligible = negatives.filter((t) => t.group !== strength.group);
    const weakness = eligible[Math.floor(next() * eligible.length) % eligible.length];
    let name = FIRM_NAMES[Math.floor(next() * FIRM_NAMES.length) % FIRM_NAMES.length];
    for (let guard = 0; usedNames.has(name) && guard < FIRM_NAMES.length; guard++) {
      name = FIRM_NAMES[(FIRM_NAMES.indexOf(name) + 1) % FIRM_NAMES.length];
    }
    usedNames.add(name);
    result.push({
      id: `contractor-${cropYear}-${i}`,
      name,
      strength: {
        id: strength.id,
        group: strength.group,
        positive: true,
        magnitude: rollRange(strength.min, strength.max, next()),
      },
      weakness: {
        id: weakness.id,
        group: weakness.group,
        positive: false,
        magnitude: rollRange(weakness.min, weakness.max, next()),
      },
      retainer: rollRange(40, 80, next()),
      cropYear,
    });
  }
  return result;
}

function traitFactor(contractor: Contractor | null, group: TraitGroup): number {
  if (!contractor) return 0;
  let signed = 0;
  for (const trait of [contractor.strength, contractor.weakness]) {
    if (trait.group !== group) continue;
    signed += (trait.positive ? 1 : -1) * trait.magnitude;
  }
  return signed / 100;
}

/** Install cost multiplier: Thrifty lowers it, Wasteful raises it. */
export function contractorCostMultiplier(contractor: Contractor | null): number {
  return Math.max(0.5, 1 - traitFactor(contractor, 'cost'));
}

/** Effect multiplier: Diligent raises it, Neglectful lowers it. */
export function contractorEffectScale(contractor: Contractor | null): number {
  return Math.max(0.5, 1 + traitFactor(contractor, 'effect'));
}

/** Snag chance at completion: Careful lowers it, Reckless raises it. */
export function contractorSnagChance(contractor: Contractor | null): number {
  return Math.min(0.9, Math.max(0, BASE_SNAG_CHANCE * (1 - traitFactor(contractor, 'risk'))));
}

/** Install duration in shifts: Expeditious shortens it, Passive lengthens it. */
export function contractorInstallShifts(contractor: Contractor | null, baseShifts: number): number {
  const multiplier = contractor
    ? Math.max(0.5, 1 - traitFactor(contractor, 'speed'))
    : IN_HOUSE_DURATION_MULTIPLIER;
  return Math.max(1, Math.round(baseShifts * multiplier));
}
