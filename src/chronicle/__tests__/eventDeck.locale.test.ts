import { afterEach, describe, expect, it } from 'vitest';
import { getLocale, setLocale } from '../../i18n';
import { EVENT_DECK, getEventDeck, localizedEventText } from '../eventDeck';
import { STEWARD_DECK } from '../stewardDeck';

const initialLocale = getLocale();
const rawSnapshot = JSON.stringify(EVENT_DECK);
const copyFields = new Set(['title', 'text', 'label', 'result', 'because']);

function withoutCopy(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutCopy);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !copyFields.has(key))
        .map(([key, item]) => [key, withoutCopy(item)])
    );
  }
  return value;
}

function copyEntries(value: unknown, path = ''): Array<[string, string]> {
  if (Array.isArray(value))
    return value.flatMap((item, index) => copyEntries(item, `${path}.${index}`));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) =>
    copyFields.has(key) && typeof item === 'string'
      ? [[`${path}.${key}`, item] as [string, string]]
      : copyEntries(item, `${path}.${key}`)
  );
}

afterEach(() => setLocale(initialLocale));

describe('event deck presentation locale', () => {
  it('keeps the engine deck and all English authored copy unchanged', () => {
    setLocale('en');
    const presentation = getEventDeck();
    expect(presentation).toEqual(EVENT_DECK);
    expect(presentation).not.toBe(EVENT_DECK);
    expect(presentation[0]).not.toBe(EVENT_DECK[0]);
    expect(presentation[0].choices[0].effect).not.toBe(EVENT_DECK[0].choices[0].effect);
    expect(presentation.slice(-STEWARD_DECK.length)).toEqual(STEWARD_DECK);
  });

  it('translates every copy field, including effects, variants and echoes, without changing rules', () => {
    setLocale('pt-BR');
    const presentation = getEventDeck();
    const english = copyEntries(EVENT_DECK);
    const portuguese = copyEntries(presentation);
    expect(english).toHaveLength(342);
    expect(portuguese.map(([path]) => path)).toEqual(english.map(([path]) => path));
    for (const [index, [path, copy]] of portuguese.entries()) {
      expect(copy, path).toBeTruthy();
      expect(copy, path).not.toBe(english[index][1]);
      expect(copy, path).not.toMatch(/^evt-[\w-]+\./);
    }
    expect(withoutCopy(presentation)).toEqual(withoutCopy(EVENT_DECK));
    const meeting = presentation.find((event) => event.id === 'evt-valley-meeting')!;
    expect(meeting.echoes![0].because).toBe(
      'Porque a aprovação do moinho em segurança dos alimentos está suspensa'
    );
    expect(meeting.choices.find((choice) => choice.id === 'close')!.variants![0].because).toBe(
      'Porque o contrato de Valley Haulage foi encerrado na arbitragem'
    );
    expect(JSON.stringify(EVENT_DECK)).toBe(rawSnapshot);
  });

  it('localizes only recognized canonical event receipts in their own event', () => {
    setLocale('pt-BR');
    const meeting = EVENT_DECK.find((event) => event.id === 'evt-valley-meeting')!;
    const localized = getEventDeck().find((event) => event.id === meeting.id)!;
    expect(localizedEventText(meeting.id, meeting.echoes![0].text)).toBe(localized.echoes![0].text);
    const variant = meeting.choices.find((choice) => choice.id === 'close')!.variants![0];
    const localizedVariant = localized.choices.find((choice) => choice.id === 'close')!
      .variants![0];
    expect(localizedEventText(meeting.id, variant.effect.result)).toBe(
      localizedVariant.effect.result
    );
    expect(localizedEventText('evt-unknown', meeting.text)).toBe(meeting.text);
    expect(localizedEventText('evt-generous-crop-year', meeting.text)).toBe(meeting.text);
    expect(localizedEventText(meeting.id, 'A custom historical receipt')).toBe(
      'A custom historical receipt'
    );
    setLocale('en');
    expect(localizedEventText(meeting.id, meeting.echoes![0].text)).toBe(meeting.echoes![0].text);
  });

  it('resolves the current locale on every read and retains defaults and delegation', () => {
    setLocale('pt-BR');
    const portuguese = getEventDeck();
    expect(portuguese[0].title).toBe('Uma safra generosa');
    expect(EVENT_DECK[0].title).toBe('A generous crop year');
    for (const event of portuguese) {
      const defaultChoice = event.choices.find((choice) => choice.id === event.defaultChoiceId)!;
      expect(defaultChoice, event.id).toBeDefined();
      expect(defaultChoice.requires, event.id).toBeUndefined();
      expect(defaultChoice.cost?.fund ?? 0, event.id).toBe(0);
      expect(defaultChoice.cost?.knowHow ?? 0, event.id).toBe(0);
      expect(
        Object.values(defaultChoice.cost?.attention ?? {}).every((value) => !value),
        event.id
      ).toBe(true);
    }
    const cover = portuguese.find((event) => event.id === 'evt-standby-cover')!;
    expect(cover.defaultChoiceId).toBe('partner');
    expect(cover.choices.find((choice) => choice.id === 'partner')).toMatchObject({
      delegates: true,
      effect: { marks: ['cover-floor'] },
    });
    setLocale('en');
    expect(getEventDeck()).toEqual(EVENT_DECK);
    expect(portuguese[0].title).toBe('Uma safra generosa');
  });
});
