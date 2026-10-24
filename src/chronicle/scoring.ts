/**
 * Final score and rank, after Predynastic Egypt's closing screen ("you are as
 * wise as... a hardworking farmer ... the god Horus himself"). The rank names
 * the run, never a person.
 */
import { charterScore, TRAINING_MODE } from './charter';
import { eraById } from './plans';
import { MEDAL_POINTS } from './trials';
import type { Charter, EraId, Medal } from './types';

/**
 * Thresholds rescaled when part two raised the maximum from 53 to 60 (standing
 * up to 4, the long night 3): each is the part-one threshold times 60/53,
 * rounded, so a rank means the same share of a perfect chronicle.
 */
export const RANKS: ReadonlyArray<{ min: number; title: string }> = [
  { min: 0, title: 'a sack-carrier' },
  { min: 7, title: 'an apprentice miller' },
  { min: 14, title: 'a journeyman miller' },
  { min: 20, title: 'a master miller' },
  { min: 27, title: 'a millwright of renown' },
  { min: 34, title: 'a steward of the cooperative' },
  { min: 41, title: 'a founder of the federation' },
  { min: 48, title: 'the keeper of the millstream' },
  { min: 54, title: 'the spirit of the millstream' },
];

export interface ScoreInput {
  charter: Omit<Charter, 'seed'>;
  trialMedals: readonly (Medal | null)[];
  challengeMedals: readonly Medal[];
  era: EraId;
  /** Shift grades A..F as points 4..0. */
  gradePoints: readonly number[];
  trainingMode: boolean;
  /** Certifier standing points (docs/CHRONICLE.md, system 23). */
  standing?: number;
  /** Points for holding the front the mill did not choose on the long night. */
  longNight?: number;
}

export interface ScoreBreakdown {
  trials: number;
  challenges: number;
  era: number;
  grades: number;
  charter: number;
  standing: number;
  longNight: number;
  training: number;
  total: number;
  rank: string;
}

export function scoreChronicle(input: ScoreInput): ScoreBreakdown {
  const trials = input.trialMedals.reduce(
    (sum, medal) => sum + (medal ? MEDAL_POINTS[medal] : 0),
    0
  );
  // Challenges are repeatable; the best three count.
  const challenges = [...input.challengeMedals]
    .map((medal) => MEDAL_POINTS[medal])
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((sum, value) => sum + value, 0);
  const era = eraById(input.era).order * 3;
  const grades = input.gradePoints.length
    ? Math.round(
        (input.gradePoints.reduce((sum, value) => sum + value, 0) / input.gradePoints.length) * 2
      )
    : 0;
  const charter = charterScore(input.charter);
  const standing = Math.max(0, input.standing ?? 0);
  const longNight = Math.max(0, input.longNight ?? 0);
  const training = input.trainingMode ? -TRAINING_MODE.scorePenalty : 0;
  const total = Math.max(
    0,
    trials + challenges + era + grades + charter + standing + longNight + training
  );
  const rank = [...RANKS].reverse().find((r) => total >= r.min)?.title ?? RANKS[0].title;
  return { trials, challenges, era, grades, charter, standing, longNight, training, total, rank };
}
