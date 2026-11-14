/** Read-time views of canonical English records. No reducer or saved object is changed. */
import {
  createTranslator,
  formatFixed,
  formatGrouped,
  getLocale,
  translate,
  upperFirst,
} from '../i18n';
import { EVENT_DECK, getEventDeck } from './eventDeck';
import { currentWording, legacyResults } from './legacyWording';
import { stewardDeckMessages } from './stewardDeck.messages';
import { HISTORY_NOTES, getHistoryNotes } from './history';
import { ERAS, getEras, IMPROVEMENTS, getImprovements } from './plans';
import { FORECASTS, getForecasts } from './forecasts';
import { LEGACY_BRIEFINGS, SHORT_TRIALS, TRIALS, getTrials } from './trials';
import { copy as trialCopy } from './trials.messages';
import { CROP_YEARS, getCropYears } from './cropYears';
import { FRONTS, getFronts, LONG_NIGHT_EVENT_ID } from './longNight';
import { FIRM_NAMES } from './contractors';
import { CHARACTERS, localizedCharacterTitle } from './record';
import { RANKS } from './scoring';
import {
  BRIEFS,
  CREW_PROFILES,
  CREW_ROLE_IDS,
  getBriefs,
  getPolicyLadders,
  getRedLines,
  getStandingConditions,
  localizedCrewMember,
  localizedRulingObjection,
  RULING_OBJECTIONS,
  POLICY_LADDERS,
  RED_LINES,
  STANDING_CONDITIONS,
} from './governance';
import { localizedStakeholderPhrase, stakeholderPhrase } from './stakeholders';
import { localizedResultChanges } from './describe';
import { effectChanges, withChanges } from './engine';
import { presentationMessages as messages } from './presentation.messages';
import type {
  ChronicleEventEffect,
  ChronicleNotice,
  CrewMember,
  Initiative,
  NoticeKind,
  PolicyLadder,
  StakeholderId,
} from './types';

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
/** An English-grouped whole number, as the engine's `whole()` writes it ("12,345"). */
const grouped = '\\d{1,3}(?:,\\d{3})+|\\d+';

/** Match the whole template. Only explicitly numeric slots accept saved values. */
function capture(value: string, template: string, fixed: Params = {}): Params | null {
  const names: string[] = [];
  const pattern = template
    .split(/(\{\w+\})/)
    .map((part) => {
      const name = /^\{(\w+)\}$/.exec(part)?.[1];
      if (!name) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (fixed[name] !== undefined) return fixed[name].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (!/^[ng]\d+$/.test(name)) return '(?!)';
      names.push(name);
      return name.startsWith('g') ? `(${grouped})` : `(${numeric})`;
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
      name.startsWith('g')
        ? formatGrouped(Number(value.replaceAll(',', '')))
        : formatFixed(Number(value), value.includes('.') ? value.split('.')[1].length : 0),
    ])
  );
  return createTranslator(messages, getLocale())(key, { ...fixed, ...localized });
}

/** The sentences a trial failure is written in since item 4.5 (trials.ts, `trialFailure`). */
const FAILURE_SENTENCES = [
  'failDispatch',
  'failEnergy',
  'failGrade',
  'failQuality',
  'failQc',
  'failCleanQuality',
  'failIncident',
  'cleanFail',
] as const satisfies readonly Key[];

/** Answers removed from the deck whose notices saves still hold, by event. */
const RETIRED_CHOICES: Record<string, readonly string[]> = { 'evt-standby-cover': ['floor'] };

const staticRules: Array<[NoticeKind, Key, Key]> = [
  ['ledger', 't0', 'b0'],
  ['ledger', 't1', 'b1'],
  ['ledger', 't1', 'shortfallBody'],
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
  // A wet year is dried; saves from before say "conditioned" (t12, t13).
  ['event', 'grainDried', 'b13'],
  ['ledger', 'qcReview', 'qcReviewBody'],
  ['ledger', 'qcReview', 'qcReviewOneBody'],
  ['trial', 't14', 'b14'],
  ['trial', 't15', 'b15'],
  ['initiative', 't16', 'b16'],
  ['initiative', 't17', 'b17'],
  ['initiative', 't18', 'b18'],
  ['initiative', 't19', 'b19'],
  ['trial', 't20', 'b20'],
  ['trial', 't21', 'b21'],
  ['trial', 't22', 'b22'],
  ['event', 'proposalWithdrawn', 'proposalWithdrawnBody'],
  ['era', 'adminLeaves', 'adminRestored'],
  ['era', 'adminLeaves', 'adminKept'],
  ['ledger', 'autofillOn', 'autofillOnBody'],
  ['ledger', 'autofillOff', 'autofillOffBody'],
  ['ledger', 'reserveDrawn', 'reserveCovered'],
  ['ledger', 'reserveDrawn', 'reserveShort'],
  // Training now reads "-25 points"; b14/b15 above keep older saves' "-25%".
  ['trial', 't14', 'trainingBody'],
  ['trial', 't15', 'trainingBody'],
  ['event', 'ductCleared', 'ductClearedBody'],
  ['event', 'ductReleased', 'ductReleasedBody'],
  ['ledger', 't5', 'forcedFundOnly'],
];

// ---------------------------------------------------------------------------
// Part three (governance.ts). The engine writes these sentences in English from
// the definitions; each is matched whole against its template, with every
// word slot filled from a known definition, and re-rendered from the matching
// presentation copy. Anything else is shown as stored.
// ---------------------------------------------------------------------------

type Option = [Key, Params, Params];
type Rendered = { title: string; body: string };

/** The one rendering whose English template is exactly `value`, or null. */
function only(value: string, options: readonly Option[]): string | null {
  const results = new Set<string>();
  for (const [key, raw, local] of options) {
    const values = capture(value, messages.en[key], raw);
    if (values) results.add(render(key, local, values));
  }
  return results.size === 1 ? [...results][0] : null;
}

const lower = (text: string) => text.toLowerCase();
/** The engine's own `capitalise`, so the English matches byte for byte. */
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function ladderPairs() {
  const local = getPolicyLadders();
  return POLICY_LADDERS.map((raw, index) => ({ raw, local: local[index] }));
}

function crewPairs(): Array<{ raw: CrewMember; local: CrewMember }> {
  return CREW_ROLE_IDS.flatMap((id) =>
    CREW_PROFILES[id].map((raw) => ({ raw, local: localizedCrewMember(raw) }))
  );
}

function partyPair(id: StakeholderId): Params {
  return {
    raw: capitalise(stakeholderPhrase(id)),
    local: upperFirst(localizedStakeholderPhrase(id)),
  };
}

/** Why a member votes as they do (`crewBallot`), in the current language. */
export function localizedBallotReason(reason: string, member: CrewMember | undefined): string {
  if (getLocale() === 'en') return reason;
  const options: Option[] = [
    ['ballotEager', {}, {}],
    ['ballotCautious', {}, {}],
    ['ballotUntouched', {}, {}],
    ...ladderPairs().flatMap(({ raw, local }): Option[] => [
      ['ballotLifts', { ladder: lower(raw.label) }, { ladder: lower(local.label) }],
      ['ballotStands', { ladder: lower(raw.label) }, { ladder: lower(local.label) }],
    ]),
    ...RULING_OBJECTIONS.map(
      (entry): Option => [
        'ballotRulingStands',
        { ruling: entry.ruling },
        { ruling: localizedRulingObjection(entry.mark) },
      ]
    ),
  ];
  const local = member ? localizedCrewMember(member) : undefined;
  // An unrecognised member's need and value are not guessed at.
  if (member && local && local !== member) {
    const need: Option[1] = { need: member.need.text };
    const localNeed: Option[1] = { need: local.need.text };
    options.push(
      ['ballotMet', need, localNeed],
      ['ballotCuts', need, localNeed],
      ['ballotToward', { value: member.value }, { value: local.value }],
      ['ballotAway', { value: member.value }, { value: local.value }]
    );
  }
  return only(reason, options) ?? reason;
}

/** Why a step cannot be proposed now (`policyBlockReason`), in the current language. */
export function localizedBlockReason(reason: string): string {
  if (getLocale() === 'en') return reason;
  const plans = getImprovements();
  return (
    only(reason, [
      ['blockStopped', {}, {}],
      ['blockAdministrator', {}, {}],
      ['blockStep', {}, {}],
      ['blockLockedOne', {}, {}],
      ['blockLockedMany', {}, {}],
      ['blockProposal', {}, {}],
      ['blockCost', {}, {}],
      ...IMPROVEMENTS.flatMap((plan): Option[] => {
        const local = plans.find((item) => item.id === plan.id);
        return local ? [['blockPlan', { label: plan.label }, { label: local.label }]] : [];
      }),
    ]) ?? reason
  );
}

/** A concession (`concessionFor`) is the member's own need text; shown in their copy. */
export function localizedConcession(text: string, member: CrewMember | undefined): string {
  if (!member || text !== member.need.concession) return text;
  return localizedCrewMember(member).need.concession;
}

/**
 * "Carried 4 to 1. Ladder: step (effect)." then, on a tie that carries, why,
 * and one sentence per outvoted or lifted member. Saves from before the tie
 * sentence have none, and translate as before.
 */
function carriedBody(
  body: string,
  ladder: ReturnType<typeof ladderPairs>[number],
  crew: ReturnType<typeof crewPairs>
): string | null {
  const [first, ...rest] = body.split(/(?<=\.) (?=The )/);
  const head = only(
    first,
    ladder.raw.rungs.flatMap((rung, index): Option[] => {
      const local = ladder.local.rungs[index];
      const raw = { ladder: ladder.raw.label, rung: lower(rung.label), effect: rung.effectText };
      const translated = {
        ladder: ladder.local.label,
        rung: lower(local.label),
        effect: local.effectText,
      };
      return [
        ['carried', raw, translated],
        ['carriedAbstain', raw, translated],
      ];
    })
  );
  if (head === null) return null;
  const parts = [head];
  for (const part of rest) {
    const translated = only(part, [
      ['tieOffRedLine', {}, {}],
      ['tieClearsCondition', {}, {}],
      ...crew.flatMap(({ raw, local }): Option[] => [
        [
          'outvoted',
          { role: lower(raw.role), need: raw.need.text },
          { role: local.role, need: local.need.text },
        ],
        ['objectionLifted', { role: lower(raw.role) }, { role: local.role }],
      ]),
    ]);
    if (translated === null) return null;
    parts.push(translated);
  }
  return parts.join(' ');
}

/** A crop year's return: the dispatch, then what the quota did. */
function returnBody(body: string): string | null {
  const [first, ...rest] = body.split(/(?<=\.) /);
  const head = only(first, [
    ['returnDispatched', {}, {}],
    ['returnDispatchedQuota', {}, {}],
  ]);
  if (head === null) return null;
  const parts = [head];
  for (const part of rest) {
    const translated = only(part, [
      ['returnMet', {}, {}],
      ['returnMissed', {}, {}],
      ['returnRaised', {}, {}],
      ['returnNext', {}, {}],
    ]);
    if (translated === null) return null;
    parts.push(translated);
  }
  return parts.join(' ');
}

/** One cause in the administrator's offer (`administrationCauses`), or null if unknown. */
function localizedAdministrationCause(
  savedCause: string,
  ladders: ReturnType<typeof ladderPairs>
): string | null {
  // Saved before D17's rewording: read in the wording the definitions use now.
  const cause = currentWording(savedCause);
  const year = /^the crop year (\d+) return$/.exec(cause);
  if (year) return render('causeReturn', {}, { n0: year[1] });
  for (const { raw, local } of ladders)
    if (cause === `the ${lower(raw.label)} policy`)
      return render('causePolicy', { ladder: lower(local.label) });
  const localDeck = getEventDeck();
  for (const event of EVENT_DECK) {
    const localEvent = localDeck.find((item) => item.id === event.id);
    for (const choice of event.choices) {
      if (cause !== `${event.title} (${lower(choice.label)})`) continue;
      const localChoice = localEvent?.choices.find((item) => item.id === choice.id);
      if (localEvent && localChoice) return `${localEvent.title} (${lower(localChoice.label)})`;
    }
  }
  return null;
}

function governanceCandidates(notice: ChronicleNotice): Rendered[] {
  const out: Rendered[] = [];
  const both = (title: string | null, body: string | null) => {
    if (title !== null && body !== null) out.push({ title, body });
  };
  const ladders = ladderPairs();
  const ladderOf = (id: PolicyLadder) => ladders.find((pair) => pair.raw.id === id)!;
  const lines = getRedLines();
  const lineCopy = RED_LINES.map((line, index) => {
    const ladder = ladderOf(line.ladder);
    return {
      line,
      party: partyPair(line.party),
      reason: { raw: capitalise(line.reason), local: upperFirst(lines[index].reason) },
      ladder: { raw: lower(ladder.raw.label), local: lower(ladder.local.label) },
      rung: {
        raw: lower(ladder.raw.rungs[line.rung].label),
        local: lower(ladder.local.rungs[line.rung].label),
      },
    };
  });

  // 27. A standing condition raised or cleared, anchored by its id.
  const condition = Object.values(STANDING_CONDITIONS).find((c) => c.id === notice.relatedId);
  if (notice.kind === 'ledger' && condition) {
    const local = getStandingConditions()[condition.id];
    const label: Option[1] = { label: condition.label };
    const localLabel: Option[1] = { label: local.label };
    both(
      only(notice.title, [['plain', label, localLabel]]),
      only(notice.body, [
        [
          'conditionRaisedBody',
          { effect: capitalise(condition.effectText), clear: condition.clearText },
          { effect: upperFirst(local.effectText), clear: local.clearText },
        ],
      ])
    );
    both(
      only(notice.title, [['conditionCleared', label, localLabel]]),
      only(notice.body, [['conditionClearedBody', {}, {}]])
    );
  }

  // 28. A red line's countdown issued, or acted on, anchored by the countdown's id.
  if (/^countdown-\d+$/.test(notice.relatedId ?? '')) {
    for (const copy of lineCopy) {
      const party: Option[1] = { party: copy.party.raw };
      const localParty: Option[1] = { party: copy.party.local };
      if (notice.kind === 'event')
        both(
          only(notice.title, [['redLineActs', party, localParty]]),
          only(notice.body, [
            ['redLineActsBody', { reason: copy.reason.raw }, { reason: copy.reason.local }],
          ])
        );
      if (notice.kind === 'forecast')
        both(
          only(notice.title, [['countdownIssued', party, localParty]]),
          only(notice.body, [
            [
              'countdownBody',
              { reason: copy.reason.raw, ladder: copy.ladder.raw, rung: copy.rung.raw },
              { reason: copy.reason.local, ladder: copy.ladder.local, rung: copy.rung.local },
            ],
          ])
        );
    }
  }

  if (notice.relatedId !== null) return out;

  if (notice.kind === 'event') {
    for (const copy of lineCopy)
      both(
        only(notice.title, [
          ['countdownWithdrawn', { party: copy.party.raw }, { party: copy.party.local }],
        ]),
        only(notice.body, [
          [
            'countdownWithdrawnBody',
            { ladder: copy.ladder.raw, rung: copy.rung.raw },
            { ladder: copy.ladder.local, rung: copy.rung.local },
          ],
        ])
      );
    const crew = crewPairs();
    for (const ladder of ladders) {
      const name: Option[1] = { ladder: lower(ladder.raw.label) };
      const localName: Option[1] = { ladder: lower(ladder.local.label) };
      both(
        only(notice.title, [['assemblyFails', name, localName]]),
        only(notice.body, [
          ['notCarried', {}, {}],
          ['notCarriedAbstain', {}, {}],
        ])
      );
      const carries = only(notice.title, [['assemblyCarries', name, localName]]);
      if (carries !== null) both(carries, carriedBody(notice.body, ladder, crew));
    }
    for (const { raw, local } of crew) {
      const role: Option[1] = { role: lower(raw.role) };
      const localRole: Option[1] = { role: local.role };
      const need: Option[1] = { concession: capitalise(raw.need.concession), need: raw.need.text };
      const localNeed: Option[1] = {
        concession: upperFirst(local.need.concession),
        need: local.need.text,
      };
      both(
        only(notice.title, [['needMet', role, localRole]]),
        only(notice.body, [['needMetBody', need, localNeed]])
      );
      both(
        only(notice.title, [['objectionMet', role, localRole]]),
        only(notice.body, [['objectionMetBody', need, localNeed]])
      );
      // A ruling that cut against what they value (item 4.10).
      for (const entry of RULING_OBJECTIONS.filter((e) => e.memberId === raw.id))
        both(
          only(notice.title, [
            [
              'rulingObjection',
              { ...role, ruling: entry.ruling },
              { ...localRole, ruling: localizedRulingObjection(entry.mark) },
            ],
          ]),
          only(notice.body, [['rulingObjectionBody', { value: raw.value }, { value: local.value }]])
        );
    }
  }

  // 32. The federation offers its administrator, naming what brought it (item 4.11).
  if (notice.kind === 'era' && only(notice.title, [['adminOffered', {}, {}]]) !== null) {
    const marker = ' Brought by: ';
    const at = notice.body.indexOf(marker);
    const head = at < 0 ? notice.body : notice.body.slice(0, at);
    const reason = only(head, [
      ['adminOfferMissed', {}, {}],
      ['adminOfferCool', {}, {}],
    ]);
    const causes =
      at < 0
        ? []
        : notice.body
            .slice(at + marker.length)
            .replace(/\.$/, '')
            .split('; ')
            .map((cause) => localizedAdministrationCause(cause, ladders));
    if (reason !== null && causes.every((cause) => cause !== null))
      both(
        render('adminOffered', {}),
        causes.length
          ? `${reason}${render('adminBroughtBy', { causes: causes.join('; ') })}`
          : reason
      );
  }

  // 32. The administrator arrives; an open proposal is set aside with it.
  if (notice.kind === 'era' && only(notice.title, [['adminArrives', {}, {}]]) !== null) {
    const title = render('adminArrives', {});
    const english = createTranslator(messages, 'en');
    // Body: the reason, then an optional set-aside proposal, then optional held warnings.
    const wait = english('adminWarningsWait', {});
    const tails = notice.body.endsWith(wait)
      ? [{ body: notice.body.slice(0, -wait.length), local: render('adminWarningsWait', {}) }]
      : [{ body: notice.body, local: '' }];
    for (const tail of tails) {
      for (const base of ['adminMissed', 'adminCool'] as const) {
        const plain = only(tail.body, [[base, {}, {}]]);
        both(title, plain === null ? null : plain + tail.local);
        for (const ladder of ladders) {
          const suffix = english('adminSetAside', { ladder: lower(ladder.raw.label) });
          if (!tail.body.endsWith(suffix)) continue;
          const head = only(tail.body.slice(0, -suffix.length), [[base, {}, {}]]);
          if (head !== null)
            both(
              title,
              head + render('adminSetAside', { ladder: lower(ladder.local.label) }) + tail.local
            );
        }
      }
    }
  }

  // 29. The partner's brief set.
  if (notice.kind === 'initiative') {
    const local = getBriefs();
    BRIEFS.forEach((brief, index) =>
      both(
        only(notice.title, [
          ['briefSet', { label: lower(brief.label) }, { label: local[index].label }],
        ]),
        only(notice.body, [
          ['briefSetBody', { rule: brief.rule }, { rule: upperFirst(local[index].rule) }],
        ])
      )
    );
  }

  // 30. A crop year's return filed.
  if (notice.kind === 'ledger' && only(notice.title, [['returnFiled', {}, {}]]) !== null)
    both(only(notice.title, [['returnFiled', {}, {}]]), returnBody(notice.body));

  return out;
}

/**
 * A ruling's result as the engine writes it now, its changes in brackets
 * (`effectChanges`), and as saves from before that have it, without. Standing
 * and a suspension are named only on a mill that was not suspended, so both
 * forms are offered.
 */
function withChangeForms(
  raw: string,
  local: string,
  effect: ChronicleEventEffect
): Array<{ raw: string; local: string }> {
  const forms = [{ raw, local }];
  for (const suspended of [false, true]) {
    const changes = effectChanges(effect, { suspended });
    if (changes)
      forms.push({
        raw: withChanges(raw, changes),
        local: withChanges(local, localizedResultChanges(effect, { suspended })),
      });
  }
  return forms;
}

/**
 * Unknown, custom and ambiguous records retain their exact original copy. A
 * notice saved before D17's rewording is read in the wording the definitions
 * use now (legacyWording.ts), so it is still recognised.
 */
export function localizedNotice(saved: ChronicleNotice): ChronicleNotice {
  const title = currentWording(saved.title);
  const body = currentWording(saved.body);
  const notice = title === saved.title && body === saved.body ? saved : { ...saved, title, body };
  if (getLocale() === 'en') return notice;
  return localizedCurrentNotice(notice);
}

function localizedCurrentNotice(notice: ChronicleNotice): ChronicleNotice {
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
          ['notCommissioned', 'notCommissionedBody', false],
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
        // retireMootEvents: taken off the desk without its default applied.
        for (const body of ['mootCrop', 'mootRuling'] as const)
          add(
            `${event.title}: no longer needed`,
            messages.en[body],
            render('noLongerNeeded', { title: local.title }),
            render(body, {})
          );
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
        // Answers since retired still read in saves (item 4.4 removed "Cover the roller floor").
        for (const id of RETIRED_CHOICES[event.id] ?? []) {
          const copy = (field: string) => {
            const key = `${event.id}.choices.${id}.${field}` as keyof typeof stewardDeckMessages.en;
            return { raw: stewardDeckMessages.en[key], local: translate(stewardDeckMessages, key) };
          };
          const label = copy('label');
          const result = copy('effect.result');
          if (label.raw && result.raw)
            add(
              `${event.title}: ${label.raw}`,
              result.raw,
              `${local.title}: ${label.local}`,
              result.local
            );
        }
        for (const choice of event.choices) {
          const translated = local.choices.find((item) => item.id === choice.id);
          if (!translated) continue;
          const outcomes = [
            ...withChangeForms(choice.effect.result, translated.effect.result, choice.effect),
            // What the answer did in a save from before its effect changed.
            ...legacyResults(event.id, choice.id),
            ...(choice.variants ?? []).flatMap((variant, index) => {
              const localVariant = translated.variants?.[index];
              return localVariant
                ? withChangeForms(
                    `${variant.because}. ${variant.effect.result}`,
                    `${localVariant.because}. ${localVariant.effect.result}`,
                    variant.effect
                  )
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
            if (choice.id === event.defaultChoiceId) {
              // The engine now writes "lapsed"; older saves say "the moment passed".
              add(
                `${event.title}: the moment passed`,
                outcome.raw,
                render('passedMoment', { title: local.title }),
                outcome.local
              );
              add(
                `${event.title}: lapsed`,
                outcome.raw,
                render('lapsed', { title: local.title }),
                outcome.local
              );
            }
          }
        }
      }
      if (notice.relatedId === null) {
        // A hand-over rules by the partner's brief, so any answer can be the
        // partner's (item 4.7); the default was the only one before.
        for (const choice of event.choices) {
          const translated = local.choices.find((item) => item.id === choice.id);
          if (!translated) continue;
          if (choice.delegates && choice.id !== event.defaultChoiceId) continue;
          // resolveChain deliberately omits the variant's because clause.
          const outcomes = [
            { raw: choice.effect.result, local: translated.effect.result, effect: choice.effect },
            ...legacyResults(event.id, choice.id).map((legacy) => ({
              ...legacy,
              effect: {} as ChronicleEventEffect,
            })),
            ...(choice.variants ?? []).flatMap((variant, index) =>
              translated.variants?.[index]
                ? [
                    {
                      raw: variant.effect.result,
                      local: translated.variants[index].effect.result,
                      effect: variant.effect,
                    },
                  ]
                : []
            ),
          ];
          for (const outcome of outcomes)
            for (const form of withChangeForms(
              choice.delegates ? outcome.raw : `${choice.label}. ${outcome.raw}`,
              choice.delegates ? outcome.local : `${translated.label}. ${outcome.local}`,
              outcome.effect
            ))
              add(
                `${event.title} (ruled by the AI partner)`,
                form.raw,
                render('ruled', { title: local.title }),
                form.local
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
      template(
        'forecastStruck',
        'struckNowBody',
        { title: definition.title },
        { title: local.title }
      );
      template('forecastPassed', 'passedBody', { title: definition.title }, { title: local.title });
      template(
        'forecastUnderWay',
        'underWayBody',
        { title: definition.title },
        { title: local.title }
      );
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
  // A trial's notice is read against the full and the short chronicle's
  // definitions: a short trial's briefing and figures are its own (item 4.2).
  for (const list of notice.kind === 'trial' ? [TRIALS, SHORT_TRIALS] : []) {
    const raw = list.find((trial) => trial.id === notice.relatedId);
    const local = getTrials(list).find((trial) => trial.id === notice.relatedId);
    if (raw && local) {
      add(raw.title, raw.pressureBeat, local.title, local.pressureBeat);
      const soon = capture(notice.title, messages.en.trialSoon, { title: raw.title });
      // Saved before item 4.5, the announcement was the briefing alone.
      if (soon && notice.body === raw.briefing)
        candidates.push({
          title: render('trialSoon', { title: local.title }, soon),
          body: local.briefing,
        });
      if (soon && notice.body === `${raw.briefing} ${raw.floor}`)
        candidates.push({
          title: render('trialSoon', { title: local.title }, soon),
          body: `${local.briefing} ${local.floor}`,
        });
      // Saved before item 4.1 re-tuned the goals: the old briefing, translated.
      for (const legacy of list === TRIALS ? (LEGACY_BRIEFINGS[raw.id] ?? []) : []) {
        if (soon && notice.body === `${legacy} ${raw.floor}`)
          candidates.push({
            title: render('trialSoon', { title: local.title }, soon),
            body: `${trialCopy(legacy)} ${local.floor}`,
          });
        const begunBefore = capture(notice.body, `${legacy} {n0} shifts.`);
        if (notice.title === `${raw.title} has begun` && begunBefore)
          candidates.push({
            title: render('trialBegun', { title: local.title }),
            body: render('begunBody', { briefing: trialCopy(legacy) }, begunBefore),
          });
      }
      // A failure that names the conditions that broke it (item 4.5), a sentence each.
      if (notice.title === `${raw.title}: trial failed`) {
        const sentences = notice.body.split(/(?<=\.) /);
        const localized = sentences.map((sentence) => {
          for (const key of FAILURE_SENTENCES) {
            const values = capture(sentence, messages.en[key]);
            if (values) return render(key, {}, values);
          }
          return null;
        });
        if (
          localized.every((sentence) => sentence !== null) &&
          sentences.some((sentence) => / broke it/.test(sentence))
        )
          candidates.push({
            title: render('trialFailed', { title: local.title }),
            body: localized.join(' '),
          });
      }
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
        // trials.ts groups both figures in English ('7,462 of 12,000 kg').
        const firstMatch = /^(\d+(?:,\d{3})*) of (\d+(?:,\d{3})*) kg dispatched\.$/.exec(parts[0]);
        const first = firstMatch ? { n0: firstMatch[1].replaceAll(',', '') } : null;
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
          /^Moisture about (-?\d+(?:\.\d+)?)%, protein about (-?\d+(?:\.\d+)?)%\.(?: Wheat recipes lose (\d+) quality points (until the grain is treated|unless the grain is dried first on the Tempering card)\.)?(?: Reinvestment \+(\d+)%\.)?$/.exec(
            notice.body
          );
        if (title && body) {
          const parts = [render('cropBase', {}, { n0: body[1], n1: body[2] })];
          // Saves keep the wording they were written in (rule 7).
          if (body[3]) {
            const key = body[4]?.startsWith('unless') ? 'cropPenaltyDried' : 'cropPenalty';
            parts.push(render(key, {}, { n0: body[3] }));
          }
          if (body[5]) parts.push(render('cropReinvestment', {}, { n0: body[5] }));
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
        template('held', 'heldBody', { label: raw.label }, { label: local.label });
        template('held', 'heldNowBody', { label: raw.label }, { label: local.label });
        template('fell', 'fellBody', { label: raw.label }, { label: local.label });
        template('fell', 'fellNowBody', { label: raw.label }, { label: local.label });
      }
    }
  }
  candidates.push(...governanceCandidates(notice));
  const unique = [
    ...new Map(candidates.map((candidate) => [JSON.stringify(candidate), candidate])).values(),
  ];
  return unique.length === 1 ? { ...notice, ...unique[0] } : notice;
}

export function localizedInitiative(saved: Initiative): Initiative {
  // Saved before D17's rewording: read in the wording the definitions use now.
  const summary = currentWording(saved.summary);
  const entry = summary === saved.summary ? saved : { ...saved, summary };
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
    return (
      translated('suppressSummary', 'suppressReason') ??
      translated('suppressSummary', 'suppressSafetyReason') ??
      translated('handCleanSummary', 'handCleanReason') ??
      entry
    );
  if (entry.kind === 'restore' && entry.targetId.length > 0)
    return translated('restoreSummary', 'restoreReason') ?? entry;
  if (entry.kind === 'install') {
    const raw = IMPROVEMENTS.find((plan) => plan.id === entry.targetId);
    const local = getImprovements().find((plan) => plan.id === entry.targetId);
    if (!raw || !local) return entry;
    const summary = only(entry.summary, [
      ['installSummary', { label: raw.label.toLowerCase() }, { label: local.label.toLowerCase() }],
    ]);
    // The conventional brief's sentence, or one naming the brief that ranked the plan.
    const localBriefs = getBriefs();
    const reason = only(entry.reason, [
      ['installReason', {}, {}],
      ...BRIEFS.flatMap((brief, index): Option[] => {
        const names: [Params, Params] = [
          { label: lower(brief.label) },
          { label: localBriefs[index].label },
        ];
        return [
          ['installBriefServes', ...names],
          ['installBriefServesYear', ...names],
          ['installBriefNone', ...names],
          ['installBriefNoneYear', ...names],
        ];
      }),
    ]);
    return summary !== null && reason !== null ? { ...entry, summary, reason } : entry;
  }
  if (entry.kind === 'mitigation' && /^forecast-\d+$/.test(entry.targetId)) {
    // Older saves say "above"; the engine now says "at or above", and names a non-conventional brief.
    const localBriefs = getBriefs();
    const reason = only(entry.reason, [
      ['mitigationReason', {}, {}],
      ['mitigationReasonAt', {}, {}],
      ...BRIEFS.map(
        (brief, index): Option => [
          'mitigationReasonBrief',
          { label: lower(brief.label) },
          { label: localBriefs[index].label },
        ]
      ),
    ]);
    if (reason === null) return entry;
    const candidates = Object.values(FORECASTS).flatMap((raw) => {
      const local = getForecasts()[raw.kind];
      const summary = only(entry.summary, [
        [
          'mitigationSummary',
          { label: raw.mitigationLabel, title: raw.title.toLowerCase() },
          { label: local.mitigationLabel, title: local.title.toLowerCase() },
        ],
      ]);
      return summary === null ? [] : [{ ...entry, summary, reason }];
    });
    return candidates.length === 1 ? candidates[0] : entry;
  }
  const localBriefs = getBriefs();
  const eventReason =
    entry.kind === 'event'
      ? only(entry.reason, [
          ['eventReason', {}, {}],
          ...BRIEFS.map(
            (brief, index): Option => [
              'eventBriefReason',
              { label: lower(brief.label), rule: brief.rule },
              { label: localBriefs[index].label, rule: localBriefs[index].rule },
            ]
          ),
        ])
      : null;
  if (entry.kind === 'event' && /^event-\d+$/.test(entry.targetId) && eventReason !== null) {
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
                reason: eventReason,
              },
            ]
          : [];
      })
    );
    return candidates.length === 1 ? candidates[0] : entry;
  }
  return entry;
}
