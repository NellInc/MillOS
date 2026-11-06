import { afterEach, describe, expect, it } from 'vitest';
import {
  createWorkplace,
  displayEventDetail,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import { requiredChecks, shiftResumable, WORKPLACE_CHECKS } from './workplaceCampaign';
import { setLocale } from '../i18n';
import type { WorkplaceState } from '../types/workplace';

afterEach(() => setLocale('en'));

/** A teaching season, run through the engine's own consent path. */
function season() {
  let state: WorkplaceState = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    state = result.state;
    return result;
  };
  run({ type: 'startCampaign', args: ['cooperative', 17] });
  const agree = () => {
    for (const actor of ['packing', 'mind'])
      for (const id of requiredChecks(actor))
        run({
          type: 'answerCheck',
          args: [actor, id, WORKPLACE_CHECKS.find((q) => q.id === id)!.correct],
        });
    run({ type: 'understand', args: ['packing'] });
    run({ type: 'vote', args: ['packing', true] });
    if (state.planId === 'cover') run({ type: 'consentToCover', args: ['packing', true] });
    run({ type: 'simulateResponses', args: [] });
  };
  return {
    run,
    agree,
    get state() {
      return state;
    },
    reload() {
      state = restoreWorkplace(saveWorkplace(state));
    },
  };
}

describe('Workplace lane, seventh pass: a resumed shift receipt', () => {
  // The plant ticks in fractions of a minute, so a reload lands mid-minute.
  const resumedAt = (locale: 'en' | 'pt-BR') => {
    const s = season();
    s.run({ type: 'campaignDecision', args: ['keep-target', 'coordinator'] });
    s.agree();
    expect(s.run({ type: 'activate', args: [s.state.revision] }).changed).toBe(true);
    s.run({ type: 'tick', args: [37.483333333333334, 0, false] });
    s.reload();
    expect(shiftResumable(s.state)).toBe(true);
    expect(s.run({ type: 'resumeShift', args: [s.state.revision] }).changed).toBe(true);
    setLocale(locale);
    const event = s.state.events.find((e) => e.kind === 'shift-resumed')!;
    return displayEventDetail(event.detail);
  };

  it('names the minute it resumed at as a whole minute, like the note beside it', () => {
    expect(resumedAt('en')).toBe(
      'Shift resumed at minute 37 after a reload; it continues once everyone consents again.'
    );
  });

  it('and in Portuguese', () => {
    setLocale('pt-BR');
    expect(resumedAt('pt-BR')).toBe(
      'Turno retomado no minuto 37 após uma recarga; continua quando todos consentirem de novo.'
    );
  });
});
