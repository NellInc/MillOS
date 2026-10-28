/** Read-time views of canonical English records. No reducer or saved object is changed. */
import { createTranslator, formatFixed, getLocale } from '../i18n';
import { EVENT_DECK, getEventDeck } from './eventDeck';
import { HISTORY_NOTES, getHistoryNotes } from './history';
import { ERAS, getEras, IMPROVEMENTS, getImprovements } from './plans';
import { FORECASTS, getForecasts } from './forecasts';
import { TRIALS, getTrials } from './trials';
import { CROP_YEARS, getCropYears } from './cropYears';
import { FRONTS, getFronts, LONG_NIGHT_EVENT_ID } from './longNight';
import { FIRM_NAMES } from './contractors';
import { CHARACTERS, localizedCharacterTitle } from './record';
import { RANKS } from './scoring';
import { presentationMessages as messages } from './presentation.messages';
import type { ChronicleNotice, Initiative, NoticeKind } from './types';

type Key = keyof typeof messages.en;
type Params = Record<string, string>;
const rankKeys: Key[] = [
  'rank0',
  'rank1',
  'rank2',
  'rank3',
  'rank4',
  'rank5',
  'rank6',
  'rank7',
  'rank8',
];
const numeric = '-?\\d+(?:\\.\\d+)?';

/** Match the whole template. Only explicitly numeric slots accept saved values. */
function capture(value: string, template: string, fixed: Params = {}): Params | null {
  const names: string[] = [];
  const pattern = template
    .split(/(\{\w+\})/)
    .map((part) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1];
      if (!name) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (fixed[name] !== undefined) return fixed[name].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!/^n\d+$/.test(name)) return '(?!)';
      names.push(name);
      return `(${numeric})`;
    })
    .join('');
  const match = new RegExp(`^${pattern}$`).exec(value);
  if (!match) return null;
  return Object.fromEntries(names.map((name, index) => [name, match[index + 1]]));
}

function render(key: Key, fixed: Params, values: Params = {}): string {
  const localized = Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      formatFixed(Number(value), value.includes('.') ? value.split('.')[1].length : 0),
    ])
  );
  return createTranslator(messages, getLocale())(key, { ...fixed, ...localized });
}

const staticRules: Array<[NoticeKind, Key, Key]> = [
  ['ledger', 't0', 'b0'],
  ['ledger', 't1', 'b1'],
  ['ledger', 't2', 'b2'],
  ['ledger', 't3', 'b3'],
  ['ledger', 't4', 'b4'],
  ['ledger', 't5', 'b5'],
  ['event', 't6', 'b6'],
  ['event', 't7', 'b7'],
  ['event', 't8', 'b8'],
  ['event', 't9', 'b9'],
  ['event', 't10', 'b10'],
  ['event', 't11', 'b11'],
  ['event', 't12', 'b12'],
  ['event', 't13', 'b13'],
  ['trial', 't14', 'b14'],
  ['trial', 't15', 'b15'],
  ['initiative', 't16', 'b16'],
  ['initiative', 't17', 'b17'],
  ['initiative', 't18', 'b18'],
  ['initiative', 't19', 'b19'],
  ['trial', 't20', 'b20'],
  ['trial', 't21', 'b21'],
  ['trial', 't22', 'b22'],
];

/** Unknown, custom and ambiguous records retain their exact original copy. */
export function localizedNotice(notice: ChronicleNotice): ChronicleNotice {
  if (getLocale() === 'en') return notice;
  const candidates: Array<{ title: string; body: string }> = [];
  const add = (title: string, body: string, localizedTitle: string, localizedBody: string) => {
    if (notice.title === title && notice.body === body)
      candidates.push({ title: localizedTitle, body: localizedBody });
  };
  const template = (titleKey: Key, bodyKey: Key, raw: Params = {}, translated: Params = raw) => {
    const titleValues = capture(notice.title, messages.en[titleKey], raw);
    const bodyValues = capture(notice.body, messages.en[bodyKey], raw);
    if (titleValues && bodyValues)
      candidates.push({
        title: render(titleKey, translated, titleValues),
        body: render(bodyKey, translated, bodyValues),
      });
  };
  // These producers deliberately carry no related ID. Do not reinterpret unrelated records.
  if (notice.relatedId === null) {
    for (const [kind, title, body] of staticRules) if (notice.kind === kind) template(title, body);
    if (notice.kind === 'event') {
      for (const name of FIRM_NAMES) template('retained', 'retainedBody', { label: name });
      const translatedPlans = getImprovements();
      for (const plan of IMPROVEMENTS) {
        const local = translatedPlans.find((item) => item.id === plan.id);
        if (!local) continue;
        for (const [title, body, lower] of [
          ['snag', 'snagBody', true],
          ['installed', 'installedBody', false],
          ['planned', 'plannedBody', false],
        ] as const)
          template(
            title,
            body,
            { label: lower ? plan.label.toLowerCase() : plan.label },
            { label: lower ? local.label.toLowerCase() : local.label }
          );
      }
    }
  }
  if (notice.kind === 'history') {
    const local = getHistoryNotes().find((note) => note.id === notice.relatedId);
    const raw = HISTORY_NOTES.find((note) => note.id === notice.relatedId);
    if (raw && local) add(raw.title, raw.brief, local.title, local.brief);
  }
  if (notice.kind === 'event') {
    const localDeck = getEventDeck();
    for (const event of EVENT_DECK) {
      const local = localDeck.find((item) => item.id === event.id);
      if (!local) continue;
      if (notice.relatedId !== null && /^event-\d+$/.test(notice.relatedId)) {
        add(event.title, event.text, local.title, local.text);
        event.echoes?.forEach((echo, index) => {
          const translated = local.echoes?.[index];
          if (translated)
            add(
              event.title,
              `${echo.because}. ${echo.text}`,
              local.title,
              `${translated.because}. ${translated.text}`
            );
        });
        for (const choice of event.choices) {
          const translated = local.choices.find((item) => item.id === choice.id);
          if (!translated) continue;
          const outcomes = [
            { raw: choice.effect.result, local: translated.effect.result },
            ...(choice.variants ?? []).flatMap((variant, index) => {
              const localVariant = translated.variants?.[index];
              return localVariant
                ? [
                    {
                      raw: `${variant.because}. ${variant.effect.result}`,
                      local: `${localVariant.because}. ${localVariant.effect.result}`,
                    },
                  ]
                : [];
            }),
          ];
          for (const outcome of outcomes) {
            add(
              `${event.title}: ${choice.label}`,
              outcome.raw,
              `${local.title}: ${translated.label}`,
              outcome.local
            );
            if (choice.id === event.defaultChoiceId)
              add(
                `${event.title}: the moment passed`,
                outcome.raw,
                render('passedMoment', { title: local.title }),
                outcome.local
              );
          }
        }
      }
      if (notice.relatedId === null) {
        const choice = event.choices.find((item) => item.id === event.defaultChoiceId);
        const translated = local.choices.find((item) => item.id === event.defaultChoiceId);
        if (choice && translated) {
          // resolveChain deliberately omits the variant's because clause.
          const outcomes = [
            { raw: choice.effect.result, local: translated.effect.result },
            ...(choice.variants ?? []).flatMap((variant, index) =>
              translated.variants?.[index]
                ? [{ raw: variant.effect.result, local: translated.variants[index].effect.result }]
                : []
            ),
          ];
          for (const outcome of outcomes)
            add(
              `${event.title} (ruled by the AI partner)`,
              choice.delegates ? outcome.raw : `${choice.label}. ${outcome.raw}`,
              render('ruled', { title: local.title }),
              choice.delegates ? outcome.local : `${translated.label}. ${outcome.local}`
            );
        }
      }
    }
  }
  if (notice.kind === 'forecast' && /^forecast-\d+$/.test(notice.relatedId ?? '')) {
    const localForecasts = getForecasts();
    for (const definition of Object.values(FORECASTS)) {
      const local = localForecasts[definition.kind];
      template('forecastStruck', 'struckBody', { title: definition.title }, { title: local.title });
      template('forecastPassed', 'passedBody', { title: definition.title }, { title: local.title });
      const issued = capture(notice.title, messages.en.forecastIssued, {
        title: definition.title,
        unit: definition.leadShifts === 1 ? 'shift' : 'shifts',
      });
      if (issued && notice.body === definition.text)
        candidates.push({
          title: render(
            'forecastIssued',
            { title: local.title, unit: render(Number(issued.n1) === 1 ? 'shift' : 'shifts', {}) },
            issued
          ),
          body: local.text,
        });
    }
  }
  if (notice.kind === 'trial') {
    const raw = TRIALS.find((trial) => trial.id === notice.relatedId);
    const local = getTrials().find((trial) => trial.id === notice.relatedId);
    if (raw && local) {
      add(raw.title, raw.pressureBeat, local.title, local.pressureBeat);
      const soon = capture(notice.title, messages.en.trialSoon, { title: raw.title });
      if (soon && notice.body === raw.briefing)
        candidates.push({
          title: render('trialSoon', { title: local.title }, soon),
          body: local.briefing,
        });
      const begun = capture(notice.body, `${raw.briefing} {n0} shifts.`);
      if (notice.title === `${raw.title} has begun` && begun)
        candidates.push({
          title: render('trialBegun', { title: local.title }),
          body: render('begunBody', { briefing: local.briefing }, begun),
        });
      for (const medal of ['gold', 'silver', 'bronze'] as const) {
        const translatedMedal = render(medal, {});
        template(
          'trialVictory',
          'completed',
          { title: raw.title, medal },
          { title: local.title, medal: translatedMedal }
        );
        const target =
          /^Completed in (\d+) of (\d+) shifts\. (Gold|Silver) needed completion within (\d+)\.$/.exec(
            notice.body
          );
        if (notice.title === `${raw.title}: ${medal} victory` && target)
          candidates.push({
            title: render('trialVictory', { title: local.title, medal: translatedMedal }),
            body: render(
              'completedTarget',
              { medal: render(target[3] === 'Gold' ? 'Gold' : 'Silver', {}) },
              { n0: target[1], n1: target[2], n2: target[4] }
            ),
          });
      }
      if (notice.title === `${raw.title}: trial failed` && raw.goal.kind === 'dispatch') {
        const parts = notice.body.split(/(?<=\.) /);
        const firstMatch = /^(\d+) of (\d+(?:,\d{3})*) kg dispatched\.$/.exec(parts[0]);
        const first = firstMatch ? { n0: firstMatch[1] } : null;
        if (first) {
          const localized = [
            render(
              'dispatchFail',
              { target: formatFixed(Number(firstMatch![2].replaceAll(',', ''))) },
              first
            ),
          ];
          let valid = true;
          let last = 0;
          for (const part of parts.slice(1)) {
            const energy = capture(part, messages.en.energyFail);
            const grade = capture(part, messages.en.gradeFail);
            if (energy && last === 0) {
              localized.push(render('energyFail', {}, energy));
              last = 1;
            } else if (grade && last < 2) {
              localized.push(render('gradeFail', {}, grade));
              last = 2;
            } else valid = false;
          }
          if (valid)
            candidates.push({
              title: render('trialFailed', { title: local.title }),
              body: localized.join(' '),
            });
        }
      }
      for (const body of ['window', 'qualityFail', 'cleanFail'] as const)
        template('trialFailed', body, { title: raw.title }, { title: local.title });
    }
  }
  if (notice.relatedId === null && (notice.kind === 'era' || notice.kind === 'event')) {
    const localCrops = getCropYears();
    const localEras = getEras();
    if (notice.kind === 'era') {
      RANKS.forEach((rank, index) => {
        for (const character of Object.values(CHARACTERS))
          template(
            'complete',
            'completeBody',
            { rank: rank.title, character },
            { rank: render(rankKeys[index], {}), character: localizedCharacterTitle(character) }
          );
      });
      for (const raw of ERAS) {
        const local = localEras.find((era) => era.id === raw.id);
        if (!local) continue;
        if (raw.id === 'village') {
          for (const crop of Object.values(CROP_YEARS))
            template(
              'begins',
              'beginBody',
              { label: raw.label, crop: crop.label.toLowerCase() },
              { label: local.label, crop: localCrops[crop.kind].label.toLowerCase() }
            );
        }
        if (notice.title === `A new era: ${raw.label}`) {
          const parts =
            notice.body.startsWith('Bonus: ') && notice.body.endsWith('.')
              ? notice.body.slice(7, -1).split(', ')
              : [];
          const translated = parts.map((part) => {
            for (const key of [
              'reinvestment',
              'wear',
              'energy',
              'production',
              'quality',
            ] as const) {
              const values = capture(part, messages.en[key]);
              if (values) return render(key, {}, values);
            }
            return null;
          });
          if (parts.length && translated.every((part) => part !== null))
            candidates.push({
              title: render('newEra', { label: local.label }),
              body: render('bonus', { label: translated.join(', ') }),
            });
          template('newEra', 'noBonus', { label: raw.label }, { label: local.label });
        }
      }
    }
    if (notice.kind === 'event') {
      for (const crop of Object.values(CROP_YEARS)) {
        const title = capture(notice.title, messages.en.cropYear, {
          label: crop.label.toLowerCase(),
        });
        const body =
          /^Moisture about (-?\d+(?:\.\d+)?)%, protein about (-?\d+(?:\.\d+)?)%\.(?: Wheat recipes lose (\d+) quality points until the grain is treated\.)?(?: Reinvestment \+(\d+)%\.)?$/.exec(
            notice.body
          );
        if (title && body) {
          const parts = [render('cropBase', {}, { n0: body[1], n1: body[2] })];
          if (body[3]) parts.push(render('cropPenalty', {}, { n0: body[3] }));
          if (body[4]) parts.push(render('cropReinvestment', {}, { n0: body[4] }));
          candidates.push({
            title: render('cropYear', { label: localCrops[crop.kind].label.toLowerCase() }, title),
            body: parts.join(' '),
          });
        }
      }
    }
  }
  if (notice.relatedId === LONG_NIGHT_EVENT_ID) {
    if (notice.kind === 'forecast') template('nightSoon', 'nightBody');
    if (notice.kind === 'trial') {
      const localFronts = getFronts();
      for (const id of ['intake', 'floor'] as const) {
        const raw = FRONTS[id];
        const local = localFronts[id];
        template(
          'held',
          'heldBody',
          { label: raw.label, pronoun: raw.pronoun },
          { label: local.label }
        );
        template('fell', 'fellBody', { label: raw.label }, { label: local.label });
      }
    }
  }
  const unique = [
    ...new Map(candidates.map((candidate) => [JSON.stringify(candidate), candidate])).values(),
  ];
  return unique.length === 1 ? { ...notice, ...unique[0] } : notice;
}

export function localizedInitiative(entry: Initiative): Initiative {
  if (getLocale() === 'en') return entry;
  const translated = (
    summary: Key,
    reason: Key,
    raw: Params = {},
    local: Params = raw
  ): Initiative | null => {
    const summaryValues = capture(entry.summary, messages.en[summary], raw);
    const reasonValues = capture(entry.reason, messages.en[reason], raw);
    return summaryValues && reasonValues
      ? {
          ...entry,
          summary: render(summary, local, summaryValues),
          reason: render(reason, local, reasonValues),
        }
      : null;
  };
  if (entry.kind === 'suppression' && entry.targetId === 'fire')
    return translated('suppressSummary', 'suppressReason') ?? entry;
  if (entry.kind === 'restore' && entry.targetId.length > 0)
    return translated('restoreSummary', 'restoreReason') ?? entry;
  if (entry.kind === 'install') {
    const raw = IMPROVEMENTS.find((plan) => plan.id === entry.targetId);
    const local = getImprovements().find((plan) => plan.id === entry.targetId);
    return raw && local
      ? (translated(
          'installSummary',
          'installReason',
          { label: raw.label.toLowerCase() },
          { label: local.label.toLowerCase() }
        ) ?? entry)
      : entry;
  }
  if (entry.kind === 'mitigation' && /^forecast-\d+$/.test(entry.targetId)) {
    const candidates = Object.values(FORECASTS).flatMap((raw) => {
      const local = getForecasts()[raw.kind];
      const candidate = translated(
        'mitigationSummary',
        'mitigationReason',
        { label: raw.mitigationLabel, title: raw.title.toLowerCase() },
        { label: local.mitigationLabel, title: local.title.toLowerCase() }
      );
      return candidate ? [candidate] : [];
    });
    return candidates.length === 1 ? candidates[0] : entry;
  }
  if (
    entry.kind === 'event' &&
    /^event-\d+$/.test(entry.targetId) &&
    entry.reason === messages.en.eventReason
  ) {
    const candidates = EVENT_DECK.flatMap((raw) =>
      raw.choices.flatMap((choice) => {
        if (entry.summary !== `${raw.title}: ${choice.label}`) return [];
        const local = getEventDeck().find((event) => event.id === raw.id);
        const localChoice = local?.choices.find((item) => item.id === choice.id);
        return local && localChoice
          ? [
              {
                ...entry,
                summary: `${local.title}: ${localChoice.label}`,
                reason: render('eventReason', {}),
              },
            ]
          : [];
      })
    );
    return candidates.length === 1 ? candidates[0] : entry;
  }
  return entry;
}
