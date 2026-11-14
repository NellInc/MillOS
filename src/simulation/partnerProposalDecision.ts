/**
 * The partner's proposals in the agent's old card contract (decision.respond,
 * `production.aiDecisions` in the agent projection). Pure.
 *
 * - A proposal reads as a decision of type 'proposal': pending while open,
 *   completed once resolved, superseded when withdrawn.
 * - 'accepted' answers with the partner's choice; 'rejected' with the other
 *   answer when there are exactly two; 'modified' with the option id given as
 *   modifiedAction; 'deferred' is refused (the window is the deferral).
 * - Its response reads back the same way, so the kernel's verify step sees the
 *   disposition the agent sent.
 */
import type { PartnerProposal } from './partnerProposals';
import { closesAtMinute } from './partnerProposals';

export type ProposalDisposition = 'accepted' | 'modified' | 'rejected' | 'deferred';

/** The part of a proposal its answers are read against. */
export interface ProposalChoices {
  options: readonly { id: string }[];
  defaultOptionId: string;
}

/** The option a disposition answers with; null when it names none. */
export function proposalOptionForDisposition(
  proposal: ProposalChoices,
  disposition: ProposalDisposition,
  modifiedAction?: string
): string | null {
  if (disposition === 'accepted') return proposal.defaultOptionId;
  if (disposition === 'rejected') {
    const others = proposal.options.filter((option) => option.id !== proposal.defaultOptionId);
    return proposal.options.length === 2 && others.length === 1 ? others[0].id : null;
  }
  if (disposition === 'modified') {
    const id = modifiedAction?.trim();
    return id && proposal.options.some((option) => option.id === id) ? id : null;
  }
  return null;
}

/** The disposition an answer reads back as. */
export function dispositionForOption(
  proposal: ProposalChoices,
  optionId: string
): ProposalDisposition {
  if (optionId === proposal.defaultOptionId) return 'accepted';
  return proposal.options.length === 2 ? 'rejected' : 'modified';
}

/** A proposal as the agent projection lists decisions. */
export function proposalDecisionView(proposal: PartnerProposal) {
  const resolution = proposal.resolution;
  return {
    id: proposal.id,
    timestamp: null,
    type: 'proposal',
    kind: proposal.kind,
    subject: proposal.subject,
    action: proposal.defaultOptionId,
    confidence: 0,
    impact: '',
    machineId:
      proposal.kind === 'service' ? (proposal as PartnerProposal<'service'>).facts.machineId : null,
    status:
      proposal.status === 'open'
        ? 'pending'
        : proposal.status === 'resolved'
          ? 'completed'
          : 'superseded',
    priority: 'high',
    raisedAtMinute: proposal.raisedAtMinute,
    closesAtMinute: closesAtMinute(proposal),
    options: proposal.options.map((option) => ({
      id: option.id,
      partnerChoice: option.id === proposal.defaultOptionId,
      price: { ...option.price, parts: { ...option.price.parts } },
    })),
    response: resolution
      ? {
          disposition: dispositionForOption(proposal, resolution.optionId),
          optionId: resolution.optionId,
          decidedBy: resolution.decidedBy,
          atMinute: resolution.atMinute,
          ran: resolution.ran,
        }
      : null,
    measuredOutcome: proposal.comparison
      ? {
          atMinute: proposal.comparison.atMinute,
          bestOptionId: proposal.comparison.bestOptionId,
          prices: proposal.comparison.prices.map((priced) => ({
            id: priced.id,
            price: { ...priced.price, parts: { ...priced.price.parts } },
          })),
        }
      : null,
  };
}
