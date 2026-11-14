import { create } from 'zustand';
import { useWindmillLearningStore } from './windmillLearningStore';
import { chronicleChance } from '../chronicle/rng';

export type ProcessInspectionKind = 'mill' | 'sifter' | 'packer' | 'silo' | 'henhouse';
export interface ProcessInspectionSubject {
  id: string;
  kind: ProcessInspectionKind;
  name: string;
}
export type ProcessInspectionStage = 0 | 1 | 2 | 3;
export type ProcessInspectionChoice = 'a' | 'b';

/** The default seed for answer order; tests and captures may set their own. */
export const PROCESS_INSPECTION_SEED = 0x6d696c6c;

/**
 * The order a lesson question shows its two choices in. Choice `a` answers the
 * first question and `b` the second (the lesson copy's keys); where each sits
 * is drawn from (seed, subject, run), so the right answer is not always in the
 * same place. Working if the position varies by seed and is stable for one.
 */
export function inspectionChoiceOrder(
  seed: number,
  subjectId: string,
  run: number,
  stage: number
): readonly [ProcessInspectionChoice, ProcessInspectionChoice] {
  return chronicleChance(seed, `inspection:${subjectId}`, run * 4 + stage) < 0.5
    ? (['a', 'b'] as const)
    : (['b', 'a'] as const);
}

const owners = new Map<string, Map<symbol, ProcessInspectionSubject>>();
const closed = {
  active: null,
  stage: 0 as const,
  feedback: 'none' as const,
  run: 0,
  liveFillPercent: null,
};
interface ProcessInspectionState {
  available: Record<string, ProcessInspectionSubject>;
  active: ProcessInspectionSubject | null;
  stage: ProcessInspectionStage;
  feedback: 'none' | 'retry' | 'correct';
  seed: number;
  /** Lessons started per subject this session; the active lesson's index is `run`. */
  runs: Record<string, number>;
  run: number;
  /**
   * Subjects whose lesson has been finished this session, each recorded once.
   * Lesson state is not persisted (the cutaway batch's contract), so neither
   * is this record.
   */
  completed: string[];
  /** The open silo cutaway's grain level, to the nearest 10%, as it draws it. */
  liveFillPercent: number | null;
  register: (subject: ProcessInspectionSubject) => () => void;
  start: (id: string) => boolean;
  close: () => void;
  answer: (answer: ProcessInspectionChoice) => void;
  next: () => void;
  back: () => void;
  setLiveFillPercent: (percent: number | null) => void;
}

// Each mounted subject owns one lease; readiness never comes from lesson progress.
// Working if releasing one copy preserves the subject until its final owner leaves.
export const useProcessInspectionStore = create<ProcessInspectionState>()((set, get) => ({
  available: {},
  ...closed,
  seed: PROCESS_INSPECTION_SEED,
  runs: {},
  completed: [],
  register: (subject) => {
    const owner = Symbol(subject.id);
    const leases = owners.get(subject.id) ?? new Map<symbol, ProcessInspectionSubject>();
    leases.set(owner, subject);
    owners.set(subject.id, leases);
    set((state) => ({ available: { ...state.available, [subject.id]: subject } }));
    return () => {
      if (!leases.delete(owner)) return;
      const remaining = [...leases.values()].at(-1);
      if (remaining) {
        set((state) => ({ available: { ...state.available, [subject.id]: remaining } }));
        return;
      }
      owners.delete(subject.id);
      set((state) => {
        const available = { ...state.available };
        delete available[subject.id];
        return { available, ...(state.active?.id === subject.id ? closed : {}) };
      });
    };
  },
  start: (id) => {
    const subject = get().available[id];
    if (!subject) return false;
    useWindmillLearningStore.getState().close();
    if (get().active?.id !== id) {
      const run = get().runs[id] ?? 0;
      set((state) => ({
        ...closed,
        active: subject,
        run,
        runs: { ...state.runs, [id]: run + 1 },
      }));
    }
    return true;
  },
  close: () => set(closed),
  answer: (answer) => {
    const { active, stage } = get();
    if (!active || (stage !== 0 && stage !== 2)) return;
    set({ feedback: answer === (stage === 0 ? 'a' : 'b') ? 'correct' : 'retry' });
  },
  next: () => {
    const { active, stage, feedback, completed } = get();
    if (!active || ((stage === 0 || stage === 2) && feedback !== 'correct')) return;
    if (stage === 3) {
      if (!completed.includes(active.id)) set({ completed: [...completed, active.id] });
      get().close();
    } else set({ stage: (stage + 1) as ProcessInspectionStage, feedback: 'none' });
  },
  back: () => {
    const { active, stage } = get();
    if (active) set({ stage: Math.max(0, stage - 1) as ProcessInspectionStage, feedback: 'none' });
  },
  setLiveFillPercent: (percent) => {
    if (get().liveFillPercent !== percent) set({ liveFillPercent: percent });
  },
}));
