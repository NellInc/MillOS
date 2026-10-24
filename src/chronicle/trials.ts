/**
 * Trials, after Predynastic Egypt's trials (trial_sanctuary.txt: ten turns,
 * gold with seven or more to spare, silver with four or more, otherwise
 * bronze) and Old Kingdom's advance warning ("A new trial will commence in N
 * turns"). Each trial reads only recorded shift evidence.
 */
import type { Medal, TrialDefinition, TrialId, TrialProgress } from './types';

export const TRIAL_TELEGRAPH_SHIFTS = 2;

export const TRIALS: readonly TrialDefinition[] = [
  {
    id: 'wet_harvest',
    title: 'The Wet Harvest',
    startShift: 11,
    durationShifts: 4,
    goldSpare: 2,
    silverSpare: 1,
    goal: { kind: 'dispatch', kg: 6000, noQualityFailure: true },
    introNoteId: 'history-wet-harvest-1879',
    outroNoteId: 'history-grain-drying',
    briefing:
      'The growers brought the harvest in wet. Dispatch 6,000 kg with no quality failure while the damp grain runs through the mill.',
    pressureBeat: 'Half the window has gone. The bakers are asking whether the flour will hold.',
  },
  {
    id: 'inspection',
    title: 'The Inspection',
    startShift: 20,
    durationShifts: 4,
    goldSpare: 1,
    silverSpare: 0,
    goal: { kind: 'clean_closes', closes: 3 },
    introNoteId: 'history-assize-of-bread',
    outroNoteId: 'history-sale-of-food-act',
    briefing:
      'The county food-standards office will audit three consecutive shift closes: a passed QC test in each, no quality failure and no unresolved high-severity incident.',
    pressureBeat: 'The auditors are halfway through their file. Every shift close is being read.',
  },
  {
    id: 'bakers_rush',
    title: 'The Bakers’ Rush',
    startShift: 29,
    durationShifts: 6,
    goldSpare: 2,
    silverSpare: 1,
    goal: { kind: 'dispatch', kg: 12000 },
    introNoteId: 'history-chorleywood',
    outroNoteId: 'history-bread-rationing',
    briefing:
      'Every bakery in the valley wants flour at once. Dispatch 12,000 kg before the rush passes.',
    pressureBeat: 'Halfway through the rush. The bakeries are counting the sacks.',
  },
  {
    id: 'grid_winter',
    title: 'Grid Winter',
    startShift: 38,
    durationShifts: 5,
    goldSpare: 2,
    silverSpare: 1,
    goal: { kind: 'dispatch', kg: 8000, maxEnergyPerKg: 0.08 },
    introNoteId: 'history-three-day-week',
    outroNoteId: 'history-tide-mills',
    briefing:
      'Power is short across the region this winter. Dispatch 8,000 kg at an energy cost of no more than 0.08 per kg.',
    pressureBeat: 'Half the winter window has gone. The network operator is watching peak demand.',
  },
  {
    id: 'great_programme',
    title: 'The Great Programme',
    startShift: 50,
    durationShifts: 9,
    goldSpare: 3,
    silverSpare: 1,
    goal: { kind: 'dispatch', kg: 20000, noQualityFailure: true },
    introNoteId: 'history-old-kingdom-bakeries',
    outroNoteId: 'history-grinding-statues',
    briefing:
      'The federation asks the mill to feed the whole valley through the months of works. Dispatch 20,000 kg with no quality failure.',
    pressureBeat: 'The programme is half done. The federation asks for a progress report.',
  },
];

export function trialById(id: TrialId): TrialDefinition {
  return TRIALS.find((trial) => trial.id === id) ?? TRIALS[0];
}

export function emptyTrialProgress(id: TrialId): TrialProgress {
  return {
    id,
    phase: 'telegraphed',
    startedShift: null,
    shiftsUsed: 0,
    dispatchedKg: 0,
    qualityFailureKg: 0,
    energyCost: 0,
    gradePoints: 0,
    cleanCloses: 0,
    medal: null,
    pressureShown: false,
    failureReason: null,
  };
}

export const GRADE_POINTS: Record<'A' | 'B' | 'C' | 'D' | 'F', number> = {
  A: 4,
  B: 3,
  C: 2,
  D: 1,
  F: 0,
};

export interface TrialShiftEvidence {
  dispatchedKg: number;
  qualityFailureKg: number;
  energyCost: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  qcPassedThisShift: boolean;
  unresolvedHighIncident: boolean;
}

export function medalFor(definition: TrialDefinition, shiftsUsed: number): Medal {
  const spare = definition.durationShifts - shiftsUsed;
  if (spare >= definition.goldSpare) return 'gold';
  if (spare >= definition.silverSpare) return 'silver';
  return 'bronze';
}

/** The latest completion shift (shifts used) that would have earned the next medal up. */
export function nextMedalTarget(
  definition: TrialDefinition,
  medal: Medal
): { medal: Medal; shiftsUsed: number } | null {
  if (medal === 'bronze')
    return { medal: 'silver', shiftsUsed: definition.durationShifts - definition.silverSpare };
  if (medal === 'silver')
    return { medal: 'gold', shiftsUsed: definition.durationShifts - definition.goldSpare };
  return null;
}

/** Advance an active trial by one closed shift. Pure. */
export function advanceTrial(
  definition: TrialDefinition,
  progress: TrialProgress,
  evidence: TrialShiftEvidence
): TrialProgress {
  if (progress.phase !== 'active') return progress;
  const next: TrialProgress = {
    ...progress,
    shiftsUsed: progress.shiftsUsed + 1,
    dispatchedKg: progress.dispatchedKg + Math.max(0, evidence.dispatchedKg),
    qualityFailureKg: progress.qualityFailureKg + Math.max(0, evidence.qualityFailureKg),
    energyCost: progress.energyCost + Math.max(0, evidence.energyCost),
    gradePoints: progress.gradePoints + GRADE_POINTS[evidence.grade],
  };
  const goal = definition.goal;
  let complete = false;
  if (goal.kind === 'clean_closes') {
    const clean =
      evidence.qcPassedThisShift &&
      evidence.qualityFailureKg <= 0 &&
      !evidence.unresolvedHighIncident;
    next.cleanCloses = clean ? progress.cleanCloses + 1 : 0;
    complete = next.cleanCloses >= goal.closes;
  } else {
    if (goal.noQualityFailure && next.qualityFailureKg > 0) {
      return {
        ...next,
        phase: 'failed',
        failureReason: `${next.qualityFailureKg.toFixed(0)} kg failed its recipe quality threshold.`,
      };
    }
    const energyOk =
      goal.maxEnergyPerKg === undefined ||
      (next.dispatchedKg > 0 && next.energyCost / next.dispatchedKg <= goal.maxEnergyPerKg);
    const gradeOk =
      goal.minAverageGrade === undefined ||
      next.gradePoints / next.shiftsUsed >= GRADE_POINTS[goal.minAverageGrade];
    complete = next.dispatchedKg >= goal.kg && energyOk && gradeOk;
  }
  if (complete) return { ...next, phase: 'passed', medal: medalFor(definition, next.shiftsUsed) };
  if (next.shiftsUsed >= definition.durationShifts) {
    return { ...next, phase: 'failed', failureReason: trialShortfall(definition, next) };
  }
  return next;
}

export function trialShortfall(definition: TrialDefinition, progress: TrialProgress): string {
  const goal = definition.goal;
  if (goal.kind === 'clean_closes')
    return `${progress.cleanCloses} of ${goal.closes} consecutive clean shift closes.`;
  const parts = [
    `${progress.dispatchedKg.toFixed(0)} of ${goal.kg.toLocaleString()} kg dispatched.`,
  ];
  if (goal.maxEnergyPerKg !== undefined && progress.dispatchedKg > 0)
    parts.push(
      `Energy ${(progress.energyCost / progress.dispatchedKg).toFixed(3)} per kg against ${goal.maxEnergyPerKg}.`
    );
  if (goal.minAverageGrade !== undefined && progress.shiftsUsed > 0)
    parts.push(
      `Average grade points ${(progress.gradePoints / progress.shiftsUsed).toFixed(1)} against ${GRADE_POINTS[goal.minAverageGrade]}.`
    );
  return parts.join(' ');
}

/** The conditions beyond the tonnage, for the trial card. */
export function trialGoalConditions(definition: TrialDefinition): string {
  const goal = definition.goal;
  if (goal.kind !== 'dispatch') return '';
  const parts: string[] = [];
  if (goal.noQualityFailure) parts.push('no quality failure');
  if (goal.maxEnergyPerKg !== undefined) parts.push(`energy at most ${goal.maxEnergyPerKg} per kg`);
  if (goal.minAverageGrade) parts.push(`average grade ${goal.minAverageGrade} or better`);
  return parts.join(', ');
}

/** The whole goal in a few words. */
export function trialGoalText(definition: TrialDefinition): string {
  const goal = definition.goal;
  if (goal.kind === 'clean_closes')
    return `${goal.closes} clean shift closes in a row within ${definition.durationShifts} shifts`;
  const conditions = trialGoalConditions(definition);
  return `dispatch ${goal.kg.toLocaleString()} kg in ${definition.durationShifts} shifts${conditions ? `, ${conditions}` : ''}`;
}

/** Progress toward the goal, 0..1, for the trial bar. */
export function trialFraction(definition: TrialDefinition, progress: TrialProgress): number {
  const goal = definition.goal;
  if (goal.kind === 'clean_closes') return Math.min(1, progress.cleanCloses / goal.closes);
  return Math.min(1, progress.dispatchedKg / goal.kg);
}

// ---------------------------------------------------------------------------
// Recovery challenge medals (operationsPlay challenges, 360-minute window)
// ---------------------------------------------------------------------------

export const CHALLENGE_GOLD_SPARE_MINUTES = 180;
export const CHALLENGE_SILVER_SPARE_MINUTES = 90;

export function challengeMedal(run: {
  status: string;
  deadlineMinute: number;
  endedAtMinute: number | null;
}): Medal | null {
  if (run.status !== 'completed' || run.endedAtMinute === null) return null;
  const spare = run.deadlineMinute - run.endedAtMinute;
  if (spare >= CHALLENGE_GOLD_SPARE_MINUTES) return 'gold';
  if (spare >= CHALLENGE_SILVER_SPARE_MINUTES) return 'silver';
  return 'bronze';
}

export const MEDAL_POINTS: Record<Medal, number> = { gold: 3, silver: 2, bronze: 1 };
export const MEDAL_KNOW_HOW: Record<Medal, number> = { gold: 12, silver: 8, bronze: 4 };
