import { create } from 'zustand';

/** What the first-person card shows: a resident, or the silo whose ladder top the body is on. */
export type WorldCardSubject =
  | {
      readonly kind: 'resident';
      readonly personId: string;
      /** The scene's task when the resident was greeted (English diagnostic data). */
      readonly task: string;
      /** The aim target that opened it; the card closes when the view leaves it. */
      readonly interactableId: string;
    }
  | { readonly kind: 'silo'; readonly siloId: string };

interface WorldCardState {
  card: WorldCardSubject | null;
  show: (card: WorldCardSubject) => void;
  close: () => void;
}

export const useWorldCardStore = create<WorldCardState>()((set) => ({
  card: null,
  show: (card) => set({ card }),
  close: () => set({ card: null }),
}));

/**
 * Show the silo card while the body is at the top of a silo's ladder (the
 * reading the climb is for), and close it on the way down. Writes the store
 * only when the silo changes, so a frame at the top allocates nothing.
 */
export function updateSiloCard(shown: { current: string | null }, siloId: string | null): void {
  if (shown.current === siloId) return;
  const cards = useWorldCardStore.getState();
  if (siloId) cards.show({ kind: 'silo', siloId });
  else if (cards.card?.kind === 'silo') cards.close();
  shown.current = siloId;
}
