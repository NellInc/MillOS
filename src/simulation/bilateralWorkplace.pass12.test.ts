import { afterEach, describe, expect, it } from 'vitest';
import { createWorkplace, displayEventDetail, transitionWorkplace } from './bilateralWorkplace';
import { bilateralWorkplaceMessages as wm } from './bilateralWorkplace.messages';
import { setLocale } from '../i18n';

afterEach(() => setLocale('en'));

// Four receipts are written by function-valued copy (an objection raised and
// resolved, a chair ballot, a surplus ballot). The switch-time renderer only
// knew string templates, so these stayed in the language they were written in.
// Working if each reads in the language chosen after it was recorded.
describe('Workplace lane, twelfth pass: function-valued receipts after a language switch', () => {
  it('shows a raised objection in the language chosen now', () => {
    const s = transitionWorkplace(createWorkplace('workshop', 17), {
      type: 'start',
      args: ['workshop', 17],
    }).state;
    const raised = transitionWorkplace(s, { type: 'object', args: ['packing', 'rest'] }).state;
    const recorded = raised.events.at(-1)!.detail;
    expect(recorded).toBe(wm.en.evObjection({ kind: 'rest' }));
    setLocale('pt-BR');
    expect(displayEventDetail(recorded)).toBe(wm['pt-BR'].evObjection({ kind: 'rest' }));
  });

  it('shows a resolved objection in the language chosen now', () => {
    const recorded = wm.en.objectionResolution({ actor: 'quality', kind: 'privacy' });
    setLocale('pt-BR');
    expect(displayEventDetail(recorded)).toBe(
      wm['pt-BR'].objectionResolution({ actor: 'quality', kind: 'privacy' })
    );
  });

  it('shows chair and surplus ballots in the language chosen now, and back again', () => {
    setLocale('pt-BR');
    const chair = wm['pt-BR'].evChairBallot({ candidate: 'maintenance' });
    const surplus = wm['pt-BR'].evSurplusBallot({ destination: 'community' });
    setLocale('en');
    expect(displayEventDetail(chair)).toBe(wm.en.evChairBallot({ candidate: 'maintenance' }));
    expect(displayEventDetail(surplus)).toBe(wm.en.evSurplusBallot({ destination: 'community' }));
  });

  it('leaves a receipt in the language it was written in unchanged', () => {
    const recorded = wm.en.evObjection({ kind: 'burden' });
    expect(displayEventDetail(recorded)).toBe(recorded);
  });
});
