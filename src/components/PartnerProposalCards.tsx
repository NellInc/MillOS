import React from 'react';
import { Bot, Clock3 } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { usePartnerProposalStore } from '../stores/partnerProposalStore';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { answerPartnerProposal } from '../systems/partnerProposalRuntime';
import {
  minutesLeft,
  PROPOSAL_KIND_IDS,
  type PartnerProposal,
} from '../simulation/partnerProposals';
import {
  formatProposalPrice,
  proposalKindLabel,
  proposalOptionLabel,
  proposalReasonText,
} from '../simulation/partnerProposalText';
import { partnerProposalMessages } from '../simulation/partnerProposals.messages';
import { formatFixed, useLocale, useT } from '../i18n';
import {
  pendingProposalFocus,
  subscribeProposalFocus,
  takeProposalFocus,
} from './proposalCardFocus';

/**
 * The partner's open proposals, as the AI Command Center's cards (plan item
 * 3.0): the reason in one line, each answer as a button with its price on it,
 * the partner's choice marked, and the game minutes left before it runs. Then,
 * per kind, whether the partner asks or decides and tells. A host that leads
 * with the open cards (the phone sheet) shows the delegation rows elsewhere:
 * `show` picks one part, or both by default.
 */
export const PartnerProposalCards: React.FC<{ show?: 'all' | 'cards' | 'delegation' }> = ({
  show = 'all',
}) => {
  const t = useT(partnerProposalMessages);
  const locale = useLocale();
  const { proposals, delegation, setDelegation } = usePartnerProposalStore(
    useShallow((state) => ({
      proposals: state.proposals,
      delegation: state.delegation,
      setDelegation: state.setDelegation,
    }))
  );
  const minute = useOperationsCampaignStore((state) => state.elapsedMinutes);
  const open = proposals.filter((proposal) => proposal.status === 'open');

  // A card leaves when it is answered or its window closes, and takes the
  // focused button with it. Focus then goes to the card that took its place
  // (or the one before it), else to this section, never to <body>; the bell's
  // route to a card lands on that card. Working if Tab continues from here.
  const sectionRef = React.useRef<HTMLElement>(null);
  const focusedCard = React.useRef<{ id: string; index: number } | null>(null);
  const openIds = open.map((proposal) => proposal.id).join('|');
  React.useEffect(() => {
    const section = sectionRef.current;
    if (!section || show === 'delegation') return;
    const cards = () =>
      Array.from(section.querySelectorAll<HTMLElement>('article[data-proposal-id]'));
    const left = focusedCard.current;
    if (left && !openIds.split('|').includes(left.id)) {
      focusedCard.current = null;
      const active = document.activeElement;
      if (!active || active === document.body || !active.isConnected) {
        const list = cards();
        (list[Math.min(left.index, list.length - 1)] ?? section).focus();
      }
    }
    const land = () => {
      const id = pendingProposalFocus();
      if (!id) return;
      const target = cards().find((card) => card.dataset.proposalId === id);
      takeProposalFocus(id);
      (target ?? section).focus();
    };
    land();
    return subscribeProposalFocus(land);
  }, [openIds, show]);
  const noteFocus = (event: React.FocusEvent<HTMLElement>) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('article[data-proposal-id]');
    const id = card?.dataset.proposalId;
    focusedCard.current = id ? { id, index: openIds.split('|').indexOf(id) } : null;
  };
  const forgetFocus = (event: React.FocusEvent<HTMLElement>) => {
    // Leaving the section for elsewhere; a removed card's blur has no target.
    const next = event.relatedTarget as Node | null;
    if (next && !sectionRef.current?.contains(next)) focusedCard.current = null;
  };

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-label={t('proposalsHeading')}
      data-testid={show === 'delegation' ? 'partner-delegation-section' : 'partner-proposals'}
      className="space-y-2 focus:outline-none"
      onFocus={noteFocus}
      onBlur={forgetFocus}
    >
      {(show === 'delegation' ? [] : open).map((proposal: PartnerProposal) => (
        <article
          key={proposal.id}
          tabIndex={-1}
          data-proposal-id={proposal.id}
          aria-label={proposalKindLabel(proposal.kind, locale)}
          data-testid={`partner-proposal-${proposal.id}`}
          className="rounded-lg border border-cyan-500/40 bg-slate-800/60 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
        >
          <div className="mb-1 flex items-center gap-1.5">
            <Bot className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
            <span className="text-[10px] font-semibold uppercase text-cyan-200">
              {proposalKindLabel(proposal.kind, locale)}
            </span>
            <span
              className="ml-auto inline-flex items-center gap-1 text-[10px] text-amber-200"
              data-testid="partner-proposal-time-left"
            >
              <Clock3 className="h-3 w-3" aria-hidden="true" />
              {t('timeLeft', {
                minutes: formatFixed(Math.ceil(minutesLeft(proposal, minute)), 0),
              })}
            </span>
          </div>
          <p className="text-xs text-white">{proposalReasonText(proposal, locale)}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {proposal.options.map((option) => {
              const isDefault = option.id === proposal.defaultOptionId;
              return (
                <button
                  key={option.id}
                  type="button"
                  data-option={option.id}
                  data-default={isDefault ? 'true' : undefined}
                  onClick={() => answerPartnerProposal(proposal.id, option.id, 'operator')}
                  className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-left text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                    isDefault
                      ? 'border border-cyan-400/70 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/25'
                      : 'border border-slate-600 bg-slate-900/70 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {isDefault && (
                    <>
                      <Bot className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="sr-only">{t('partnerChoice')}: </span>
                    </>
                  )}
                  {/* nowrap: beside a long price, "Take it now" broke over two
                      lines in a 384 px sidebar (seen in a capture). */}
                  <span className="shrink-0 whitespace-nowrap font-semibold">
                    {proposalOptionLabel(option.id, locale)}
                  </span>
                  <span className="text-slate-300">
                    {formatProposalPrice(option.price, locale)}
                  </span>
                </button>
              );
            })}
          </div>
        </article>
      ))}
      <div className="space-y-1" data-testid="partner-delegation">
        {(show === 'cards' ? [] : PROPOSAL_KIND_IDS).map((kind) => (
          <div
            key={kind}
            role="group"
            aria-label={proposalKindLabel(kind, locale)}
            className="flex items-center gap-1 text-[10px]"
          >
            <span className="flex-1 text-slate-400">{proposalKindLabel(kind, locale)}</span>
            {(['ask', 'decide'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={delegation[kind] === value}
                onClick={() => setDelegation(kind, value)}
                className={`min-h-7 rounded px-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
                  delegation[kind] === value
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'bg-slate-800/60 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {t(value === 'ask' ? 'delegationAsk' : 'delegationDecide')}
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
};
