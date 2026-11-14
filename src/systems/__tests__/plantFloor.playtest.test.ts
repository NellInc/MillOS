/**
 * Intake and incidents on the real tick (plan items 3.1, 3.5): a review
 * instrument beside plantMeasure.playtest.test.ts, whose `runPolicy` it drives
 * (the same stores, the same mirrored component calls; read that file's
 * header). Inert in the ordinary suite: each block runs only when its output
 * path is given (MILLOS_PLANT_INTAKE_OUT, MILLOS_PLANT_INCIDENT_OUT).
 *
 * Each arm answers one kind one way. Written per arm: the plant's outcome
 * (tonnes, orders on time, late and forfeited, net, grades) and the record's
 * own comparisons per kind (`compareProposal`, the figures the delegation
 * rule reads).
 */
import { writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import {
  extractDockPredicates,
  extractRoster,
  LINE_RATE,
  runPolicy,
  type ArmResult,
  type Policy,
} from './plantMeasure.playtest.test';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';
import { usePartnerProposalStore } from '../../stores/partnerProposalStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useChronicleStore } from '../../stores/chronicleStore';
import type { PartnerProposal, ProposalKind } from '../../simulation/partnerProposals';
import { INCIDENT_DELEGATION_EVIDENCE } from '../../simulation/incidentProposal';
import { DELEGATION_EVIDENCE } from '../../simulation/partnerProposals';

vi.setConfig({ testTimeout: 3_600_000 });

const INTAKE_OUT = process.env.MILLOS_PLANT_INTAKE_OUT;
/**
 * The sprouted intake arms run twenty shifts, the length their evidence was
 * measured at (partnerProposals.ts DELEGATION_EVIDENCE.intake); the other
 * suites keep MILLOS_PLANT_MEASURE_SHIFTS. MILLOS_PLANT_INTAKE_SHIFTS overrides.
 */
const SPROUTED_INTAKE_SHIFTS = Number(process.env.MILLOS_PLANT_INTAKE_SHIFTS ?? 20);
const INCIDENT_OUT = process.env.MILLOS_PLANT_INCIDENT_OUT;
const TEMPER_OUT = process.env.MILLOS_PLANT_TEMPER_OUT;
const WHOLE_SHIFTS = Number(process.env.MILLOS_PLANT_MEASURE_SHIFTS ?? 10);

const git = (command: string) => {
  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
};

/** The orders of a run by id, as last seen (the campaign keeps only its last 30). */
function orderLedger() {
  const seen = new Map<
    string,
    { minimum: number; due: number; completed: number | null; forfeited: boolean; accepted: number }
  >();
  const observe = () => {
    const campaign = useOperationsCampaignStore.getState();
    for (const o of campaign.orders)
      seen.set(o.id, {
        minimum: o.recipe.minimumQuality,
        due: o.dueAtMinute,
        completed: o.completedAtMinute ?? null,
        forfeited: o.forfeitedAtMinute !== undefined,
        accepted: seen.get(o.id)?.accepted ?? campaign.elapsedMinutes,
      });
  };
  return { seen, observe };
}

let parsed: [ReturnType<typeof extractRoster>, ReturnType<typeof extractDockPredicates>] | null =
  null;
const sources = () => (parsed ??= [extractRoster(), extractDockPredicates()]);

type Summary = ReturnType<typeof summarise>;

function summarise(
  policy: Policy,
  result: ArmResult,
  proposals: PartnerProposal[],
  strongAfterTurn: { minimum: number; due: number; completed: number | null; forfeited: boolean }[],
  turnMinute: number | null
) {
  const whole = result.rows.filter((row) => !row.partial);
  const byKind = (kind: ProposalKind) => {
    const ofKind = proposals.filter((p) => p.kind === kind);
    const compared = ofKind.filter((p) => p.status === 'resolved' && p.comparison);
    const tally = (pick: (p: PartnerProposal) => string, from: PartnerProposal[]) =>
      from.reduce<Record<string, number>>((acc, p) => {
        acc[pick(p)] = (acc[pick(p)] ?? 0) + 1;
        return acc;
      }, {});
    return {
      raised: ofKind.length,
      compared: compared.length,
      partnerChoice: tally((p) => p.defaultOptionId, ofKind),
      chosen: tally((p) => p.resolution?.optionId ?? 'open', ofKind),
      best: tally((p) => p.comparison!.bestOptionId ?? 'tie', compared),
      nonDefaultBest: compared.filter(
        (p) => p.comparison!.bestOptionId && p.comparison!.bestOptionId !== p.defaultOptionId
      ).length,
      defaultBest: compared.filter((p) => p.comparison!.bestOptionId === p.defaultOptionId).length,
      notRun: ofKind.filter((p) => p.resolution && !p.resolution.ran).length,
      first: ofKind[0] ? { options: ofKind[0].options, facts: ofKind[0].facts } : null,
    };
  };
  const incidents = useOperationsCampaignStore.getState().incidents;
  return {
    label: policy.label,
    shippedKg: result.totals.shippedKg,
    ordersOnTime: result.totals.ordersOnTime,
    ordersLate: result.totals.ordersLate,
    ordersForfeited: result.totals.ordersForfeited,
    net: result.totals.net,
    latePenalties: result.totals.latePenalties,
    demurrage: result.totals.demurrageCost,
    qualityFailureKg: result.totals.qualityFailureKg,
    grades: whole.map((row) => row.grade ?? '-').join(''),
    programmesAccepted: result.end.programmesAccepted,
    shippedByShift: whole.map((row) => row.shippedKg),
    netByShift: whole.map((row) => row.net),
    minProductQualityByShift: whole.map((row) => row.minProductQuality),
    turnMinute,
    strongWhiteAfterTurn: {
      orders: strongAfterTurn.length,
      onTime: strongAfterTurn.filter((o) => o.completed !== null && o.completed <= o.due).length,
      late: strongAfterTurn.filter((o) => o.completed !== null && o.completed > o.due).length,
      forfeited: strongAfterTurn.filter((o) => o.forfeited).length,
    },
    intake: byKind('intake'),
    incident: byKind('incident'),
    temper: byKind('temper'),
    energyCost: result.totals.energyCost,
    noGrainMinutes: result.totals.noGrainMinutes,
    incidents: incidents.map((i) => ({
      kind: i.kind,
      origin: i.origin ?? null,
      phase: i.phase,
      response: i.response ?? null,
      started: i.startedAtMinute,
      resolved: i.resolvedAtMinute,
    })),
    materialBalanceErrorKg: result.end.materialBalanceErrorKg,
  };
}

function floorRun(
  policy: Policy,
  shifts: number,
  out: Record<string, unknown>,
  path: string,
  onTick?: () => void
): Summary {
  const ledger = new Map<string, PartnerProposal>();
  const stop = usePartnerProposalStore.subscribe((state) => {
    for (const proposal of state.proposals) ledger.set(proposal.id, proposal);
  });
  const orders = orderLedger();
  let turnMinute: number | null = null;
  let result: ArmResult;
  try {
    result = runPolicy(policy, STANDARD_GAME_SPEED, shifts, ...sources(), () => {
      orders.observe();
      if (
        turnMinute === null &&
        policy.cropTurn !== undefined &&
        policy.charter &&
        policy.charter !== 'typical' &&
        useChronicleStore.getState().chronicle.crop?.kind === policy.charter
      )
        turnMinute = useOperationsCampaignStore.getState().elapsedMinutes;
      onTick?.();
    });
  } finally {
    stop();
  }
  const strong = [...orders.seen.values()].filter(
    (o) => o.minimum >= 95 && (turnMinute === null || o.accepted >= turnMinute)
  );
  const summary = summarise(policy, result, [...ledger.values()], strong, turnMinute);
  out[policy.label] = { policy, summary, rows: result.rows };
  out.provenance ??= {
    commit: git('git rev-parse HEAD'),
    modifiedFiles: git('git status --porcelain')?.split('\n').filter(Boolean).length ?? null,
  };
  writeFileSync(path, JSON.stringify(out, null, 1));
  process.stdout.write(
    `${policy.label} ${JSON.stringify({ ...summary, intake: { ...summary.intake, first: undefined }, temper: { ...summary.temper, first: undefined } })}\n`
  );
  expect(Math.abs(result.end.materialBalanceErrorKg)).toBeLessThan(0.001);
  return summary;
}

const noInput = (label: string): Policy => ({
  label,
  accepts: false,
  repairs: false,
  lineRate: LINE_RATE,
  service: false,
  proposals: 'leave',
});

const made = (s: Summary) => s.strongWhiteAfterTurn.onTime + s.strongWhiteAfterTurn.late;

describe.skipIf(!INTAKE_OUT)('intake: accept, blend or refuse a lot on its readings', () => {
  const out: Record<string, unknown> = { instrument: 'plan item 3.1' };
  // A chronicle's year turns: two typical shifts fill the silos with sound
  // grain, then the year is sprouted.
  const sprouted = (label: string, extra: Partial<Policy> = {}): Policy => ({
    ...noInput(label),
    charter: 'sprouted',
    cropTurn: Number(process.env.MILLOS_PLANT_INTAKE_TURN ?? 2),
    ...extra,
  });
  const only = process.env.MILLOS_PLANT_INTAKE_ONLY?.split('|');
  const wants = (label: string) => !only || only.includes(label);

  it.skipIf(!wants('p'))('no charter: the intake changes nothing, to the kilogram', () => {
    const on = floorRun(noInput('p'), WHOLE_SHIFTS, out, INTAKE_OUT!);
    const off = floorRun(
      { ...noInput('p-intake-off'), intake: false },
      WHOLE_SHIFTS,
      out,
      INTAKE_OUT!
    );
    expect(on.intake.raised).toBe(0);
    expect(on.shippedByShift).toEqual(off.shippedByShift);
    expect(on.netByShift).toEqual(off.netByShift);
    expect(on.grades).toBe(off.grades);
    expect(on.ordersLate).toBe(0);
    expect(on.grades).toBe('A'.repeat(WHOLE_SHIFTS));
  });

  it.skipIf(!wants('s'))(
    'a sprouted year after a sound one: old rule, accept, blend, refuse, partner',
    () => {
      // The length DELEGATION_EVIDENCE.intake was measured at. At ten shifts
      // the sprouted year has barely begun to tell: deciding at once makes 13
      // strong-white orders, as accepting does, and the assertions below fail
      // (13 > 13) though nothing is wrong.
      const shifts = SPROUTED_INTAKE_SHIFTS;
      const before = floorRun(
        sprouted('s-intake-off', { intake: false }),
        shifts,
        out,
        INTAKE_OUT!
      );
      const accept = floorRun(
        sprouted('s-accept', { intakeAnswer: 'accept' }),
        shifts,
        out,
        INTAKE_OUT!
      );
      const blend = floorRun(
        sprouted('s-blend', { intakeAnswer: 'blend' }),
        shifts,
        out,
        INTAKE_OUT!
      );
      const refuse = floorRun(
        sprouted('s-refuse', { intakeAnswer: 'refuse' }),
        shifts,
        out,
        INTAKE_OUT!
      );
      const partner = floorRun(sprouted('s-partner'), shifts, out, INTAKE_OUT!);
      // Asked, but each card answered with the partner's own choice at once:
      // the cost of the window apart from the choice.
      const pressed = floorRun(
        sprouted('s-partner-pressed', { intakeAnswer: 'partner' }),
        shifts,
        out,
        INTAKE_OUT!
      );
      // The same with intake on "decide and tell me": no lot waits at the intake.
      const decided = floorRun(
        sprouted('s-partner-decide', { proposals: 'delegate' }),
        shifts,
        out,
        INTAKE_OUT!
      );
      // On the old plant-wide rule no strong-white order taken after the turn is made.
      expect(made(before)).toBe(0);
      // The partner blends or refuses the lots that would tip the silos under
      // the sprouted band. Deciding at once it makes strong-white orders that
      // accepting straight does not; asked, the lot waits out the window first.
      expect(made(decided)).toBeGreaterThan(made(accept));
      expect(made(pressed)).toBeGreaterThan(made(accept));
      expect(made(partner)).toBeGreaterThanOrEqual(made(accept));
      expect(partner.net).toBeGreaterThan(accept.net);
      const turnedAway = (partner.intake.chosen.refuse ?? 0) + (partner.intake.chosen.blend ?? 0);
      expect(turnedAway).toBeGreaterThan(0);
      // Refusing every lot drains the silos: worse than either.
      expect(made(refuse)).toBeLessThan(made(partner));
      expect(blend.intake.raised).toBeGreaterThan(0);
      // The delegation rule (partnerProposals.ts DELEGATION_EVIDENCE.intake).
      const evidence = DELEGATION_EVIDENCE.intake;
      const arms: Record<string, Summary> = { 's-partner': partner, 's-accept': accept };
      expect(
        arms[evidence.otherBetter!.replace('floor:', '')].intake.nonDefaultBest
      ).toBeGreaterThan(0);
      expect(arms[evidence.otherWorse!.replace('floor:', '')].intake.defaultBest).toBeGreaterThan(
        0
      );
    }
  );

  it.skipIf(!wants('w'))('a wet year from the start: the per-lot stamp changes nothing', () => {
    const wet = (label: string, extra: Partial<Policy> = {}): Policy => ({
      ...noInput(label),
      charter: 'wet',
      ...extra,
    });
    // Tempered as it comes (plan item 7.7), so the intake is the only change.
    const on = floorRun(
      wet('w-intake', { temperAnswer: 'standard' }),
      WHOLE_SHIFTS,
      out,
      INTAKE_OUT!
    );
    const off = floorRun(wet('w-intake-off', { intake: false }), WHOLE_SHIFTS, out, INTAKE_OUT!);
    // Every lot is wet, so every lot's stamp is the year's: the partner accepts
    // each one and the plant ships what it shipped on the plant-wide rule.
    expect(on.intake.chosen.refuse ?? 0).toBe(0);
    expect(on.shippedByShift).toEqual(off.shippedByShift);
    expect(on.ordersForfeited).toBe(off.ordersForfeited);
  });

  it.skipIf(!wants('t'))('a typical year: accepting is right, refusing only costs', () => {
    const typical = (label: string, extra: Partial<Policy> = {}): Policy => ({
      ...noInput(label),
      charter: 'typical',
      ...extra,
    });
    const accept = floorRun(
      typical('t-accept', { intakeAnswer: 'accept' }),
      WHOLE_SHIFTS,
      out,
      INTAKE_OUT!
    );
    const refuse = floorRun(
      typical('t-refuse', { intakeAnswer: 'refuse' }),
      WHOLE_SHIFTS,
      out,
      INTAKE_OUT!
    );
    expect(refuse.demurrage).toBeGreaterThan(accept.demurrage);
    expect(refuse.intake.nonDefaultBest).toBe(0);
    expect(refuse.intake.best.accept ?? 0).toBeGreaterThan(0);
  });
});

describe.skipIf(!TEMPER_OUT)('tempering: the wet year dried first or tempered as it comes', () => {
  const out: Record<string, unknown> = { instrument: 'plan item 7.7' };
  const shifts = Number(process.env.MILLOS_PLANT_TEMPER_SHIFTS ?? WHOLE_SHIFTS);
  const only = process.env.MILLOS_PLANT_TEMPER_ONLY?.split('|');
  const wants = (label: string) => !only || only.includes(label);
  const arm = (label: string, extra: Partial<Policy>): Policy => ({ ...noInput(label), ...extra });
  const row = (s: Summary) => ({
    label: s.label,
    strongWhite: s.strongWhiteAfterTurn,
    forfeits: s.ordersForfeited,
    onTime: s.ordersOnTime,
    late: s.ordersLate,
    energy: Math.round(s.energyCost * 100) / 100,
    net: s.net,
    grades: s.grades,
    noGrainMinutes: s.noGrainMinutes,
    cards: s.temper.raised,
    chosen: s.temper.chosen,
    partnerChoice: s.temper.partnerChoice,
    best: s.temper.best,
    nonDefaultBest: s.temper.nonDefaultBest,
    defaultBest: s.temper.defaultBest,
  });
  const table = (label: string, rows: Summary[]) => {
    out[`table-${label}`] = rows.map(row);
    writeFileSync(TEMPER_OUT!, JSON.stringify(out, null, 1));
    process.stdout.write(`TEMPER-TABLE ${label} ${JSON.stringify(rows.map(row))}\n`);
  };

  it.skipIf(!wants('tw'))('a wet year from the start: never, always, the partner, skilled', () => {
    const wet = (label: string, extra: Partial<Policy> = {}) =>
      arm(label, { charter: 'wet', ...extra });
    const runs = [
      floorRun(wet('tw-standard', { temperAnswer: 'standard' }), shifts, out, TEMPER_OUT!),
      floorRun(wet('tw-dry', { temperAnswer: 'dry-first' }), shifts, out, TEMPER_OUT!),
      floorRun(wet('tw-partner'), shifts, out, TEMPER_OUT!),
      floorRun(wet('tw-asked', { temperAnswer: 'lapse' }), shifts, out, TEMPER_OUT!),
      floorRun(wet('tw-skilled', { temperAnswer: 'skilled' }), shifts, out, TEMPER_OUT!),
    ];
    table('wet', runs);
    for (const s of runs) expect(s.temper.raised).toBeGreaterThan(0);
    // Dried, the wet year's strong white is made; tempered as it comes, none is.
    expect(made(runs[1])).toBeGreaterThan(made(runs[0]));
  });

  it.skipIf(!wants('twm'))('a wet year with moisture meters installed', () => {
    const wet = (label: string, extra: Partial<Policy> = {}) =>
      arm(label, { charter: 'wet', chroniclePlans: ['moisture-meters'], ...extra });
    const runs = [
      floorRun(wet('twm-standard', { temperAnswer: 'standard' }), shifts, out, TEMPER_OUT!),
      floorRun(wet('twm-dry', { temperAnswer: 'dry-first' }), shifts, out, TEMPER_OUT!),
      floorRun(wet('twm-partner'), shifts, out, TEMPER_OUT!),
      floorRun(wet('twm-skilled', { temperAnswer: 'skilled' }), shifts, out, TEMPER_OUT!),
    ];
    table('wet-meters', runs);
  });

  it.skipIf(!wants('twt'))('a wet year after two sound shifts', () => {
    const wet = (label: string, extra: Partial<Policy> = {}) =>
      arm(label, { charter: 'wet', cropTurn: 2, ...extra });
    const runs = [
      floorRun(wet('twt-standard', { temperAnswer: 'standard' }), shifts, out, TEMPER_OUT!),
      floorRun(wet('twt-dry', { temperAnswer: 'dry-first' }), shifts, out, TEMPER_OUT!),
      floorRun(wet('twt-partner'), shifts, out, TEMPER_OUT!),
      floorRun(wet('twt-skilled', { temperAnswer: 'skilled' }), shifts, out, TEMPER_OUT!),
    ];
    table('wet-turn', runs);
  });

  it.skipIf(!wants('td'))('a dry year: no card, as before', () => {
    const runs = [floorRun(arm('td-partner', { charter: 'dry' }), shifts, out, TEMPER_OUT!)];
    table('dry', runs);
    expect(runs[0].temper.raised).toBe(0);
  });

  it.skipIf(!wants('rule'))('the delegation rule for temper holds against these arms', () => {
    const arms = out as Record<string, { summary?: Summary } | undefined>;
    const evidence = DELEGATION_EVIDENCE.temper;
    const better = evidence.otherBetter
      ? arms[evidence.otherBetter.replace('floor:', '')]?.summary
      : undefined;
    const worse = evidence.otherWorse
      ? arms[evidence.otherWorse.replace('floor:', '')]?.summary
      : undefined;
    out.rule = {
      ...evidence,
      nonDefaultBestThere: better?.temper.nonDefaultBest ?? null,
      defaultBestThere: worse?.temper.defaultBest ?? null,
    };
    writeFileSync(TEMPER_OUT!, JSON.stringify(out, null, 1));
    if (better) expect(better.temper.nonDefaultBest).toBeGreaterThan(0);
    if (worse) expect(worse.temper.defaultBest).toBeGreaterThan(0);
    // A null claim is a claim (review 2): no arm of this suite found it.
    for (const [label, arm] of Object.entries(arms)) {
      const summary = arm?.summary;
      if (!summary?.temper) continue;
      if (!evidence.otherBetter) expect(summary.temper.nonDefaultBest, label).toBe(0);
      if (!evidence.otherWorse) expect(summary.temper.defaultBest, label).toBe(0);
    }
  });
});

describe.skipIf(!INCIDENT_OUT)('incidents: two answers, neither right in every programme', () => {
  const out: Record<string, unknown> = { instrument: 'plan item 3.5' };
  const shifts = Number(process.env.MILLOS_PLANT_INCIDENT_SHIFTS ?? 3);
  const arm = (
    label: string,
    incident: NonNullable<Policy['incident']>,
    extra: Partial<Policy> = {}
  ): Policy => ({ ...noInput(label), incident, ...extra });
  const only = process.env.MILLOS_PLANT_INCIDENT_ONLY?.split('|');
  const wants = (label: string) => !only || only.includes(label);

  it.skipIf(!wants('dt'))(
    'a delayed truck: relief when an order is due soon, wait with slack',
    () => {
      // Due soon: a programme whose due windows are a quarter shorter (the
      // harness's dueScale), so a truck an hour late can make an order late.
      const due = { kind: 'delayed_truck', when: 'due-soon', fromShift: 1 } as const;
      // (dueScale scales orders the harness's own Accept takes, so it accepts.)
      const tight: Partial<Policy> = { dueScale: 0.75, accepts: true };
      const slack = { kind: 'delayed_truck', when: 'slack', fromShift: 1 } as const;
      const runs = [
        floorRun(arm('dt-due-wait', { ...due, answer: 'wait' }, tight), shifts, out, INCIDENT_OUT!),
        floorRun(
          arm('dt-due-relief', { ...due, answer: 'relief' }, tight),
          shifts,
          out,
          INCIDENT_OUT!
        ),
        floorRun(arm('dt-slack-wait', { ...slack, answer: 'wait' }), shifts, out, INCIDENT_OUT!),
        floorRun(
          arm('dt-slack-relief', { ...slack, answer: 'relief' }),
          shifts,
          out,
          INCIDENT_OUT!
        ),
        floorRun(arm('dt-due-partner', due, tight), shifts, out, INCIDENT_OUT!),
        floorRun(arm('dt-slack-partner', slack), shifts, out, INCIDENT_OUT!),
      ];
      for (const s of runs) {
        expect(s.incident.raised).toBe(1);
        expect(s.incidents.every((i) => i.phase === 'resolved')).toBe(true);
      }
      expect(runs[0].incident.best.relief ?? 0).toBe(1);
      expect(runs[3].incident.best.wait ?? 0).toBe(1);
    }
  );

  it.skipIf(!wants('df'))(
    'dust filter: change it on a worn line, run on at pressure on a fresh one',
    () => {
      const worn = { kind: 'dust_filter_pressure', when: 'worn', fromShift: 1 } as const;
      const fresh = { kind: 'dust_filter_pressure', when: 'fresh', fromShift: 1 } as const;
      // Worn: the line is never serviced (every service answered "run on").
      const wornShifts = Number(process.env.MILLOS_PLANT_INCIDENT_WORN_SHIFTS ?? 8);
      const runs = [
        floorRun(
          arm(
            'df-worn-run-on',
            { ...worn, answer: 'run-on' },
            { proposals: 'run-on', plantIncidents: false }
          ),
          wornShifts,
          out,
          INCIDENT_OUT!
        ),
        floorRun(
          arm(
            'df-worn-change',
            { ...worn, answer: 'change-filter' },
            { proposals: 'run-on', plantIncidents: false }
          ),
          wornShifts,
          out,
          INCIDENT_OUT!
        ),
        floorRun(
          arm('df-fresh-run-on', { ...fresh, answer: 'run-on' }),
          shifts,
          out,
          INCIDENT_OUT!
        ),
        floorRun(
          arm('df-fresh-change', { ...fresh, answer: 'change-filter' }),
          shifts,
          out,
          INCIDENT_OUT!
        ),
        floorRun(
          arm('df-worn-partner', worn, { proposals: 'run-on', plantIncidents: false }),
          wornShifts,
          out,
          INCIDENT_OUT!
        ),
        floorRun(arm('df-fresh-partner', fresh), shifts, out, INCIDENT_OUT!),
      ];
      for (const s of runs) expect(s.incident.raised).toBe(1);
      expect(runs[0].incident.best['change-filter'] ?? 0).toBe(1);
      expect(runs[3].incident.best['run-on'] ?? 0).toBe(1);
    }
  );

  it.skipIf(!wants('ch'))(
    'the player route: a started challenge raises the plant incident and its card',
    () => {
      let started = false;
      const summary = floorRun(noInput('challenge-power'), 2, out, INCIDENT_OUT!, () => {
        const campaign = useOperationsCampaignStore.getState();
        if (!started && campaign.reports.length >= 1)
          started = campaign.startChallenge('power_recovery', 'operator');
      });
      expect(started).toBe(true);
      expect(summary.incident.raised).toBe(1);
      expect(summary.incident.first?.options.map((o) => o.id)).toEqual(['shed', 'ride']);
      const sag = summary.incidents.find((i) => i.kind === 'power_sag');
      expect(sag?.origin).toBe('plant');
      expect(sag?.phase).toBe('resolved');
      const history = useOperationsCampaignStore.getState().challengeHistory;
      out['challenge-power-history'] = history;
      writeFileSync(INCIDENT_OUT!, JSON.stringify(out, null, 1));
      expect(history.at(-1)?.challengeId).toBe('power_recovery');
      // Its goal is judged as before: 1,000 kg shipped within 360 game minutes.
      expect(history.at(-1)?.status).toBe('completed');
    }
  );

  it.skipIf(!wants('bo'))(
    'an ignored wear warning on a mill raises a bearing overheat, which ends',
    () => {
      const runOn: Policy = { ...noInput('q-bearing'), proposals: 'run-on' };
      const summary = floorRun(runOn, WHOLE_SHIFTS, out, INCIDENT_OUT!);
      // The control: the same arm with no plant incident raised.
      floorRun(
        { ...runOn, label: 'q-bearing-off', plantIncidents: false },
        WHOLE_SHIFTS,
        out,
        INCIDENT_OUT!
      );
      const bearings = summary.incidents.filter((i) => i.kind === 'bearing_overheat');
      expect(bearings.length).toBeGreaterThan(0);
      for (const b of bearings) {
        expect(b.origin).toBe('plant');
        expect(b.phase).toBe('resolved');
      }
    }
  );

  it('the delegation rule per incident kind holds against these arms', () => {
    const arms = out as Record<string, { summary?: Summary } | undefined>;
    const verdicts: Record<string, unknown> = {};
    for (const [kind, evidence] of Object.entries(INCIDENT_DELEGATION_EVIDENCE)) {
      const better = evidence.otherBetter ? arms[evidence.otherBetter]?.summary : undefined;
      const worse = evidence.otherWorse ? arms[evidence.otherWorse]?.summary : undefined;
      verdicts[kind] = {
        ...evidence,
        nonDefaultBestThere: better?.incident.nonDefaultBest ?? null,
        defaultBestThere: worse?.incident.defaultBest ?? null,
      };
      if (better) expect(better.incident.nonDefaultBest).toBeGreaterThan(0);
      if (worse) expect(worse.incident.defaultBest).toBeGreaterThan(0);
    }
    out.rule = verdicts;
    writeFileSync(INCIDENT_OUT!, JSON.stringify(out, null, 1));
  });
});
