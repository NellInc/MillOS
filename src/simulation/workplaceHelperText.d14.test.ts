/**
 * D14 (D-012): the season's simulation copy keeps states, refusals and the
 * next step, and drops the hints and trailing disclaimers the earlier sweep
 * was not allowed to touch. Working if none of these sentences is left in
 * either language, and no catalogue holds a hint, limitation or assumption key.
 */
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../i18n';
import { workplaceAutoplayMessages } from './workplaceAutoplay.messages';
import { workplaceImprovementMessages } from './workplaceImprovement.messages';
import { workplaceAdviceMessages } from './workplaceAdvice.messages';
import { workplaceFairnessMessages } from './workplaceFairness.messages';
import { workplaceCampaignMessages } from './workplaceCampaign.messages';

const CATALOGUES = {
  workplaceAutoplay: workplaceAutoplayMessages,
  workplaceImprovement: workplaceImprovementMessages,
  workplaceAdvice: workplaceAdviceMessages,
  workplaceFairness: workplaceFairnessMessages,
  workplaceCampaign: workplaceCampaignMessages,
};

/** Every string a catalogue holds in `locale`, templates sampled with sample params. */
function copy(locale: (typeof LOCALES)[number]): string[] {
  const out: string[] = [];
  for (const catalogue of Object.values(CATALOGUES))
    for (const value of Object.values(catalogue[locale] as Record<string, unknown>)) {
      if (typeof value === 'string') out.push(value);
      else if (typeof value === 'function')
        out.push(
          String(
            (value as (p: Record<string, string>) => unknown)({
              delivered: '1',
              evidence: 'current',
              remaining: '1',
              role: 'Packing',
              minutes: '1',
            })
          )
        );
    }
  return out;
}

const CUT = {
  en: [
    'To run it again',
    'To continue, open Autonomy',
    'One trial cannot establish',
    'shortened trial cannot be treated',
    'workplace minutes =',
    'Real material engine at',
    'Fixed machinery, recipe, quality interlock',
    'Whole-line pacing only',
    'Dispatch lower bound is zero',
    'Advice changes require fresh understanding',
    'No private reason is required',
    'Scripted adviser dialogue is identified separately',
    'Quality release and physical customer departures have separate receipts',
    'Compensation is separate from earned pay',
    'It leaves the physical plant untouched',
    'This exercise counter is separate',
    'Earlier volunteering grants no new duty',
    'The full customer commitment remains recorded',
    'Actual batch certification',
    'A team discussion cannot close',
    'Fresh terms still need fresh understanding',
    'Deadline pressure never changes refusal rights',
    'Deadline pressure carries forward',
    'Fresh offers prioritise',
    'Restated terms and raiser-owned resolution carry forward',
    'The agreement outcome records that unresolved promise',
    'New duties require a new agreement',
    'A restatement cannot close your objection',
    'The challenge remains yours',
    'Paid compensation and delivered recovery have separate receipts',
    'Cover can be withdrawn; earned obligations remain',
    'This grants no vote or cover consent',
    'Approval cannot volunteer you for cover',
    'Silence gives no consent',
  ],
  'pt-BR': [
    'Para rodá-la de novo',
    'Para continuar, abra Autonomia',
    'Um único teste não estabelece',
    'teste encurtado não pode',
    'minutos de trabalho =',
    'Motor de material real',
    'A certificação real do lote',
    'Uma discussão da equipe não pode',
    'A pressão do prazo nunca muda',
    'A pressão do prazo continua',
    'Silêncio não é consentimento',
    'A planta física não é alterada',
    'Nenhum motivo pessoal é exigido',
  ],
} as const;

describe('D14: season simulation copy carries no hints or trailing disclaimers', () => {
  it.each(LOCALES)('in %s no cut sentence is left', (locale) => {
    const all = copy(locale).join('\n');
    for (const sentence of CUT[locale]) expect(all, sentence).not.toContain(sentence);
  });

  it('keeps no hint, limitation or assumption key in either language', () => {
    for (const [name, catalogue] of Object.entries(CATALOGUES))
      for (const locale of LOCALES)
        for (const key of Object.keys(catalogue[locale]))
          expect(`${name}.${key}`).not.toMatch(/\.(?:\w*Hint|limitation\w*|assumption\w*)$/);
  });
});
