import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { describeEffect, localizedDescribeEffect } from '../describe';
import { EVENT_DECK } from '../eventDeck';

// Seen in a Portuguese session: the hired dryer's button read "energia da
// secagem x0", a multiplier where a person would say the drying costs nothing.
// Working if the zero case reads as that fact in both languages and any other
// value keeps its multiplier.
const wetIntake = EVENT_DECK.find((event) => event.id === 'evt-wet-intake');
const choice = (id: string) => wetIntake?.choices.find((c) => c.id === id)?.effect;

afterEach(() => setLocale('en'));

describe('the drying modifier on a choice', () => {
  it('says a hired dryer books no drying energy, in English and Portuguese', () => {
    const dryer = choice('dryer');
    expect(dryer?.modifier?.dryingEnergy).toBe(0);
    if (!dryer) return;
    setLocale('en');
    expect(localizedDescribeEffect(dryer)).toContain('drying books no energy for 3 shifts');
    expect(localizedDescribeEffect(dryer)).not.toContain('x0');
    expect(describeEffect(dryer)).toContain('drying books no energy for 3 shifts');
    setLocale('pt-BR');
    expect(localizedDescribeEffect(dryer)).toContain('a secagem não gasta energia por 3 turnos');
    expect(localizedDescribeEffect(dryer)).not.toContain('x0');
  });

  it('keeps the multiplier for blending', () => {
    const blend = choice('blend');
    if (!blend) throw new Error('no blend choice');
    setLocale('en');
    expect(localizedDescribeEffect(blend)).toContain('drying energy x0.5');
    expect(describeEffect(blend)).toContain('drying energy x0.5');
    setLocale('pt-BR');
    expect(localizedDescribeEffect(blend)).toContain('energia da secagem x0,5');
  });
});
