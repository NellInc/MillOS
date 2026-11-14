/**
 * D17 (fix-up e of plan item 4c): the maize-meal buyer reads as Community
 * Polenta Kitchen, selling cornmeal, in the Chronicle as on the plant. Ids,
 * marks and effects are unchanged; the stored order name still matches; a
 * notice saved in the old wording is still recognised and translated (rule 7).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { CUSTOMERS, customerDisplayNameOf, customerIdForName } from '../customers';
import { EVENT_DECK, getEventDeck } from '../eventDeck';
import { EPILOGUE_SECTIONS } from '../epilogue';
import { MARKS, localizedMarkLabel } from '../record';
import { localizedNotice } from '../presentation';
import { D17_SUBSTITUTIONS } from '../legacyWording';

const OLD_RESULT = 'The pasta works gets the early slot; the hard durum is heavier on the rolls.';

describe('D17 in the Chronicle', () => {
  afterEach(() => setLocale('en'));

  it('keeps matching the stored order name and shows the plant’s display name', () => {
    expect(customerIdForName('Community Pasta Works')).toBe('pasta');
    expect(CUSTOMERS.find((c) => c.id === 'pasta')?.name).toBe('Community Pasta Works');
    expect(customerDisplayNameOf('pasta')).toBe('Community Polenta Kitchen');
  });

  it('leaves no old wording in the definitions, and keeps every id and effect', () => {
    const english = JSON.stringify([
      EVENT_DECK,
      EPILOGUE_SECTIONS,
      Object.values(MARKS).map((m) => m.label),
    ]);
    for (const [before] of D17_SUBSTITUTIONS) expect(english, before).not.toContain(before);
    const event = EVENT_DECK.find((e) => e.id === 'evt-two-buyers-one-slot')!;
    const pasta = event.choices.find((c) => c.id === 'pasta')!;
    expect(pasta.effect.modifier).toMatchObject({
      label: 'Changeover to maize',
      wear: 1.06,
      shifts: 3,
    });
    expect(pasta.effect.relationship).toEqual({ customer: 'pasta', delta: 10 });
  });

  it('reads a notice saved in the old wording, in both languages', () => {
    const saved = {
      id: 'notice-12',
      shift: 14,
      kind: 'event' as const,
      title: 'Two buyers, one slot: Put the pasta works first',
      body: OLD_RESULT,
      relatedId: 'event-9',
    };
    expect(localizedNotice(saved).body).toBe(
      'The polenta kitchen gets the early slot; the maize run means a changeover on the rolls.'
    );
    setLocale('pt-BR');
    const local = localizedNotice(saved);
    const shown = getEventDeck()
      .find((e) => e.id === 'evt-two-buyers-one-slot')!
      .choices.find((c) => c.id === 'pasta')!;
    expect(local.body).toBe(shown.effect.result);
    expect(local.title).toMatch(/cozinha de polenta/);
  });

  it('labels the record’s marks in both languages', () => {
    expect(localizedMarkLabel('granary-pasta')).toBe('Gave the old granary to the polenta kitchen');
    setLocale('pt-BR');
    expect(localizedMarkLabel('granary-pasta')).toBe('Cedeu o antigo celeiro à cozinha de polenta');
  });
});
