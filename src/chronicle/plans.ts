import { copy } from './plans.messages';
/**
 * Eras of the mill (Predynastic Egypt's social stages) and the improvement
 * plans (its discovery tree, with Old Kingdom's cost / rent / bonus split).
 */
import type {
  ChronicleLength,
  ChronicleMode,
  EraDefinition,
  EraId,
  ImprovementDefinition,
  ImprovementProgress,
} from './types';

export const ERAS: readonly EraDefinition[] = [
  {
    id: 'village',
    label: 'Village mill',
    order: 0,
    requires: { improvements: 0, knowHowEarned: 0, trialsPassed: 0 },
    bonus: {},
    noteId: null,
  },
  {
    id: 'cooperative',
    label: 'Cooperative mill',
    order: 1,
    requires: { improvements: 3, knowHowEarned: 40, trialsPassed: 0 },
    bonus: { reinvestment: 0.05 },
    noteId: 'history-rochdale',
  },
  {
    id: 'district',
    label: 'District mill',
    order: 2,
    requires: { improvements: 6, knowHowEarned: 90, trialsPassed: 1 },
    bonus: { wear: 0.97 },
    noteId: 'history-oliver-evans',
  },
  {
    id: 'regional',
    label: 'Regional mill',
    order: 3,
    requires: { improvements: 9, knowHowEarned: 160, trialsPassed: 2 },
    bonus: { energy: 0.97 },
    noteId: 'history-roller-milling',
    minStanding: 4,
  },
  {
    id: 'federated',
    label: 'Federated cooperative',
    order: 4,
    requires: { improvements: 12, knowHowEarned: 240, trialsPassed: 3 },
    bonus: { reinvestment: 0.05, production: 1.02 },
    noteId: 'history-mondragon',
    minStanding: 6,
  },
];

export function eraById(id: EraId): EraDefinition {
  return ERAS.find((era) => era.id === id) ?? ERAS[0];
}

/** Know-how standing in for each trial when the charter has no trials. */
const KNOW_HOW_PER_TRIAL_WITHOUT_TRIALS = 60;
/**
 * Era requirement scale for 27-shift short chronicles so all five eras
 * (including Federated cooperative) remain reachable within the shorter span.
 */
const SHORT_CHRONICLE_ERA_SCALE = 0.75;

/** Improvements an era asks for, scaled down for 27-shift short chronicles. */
export function eraImprovementTarget(era: EraDefinition, length?: ChronicleLength): number {
  if (length === 'short') return Math.ceil(era.requires.improvements * SHORT_CHRONICLE_ERA_SCALE);
  return era.requires.improvements;
}

/** Know-how an era asks for; without trials it stands in for them. */
export function eraKnowHowTarget(
  era: EraDefinition,
  mode: ChronicleMode,
  length?: ChronicleLength
): number {
  const base =
    mode === 'historical'
      ? era.requires.knowHowEarned
      : era.requires.knowHowEarned + era.requires.trialsPassed * KNOW_HOW_PER_TRIAL_WITHOUT_TRIALS;
  return length === 'short' ? Math.round(base * SHORT_CHRONICLE_ERA_SCALE) : base;
}

export function eraRequirementsMet(
  era: EraDefinition,
  installed: number,
  knowHowEarned: number,
  trialsPassed: number,
  mode: ChronicleMode,
  standing = 9,
  length?: ChronicleLength
): boolean {
  if (era.minStanding !== undefined && standing < era.minStanding) return false;
  const knowHowNeeded = eraKnowHowTarget(era, mode, length);
  const trialsOk = mode === 'historical' ? trialsPassed >= era.requires.trialsPassed : true;
  return (
    installed >= eraImprovementTarget(era, length) && knowHowEarned >= knowHowNeeded && trialsOk
  );
}

/** The highest era whose requirements are met, never moving backwards. */
export function reachedEra(
  current: EraId,
  installed: number,
  knowHowEarned: number,
  trialsPassed: number,
  mode: ChronicleMode,
  standing = 9,
  suspended = false,
  length?: ChronicleLength
): EraId {
  let best = eraById(current);
  // A suspended approval holds the mill where it is (docs/CHRONICLE.md, system 23).
  if (suspended) return best.id;
  for (const era of ERAS) {
    if (era.order <= best.order) continue;
    if (era.order !== best.order + 1) break;
    if (!eraRequirementsMet(era, installed, knowHowEarned, trialsPassed, mode, standing, length))
      break;
    best = era;
  }
  return best.id;
}

export const IMPROVEMENTS: readonly ImprovementDefinition[] = [
  // Village mill
  {
    id: 'moisture-meters',
    label: 'Grain moisture meters',
    column: 0,
    row: 0,
    era: 'village',
    requires: [],
    planCost: 8,
    installCost: 35,
    installShifts: 2,
    upkeep: 1,
    effect: { qualityPenalty: -1 },
  },
  {
    id: 'spare-parts-store',
    label: 'Spare-parts store',
    column: 0,
    row: 1,
    era: 'village',
    requires: [],
    planCost: 8,
    installCost: 30,
    installShifts: 2,
    upkeep: 1,
    effect: { wear: 0.97 },
  },
  {
    id: 'drainage-works',
    label: 'Yard drainage works',
    column: 0,
    row: 2,
    era: 'village',
    requires: [],
    planCost: 10,
    installCost: 35,
    installShifts: 2,
    upkeep: 1,
    effect: {},
    forecastRelief: { severe_rain: 0.25 },
  },
  {
    id: 'members-library',
    label: 'Members library',
    column: 0,
    row: 3,
    era: 'village',
    requires: [],
    planCost: 6,
    installCost: 25,
    installShifts: 1,
    upkeep: 1,
    effect: {},
    knowHowPerShift: 1,
  },
  // Cooperative mill
  {
    id: 'grain-dryer',
    label: 'Grain dryer',
    column: 1,
    row: 0,
    era: 'cooperative',
    requires: ['moisture-meters'],
    planCost: 18,
    installCost: 55,
    installShifts: 3,
    upkeep: 2,
    effect: {},
    cropRelief: ['wet'],
  },
  {
    id: 'vibration-monitoring',
    label: 'Vibration monitoring',
    column: 1,
    row: 1,
    era: 'cooperative',
    requires: ['spare-parts-store'],
    planCost: 16,
    // Priced on what it saves (item 4.3, D8) and stepped cleanly above its
    // Village prerequisite spare-parts-store (30/1).
    installCost: 40,
    installShifts: 3,
    upkeep: 1,
    effect: { wear: 0.92 },
  },
  {
    id: 'aspiration-upgrade',
    label: 'Aspiration upgrade',
    column: 1,
    row: 2,
    era: 'cooperative',
    requires: [],
    planCost: 16,
    installCost: 45,
    installShifts: 3,
    upkeep: 2,
    effect: {},
    forecastRelief: { dust_filter_pressure: 0.3 },
  },
  // District mill
  {
    id: 'standby-generator',
    label: 'Standby generator',
    column: 2,
    row: 0,
    era: 'district',
    requires: [],
    planCost: 24,
    installCost: 65,
    installShifts: 3,
    upkeep: 2,
    effect: {},
    forecastRelief: { power_sag: 0.3 },
  },
  {
    id: 'blending-bins',
    label: 'Blending bins',
    column: 2,
    row: 1,
    era: 'district',
    requires: ['grain-dryer'],
    planCost: 22,
    installCost: 55,
    installShifts: 3,
    upkeep: 2,
    effect: {},
    cropRelief: ['sprouted'],
  },
  {
    id: 'sifter-retrofit',
    label: 'Plansifter retrofit',
    column: 2,
    row: 2,
    era: 'district',
    requires: ['aspiration-upgrade'],
    planCost: 26,
    installCost: 70,
    installShifts: 4,
    upkeep: 2,
    effect: { production: 1.03 },
    noteId: 'history-plansifter',
  },
  {
    id: 'haulage-agreement',
    label: 'Haulage agreement',
    column: 2,
    row: 3,
    era: 'district',
    requires: [],
    planCost: 20,
    installCost: 45,
    installShifts: 2,
    upkeep: 2,
    effect: {},
    forecastRelief: { delayed_truck: 0.3 },
  },
  // Regional mill
  {
    id: 'wind-turbine',
    label: 'Wind turbine',
    column: 3,
    row: 0,
    era: 'regional',
    requires: [],
    planCost: 32,
    // Priced on what it saves (item 4.3, D8): about 10.7 of the 167 of energy
    // booked a shift in the paired control (9.9 in the probe's runs, where it
    // paid back in 6 to 11 shifts). Was 400 and 6, which never paid back.
    installCost: 60,
    installShifts: 4,
    upkeep: 2,
    effect: { energy: 0.94 },
    noteId: 'history-windmills',
  },
  {
    id: 'roll-regrinding-shop',
    label: 'Roll regrinding shop',
    column: 3,
    row: 1,
    era: 'regional',
    requires: ['vibration-monitoring'],
    planCost: 30,
    installCost: 80,
    installShifts: 4,
    upkeep: 3,
    effect: { wear: 0.9, production: 1.02 },
  },
  {
    id: 'heat-recovery',
    label: 'Heat recovery',
    column: 3,
    row: 2,
    era: 'regional',
    requires: [],
    planCost: 28,
    // Priced on what it saves (item 4.3, D8): about 7 of the 167 of energy
    // booked a shift in the paired control (6.5 in the probe's runs, where it
    // paid back in 6 to 10 shifts). Was 280 and 5.
    installCost: 45,
    installShifts: 3,
    upkeep: 1,
    effect: { energy: 0.96 },
  },
  // Federated cooperative
  {
    id: 'federated-purchasing',
    label: 'Federated purchasing',
    column: 4,
    row: 0,
    era: 'federated',
    requires: [],
    planCost: 40,
    installCost: 70,
    installShifts: 3,
    upkeep: 1,
    effect: { upkeep: 0.85 },
  },
  {
    id: 'solar-canopy',
    label: 'Solar canopy',
    column: 4,
    row: 1,
    era: 'federated',
    requires: ['wind-turbine'],
    planCost: 40,
    installCost: 75,
    installShifts: 4,
    upkeep: 2,
    effect: { energy: 0.93 },
  },
];

export function improvementById(id: string): ImprovementDefinition | undefined {
  return IMPROVEMENTS.find((plan) => plan.id === id);
}

export function installedIds(progress: readonly ImprovementProgress[]): string[] {
  return progress.filter((p) => p.phase === 'installed').map((p) => p.id);
}

export type PlanAvailability =
  | 'locked_era'
  | 'locked_requires'
  | 'available'
  | 'planned'
  | 'installing'
  | 'installed';

export function planAvailability(
  plan: ImprovementDefinition,
  era: EraId,
  progress: readonly ImprovementProgress[]
): PlanAvailability {
  const own = progress.find((p) => p.id === plan.id);
  if (own) return own.phase;
  if (plan.column > eraById(era).order) return 'locked_era';
  const installed = new Set(installedIds(progress));
  if (!plan.requires.every((id) => installed.has(id) || progress.some((p) => p.id === id)))
    return 'locked_requires';
  return 'available';
}

export function getEras(): EraDefinition[] {
  return ERAS.map((era) => ({ ...era, label: copy(era.label) }));
}

export function getImprovements(): ImprovementDefinition[] {
  return IMPROVEMENTS.map((plan) => ({ ...plan, label: copy(plan.label) }));
}
