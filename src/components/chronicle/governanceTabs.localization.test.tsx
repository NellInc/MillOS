/**
 * Part three's tabs in Brazilian Portuguese (CLAUDE.md, Chronicle rule 7): no
 * string that governance.ts defines, and no sentence the engine writes about
 * the crew or the assembly, may reach a pt-BR reader in its English source.
 * The English tabs still show the definitions verbatim.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { setLocale } from '../../i18n';
import { closeShift, createInitialState, type ChronicleState } from '../../chronicle/engine';
import {
  BRIEFS,
  CREW_PROFILES,
  CREW_ROLE_IDS,
  POLICY_LADDERS,
  RED_LINES,
  STANDING_CONDITIONS,
  TEMPERAMENTS,
} from '../../chronicle/governance';
import type { StandingConditionId } from '../../chronicle/types';
import { useChronicleStore } from '../../stores/chronicleStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { PartnersTab } from './PartnersTab';
import { PolicyTab } from './PolicyTab';
import { ReturnsTab } from './ReturnsTab';

const chronicle = () => useChronicleStore.getState().chronicle;

/** Every string governance.ts defines for display. */
const DEFINED = [
  ...POLICY_LADDERS.flatMap((ladder) => [
    ladder.label,
    ...ladder.rungs.flatMap((rung) => [rung.label, rung.effectText]),
  ]),
  ...Object.values(STANDING_CONDITIONS).flatMap((c) => [c.label, c.effectText, c.clearText]),
  ...Object.values(TEMPERAMENTS).flatMap((t) => [t.label, t.rule]),
  ...CREW_ROLE_IDS.flatMap((id) =>
    CREW_PROFILES[id].flatMap((p) => [p.role, p.value, p.need.text, p.need.concession])
  ),
  ...RED_LINES.map((line) => line.reason),
  ...BRIEFS.flatMap((brief) => [brief.label, brief.rule]),
];

/** The engine's own wording around those strings (ballots, block reasons, initiative reasons). */
const ENGINE_WORDING = [
  'their need for',
  'is met another way',
  'cuts against',
  'what they value',
  'their objection on',
  'leaves them be',
  'either end',
  'does not touch them',
  'changed lately',
  'not running',
  'locked the policies',
  'one step at a time',
  'already before the assembly',
  'Routine event',
  'threshold',
  'brief',
];

/**
 * Proper names that stay as they are in every language (GLOSSARY.md, "Never
 * translate"). None of governance.ts's strings is one; the list is here so a
 * future proper noun is allowed by name rather than by loosening the check.
 */
const PROPER_NOUNS: readonly string[] = [];

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Everything a reader or a screen reader gets: text, accessible names and titles. */
function visible(root: HTMLElement): string {
  const attributes = [...root.querySelectorAll('[aria-label],[title]')].flatMap((element) => [
    element.getAttribute('aria-label') ?? '',
    element.getAttribute('title') ?? '',
  ]);
  // One entry per text node: textContent runs adjacent elements together
  // ("pointsScheduled"), which would hide a leaked word from the boundary check.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: string[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode.textContent ?? '');
  return [...texts, ...attributes].join('\n');
}

function leaks(text: string): string[] {
  return [...DEFINED, ...ENGINE_WORDING].filter(
    (english) =>
      !PROPER_NOUNS.includes(english) &&
      new RegExp(`(^|[^\\p{L}])${escape(english)}($|[^\\p{L}])`, 'iu').test(text)
  );
}

let minute = 0;
function evidence() {
  minute += 480;
  return {
    report: {
      id: `tabs-report-${minute}`,
      grade: 'B' as const,
      endedAtMinute: minute,
      metrics: {
        revenue: 2000,
        energyCost: 0,
        automationCost: 0,
        wasteCost: 0,
        maintenanceCost: 0,
        demurrageCost: 0,
        latePenalties: 0,
        dispatchedKg: 3000,
        qualityFailureKg: 0,
        incidentsResolved: 0,
        automaticActions: 0,
        commitmentMinutes: 0,
      },
    },
    orders: [],
    incidents: [],
    challengeActive: false,
    challengeHistory: [],
    qcTests: [],
  };
}

/** A partner on the standards brief guarding a 30% dust forecast, as the engine logs it. */
function guardedInitiatives(state: ChronicleState) {
  const closed = closeShift(
    {
      ...state,
      delegation: 2,
      governance: { ...state.governance, brief: 'standards' },
      modifiers: [
        {
          id: 'm',
          sourceId: 'test',
          label: 'Clean filters',
          remainingShifts: 9,
          forecastChance: -0.15,
        },
      ],
      forecasts: [
        {
          id: 'forecast-90',
          kind: 'dust_filter_pressure',
          issuedShift: state.shift,
          dueShift: state.shift + 5,
          chance: 0.3,
          mitigated: false,
          mitigatedBy: null,
          paidFund: 0,
          status: 'pending',
        },
      ],
    },
    evidence(),
    []
  ).state;
  return closed.initiatives;
}

/**
 * A chronicle with every part-three surface showing: a proposal with its
 * ballots (or, without one, the steps' block reasons), all six standing
 * conditions, a warning, a standing objection, a filed return and a logged
 * initiative on a brief.
 */
function setUp(profile: 0 | 1, withProposal: boolean) {
  act(() => {
    useChronicleStore.getState().sign(
      {
        grain: 'cooperative',
        plant: 'tired',
        customers: 'loyal',
        fortune: 'kind',
        mode: 'no_trials',
      },
      21
    );
  });
  const state = chronicle();
  const rich: ChronicleState = {
    ...state,
    ledger: {
      ...state.ledger,
      fund: { ...state.ledger.fund, charter: 5000 },
      knowHow: { ...state.ledger.knowHow, grades: 40 },
    },
  };
  const conditions = Object.keys(STANDING_CONDITIONS) as StandingConditionId[];
  act(() =>
    useChronicleStore.setState({
      chronicle: {
        ...rich,
        initiatives: guardedInitiatives(rich),
        governance: {
          ...rich.governance,
          crew: CREW_ROLE_IDS.map((id) => CREW_PROFILES[id][profile]),
          proposal: withProposal
            ? { ladder: 'stock', from: 1, to: 2, proposedShift: rich.shift, concessions: [] }
            : null,
          changedShift: {
            ...rich.governance.changedShift,
            orders: withProposal ? null : rich.shift,
          },
          objections: [{ memberId: 'yard', ladder: 'stock', rung: 1, raisedShift: 1 }],
          conditions: conditions.map((id) => ({ id, sinceShift: 0 })),
          countdowns: [
            {
              id: 'countdown-5',
              party: 'growers',
              ladder: 'intake',
              rung: 0,
              dueShift: rich.shift + 3,
            },
          ],
          returns: [
            {
              year: 0,
              shifts: 9,
              dispatchedKg: 27_000,
              quotaKg: null,
              met: null,
              nextQuotaKg: 24_300,
              qualityFailureKg: 0,
              energyCost: 120,
              averageGrade: 3,
              fundReinvested: 400,
              knowHowEarned: 6,
              policies: { maintenance: 0, intake: 2, stock: 2, orders: 0 },
              conditions,
            },
          ],
        },
      },
    })
  );
}

/** Each tab's text node by node (for the leak check) and as one run of text (for phrases). */
function renderTabs(): { nodes: string; flat: string } {
  const state = chronicle();
  const nodes: string[] = [];
  const flat: string[] = [];
  for (const Tab of [PolicyTab, ReturnsTab, PartnersTab]) {
    const { container, unmount } = render(<Tab state={state} />);
    nodes.push(visible(container));
    flat.push(container.textContent ?? '');
    unmount();
  }
  return { nodes: nodes.join('\n'), flat: flat.join('\n') };
}

describe('part three tabs in Brazilian Portuguese', { timeout: 30_000 }, () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState() });
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
  });

  for (const profile of [0, 1] as const)
    for (const withProposal of [true, false])
      it(`shows no governance English in pt-BR (crew profile ${profile}, ${withProposal ? 'a proposal open' : 'steps blocked'})`, () => {
        setUp(profile, withProposal);
        setLocale('pt-BR');
        const { nodes, flat: text } = renderTabs();
        expect(leaks(nodes)).toEqual([]);
        // The surfaces were really there, in Portuguese.
        expect(text).toContain('Carteira de pedidos');
        expect(text).toContain('x0,85');
        expect(text).toContain('Para resolver:');
        expect(text).toContain(withProposal ? 'Em votação na assembleia' : 'mudou há pouco');
        expect(text).toContain('Sob o administrador da federação');
        expect(text).toContain('da orientação Padrões em primeiro lugar');
      });

  it('shows the English definitions verbatim in English', () => {
    setUp(0, true);
    setLocale('en');
    const { nodes, flat: text } = renderTabs();
    // The control: the same check finds the English it exists to catch.
    expect(leaks(nodes)).toEqual(
      expect.arrayContaining([
        ...POLICY_LADDERS.flatMap((ladder) => [
          ladder.label,
          ...ladder.rungs.flatMap((rung) => [rung.label, rung.effectText]),
        ]),
        ...Object.values(STANDING_CONDITIONS).flatMap((c) => [c.label, c.effectText, c.clearText]),
        ...CREW_ROLE_IDS.flatMap((id) => [CREW_PROFILES[id][0].role, CREW_PROFILES[id][0].value]),
        'their need for',
        'threshold',
      ])
    );
    for (const ladder of POLICY_LADDERS)
      for (const rung of ladder.rungs) expect(text).toContain(`${rung.label}: ${rung.effectText}`);
    for (const condition of Object.values(STANDING_CONDITIONS))
      expect(text).toContain(
        `${condition.label}: ${condition.effectText}. To clear: ${condition.clearText}`
      );
    for (const id of CREW_ROLE_IDS) {
      const member = CREW_PROFILES[id][0];
      expect(text).toContain(`Values ${member.value}`);
      expect(text).toContain(
        `${TEMPERAMENTS[member.temperament].label}: ${TEMPERAMENTS[member.temperament].rule}`
      );
    }
    expect(text).toContain('Yard hand: it cuts against their need for room to turn a forklift');
    expect(text).toContain('Meet the need: mark out a second turning lane');
    expect(text).toContain('threshold of the standards first brief');
    expect(text).toContain(
      'Maintenance: run to failure; Intake: contracted growers only; Stock: strategic reserve; Order book: spot'
    );
  });
});
