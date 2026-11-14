import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkplaceNegotiation, WorkplacePracticeProposal } from './WorkplaceNegotiation';
import { workplaceNegotiationMessages } from './WorkplaceNegotiation.messages';
import {
  createWorkplace,
  exportPracticeProposal,
  transitionWorkplace,
  type WorkplaceCommand,
} from '../../../simulation/bilateralWorkplace';
import { requiredChecks, WORKPLACE_CHECKS } from '../../../simulation/workplaceCampaign';
import { setLocale } from '../../../i18n';

/** A cooperative season brought to its Thursday shift (as WorkplaceNegotiation.test.tsx). */
function thursday() {
  let state = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    state = result.state;
    return result;
  };
  const agree = (cover = false) => {
    for (const actor of ['packing', 'mind'])
      for (const check of requiredChecks(actor))
        run({
          type: 'answerCheck',
          args: [actor, check, WORKPLACE_CHECKS.find((item) => item.id === check)!.correct],
        });
    run({ type: 'understand', args: ['packing'] });
    run({ type: 'vote', args: ['packing', true] });
    if (cover) run({ type: 'consentToCover', args: ['packing', true] });
    run({ type: 'simulateResponses', args: [] });
  };
  run({ type: 'startCampaign', args: ['cooperative', 17] });
  delete state.campaign!.draw;
  for (let shift = 0; shift < 2; shift++) {
    if (shift === 0) {
      run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
      run({ type: 'selectPlan', args: ['cover'] });
    }
    agree(shift === 0);
    run({ type: 'activate', args: [state.revision] });
    while (state.phase === 'active') {
      if (shift === 1 && state.minute >= 25 && !state.campaign?.inspectionUntilMinute)
        run({ type: 'campaignDecision', args: ['inspect', 'quality'] });
      run({ type: 'tick', args: [5, 0, false] });
    }
    run({ type: 'nextCampaignShift', args: [] });
  }
  return {
    run,
    get state() {
      return state;
    },
  };
}

afterEach(() => {
  cleanup();
  setLocale('en');
});

// D14: the negotiation keeps its terms and receipts; the disclaimers go.
const CUT = {
  en: [
    'Dispatch remains uncertain',
    'You can challenge my authority',
    'remain a valid experiment',
    'These are terms offered',
    'Keep understanding, the policy vote',
    'Planning draft only',
    'Earlier willingness grants',
    'Packing retains remedy review',
    'This receipt grants no new',
    'Past agreement cannot supply',
    'Changed promises never create',
    'You can protect the boundary',
  ],
  'pt-BR': [
    'A expedição continua incerta',
    'Você pode contestar minha autoridade',
    'experimento válido',
    'Estes são os termos oferecidos',
    'Mantenha separados o entendimento',
    'Apenas rascunho de planejamento',
    'Uma disposição anterior',
    'O Ensaque mantém a revisão',
    'nenhuma nova permissão',
    'Um acordo passado não pode',
    'Promessas alteradas',
    'Você pode proteger o limite',
  ],
} as const;

const REMOVED_KEYS = [
  'dispatchUncertain',
  'planningOnly',
  'reviewExperiment',
  'proposalScope',
  'stageOfferDetail',
];

const text = () => document.body.textContent ?? '';

describe('the Thursday negotiation without disclaimers', () => {
  it.each(['en', 'pt-BR'] as const)('the catalogue has no cut key in %s', (locale) => {
    for (const key of REMOVED_KEYS)
      expect(Object.keys(workplaceNegotiationMessages[locale])).not.toContain(key);
  });

  it.each(['en', 'pt-BR'] as const)(
    'stages, before and after the correction, carry no tail in %s',
    (locale) => {
      setLocale(locale);
      const c = thursday();
      const view = render(<WorkplaceNegotiation state={c.state} />);
      for (const cut of CUT[locale]) expect(text()).not.toContain(cut);
      expect(
        screen.getByText(locale === 'en' ? /^Packing has carried/ : /^O Ensaque já assumiu/)
      ).toHaveTextContent(locale === 'en' ? /recovery\.$/ : /recuperação\.$/);
      c.run({ type: 'respondToPressure', args: ['repeat-cover', 'accept-demand'] });
      c.run({ type: 'respondToPressure', args: ['repeat-cover', 'protect-boundary'] });
      c.run({ type: 'campaignDecision', args: ['protect-refusal', 'coordinator'] });
      c.run({ type: 'resolveObjection', args: [c.state.objections[0].id, 'packing'] });
      view.rerender(<WorkplaceNegotiation state={c.state} />);
      for (const cut of CUT[locale]) expect(text()).not.toContain(cut);
      expect(
        screen.getByText(
          locale === 'en'
            ? 'The adviser corrected reused consent.'
            : 'O conselheiro corrigiu o consentimento reaproveitado.',
          { exact: true }
        )
      ).toBeInTheDocument();
    }
  );

  it.each(['en', 'pt-BR'] as const)('the practice draft shows its scope alone in %s', (locale) => {
    setLocale(locale);
    const state = createWorkplace();
    render(<WorkplacePracticeProposal state={state} />);
    expect(
      screen.getByText(exportPracticeProposal(state).scope, { exact: true })
    ).toBeInTheDocument();
    for (const cut of CUT[locale]) expect(text()).not.toContain(cut);
  });
});
