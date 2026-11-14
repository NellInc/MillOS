import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkplacePressureChapter, deriveWorkplaceGuidance } from './WorkplacePressureChapter';
import { workplacePressureChapterMessages } from './WorkplacePressureChapter.messages';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { campaignRecord } from '../../../simulation/workplaceCampaign';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';
import { setLocale } from '../../../i18n';

// D14 (D-012): the chapter keeps its heading, the beat, one next-step
// sentence, the challenge state and the retained burden; it drops the step
// list, the notes and the advice tails.
// Working if every state below renders none of the cut copy in either language.

const CUT = [
  // step list
  /restatement leaves the objection open/,
  /a reafirmação deixa a objeção aberta/,
  /Let each raiser review the remedy/,
  /Deixe cada pessoa que levantou/,
  /explicitly approve the plan/,
  /aprove explicitamente o plano/,
  /Promises and agreed deferrals/,
  /Promessas e adiamentos acordados/,
  // notes
  /a no-extra-duty plan remains valid/,
  /um plano sem trabalho extra continua válido/,
  /Owed recovery needs modeled clock time/,
  /A recuperação devida precisa de tempo/,
  /Repair belongs to review/,
  /A reparação cabe à revisão/,
  // trimmed tails
  /grants no new consent/,
  /não concede novo consentimento/,
  /Prevention does not claim/,
  /A prevenção não afirma/,
  /The pressure card is optional/,
  /A carta de pressão é opcional/,
  // next-step tails
  /This shift stays closed/,
  /Este turno continua encerrado/,
  /Each role chooses again/,
  /Cada papel decide novamente/,
  /Campaign receipts are kept/,
  /The challenge remains open afterwards/,
  /Only the raiser can confirm/,
  /deadline pressure grants no authority/,
  /Actual batch certification remains separate/,
  /An objection during work/,
  /Changing shared terms clears/,
  /only when you choose to proceed/,
];

const body = () => document.body.textContent ?? '';
const noHelper = () => {
  for (const pattern of CUT) expect(body()).not.toMatch(pattern);
};

const thirdShift = () => {
  const store = useWorkplaceStore.getState();
  fulfilFirstDelivery();
  store.startCampaign('cooperative', 17);
  const { draw: _draw, ...fixed } = useWorkplaceStore.getState().workplace.campaign!;
  const state = { ...useWorkplaceStore.getState().workplace, campaign: fixed };
  useWorkplaceStore.setState({
    workplace: {
      ...state,
      campaign: {
        ...state.campaign!,
        shift: 2,
        history: [campaignRecord(state)],
        decision: null,
      },
    },
  });
  return useWorkplaceStore.getState().workplace;
};

const show = () =>
  render(
    <WorkplacePressureChapter state={useWorkplaceStore.getState().workplace} navigate={() => {}} />
  );

beforeEach(() => useWorkplaceStore.setState({ workplace: createWorkplace() }));
afterEach(() => {
  cleanup();
  setLocale('en');
});

describe.each(['en', 'pt-BR'] as const)('pressure chapter without helper text (%s)', (locale) => {
  beforeEach(() => setLocale(locale));

  it('on Thursday, deliberating', () => {
    thirdShift();
    show();
    expect(body()).toMatch(
      locale === 'en' ? /Yesterday’s willingness has expired\./ : /A disposição de ontem expirou\./
    );
    noHelper();
  });

  it('while running, and in review after an objection', () => {
    const state = thirdShift();
    useWorkplaceStore.setState({ workplace: { ...state, phase: 'active' } });
    show();
    noHelper();
    // What shows instead: the season's beat, as its heading (review 2).
    expect(document.body.textContent).toContain(
      deriveWorkplaceGuidance(useWorkplaceStore.getState().workplace).beat
    );
    cleanup();
    useWorkplaceStore.getState().object('packing', 'burden');
    show();
    noHelper();
    expect(document.body.textContent).toContain(
      deriveWorkplaceGuidance(useWorkplaceStore.getState().workplace).beat
    );
  });

  it('in a final review', () => {
    const state = thirdShift();
    useWorkplaceStore.setState({ workplace: { ...state, phase: 'review' } });
    show();
    noHelper();
    expect(document.body.textContent).toContain(
      deriveWorkplaceGuidance(useWorkplaceStore.getState().workplace).beat
    );
  });
});

describe('the next step is one sentence', () => {
  it('in every catalogue entry, in both languages', () => {
    for (const locale of ['en', 'pt-BR'] as const) {
      const catalogue = workplacePressureChapterMessages[locale] as Record<string, unknown>;
      for (const [key, value] of Object.entries(catalogue)) {
        if (!key.startsWith('next') || typeof value !== 'string') continue;
        // One sentence: a single full stop, at the end.
        expect(value.replace(/\.$/, ''), `${locale} ${key}`).not.toMatch(/\.\s/);
      }
      for (const key of [
        'stepRestate',
        'stepRemedy',
        'stepApprove',
        'stepReview',
        'extraDutyNote',
        'recoveryNote',
        'repairBelongs',
        'remedyResumes',
        'nextRunningPauses',
      ])
        expect(Object.keys(catalogue)).not.toContain(key);
    }
  });

  it('still names what paused a shift', () => {
    const state = thirdShift();
    useWorkplaceStore.setState({ workplace: { ...state, phase: 'active' } });
    useWorkplaceStore.getState().tick(5, 0, true);
    expect(deriveWorkplaceGuidance(useWorkplaceStore.getState().workplace).next).toBe(
      'An emergency stop or drill paused this shift before its end; resume it in Review.'
    );
  });
});
