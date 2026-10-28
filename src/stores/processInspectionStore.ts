import { create } from 'zustand';
import { useWindmillLearningStore } from './windmillLearningStore';

export type ProcessInspectionKind = 'mill' | 'sifter' | 'packer' | 'silo' | 'henhouse';
export interface ProcessInspectionSubject {
  id: string;
  kind: ProcessInspectionKind;
  name: string;
}
export type ProcessInspectionStage = 0 | 1 | 2 | 3;
const owners = new Map<string, Map<symbol, ProcessInspectionSubject>>();
const closed = { active: null, stage: 0 as const, feedback: 'none' as const };
interface ProcessInspectionState {
  available: Record<string, ProcessInspectionSubject>;
  active: ProcessInspectionSubject | null;
  stage: ProcessInspectionStage;
  feedback: 'none' | 'retry' | 'correct';
  register: (subject: ProcessInspectionSubject) => () => void;
  start: (id: string) => boolean;
  close: () => void;
  answer: (answer: 'a' | 'b') => void;
  next: () => void;
  back: () => void;
}

// Each mounted subject owns one lease; readiness never comes from lesson progress.
// Working if releasing one copy preserves the subject until its final owner leaves.
export const useProcessInspectionStore = create<ProcessInspectionState>()((set, get) => ({
  available: {},
  ...closed,
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
    if (get().active?.id !== id) set({ ...closed, active: subject });
    return true;
  },
  close: () => set(closed),
  answer: (answer) => {
    const { active, stage } = get();
    if (!active || (stage !== 0 && stage !== 2)) return;
    set({ feedback: answer === (stage === 0 ? 'a' : 'b') ? 'correct' : 'retry' });
  },
  next: () => {
    const { active, stage, feedback } = get();
    if (!active || ((stage === 0 || stage === 2) && feedback !== 'correct')) return;
    if (stage === 3) get().close();
    else set({ stage: (stage + 1) as ProcessInspectionStage, feedback: 'none' });
  },
  back: () => {
    const { active, stage } = get();
    if (active) set({ stage: Math.max(0, stage - 1) as ProcessInspectionStage, feedback: 'none' });
  },
}));
