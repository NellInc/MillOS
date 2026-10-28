import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { localizedInitiative, localizedNotice } from './presentation';
import { EVENT_DECK } from './eventDeck';
import { FORECASTS } from './forecasts';
import { HISTORY_NOTES } from './history';
import { IMPROVEMENTS } from './plans';
import { TRIALS } from './trials';
import { LONG_NIGHT_EVENT_ID } from './longNight';
import { RANKS } from './scoring';
import { CHARACTERS } from './record';
import type { ChronicleNotice, Initiative } from './types';
const receipt = (
  kind: ChronicleNotice['kind'],
  title: string,
  body: string,
  relatedId: string | null = null
): ChronicleNotice => ({ id: 'notice-17', shift: 8, kind, title, body, relatedId });
const initiative = (
  kind: Initiative['kind'],
  summary: string,
  reason: string,
  targetId: string
): Initiative => ({
  id: 'initiative-2',
  shift: 9,
  kind,
  summary,
  reason,
  targetId,
  reversible: true,
  reversed: false,
});
afterEach(() => setLocale('en'));
describe('saved Chronicle presentation', () => {
  it('keeps exact English records and translates a known old receipt after switching language', () => {
    const old = receipt(
      'history',
      HISTORY_NOTES[0].title,
      HISTORY_NOTES[0].brief,
      HISTORY_NOTES[0].id
    );
    const saved = structuredClone(old);
    setLocale('en');
    expect(localizedNotice(old)).toBe(old);
    setLocale('pt-BR');
    expect(localizedNotice(old).title).not.toBe(old.title);
    expect(old).toEqual(saved);
    setLocale('en');
    expect(localizedNotice(old)).toBe(old);
  });
  it('preserves unknown, wrong-kind, wrong-related-id and edited records exactly', () => {
    setLocale('pt-BR');
    const records = [
      receipt('event', 'A custom event', 'Upkeep of 20 is due'),
      receipt(
        'event',
        'Full maintenance restored',
        'All plant is maintained again and upkeep is charged in full.'
      ),
      receipt(
        'ledger',
        'Full maintenance restored',
        'All plant is maintained again and upkeep is charged in full.',
        'custom'
      ),
      receipt('ledger', 'Full maintenance restored', 'Edited body'),
    ];
    for (const old of records) expect(localizedNotice(old)).toBe(old);
  });
  it('captures historical fund values without consulting live state', () => {
    setLocale('pt-BR');
    const old = receipt(
      'ledger',
      'Lack of material',
      'Upkeep of 2345 is due and the fund holds 17. Decrepit plant raises the chance of breakdown and fire.'
    );
    const saved = structuredClone(old);
    expect(localizedNotice(old).body).toContain('2.345');
    expect(localizedNotice(old).body).toContain('17');
    expect(old).toEqual(saved);
  });
  it('localizes canonical event, echo, choice and variant outcomes, preserving all saved objects', () => {
    setLocale('pt-BR');
    for (const event of EVENT_DECK) {
      const records = [receipt('event', event.title, event.text, 'event-42')];
      for (const echo of event.echoes ?? [])
        records.push(receipt('event', event.title, `${echo.because}. ${echo.text}`, 'event-42'));
      for (const choice of event.choices) {
        records.push(
          receipt('event', `${event.title}: ${choice.label}`, choice.effect.result, 'event-42')
        );
        for (const variant of choice.variants ?? [])
          records.push(
            receipt(
              'event',
              `${event.title}: ${choice.label}`,
              `${variant.because}. ${variant.effect.result}`,
              'event-42'
            )
          );
      }
      for (const old of records) {
        const saved = structuredClone(old);
        const local = localizedNotice(old);
        expect(local.title, event.id).not.toBe(old.title);
        expect(old).toEqual(saved);
        expect(local.id).toBe(old.id);
        expect(local.shift).toBe(old.shift);
      }
    }
  });
  it('retains forecast probability and lead time from the receipt', () => {
    setLocale('pt-BR');
    const forecast = Object.values(FORECASTS)[0];
    const old = receipt(
      'forecast',
      `${forecast.title}: 73% in 7 shifts`,
      forecast.text,
      'forecast-5'
    );
    const local = localizedNotice(old);
    expect(local.title).toContain('73%');
    expect(local.title).toContain('7 turnos');
    const passed = receipt(
      'forecast',
      `${forecast.title}: it passed`,
      'The 13% forecast did not come to pass.',
      'forecast-5'
    );
    expect(localizedNotice(passed).body).toContain('13%');
  });
  it('localizes trial victory and retains the old medal target', () => {
    setLocale('pt-BR');
    const trial = TRIALS[0];
    const old = receipt(
      'trial',
      `${trial.title}: bronze victory`,
      'Completed in 4 of 9 shifts. Silver needed completion within 6.',
      trial.id
    );
    const local = localizedNotice(old);
    expect(local.title).toContain('bronze');
    expect(local.body).toContain('4 de 9');
    expect(local.body).toContain('6');
  });
  it('keeps captured crop, long-night and final-score outcomes, rather than deriving current outcomes', () => {
    setLocale('pt-BR');
    const crop = receipt(
      'event',
      'Crop year 12: wet harvest',
      'Moisture about 17.3%, protein about 10.1%. Wheat recipes lose 8 quality points until the grain is treated.'
    );
    const night = receipt(
      'forecast',
      'The long night comes in 4 shifts',
      'A storm and a grid emergency will arrive together. The mill can hold one front itself; the other holds with 5 preparation. The intake and grain stores 7 of 5; the roller floor 3 of 5.',
      LONG_NIGHT_EVENT_ID
    );
    const final = receipt(
      'era',
      'The chronicle is complete',
      `Score 47. You are as wise as ${RANKS[1].title}. The valley came to call it ${CHARACTERS.valley}.`
    );
    const cropLocal = localizedNotice(crop);
    expect(cropLocal.body).toContain('17,3%');
    expect(cropLocal.body).toContain('8 pontos');
    expect(cropLocal.title).toContain('12');
    expect(localizedNotice(night).body).toContain('7 de 5');
    expect(localizedNotice(night).body).toContain('3 de 5');
    expect(localizedNotice(final).body).toContain('47');
    expect(localizedNotice(final).body).toContain('aprendiz');
    for (const old of [crop, night, final]) {
      const saved = structuredClone(old);
      localizedNotice(old);
      expect(old).toEqual(saved);
    }
  });
  it('keeps historical dispatch shortfall values including grouped targets and decimal energy', () => {
    setLocale('pt-BR');
    const trial = TRIALS.find((item) => item.goal.kind === 'dispatch')!;
    const old = receipt(
      'trial',
      `${trial.title}: trial failed`,
      '1234 of 45,000 kg dispatched. Energy 0.137 per kg against 0.12. Average grade points 2.5 against 3.',
      trial.id
    );
    const local = localizedNotice(old);
    expect(local.body).toContain('1.234 de 45.000');
    expect(local.body).toContain('0,137');
    expect(local.body).toContain('2,5');
  });
  it('translates initiatives only with a complete canonical summary, reason and target guard', () => {
    const plan = IMPROVEMENTS[0];
    const old = initiative(
      'install',
      `Started installing ${plan.label.toLowerCase()}`,
      'The cheapest ready plan, leaving 27 shifts of upkeep in reserve.',
      plan.id
    );
    const saved = structuredClone(old);
    setLocale('en');
    expect(localizedInitiative(old)).toBe(old);
    setLocale('pt-BR');
    expect(localizedInitiative(old).reason).toContain('27 turnos');
    expect(old).toEqual(saved);
    const edited = { ...old, reason: 'A custom rationale' };
    expect(localizedInitiative(edited)).toBe(edited);
    const unknown = { ...old, targetId: 'custom-plan' };
    expect(localizedInitiative(unknown)).toBe(unknown);
  });
});
