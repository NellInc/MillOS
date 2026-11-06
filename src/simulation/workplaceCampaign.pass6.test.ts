import { afterEach, describe, expect, it } from 'vitest';
import { createWorkplace, transitionWorkplace } from './bilateralWorkplace';
import { pressureObjectionText } from './workplaceCampaign';
import { setLocale } from '../i18n';

afterEach(() => setLocale('en'));

describe('an objection statement follows the language (pass six)', () => {
  it('a raised boundary objection reads in the language chosen after it was raised', () => {
    let state = createWorkplace('game', 17);
    state = transitionWorkplace(state, { type: 'start', args: ['game', 17] }).state;
    state = transitionWorkplace(state, { type: 'object', args: ['quality', 'rest'] }).state;
    const statement = state.objections[0].statement;
    expect(statement).toBe('Review the rest boundary before proceeding.');
    setLocale('pt-BR');
    expect(pressureObjectionText(statement)).toBe(
      'Revise o limite de descanso antes de prosseguir.'
    );
    // And back: a statement raised in Portuguese reads in English again.
    let pt = createWorkplace('game', 17);
    pt = transitionWorkplace(pt, { type: 'start', args: ['game', 17] }).state;
    pt = transitionWorkplace(pt, { type: 'object', args: ['packing', 'privacy'] }).state;
    setLocale('en');
    expect(pressureObjectionText(pt.objections[0].statement)).toBe(
      'Review the privacy boundary before proceeding.'
    );
  });

  it('leaves text it does not recognise unchanged', () => {
    setLocale('pt-BR');
    expect(pressureObjectionText('Something a facilitator typed.')).toBe(
      'Something a facilitator typed.'
    );
  });
});
