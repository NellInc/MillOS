/**
 * The partner's proposals: those open, those resolved (who decided, and an
 * hour later both prices), and per kind whether the partner asks or decides
 * and tells. Data only: the runtime (systems/partnerProposalRuntime.ts) raises,
 * answers and expires them, and carries out what an answer does.
 *
 * Saved with the plant in the physical session record (utils/physicalSession.ts),
 * not in a store of its own: a proposal names a unit's wear prediction, a
 * programme count and a game minute, so it is only true of the plant it was
 * raised in. One record keeps them together, and a reset of the plant ends them.
 */
import { create } from 'zustand';
import {
  defaultDelegationFor,
  MAX_RESOLVED_PROPOSALS,
  MAX_SETTLED_SUBJECTS,
  PROPOSAL_KIND_IDS,
  sanitizeProposal,
  type Delegation,
  type PartnerProposal,
  type ProposalKind,
} from '../simulation/partnerProposals';

export interface PartnerProposalState {
  proposals: PartnerProposal[];
  delegation: Record<ProposalKind, Delegation>;
  /**
   * The kinds whose delegation the player set (setDelegation). Only these are
   * restored from a save as saved; every other kind takes its default by the
   * rule (defaultDelegationFor), so a changed default reaches old saves.
   * Optional: a save from before it has none (readSavedProposals).
   */
  delegationChosen?: ProposalKind[];
  /** Id sequence; never reused within a session. */
  sequence: number;
  /** `kind:subject` of settled proposals dropped from the list (raiseProposals skips them). */
  settledSubjects: string[];
}

export interface PartnerProposalStore extends PartnerProposalState {
  /** Replace the list (the runtime's one write per step). Resolved ones past the cap are dropped, oldest first. */
  setProposals: (proposals: PartnerProposal[], sequence?: number) => void;
  setDelegation: (kind: ProposalKind, delegation: Delegation) => void;
  reset: () => void;
  /** A saved record's proposals, read tolerantly; anything unreadable is dropped. */
  restoreSaved: (saved: unknown) => void;
}

const defaultDelegation = (): Record<ProposalKind, Delegation> =>
  Object.fromEntries(PROPOSAL_KIND_IDS.map((kind) => [kind, defaultDelegationFor(kind)])) as Record<
    ProposalKind,
    Delegation
  >;

export const initialPartnerProposalState = (): PartnerProposalState => ({
  proposals: [],
  delegation: defaultDelegation(),
  delegationChosen: [],
  sequence: 0,
  settledSubjects: [],
});

/**
 * Every open proposal and every one awaiting its comparison, then the newest
 * whose record is written, within the cap; order is kept.
 */
export function boundProposals(proposals: PartnerProposal[]): PartnerProposal[] {
  const settled = proposals.filter(
    (proposal) =>
      proposal.status === 'withdrawn' || (proposal.status === 'resolved' && !!proposal.comparison)
  );
  if (settled.length <= MAX_RESOLVED_PROPOSALS) return proposals;
  const drop = new Set(settled.slice(0, settled.length - MAX_RESOLVED_PROPOSALS));
  return proposals.filter((proposal) => !drop.has(proposal));
}

export const usePartnerProposalStore = create<PartnerProposalStore>()((set) => ({
  ...initialPartnerProposalState(),
  setProposals: (proposals, sequence) =>
    set((state) => {
      const kept = boundProposals(proposals);
      const dropped = proposals
        .filter((proposal) => !kept.includes(proposal))
        .map((proposal) => `${proposal.kind}:${proposal.subject}`);
      return {
        proposals: kept,
        sequence: sequence ?? state.sequence,
        ...(dropped.length > 0
          ? {
              settledSubjects: [...state.settledSubjects, ...dropped].slice(-MAX_SETTLED_SUBJECTS),
            }
          : {}),
      };
    }),
  setDelegation: (kind, delegation) =>
    set((state) => {
      const chosen = state.delegationChosen ?? [];
      if (state.delegation[kind] === delegation && chosen.includes(kind)) return {};
      return {
        delegation: { ...state.delegation, [kind]: delegation },
        delegationChosen: chosen.includes(kind) ? chosen : [...chosen, kind],
      };
    }),
  reset: () => set(initialPartnerProposalState()),
  restoreSaved: (saved) => set(readSavedProposals(saved)),
}));

/** What the physical session saves. */
export function captureSavedProposals(): PartnerProposalState {
  const { proposals, delegation, delegationChosen, sequence, settledSubjects } =
    usePartnerProposalStore.getState();
  return structuredClone({
    proposals,
    delegation,
    delegationChosen: delegationChosen ?? [],
    sequence,
    settledSubjects,
  });
}

/**
 * A saved proposals record, read tolerantly. Absent (a save from before this
 * store existed) or unreadable, it is a fresh state; an unreadable proposal is
 * dropped and the rest are kept; an unknown delegation is "ask".
 */
export function readSavedProposals(saved: unknown): PartnerProposalState {
  const fresh = initialPartnerProposalState();
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return fresh;
  const record = saved as Record<string, unknown>;
  const proposals = Array.isArray(record.proposals)
    ? record.proposals
        .map(sanitizeProposal)
        .filter((proposal): proposal is PartnerProposal => proposal !== null)
    : [];
  // A kind the player set keeps the setting; every other kind takes its
  // default by the rule. A save from before `delegationChosen` wrote every
  // kind's setting, and "ask" was then every kind's default, so only a saved
  // "decide" there can have been the player's choice.
  const delegation = fresh.delegation;
  const chosenList = Array.isArray(record.delegationChosen)
    ? record.delegationChosen.filter((kind): kind is ProposalKind =>
        (PROPOSAL_KIND_IDS as readonly unknown[]).includes(kind)
      )
    : null;
  const delegationChosen: ProposalKind[] = [];
  if (record.delegation && typeof record.delegation === 'object')
    for (const kind of PROPOSAL_KIND_IDS) {
      const value = (record.delegation as Record<string, unknown>)[kind];
      if (value !== 'ask' && value !== 'decide') continue;
      const chosen = chosenList ? chosenList.includes(kind) : value === 'decide';
      if (!chosen) continue;
      delegation[kind] = value;
      delegationChosen.push(kind);
    }
  // The id sequence never runs behind the ids it has issued.
  const highest = proposals.reduce((max, proposal) => {
    const n = Number(/(\d+)$/.exec(proposal.id)?.[1]);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  const sequence =
    typeof record.sequence === 'number' && Number.isFinite(record.sequence)
      ? Math.max(Math.floor(record.sequence), highest)
      : highest;
  const settledSubjects = Array.isArray(record.settledSubjects)
    ? record.settledSubjects
        .filter((subject): subject is string => typeof subject === 'string')
        .slice(-MAX_SETTLED_SUBJECTS)
    : [];
  return {
    proposals: boundProposals(proposals),
    delegation,
    delegationChosen,
    sequence,
    settledSubjects,
  };
}
