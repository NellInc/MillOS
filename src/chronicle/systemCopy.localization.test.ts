import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { CHARTER_COLUMNS, getCharterColumns } from './charter';
import { FORECASTS, getForecasts } from './forecasts';
import { ERAS, IMPROVEMENTS, getEras, getImprovements } from './plans';
import { CROP_YEARS, getCropYears } from './cropYears';
import {
  TRIALS,
  emptyTrialProgress,
  getTrials,
  trialById,
  trialGoalText,
  trialGoalConditions,
  trialShortfall,
  localizedTrialById,
  localizedTrialGoalText,
  localizedTrialGoalConditions,
  localizedTrialShortfall,
} from './trials';
import { FRONTS, frontSources, getFronts, localizedFrontSources } from './longNight';
import { DELEGATION_LEVELS, getDelegationLevels } from './delegation';
import { CUSTOMERS, getCustomers } from './customers';
import { traitLabel, localizedTraitLabel } from './contractors';
import { deskLabel, localizedDeskLabel } from './desks';
import {
  initialStakeholders,
  stakeholderName,
  stakeholderPhrase,
  stakeholderStanding,
  localizedStakeholderName,
  localizedStakeholderPhrase,
  localizedStakeholderStanding,
} from './stakeholders';
import { epilogue, localizedEpilogue } from './epilogue';
import type { RecordContext } from './record';

const context: RecordContext = {
  marks: {},
  improvements: [],
  readNotes: [],
  customers: [],
  stakeholders: initialStakeholders(80),
  certifier: { score: 500, suspended: false },
};
const trait = { id: 'thrifty', group: 'cost', positive: true, magnitude: 12.5 } as const;
const readers = [
  [getCharterColumns, CHARTER_COLUMNS],
  [getForecasts, FORECASTS],
  [getEras, ERAS],
  [getImprovements, IMPROVEMENTS],
  [getCropYears, CROP_YEARS],
  [getTrials, TRIALS],
  [getFronts, FRONTS],
  [getDelegationLevels, DELEGATION_LEVELS],
  [getCustomers, CUSTOMERS],
] as const;
const copyKeys = new Set([
  'label',
  'title',
  'text',
  'effect',
  'briefing',
  'pressureBeat',
  'mitigationLabel',
  'subject',
  'pronoun',
  'grants',
]);
function mechanics(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mechanics);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, entry]) => !(copyKeys.has(key) && typeof entry === 'string'))
        .map(([key, entry]) => [key, mechanics(entry)])
    );
  return value;
}
afterEach(() => setLocale('en'));
describe('Chronicle system-copy read models', () => {
  it('preserves every English definition and helper output', () => {
    setLocale('en');
    for (const [read, raw] of readers) expect(read()).toEqual(raw);
    for (const raw of TRIALS) {
      const progress = { ...emptyTrialProgress(raw.id), dispatchedKg: 3210, energyCost: 123 };
      expect(localizedTrialById(raw.id)).toEqual(trialById(raw.id));
      expect(localizedTrialGoalText(raw)).toBe(trialGoalText(raw));
      expect(localizedTrialGoalConditions(raw)).toBe(trialGoalConditions(raw));
      expect(localizedTrialShortfall(raw, progress)).toBe(trialShortfall(raw, progress));
    }
    expect(localizedTraitLabel(trait)).toBe(traitLabel(trait));
    expect(localizedDeskLabel('works')).toBe(deskLabel('works'));
    for (const party of context.stakeholders) {
      expect(localizedStakeholderName(party.id)).toBe(stakeholderName(party.id));
      expect(localizedStakeholderPhrase(party.id)).toBe(stakeholderPhrase(party.id));
      expect(localizedStakeholderStanding(context.stakeholders, party.id)).toBe(
        stakeholderStanding(context.stakeholders, party.id)
      );
    }
    expect(localizedFrontSources(context, 'intake')).toEqual(frontSources(context, 'intake'));
    expect(localizedEpilogue(context)).toEqual(epilogue(context));
  });
  it('switches copy at read time without changing mechanics or canonical producers', () => {
    setLocale('en');
    const canonical = [
      trialGoalText(TRIALS[0]),
      traitLabel(trait),
      deskLabel('works'),
      stakeholderName('growers'),
      stakeholderPhrase('growers'),
      stakeholderStanding(context.stakeholders, 'growers'),
      frontSources(context, 'intake'),
      epilogue(context),
    ];
    setLocale('pt-BR');
    for (const [read, raw] of readers) expect(mechanics(read())).toEqual(mechanics(raw));
    expect(getCharterColumns()[0].label).toBe('Fornecimento de grãos');
    expect(getForecasts().severe_rain.mitigationLabel).toBe('Limpar os drenos');
    expect(getEras()[0].label).toBe('Moinho da vila');
    expect(getImprovements()[0].label).toBe('Medidores de umidade dos grãos');
    expect(getCropYears().wet.label).toBe('Colheita úmida');
    expect(getTrials()[0].briefing).toContain('6.000 kg');
    expect(localizedTrialGoalText(TRIALS[3])).toContain('0,08');
    expect(
      localizedTrialShortfall(TRIALS[3], {
        ...emptyTrialProgress('grid_winter'),
        dispatchedKg: 3210,
        energyCost: 123,
      })
    ).toContain('3.210 de 8.000 kg');
    expect(localizedTraitLabel(trait)).toContain('12,5%');
    expect(localizedDeskLabel('works')).toBe('Obras');
    expect(localizedStakeholderName('growers')).toBe('Cooperativa de produtores');
    expect(
      localizedFrontSources(context, 'intake').find((source) => source.id.startsWith('plan:'))
        ?.label
    ).toContain('Drenagem do pátio');
    expect(localizedEpilogue(context)[0].title).toBe('O moinho');
    expect(getCustomers()).toEqual(CUSTOMERS);
    expect([
      trialGoalText(TRIALS[0]),
      traitLabel(trait),
      deskLabel('works'),
      stakeholderName('growers'),
      stakeholderPhrase('growers'),
      stakeholderStanding(context.stakeholders, 'growers'),
      frontSources(context, 'intake'),
      epilogue(context),
    ]).toEqual(canonical);
    setLocale('en');
    expect(getTrials()).toEqual(TRIALS);
  });
});
