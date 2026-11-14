import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { localizedInitiative, localizedNotice } from './presentation';
import { cropYearSummary } from './engine';
import { EVENT_DECK, getEventDeck } from './eventDeck';
import { localizedStakeholderName } from './stakeholders';
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
  it('translates the shortfall, struck-forecast and fallen-front notices with and without their old closing advice (D14)', () => {
    setLocale('pt-BR');
    const forecast = Object.values(FORECASTS)[0];
    const pairs: Array<[ChronicleNotice, string]> = [
      [
        receipt('ledger', 'Lack of material', 'Upkeep of 2345 is due and the fund holds 17.'),
        'A manutenção de 2.345 está vencendo e o fundo tem 17.',
      ],
      [
        receipt(
          'forecast',
          `${forecast.title}: it struck`,
          'The 40% forecast came true.',
          'forecast-5'
        ),
        'A previsão de 40% se concretizou.',
      ],
      [
        receipt(
          'forecast',
          `${forecast.title}: it struck`,
          'The 40% forecast came true. Recover the incident from the operations card, then restore controls here.',
          'forecast-5'
        ),
        'A previsão de 40% se concretizou. Resolva a ocorrência no cartão de operações e restaure os controles aqui.',
      ],
      [
        receipt(
          'trial',
          'The roller floor fell',
          'The roller floor needed 5 preparation and had 2.',
          LONG_NIGHT_EVENT_ID
        ),
        'precisava de 5 de preparação e tinha 2.',
      ],
      [
        receipt(
          'trial',
          'The roller floor fell',
          'The roller floor needed 5 preparation and had 2. Recover the incident under Incidents raised by the chronicle.',
          LONG_NIGHT_EVENT_ID
        ),
        'Resolva a ocorrência em Ocorrências geradas pela crônica.',
      ],
    ];
    for (const [notice, expected] of pairs)
      expect(localizedNotice(notice).body, notice.body).toContain(expected);
  });
  it('reads a front held on preparation as the buttons do, and still reads the old wording', () => {
    setLocale('pt-BR');
    const held = (body: string) =>
      localizedNotice(receipt('trial', 'The roller floor held', body, LONG_NIGHT_EVENT_ID)).body;
    expect(held('Held on preparation alone (4 prepared, 2 needed).')).toBe(
      'Resistiu apenas com a preparação (4 preparados, 2 necessários).'
    );
    expect(held('Held on preparation alone (4 of 2 prepared).')).toBe(
      'Resistiu apenas com a preparação (4 de 2 preparados).'
    );
  });
  // Review 2, finding 7: a wet year has no treatment, so its notice names the
  // Tempering card; a sprouted year is still treated (blended).
  it('names the Tempering card in a wet year’s notice, in both languages', () => {
    const wet = cropYearSummary({ index: 1, kind: 'wet', treated: false });
    expect(wet).toMatch(/unless the grain is dried first on the Tempering card\.$/);
    expect(cropYearSummary({ index: 2, kind: 'sprouted', treated: false })).toMatch(
      /until the grain is treated\.$/
    );
    setLocale('pt-BR');
    const local = localizedNotice(receipt('event', 'Crop year 2: wet harvest', wet));
    expect(local.body).toMatch(/seco antes no cartão de Condicionamento\.$/);
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

describe('result notices that carry their changes', () => {
  const event = EVENT_DECK.find((candidate) => candidate.id === 'evt-court-short-weight')!;
  const choice = event.choices.find((candidate) => candidate.id === 'terminate')!;
  const title = `${event.title}: ${choice.label}`;
  const local = () => {
    const deck = getEventDeck().find((candidate) => candidate.id === event.id)!;
    return {
      title: `${deck.title}: ${deck.choices.find((c) => c.id === choice.id)!.label}`,
      result: deck.choices.find((c) => c.id === choice.id)!.effect.result,
    };
  };

  it('translates the result with its changes', () => {
    setLocale('pt-BR');
    const now = receipt(
      'event',
      title,
      `${choice.effect.result} (Growers’ cooperative -10)`,
      'event-3'
    );
    expect(localizedNotice(now)).toEqual({
      ...now,
      title: local().title,
      body: `${local().result} (${localizedStakeholderName('growers')} -10)`,
    });
  });

  it('still translates a result saved before notices carried their changes', () => {
    setLocale('pt-BR');
    const old = receipt('event', title, choice.effect.result, 'event-3');
    expect(localizedNotice(old).body).toBe(local().result);
  });

  it('translates a suspension named with its result', () => {
    const log = EVENT_DECK.find((candidate) => candidate.id === 'evt-cleaning-log')!;
    const backdate = log.choices.find((c) => c.id === 'backdate')!;
    setLocale('pt-BR');
    const local = localizedNotice(
      receipt(
        'event',
        `${log.title}: ${backdate.label}`,
        `${backdate.effect.result} (approval suspended; all customers -10)`,
        'event-6'
      )
    );
    expect(local.body).toMatch(/\(aprovação suspensa; todos os clientes -10\)$/);
  });

  it('translates the standing change and a variant’s because with it', () => {
    const meeting = EVENT_DECK.find((candidate) => candidate.id === 'evt-valley-meeting')!;
    const speak = meeting.choices.find((c) => c.id === 'speak')!;
    const close = meeting.choices.find((c) => c.id === 'close')!;
    const variant = close.variants![0];
    setLocale('pt-BR');
    const spoken = localizedNotice(
      receipt(
        'event',
        `${meeting.title}: ${speak.label}`,
        `${speak.effect.result} (Village committee +8; Growers’ cooperative +8; standing +0.10)`,
        'event-4'
      )
    );
    expect(spoken.body).toMatch(/reputação \+0,10\)$/);
    const closed = localizedNotice(
      receipt(
        'event',
        `${meeting.title}: ${close.label}`,
        `${variant.because}. ${variant.effect.result} (Village committee -10; Growers’ cooperative -8; Valley Haulage -8)`,
        'event-5'
      )
    );
    expect(closed.body).not.toMatch(/Because|Village committee/);
    expect(closed.body).toMatch(/Valley Haulage -8\)$/);
  });
});
