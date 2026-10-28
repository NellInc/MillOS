import { copy } from './epilogue.messages';
import { formatFixed } from '../i18n';
import { localizedMillCharacter } from './record';
/**
 * The epilogue (docs/CHRONICLE.md, system 24), after Awakening's closing
 * slides, which are chosen from the decisions made ("Alec ... conscripted"
 * becomes Ser Alec the Valiant). Each section shows its first slide whose
 * condition holds. Every slide is about an organisation or the mill, never a
 * person, and `steward.test.ts` plays seeded chronicles to prove every slide
 * can be reached: a slide that a more common mark always shadows is a reader in
 * name only.
 */
import { CERTIFIER_NAME, standingOf } from './certifier';
import { conditionMet, ENGINE_MARKS, millCharacter, type RecordContext } from './record';
import type { ChronicleCondition } from './types';

export interface EpilogueSlide {
  when: ChronicleCondition;
  text: string;
}

export interface EpilogueSection {
  id: string;
  title: string;
  slides: EpilogueSlide[];
}

export const EPILOGUE_SECTIONS: readonly EpilogueSection[] = [
  {
    id: 'long-night',
    title: 'The long night',
    slides: [
      {
        when: { marks: { all: ['held-intake', 'held-floor'] } },
        text: 'Both fronts held. The mill’s account of the long night was read at the federation’s meeting for years, and the intake and the switch room were shown to every new member mill.',
      },
      {
        when: { marks: { all: ['fell-intake'] } },
        text: 'The intake flooded on the long night. The grain stores were dried out over a fortnight, and the intake was rebuilt higher the next summer.',
      },
      {
        when: { marks: { all: ['fell-floor'] } },
        text: 'The roller floor went dark on the long night. The switchgear was rebuilt after the winter, and the federation lent the mill spare switchgear until it was.',
      },
    ],
  },
  {
    id: 'cover',
    title: 'The standby cover',
    slides: [
      {
        when: { marks: { all: ['cover-intake'] } },
        text: 'The standby fitters at the intake became a fixture of every harvest, and the growers timed their lorries by them.',
      },
      {
        when: { marks: { all: ['cover-yard'] } },
        text: 'The standby cover in the dispatch yard kept the lorries moving through every breakdown.',
      },
      {
        when: { marks: { all: ['cover-thin'] } },
        text: 'The standby cover stayed spread across the site, and every area learned to wait a little for it.',
      },
      {
        when: { marks: { all: ['cover-floor'] } },
        text: 'The standby fitters stayed on the roller floor, where the switch room never went a shift without them.',
      },
    ],
  },
  {
    id: 'growers',
    title: 'The growers',
    slides: [
      {
        when: { marks: { all: ['grower-advanced'] } },
        text: 'The hail-struck farm repaid its advance in two harvests and became the valley’s most careful seed grower. Its lots were the first the laboratory ever passed without a retest.',
      },
      {
        when: {
          marks: { all: ['grower-terminated'] },
          party: { id: 'growers', notTier: 'warm' },
        },
        text: 'The ended contract was talked about at every weighbridge for a decade. The hill farms sold the mill only what they could not sell elsewhere.',
      },
      {
        when: { party: { id: 'growers', tier: 'warm' } },
        text: 'The growers’ cooperative and the mill planned each harvest together.',
      },
      {
        when: { marks: { all: ['grower-docked'] } },
        text: 'The hail-struck farm kept its contract after the docked payment and never delivered a short lot again.',
      },
    ],
  },
  {
    id: 'haulier',
    title: 'Valley Haulage',
    slides: [
      {
        when: { marks: { all: ['haulier-replaced'] } },
        text: 'Valley Haulage lost the mill’s collections to a larger firm and sold its lorries within the year.',
      },
      {
        when: { marks: { all: ['haulage-shared'] } },
        text: 'The collections stayed split between Valley Haulage and a larger firm, and neither came to know the yard well.',
      },
      {
        when: { marks: { all: ['haulier-terminated'] } },
        text: 'Valley Haulage never ran for the mill again, and the drivers who knew the yard went with it.',
      },
      {
        when: { marks: { all: ['haulier-sheltered'] } },
        text: 'Valley Haulage rebuilt its depot on higher ground and painted the mill’s name on its lorry doors.',
      },
      {
        when: { marks: { all: ['haulier-suspended'] } },
        text: 'Valley Haulage served its crop year’s notice without a missed run, and the notice was quietly withdrawn.',
      },
    ],
  },
  {
    id: 'granary',
    title: 'The old granary',
    slides: [
      {
        when: { marks: { all: ['granary-village', 'promise-kept'] } },
        text: 'The village bakery kept the old granary and the pasta works got its east bin. Both still carry the mill’s lease plates.',
      },
      {
        when: { marks: { all: ['granary-village', 'promise-broken'] } },
        text: 'The village bakery kept the old granary. The pasta works told the federation that the mill’s promises were worth less than its deeds.',
      },
      {
        when: { marks: { all: ['granary-village'] } },
        text: 'The village bakery kept the old granary and, in time, outgrew it.',
      },
      {
        when: { marks: { all: ['granary-pasta'] } },
        text: 'The pasta works filled the old granary with semolina. The village bakery moved into a barn and later closed.',
      },
      {
        when: { marks: { all: ['granary-kept'] } },
        text: 'The seed merchant’s rent put a new roof on the old granary. The village never asked the mill for anything again.',
      },
    ],
  },
  {
    id: 'valley',
    title: 'The valley meeting',
    slides: [
      {
        when: { marks: { all: ['reserve-opened'] } },
        text: 'The valley remembered the rebate as the year the mill paid back.',
      },
      {
        when: { marks: { all: ['meeting-heard'] } },
        text: 'The meeting’s minutes record the mill answering for its own record, and the custom stuck.',
      },
      {
        when: { marks: { all: ['meeting-dismissed'] } },
        text: 'The unanswered meeting became a story the valley told about the mill.',
      },
    ],
  },
  {
    id: 'standards',
    title: CERTIFIER_NAME,
    slides: [
      {
        when: { suspended: true },
        text: 'The mill’s approval was still suspended when the chronicle closed. The school kitchens bought elsewhere until it was restored.',
      },
      {
        when: { marks: { all: ['log-backdated', 'reinstated'] } },
        text: 'The suspension and the reinstatement audit stayed in the county’s file, and every later auditor read them first.',
      },
      {
        when: { marks: { any: ['log-reported', 'log-recleaned'] }, minStanding: 5 },
        text: 'The gap in the cleaning log was the last one. The county’s auditors called the mill’s log the best kept in the district.',
      },
    ],
  },
  {
    id: 'counting',
    title: 'The sack supplier',
    slides: [
      {
        when: { marks: { all: ['sacks-audited'] } },
        text: 'Counting at the gate became the mill’s practice: every delivery, every bale.',
      },
      {
        when: { marks: { all: ['sacks-blacklisted'] } },
        text: 'The sack supplier dropped without a count never worked for the mill again, and the short-counting was never proved.',
      },
    ],
  },
  {
    id: 'contracts',
    title: 'Contracts',
    slides: [
      {
        when: { marks: { all: ['precedent-kept'] } },
        text: 'The mill yard became known as the place a firm in trouble could ask for time.',
      },
      {
        when: { marks: { all: ['precedent-refused'] } },
        text: 'Firms learned that the mill held them to their contracts, except Valley Haulage, which was talked about.',
      },
    ],
  },
  {
    id: 'customers',
    title: 'The city wholesaler',
    slides: [
      {
        when: { marks: { all: ['wholesaler-first'] } },
        text: 'The city wholesaler kept first call. Riverside Bakers’ Cooperative found a second mill and split its orders between the two.',
      },
      {
        when: { marks: { all: ['coop-terms'] } },
        text: 'The city wholesaler bought on cooperative terms, and later joined the federation as a member.',
      },
    ],
  },
  {
    id: 'plant',
    title: 'The hired sifter',
    slides: [
      {
        when: { marks: { all: ['hire-sifter-large'] } },
        text: 'The hired sifter’s coarse screen was blamed for a season of speckled flour long after it went back.',
      },
    ],
  },
];

export interface EpilogueEntry {
  id: string;
  title: string;
  text: string;
}

/**
 * The epilogue for this record: the mill's character first, then who made the
 * decisions if the AI partner made any, then one slide per section.
 */
export function epilogue(context: RecordContext): EpilogueEntry[] {
  const character = millCharacter(context);
  const standing = standingOf(context.certifier);
  const entries: EpilogueEntry[] = [
    {
      id: 'character',
      title: 'The mill',
      text: `The valley came to call it ${character.title}. ${CERTIFIER_NAME} rated the mill ${standing} of 9${context.certifier.suspended ? ', under suspension' : ''}.`,
    },
  ];
  const decisions = Object.values(context.marks).filter((mark) => !ENGINE_MARKS.includes(mark.id));
  const partner = decisions.filter((mark) => mark.actor === 'ai-partner').length;
  if (partner > 0)
    entries.push({
      id: 'partner',
      title: 'The AI partner',
      text:
        partner === decisions.length
          ? `The AI partner made every one of the ${decisions.length} decisions in the record.`
          : `The AI partner made ${partner} of the ${decisions.length} decisions in the record.`,
    });
  for (const section of EPILOGUE_SECTIONS) {
    const slide = section.slides.find((candidate) => conditionMet(context, candidate.when));
    if (slide) entries.push({ id: section.id, title: section.title, text: slide.text });
  }
  return entries;
}

export function localizedEpilogue(context: RecordContext): EpilogueEntry[] {
  const character = localizedMillCharacter(context);
  const standing = standingOf(context.certifier);
  const entries: EpilogueEntry[] = [
    {
      id: 'character',
      title: copy('The mill'),
      text: copy(
        'The valley came to call it {character}. {certifier} rated the mill {standing} of 9{suffix}.',
        {
          character: character.title,
          certifier: CERTIFIER_NAME,
          standing: formatFixed(standing),
          suffix: context.certifier.suspended ? copy(', under suspension') : '',
        }
      ),
    },
  ];
  const decisions = Object.values(context.marks).filter((mark) => !ENGINE_MARKS.includes(mark.id));
  const partner = decisions.filter((mark) => mark.actor === 'ai-partner').length;
  if (partner > 0)
    entries.push({
      id: 'partner',
      title: copy('The AI partner'),
      text:
        partner === decisions.length
          ? copy('The AI partner made every one of the {total} decisions in the record.', {
              total: formatFixed(decisions.length),
            })
          : copy('The AI partner made {partner} of the {total} decisions in the record.', {
              partner: formatFixed(partner),
              total: formatFixed(decisions.length),
            }),
    });
  for (const section of EPILOGUE_SECTIONS) {
    const slide = section.slides.find((candidate) => conditionMet(context, candidate.when));
    if (slide) entries.push({ id: section.id, title: copy(section.title), text: copy(slide.text) });
  }
  return entries;
}
