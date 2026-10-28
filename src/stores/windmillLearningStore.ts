import { create } from 'zustand';

export type WindmillLearningStage = 'power' | 'feed' | 'grind' | 'collect';
type Answer = 'runner' | 'sails' | 'bed';
const stages: WindmillLearningStage[] = ['power', 'feed', 'grind', 'collect'];
const models = new Set<symbol>();
const closed = { open: false, stage: 'power' as const, feedback: 'none' as const };

interface WindmillLearningState {
  ready: boolean;
  open: boolean;
  stage: WindmillLearningStage;
  feedback: 'none' | 'retry' | 'correct';
  start: () => boolean;
  close: () => void;
  answer: (answer: Answer) => void;
  next: () => void;
  back: () => void;
  registerModel: () => () => void;
}

// Readiness is a mounted-model lease, never a GPU compilation or progress claim.
// Working if only the last model release closes the lesson, even with repeated cleanup.
export const useWindmillLearningStore = create<WindmillLearningState>()((set, get) => ({
  ready: false,
  ...closed,
  start: () => {
    if (!get().ready) return false;
    if (!get().open) set({ ...closed, open: true });
    return true;
  },
  close: () => set(closed),
  answer: (answer) => {
    const { open, stage } = get();
    if (!open || (stage !== 'power' && stage !== 'grind')) return;
    set({ feedback: answer === (stage === 'power' ? 'runner' : 'bed') ? 'correct' : 'retry' });
  },
  next: () => {
    const { open, stage, feedback } = get();
    if (!open || ((stage === 'power' || stage === 'grind') && feedback !== 'correct')) return;
    if (stage === 'collect') get().close();
    else set({ stage: stages[stages.indexOf(stage) + 1], feedback: 'none' });
  },
  back: () => {
    const { open, stage } = get();
    if (open) set({ stage: stages[Math.max(0, stages.indexOf(stage) - 1)], feedback: 'none' });
  },
  registerModel: () => {
    const owner = Symbol('windmill model');
    models.add(owner);
    set({ ready: true });
    return () => {
      if (!models.delete(owner)) return;
      if (models.size === 0) set({ ready: false, ...closed });
    };
  },
}));
