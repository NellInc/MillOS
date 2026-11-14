import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sharedMessages } from './shared.messages';
import { partnerProposalMessages } from '../../simulation/partnerProposals.messages';
import { speakableText } from '../../audio/paSpeechText';
import { createTranslator, type Locale } from '../../i18n';

/*
 * Every machine line, with every machine name the plant has, in both
 * languages. The names are read from MillScene.tsx, where the plant is built,
 * not copied: a copy drifts (the speech test pinned "Plansifter A", a name the
 * plant does not use).
 * Working if "Sifter A" is spoken with A as a letter, and no Portuguese line
 * makes an adjective agree with a machine name: R.M., Silo and Sifter are
 * masculine, Pack Line feminine, so any agreement is wrong for one of them.
 */
const scene = readFileSync(join(process.cwd(), 'src/components/MillScene.tsx'), 'utf8');
const names = (constant: string): string[] => {
  const match = new RegExp(`const ${constant} = \\[([^\\]]*)\\]`).exec(scene);
  if (!match) throw new Error(`${constant} not found in MillScene.tsx`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
};
const PLANT_NAMES = [
  ...names('siloNames').map((name) => `Silo ${name}`),
  ...names('millNames'),
  ...names('sifterNames'),
  ...names('packerNames'),
];

const MACHINE_LINES = [
  'machineWarning',
  'machineWarningStill',
  'machineWarningUrgent',
  'machineCritical',
  'machineCriticalStill',
  'machineCriticalUrgent',
  'machineRecovered',
] as const;

const LETTER: Record<Locale, string> = { en: 'ay', 'pt-BR': 'á' };

describe('the plant’s machine names', () => {
  it('are read from the scene: five silos, four mills, three sifters, three pack lines', () => {
    expect(PLANT_NAMES).toHaveLength(15);
    expect(PLANT_NAMES).toContain('Sifter A');
    expect(PLANT_NAMES).toContain('Pack Line 1');
    expect(PLANT_NAMES).toContain('R.M. 101');
  });
});

describe.each(['en', 'pt-BR'] as const)('PA machine lines (%s)', (locale) => {
  const t = createTranslator(sharedMessages, locale);

  it.each(MACHINE_LINES)('%s speaks "Sifter A" with A as a letter', (key) => {
    const caption = t(key, { machine: 'Sifter A' });
    const spoken = speakableText(caption, locale);
    expect(spoken).toContain(`Sifter ${LETTER[locale]}`);
    expect(spoken).not.toMatch(/\bSifter A\b/);
  });

  it('speaks every plant name in every line without leaving a dotted designation', () => {
    for (const key of MACHINE_LINES)
      for (const machine of PLANT_NAMES) {
        const spoken = speakableText(t(key, { machine }), locale);
        expect(spoken, `${key} ${machine}`).not.toMatch(/R\.M\.|\d/);
      }
  });
});

describe('no Portuguese machine line makes an adjective agree with the name', () => {
  const pt = createTranslator(sharedMessages, 'pt-BR');
  const partner = createTranslator(partnerProposalMessages, 'pt-BR');
  const AGREEING =
    /\b(está|estão|continua|segue|ficou|foi)\s+(\w+\s+)?(parad|desgastad|quebrad|atrasad|ligad|desligad|pront)[oa]s?\b/;
  it.each(PLANT_NAMES)('%s', (machine) => {
    const lines = [
      ...MACHINE_LINES.map((key) => pt(key, { machine })),
      partner('reasonService', { machine, time: '40 min' }),
      partner('bellServiceProposed', { machine, minutes: 40 }),
      partner('bellServiceDecided', { machine }),
      partner('bellServiceRefused', { machine }),
    ];
    for (const line of lines) expect(line).not.toMatch(AGREEING);
  });

  it('words a late order through the order, not the customer', () => {
    const line = partner('reasonForfeit', {
      customer: "Riverside Bakers' Cooperative",
      best: '91',
      minimum: '95',
    });
    expect(line).toMatch(/^O pedido de Riverside Bakers' Cooperative está atrasado/);
  });
});
