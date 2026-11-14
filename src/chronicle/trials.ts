import { copy } from './trials.messages';
import { formatFixed, formatGrouped } from '../i18n';
/**
 * Trials, after Predynastic Egypt's trials (trial_sanctuary.txt: ten turns,
 * gold with seven or more to spare, silver with four or more, otherwise
 * bronze) and Old Kingdom's advance warning ("A new trial will commence in N
 * turns"). Each trial reads only recorded shift evidence.
 */
import type { CleanCloseBreak, Medal, TrialDefinition, TrialId, TrialProgress } from './types';
import {
  ENERGY_DIGITS,
  ENERGY_SCALE,
  GOLD_PACE,
  GRID_WINTER_MAX_ENERGY_PER_KG,
  SHORT_GOLD_PACE,
  trialKg,
} from './measuredPlant';

export const TRIAL_TELEGRAPH_SHIFTS = 2;

/**
 * Briefings name their goal, so they are templates filled from the goal
 * (`{kg}`, `{cap}`): a re-tune on the measured plant changes the figure in
 * every language at once. The filled English is the canonical text notices
 * keep; `getTrials` fills the template in the language shown.
 */
const BRIEFINGS = {
  wet_harvest:
    'The growers brought the harvest in wet. Dispatch {kg} kg with no quality failure while the damp grain runs through the mill.',
  bakers_rush:
    'Every bakery in the valley wants flour at once. Dispatch {kg} kg before the rush passes.',
  grid_winter:
    'Power is short across the region this winter. Dispatch {kg} kg at an energy cost of no more than {cap} per kg.',
  great_programme:
    'The federation asks the mill to feed the whole valley through the months of works. Dispatch {kg} kg with no quality failure.',
} as const;

/**
 * Briefings saved in notices before item 4.1 re-tuned the goals, full and
 * short, so a saved announcement is still recognised (rule 7; their
 * translations stay in the catalogue).
 */
export const LEGACY_BRIEFINGS: Readonly<Partial<Record<TrialId, readonly string[]>>> = {
  wet_harvest: [
    'The growers brought the harvest in wet. Dispatch 6,000 kg with no quality failure while the damp grain runs through the mill.',
    'The growers brought the harvest in wet. Dispatch 4,500 kg with no quality failure while the damp grain runs through the mill.',
  ],
  bakers_rush: [
    'Every bakery in the valley wants flour at once. Dispatch 12,000 kg before the rush passes.',
    'Every bakery in the valley wants flour at once. Dispatch 6,000 kg before the rush passes.',
  ],
  grid_winter: [
    'Power is short across the region this winter. Dispatch 8,000 kg at an energy cost of no more than 0.08 per kg.',
    'Power is short across the region this winter. Dispatch 4,800 kg at an energy cost of no more than 0.08 per kg.',
  ],
  great_programme: [
    'The federation asks the mill to feed the whole valley through the months of works. Dispatch 20,000 kg with no quality failure.',
    'The federation asks the mill to feed the whole valley through the months of works. Dispatch 8,900 kg with no quality failure.',
  ],
};

/** The figures a briefing template is filled with, in a language. */
export function briefingParams(
  goal: TrialDefinition['goal'],
  locale?: 'en'
): Record<string, string> {
  if (goal.kind !== 'dispatch') return {};
  return {
    kg: formatGrouped(goal.kg, undefined, locale),
    ...(goal.maxEnergyPerKg !== undefined
      ? { cap: formatFixed(goal.maxEnergyPerKg, ENERGY_DIGITS, locale) }
      : {}),
  };
}

function fill(template: string, params: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => params[key] ?? match);
}

/** A dispatch trial's goal, window and briefing, the tonnage set from the measured pace. */
function dispatchTrial(
  base: Omit<
    TrialDefinition,
    'goal' | 'briefing' | 'goldSpare' | 'silverSpare' | 'durationShifts' | 'briefingTemplate'
  >,
  window: { durationShifts: number; goldSpare: number; silverSpare: number },
  goal: { noQualityFailure?: boolean; maxEnergyPerKg?: number },
  template: string,
  goldPace = GOLD_PACE
): TrialDefinition {
  const full: TrialDefinition['goal'] = {
    kind: 'dispatch',
    kg: trialKg(window.durationShifts - window.goldSpare, undefined, goldPace),
    ...goal,
  };
  return {
    ...base,
    ...window,
    goal: full,
    briefingTemplate: template,
    briefing: fill(template, briefingParams(full, 'en')),
  };
}

/**
 * Windows (plan item 4.1, D3): gold at 1.2 times the measured pace over the
 * shifts gold allows (`trialKg`). Seven-shift windows with two spare for gold
 * and one for silver put silver at exactly the measured pace and bronze at
 * 0.86 of it; the Great Programme's nine put gold at 1.2 over seven shifts and
 * silver at 1.05 over eight. The dock sets the tonnes (D22), so the lever that
 * reaches gold is commitment: the partner's early programme, taken.
 */
export const TRIALS: readonly TrialDefinition[] = [
  dispatchTrial(
    {
      id: 'wet_harvest',
      title: 'The Wet Harvest',
      startShift: 11,
      introNoteId: 'history-wet-harvest-1879',
      outroNoteId: 'history-grain-drying',
      floor:
        'On the floor it tests the programmes you accept and strong white kept at 95 while the grain is wet: dry the grain, or install moisture meters and keep the line serviced.',
      pressureBeat: 'Half the window has gone. The bakers are asking whether the flour will hold.',
    },
    { durationShifts: 7, goldSpare: 2, silverSpare: 1 },
    { noQualityFailure: true },
    BRIEFINGS.wet_harvest
  ),
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
    floor:
      'On the floor it tests a batch put through Test batch on Overview every shift, flour over each order’s minimum, and high-severity incidents recovered before the close.',
    pressureBeat: 'The auditors are halfway through their file. Every shift close is being read.',
  },
  dispatchTrial(
    {
      id: 'bakers_rush',
      title: 'The Bakers’ Rush',
      startShift: 29,
      introNoteId: 'history-chorleywood',
      outroNoteId: 'history-bread-rationing',
      floor:
        'On the floor it tests the programmes you accept: every one taken while the rush lasts, and loaded onto the trucks.',
      pressureBeat: 'Halfway through the rush. The bakeries are counting the sacks.',
    },
    { durationShifts: 7, goldSpare: 2, silverSpare: 1 },
    {},
    BRIEFINGS.bakers_rush
  ),
  dispatchTrial(
    {
      id: 'grid_winter',
      title: 'Grid Winter',
      startShift: 38,
      // Energy plans take three to six shifts to install (report 07, D7).
      telegraphShifts: 6,
      introNoteId: 'history-three-day-week',
      outroNoteId: 'history-tide-mills',
      floor:
        'On the floor it tests two levers: the flour the line makes an hour, since power is charged by the hour, and running at night, when power costs 0.08 rather than 0.15.',
      pressureBeat:
        'Half the winter window has gone. The network operator is watching peak demand.',
    },
    { durationShifts: 7, goldSpare: 2, silverSpare: 1 },
    { maxEnergyPerKg: GRID_WINTER_MAX_ENERGY_PER_KG },
    BRIEFINGS.grid_winter
  ),
  dispatchTrial(
    {
      id: 'great_programme',
      title: 'The Great Programme',
      startShift: 50,
      introNoteId: 'history-old-kingdom-bakeries',
      outroNoteId: 'history-grinding-statues',
      floor:
        'On the floor it tests the programmes you accept and every order’s minimum met throughout: service the line when the partner proposes it.',
      pressureBeat: 'The programme is half done. The federation asks for a progress report.',
    },
    { durationShifts: 9, goldSpare: 2, silverSpare: 1 },
    { noQualityFailure: true },
    BRIEFINGS.great_programme
  ),
];

/**
 * The trials of a 27-shift chronicle (plan item 4.2, D3). Each starts where the
 * full one does on the shorter clock (`onSchedule`: the full start times 27/63,
 * rounded down), so they keep their order and spacing. Four shifts lie between
 * starts, so a dispatch window is four shifts with one spare for gold and none
 * for silver: gold at SHORT_GOLD_PACE (1.17) times the measured pace over three
 * shifts, silver at 0.88 of it over four (no bronze). The Great Programme has
 * five shifts before the last close: gold at 1.17 over four, silver at 0.94
 * over five.
 * The Inspection keeps its one spare shift (two clean closes in three). Pinned
 * by `chronicleLength.short.gameplay.test.ts`.
 */
const SHORT_WINDOW = { durationShifts: 4, goldSpare: 1, silverSpare: 0 };

function shortDispatch(
  trial: TrialDefinition,
  startShift: number,
  window = SHORT_WINDOW,
  telegraphShifts?: number
): TrialDefinition {
  const goal = trial.goal;
  if (goal.kind !== 'dispatch' || !trial.briefingTemplate) return trial;
  const base = { ...trial, startShift, ...(telegraphShifts ? { telegraphShifts } : {}) };
  return dispatchTrial(
    base,
    window,
    {
      ...(goal.noQualityFailure ? { noQualityFailure: true } : {}),
      ...(goal.maxEnergyPerKg !== undefined ? { maxEnergyPerKg: goal.maxEnergyPerKg } : {}),
    },
    trial.briefingTemplate,
    SHORT_GOLD_PACE
  );
}

export const SHORT_TRIALS: readonly TrialDefinition[] = TRIALS.map((trial) => {
  switch (trial.id) {
    case 'wet_harvest':
      return shortDispatch(trial, 4);
    case 'inspection':
      return {
        ...trial,
        startShift: 8,
        durationShifts: 3,
        goldSpare: 1,
        silverSpare: 0,
        goal: { kind: 'clean_closes', closes: 2 },
        briefing:
          'The county food-standards office will audit two consecutive shift closes: a passed QC test in each, no quality failure and no unresolved high-severity incident.',
      };
    case 'bakers_rush':
      return shortDispatch(trial, 12);
    case 'grid_winter':
      // Announced as far ahead as the full form (review 2, finding 8), at shift
      // 10. In 27 shifts this buys notice, not an install: the energy plans
      // (wind, heat recovery) are Regional, which a short chronicle reaches
      // at shift 23 to 27, and no plan it can have by shift 16 lowers energy.
      // The six shifts are time to see the goal and its cap and to bring
      // output per hour up before the window.
      return shortDispatch(trial, 16, SHORT_WINDOW, trial.telegraphShifts);
    case 'great_programme':
      return shortDispatch(trial, 21, { durationShifts: 5, goldSpare: 1, silverSpare: 0 });
  }
});

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
    gradedShifts: 0,
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
  /** Null for an idle window, which says nothing about the grade. */
  grade: 'A' | 'B' | 'C' | 'D' | 'F' | null;
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

function gradedShiftsOf(progress: TrialProgress): number {
  return progress.gradedShifts ?? progress.shiftsUsed;
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
    gradePoints: progress.gradePoints + (evidence.grade ? GRADE_POINTS[evidence.grade] : 0),
    gradedShifts: gradedShiftsOf(progress) + (evidence.grade ? 1 : 0),
  };
  const goal = definition.goal;
  let complete = false;
  if (goal.kind === 'clean_closes') {
    const causes: CleanCloseBreak[] = [];
    if (!evidence.qcPassedThisShift) causes.push('qc');
    if (evidence.qualityFailureKg > 0) causes.push('quality');
    if (evidence.unresolvedHighIncident) causes.push('incident');
    next.cleanCloses = causes.length === 0 ? progress.cleanCloses + 1 : 0;
    // The close the run broke at: the trial's start plus the shifts it has used.
    if (causes.length)
      next.brokenAt = { shift: (progress.startedShift ?? 0) + next.shiftsUsed, causes };
    complete = next.cleanCloses >= goal.closes;
  } else {
    if (goal.noQualityFailure && next.qualityFailureKg > 0) {
      return {
        ...next,
        phase: 'failed',
        // An order's last residual can be under a kilogram; it must not read as 0 kg.
        failureReason: `Quality broke it: ${
          next.qualityFailureKg >= 1
            ? formatFixed(next.qualityFailureKg, 0, 'en')
            : formatFixed(Math.max(0.1, Math.ceil(next.qualityFailureKg * 10) / 10), 1, 'en')
        } kg failed its recipe quality threshold.`,
      };
    }
    // To the four decimals the failure notice prints, so it never reads
    // "Energy 0.0080 per kg against 0.008" for a trial it failed on energy.
    const energyOk =
      goal.maxEnergyPerKg === undefined ||
      (next.dispatchedKg > 0 &&
        Math.round((next.energyCost / next.dispatchedKg) * ENERGY_SCALE) / ENERGY_SCALE <=
          goal.maxEnergyPerKg);
    const graded = gradedShiftsOf(next);
    const gradeOk =
      goal.minAverageGrade === undefined ||
      graded === 0 ||
      next.gradePoints / graded >= GRADE_POINTS[goal.minAverageGrade];
    // Judged on the whole kilos the trial card and the failure notice print, so a
    // window 0.4 kg short never fails as "6,000 of 6,000 kg dispatched".
    complete = Math.round(next.dispatchedKg) >= goal.kg && energyOk && gradeOk;
  }
  if (complete) return { ...next, phase: 'passed', medal: medalFor(definition, next.shiftsUsed) };
  if (next.shiftsUsed >= definition.durationShifts) {
    return { ...next, phase: 'failed', failureReason: trialFailure(definition, next) };
  }
  return next;
}

const CLEAN_BREAK_TEXT: Record<CleanCloseBreak, string> = {
  qc: 'QC broke it at the shift {shift} close: no batch passed QC.',
  quality:
    'Quality broke it at the shift {shift} close: flour failed its recipe quality threshold.',
  incident:
    'An incident broke it at the shift {shift} close: a high-severity incident was still open.',
};

/**
 * Why a trial's window closed without it, naming the condition that broke it
 * (item 4.5): one sentence per condition that failed, in the canonical English
 * the notice keeps (presentation.ts translates it). A dispatch trial names the
 * tonnage, the energy or the grade, only those that failed; the Inspection names
 * the close its last run broke at and what that close lacked.
 */
export function trialFailure(definition: TrialDefinition, progress: TrialProgress): string {
  const goal = definition.goal;
  if (goal.kind === 'clean_closes') {
    // A save's record of the break is read only when it has its shape.
    const broken = progress.brokenAt;
    const causes =
      broken && Number.isFinite(broken.shift) && Array.isArray(broken.causes) ? broken.causes : [];
    return [
      ...causes.map((cause) =>
        CLEAN_BREAK_TEXT[cause]?.replace('{shift}', formatFixed(broken!.shift, 0, 'en'))
      ),
      trialShortfall(definition, progress),
    ]
      .filter(Boolean)
      .join(' ');
  }
  const parts: string[] = [];
  if (Math.round(progress.dispatchedKg) < goal.kg)
    parts.push(
      `Dispatch broke it: ${formatGrouped(Math.round(progress.dispatchedKg), undefined, 'en')} of ${formatGrouped(goal.kg, undefined, 'en')} kg dispatched.`
    );
  if (
    goal.maxEnergyPerKg !== undefined &&
    progress.dispatchedKg > 0 &&
    Math.round((progress.energyCost / progress.dispatchedKg) * ENERGY_SCALE) / ENERGY_SCALE >
      goal.maxEnergyPerKg
  )
    parts.push(
      `Energy broke it: ${formatFixed(progress.energyCost / progress.dispatchedKg, ENERGY_DIGITS, 'en')} per kg against ${goal.maxEnergyPerKg}.`
    );
  const graded = gradedShiftsOf(progress);
  if (
    goal.minAverageGrade !== undefined &&
    graded > 0 &&
    progress.gradePoints / graded < GRADE_POINTS[goal.minAverageGrade]
  )
    parts.push(
      `The grade broke it: average grade points ${formatFixed(progress.gradePoints / graded, 1, 'en')} against ${GRADE_POINTS[goal.minAverageGrade]}.`
    );
  // Every condition held to the figure printed yet the window closed: say what it reached.
  return parts.length ? parts.join(' ') : trialShortfall(definition, progress);
}

export function trialShortfall(definition: TrialDefinition, progress: TrialProgress): string {
  const goal = definition.goal;
  if (goal.kind === 'clean_closes')
    return `${progress.cleanCloses} of ${goal.closes} consecutive clean shift closes.`;
  const parts = [
    `${formatGrouped(Math.round(progress.dispatchedKg), undefined, 'en')} of ${formatGrouped(goal.kg, undefined, 'en')} kg dispatched.`,
  ];
  if (goal.maxEnergyPerKg !== undefined && progress.dispatchedKg > 0)
    parts.push(
      `Energy ${formatFixed(progress.energyCost / progress.dispatchedKg, ENERGY_DIGITS, 'en')} per kg against ${goal.maxEnergyPerKg}.`
    );
  const graded = gradedShiftsOf(progress);
  if (goal.minAverageGrade !== undefined && graded > 0)
    parts.push(
      `Average grade points ${formatFixed(progress.gradePoints / graded, 1, 'en')} against ${GRADE_POINTS[goal.minAverageGrade]}.`
    );
  return parts.join(' ');
}

/** The conditions beyond the tonnage, for the trial card. */
export function trialGoalConditions(definition: TrialDefinition): string {
  const goal = definition.goal;
  if (goal.kind !== 'dispatch') return '';
  const parts: string[] = [];
  if (goal.noQualityFailure) parts.push('no quality failure');
  // The temper card's drying is left out of the measure (engine trialEnergyCost).
  if (goal.maxEnergyPerKg !== undefined)
    parts.push(`energy at most ${goal.maxEnergyPerKg} per kg, drying excluded`);
  if (goal.minAverageGrade) parts.push(`average grade ${goal.minAverageGrade} or better`);
  return parts.join(', ');
}

/** The whole goal in a few words. */
export function trialGoalText(definition: TrialDefinition): string {
  const goal = definition.goal;
  if (goal.kind === 'clean_closes')
    return `${goal.closes} clean shift closes in a row within ${definition.durationShifts} shifts`;
  const conditions = trialGoalConditions(definition);
  return `dispatch ${formatGrouped(goal.kg, undefined, 'en')} kg in ${definition.durationShifts} shifts${conditions ? `, ${conditions}` : ''}`;
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

/** A trial in the language shown now; `trials` is the chronicle's own list (`trialsFor`). */
export function localizedTrialById(
  id: TrialId,
  trials: readonly TrialDefinition[] = TRIALS
): TrialDefinition {
  const local = getTrials(trials);
  return local.find((trial) => trial.id === id) ?? local[0];
}

export function localizedTrialShortfall(
  definition: TrialDefinition,
  progress: TrialProgress
): string {
  const goal = definition.goal;
  if (goal.kind === 'clean_closes')
    return copy('{done} of {total} consecutive clean shift closes.', {
      done: formatFixed(progress.cleanCloses),
      total: formatFixed(goal.closes),
    });
  const parts = [
    copy('{done} of {total} kg dispatched.', {
      done: formatGrouped(Math.round(progress.dispatchedKg)),
      total: formatGrouped(goal.kg),
    }),
  ];
  if (goal.maxEnergyPerKg !== undefined && progress.dispatchedKg > 0)
    parts.push(
      copy('Energy {actual} per kg against {target}.', {
        actual: formatFixed(progress.energyCost / progress.dispatchedKg, ENERGY_DIGITS),
        target: formatGrouped(goal.maxEnergyPerKg),
      })
    );
  const graded = gradedShiftsOf(progress);
  if (goal.minAverageGrade !== undefined && graded > 0)
    parts.push(
      copy('Average grade points {actual} against {target}.', {
        actual: formatFixed(progress.gradePoints / graded, 1),
        target: formatFixed(GRADE_POINTS[goal.minAverageGrade]),
      })
    );
  return parts.join(' ');
}

export function localizedTrialGoalConditions(definition: TrialDefinition): string {
  const goal = definition.goal;
  if (goal.kind !== 'dispatch') return '';
  const parts: string[] = [];
  if (goal.noQualityFailure) parts.push(copy('no quality failure'));
  if (goal.maxEnergyPerKg !== undefined)
    parts.push(
      copy('energy at most {target} per kg, drying excluded', {
        target: formatGrouped(goal.maxEnergyPerKg),
      })
    );
  if (goal.minAverageGrade)
    parts.push(copy('average grade {grade} or better', { grade: goal.minAverageGrade }));
  return parts.join(', ');
}

export function localizedTrialGoalText(definition: TrialDefinition): string {
  const goal = definition.goal;
  if (goal.kind === 'clean_closes')
    return copy('{closes} clean shift closes in a row within {shifts} shifts', {
      closes: formatFixed(goal.closes),
      shifts: formatFixed(definition.durationShifts),
    });
  const conditions = localizedTrialGoalConditions(definition);
  return copy('dispatch {kg} kg in {shifts} shifts{conditions}', {
    kg: formatGrouped(goal.kg),
    shifts: formatFixed(definition.durationShifts),
    conditions: conditions ? `, ${conditions}` : '',
  });
}

export function getTrials(trials: readonly TrialDefinition[] = TRIALS): TrialDefinition[] {
  return trials.map((trial) => ({
    ...trial,
    title: copy(trial.title),
    // A templated briefing is filled in the language shown (item 4.1).
    briefing: trial.briefingTemplate
      ? copy(trial.briefingTemplate, briefingParams(trial.goal))
      : copy(trial.briefing),
    floor: copy(trial.floor),
    pressureBeat: copy(trial.pressureBeat),
  }));
}
