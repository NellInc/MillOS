/**
 * The bell's route to an asked card: the partner's choice runs when the card's
 * window closes, so its bell row opens the AI workspace on its decisions tab
 * and puts focus on that card. A one-shot request between components, held
 * here rather than in a store, as openRepairWorkspace's Maintain focus is.
 * Working if the row's press lands focus on the card it names.
 */
let pending: string | null = null;
const listeners = new Set<() => void>();

const setPending = (proposalId: string | null) => {
  if (pending === proposalId) return;
  pending = proposalId;
  listeners.forEach((listener) => listener());
};

/** Open the AI workspace and ask the proposal cards to focus this one. */
export function openProposalCard(proposalId: string): void {
  setPending(proposalId);
  window.dispatchEvent(new CustomEvent('millos:open-operations-workspace', { detail: 'ai' }));
}

export const subscribeProposalFocus = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The proposal a focus request is waiting for, or null. */
export const pendingProposalFocus = (): string | null => pending;

/** Consume the request for this proposal: true once, when it was the one asked for. */
export function takeProposalFocus(proposalId: string): boolean {
  if (pending !== proposalId) return false;
  setPending(null);
  return true;
}
