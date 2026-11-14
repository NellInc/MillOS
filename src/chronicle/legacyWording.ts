import { translate } from '../i18n';
import { legacyWordingMessages } from './legacyWording.messages';

/**
 * D17: the maize-meal buyer is shown as Community Polenta Kitchen, selling
 * cornmeal (semolina is a durum wheat product; src/stores/customerNames.messages.ts
 * cites the standards). Its Chronicle copy was reworded by these substitutions,
 * old English to new, and nothing else: every event keeps its ids and effects.
 * A notice saved before the rewording holds the old English, so the
 * presentation adapter reads it through `currentWording` first and a saved
 * record is still recognised and translated (rule 7).
 *
 * "Changeover to maize" replaces "Durum on the rolls" and makes no claim about
 * how a grain mills: the choice's wear modifier stands for the changeover.
 */
export const D17_SUBSTITUTIONS: ReadonlyArray<readonly [string, string]> = [
  ['Community Pasta Works', 'Community Polenta Kitchen'],
  ['The pasta works', 'The polenta kitchen'],
  ['the pasta works', 'the polenta kitchen'],
  ['Durum on the rolls', 'Changeover to maize'],
  ['the hard durum is heavier on the rolls', 'the maize run means a changeover on the rolls'],
  ['wants semolina before', 'wants cornmeal before'],
  ['for semolina storage', 'for cornmeal storage'],
  ['granary with semolina', 'granary with cornmeal'],
];

/** English saved before D17, in the wording the definitions use now. */
export function currentWording(text: string): string {
  let out = text;
  for (const [before, after] of D17_SUBSTITUTIONS) out = out.split(before).join(after);
  return out;
}

/**
 * Answers whose effect changed, with the result they had in older saves (review
 * 2, finding 5). Unlike D17's rewording, these are not the same event told in
 * new words: before plan item 7.7 the hired dryer lifted the wet-year penalty,
 * and a save from then must still say so. So the record is shown as written,
 * translated from its own wording, and the quiz grades a ruling on the result
 * its save records.
 */
const LEGACY_RESULTS: Readonly<
  Record<string, Readonly<Record<string, keyof typeof legacyWordingMessages.en>>>
> = {
  'evt-wet-intake': { dryer: 'wetIntakeDryer' },
};

/** An answer's older results, as saved (English) and in the language shown now. */
export function legacyResults(
  eventId: string,
  choiceId: string
): Array<{ raw: string; local: string }> {
  const key = LEGACY_RESULTS[eventId]?.[choiceId];
  return key
    ? [{ raw: legacyWordingMessages.en[key], local: translate(legacyWordingMessages, key) }]
    : [];
}
