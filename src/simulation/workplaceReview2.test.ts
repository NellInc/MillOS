import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  authoredSeasonCommand,
  createWorkplace,
  displayEventDetail,
  restoreWorkplace,
  saveWorkplace,
  surplusDestination,
  transitionWorkplace,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import {
  absenceCovered,
  crewAway,
  mondayMinute,
  requiredChecks,
  seasonDraw,
  seasonSobrasPool,
  shiftAbsentee,
  WORKPLACE_CHECKS,
} from './workplaceCampaign';
import { forecastPlans } from './workplaceForecast';
import { buildProgramme } from './programmes';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { bilateralWorkplaceMessages } from './bilateralWorkplace.messages';
import { workplaceCampaignMessages } from './workplaceCampaign.messages';
import { workplaceStepMessages } from '../components/ui-new/widgets/WorkplaceStep.messages';
import { workplaceLabMessages } from '../components/ui-new/widgets/WorkplaceLab.messages';
import { workplaceParticipationMessages } from '../components/ui-new/widgets/WorkplaceParticipation.messages';
import { setLocale } from '../i18n';
import type { SurplusDestination, WorkplaceProfile, WorkplaceState } from '../types/workplace';

// Review 2 of the cooperative season (13 November): twelve defects found by
// reading. Each test here failed on the build it was found in.

afterEach(() => setLocale('en'));

const FIXTURES = join(__dirname, '__tests__/fixtures/workplace-saves');
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

function season(profile: WorkplaceProfile, seed = 17, reserveBrought = 0) {
  let state = createWorkplace();
  const must = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    expect(result.changed, `${command.type}: ${result.reason}`).toBe(true);
    state = result.state;
  };
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    state = result.state;
    return result;
  };
  must({
    type: 'startCampaign',
    args: reserveBrought > 0 ? [profile, seed, undefined, reserveBrought] : [profile, seed],
  });
  const agree = () => {
    for (const actor of ['packing', 'mind']) {
      for (const id of requiredChecks(actor))
        run({
          type: 'answerCheck',
          args: [actor, id, WORKPLACE_CHECKS.find((q) => q.id === id)!.correct],
        });
      if (actor !== 'mind') run({ type: 'understand', args: [actor] });
    }
    run({ type: 'vote', args: ['packing', true] });
    run({ type: 'simulateResponses', args: [] });
  };
  /** Each shift's kilograms; steady throughout. Ends at the final review. */
  const play = (shipped: [number, number, number]) => {
    for (let shift = 0; shift < 3; shift++) {
      if (state.campaign!.shift !== 1 && state.campaign!.decision === null)
        must({
          type: 'campaignDecision',
          args: [shift === 0 ? 'keep-target' : 'protect-refusal', 'coordinator'],
        });
      agree();
      must({ type: 'activate', args: [state.revision] });
      while (state.phase === 'active') {
        if (
          state.campaign?.shift === 1 &&
          state.minute >= mondayMinute(state) &&
          state.campaign.decision === null
        )
          must({ type: 'campaignDecision', args: ['inspect', 'quality'] });
        must({ type: 'tick', args: [5, shipped[shift] / 18, false] });
      }
      if (shift < 2) must({ type: 'nextCampaignShift', args: [] });
    }
  };
  /** The authored roles do what is theirs, as the store does in solo play. */
  const authored = () => {
    for (let step = 0; step < 8; step++) {
      const command = authoredSeasonCommand(state);
      if (!command) break;
      const result = transitionWorkplace(state, command);
      if (!result.changed) break;
      state = result.state;
    }
  };
  return {
    must,
    run,
    play,
    authored,
    get state() {
      return state;
    },
  };
}

/** A season to its final review, Packing's sobras ballot cast, the others' too. */
function vote(
  profile: WorkplaceProfile,
  shipped: [number, number, number],
  packing: SurplusDestination,
  reserveBrought = 0
) {
  const c = season(profile, 17, reserveBrought);
  c.play(shipped);
  c.authored();
  c.must({ type: 'voteSurplus', args: ['packing', packing] });
  c.authored();
  return c;
}

describe('review 2, finding 2: the solo sobras vote is a decision', () => {
  it('the others’ ballots follow the season: a loss and a thin reserve send them to the reserve', () => {
    const lean = vote('toe-dip', [0, 900, 900], 'members');
    const ballots = lean.state.surplusBallots;
    expect(ballots.quality).toBe('reserve');
    expect(ballots.coordinator).toBe('reserve');
    expect(ballots.maintenance).toBe('members');
    const healthy = vote('toe-dip', [900, 900, 900], 'members', 300);
    expect(healthy.state.surplusBallots.quality).toBe('members');
    expect(healthy.state.surplusBallots.coordinator).toBe('members');
  });

  it('there are seasons where Packing’s ballot decides, and seasons where it is outvoted', () => {
    // A lean season: two for the reserve, one for the members, Packing decides.
    expect(surplusDestination(vote('toe-dip', [0, 900, 900], 'reserve').state)).toBe('reserve');
    expect(surplusDestination(vote('toe-dip', [0, 900, 900], 'members').state)).toBe('members');
    // A healthy season: the other three return it to the members whatever Packing says.
    expect(surplusDestination(vote('toe-dip', [900, 900, 900], 'reserve', 300).state)).toBe(
      'members'
    );
  });

  it('across seasons at the plant’s scale, Packing decides some and is outvoted in others', () => {
    // Per shift: nothing shipped, part of a truck, or a full truck (5,000 kg),
    // in a first season (no reserve brought) and a later one.
    const volumes = [0, 1500, 5000];
    const profiles: [number, number, number][] = [];
    for (const a of volumes)
      for (const b of volumes) for (const c of volumes) profiles.push([a, b, c]);
    const settle = (base: WorkplaceState, packing: SurplusDestination) => {
      let s = transitionWorkplace(base, { type: 'voteSurplus', args: ['packing', packing] }).state;
      for (let step = 0; step < 8; step++) {
        const command = authoredSeasonCommand(s);
        if (!command) break;
        const result = transitionWorkplace(s, command);
        if (!result.changed) break;
        s = result.state;
      }
      return surplusDestination(s);
    };
    const tally: Record<string, { decided: number; outvoted: number; seasons: number }> = {};
    for (const brought of [0, 400])
      for (const shipped of profiles) {
        const c = season('toe-dip', 17, brought);
        c.play(shipped);
        if (!(seasonSobrasPool(c.state) > 1e-8)) continue;
        const outcomes = (['members', 'reserve', 'community'] as const).map((p) => [
          p,
          settle(c.state, p),
        ]);
        const row = (tally[brought ? 'later' : 'first'] ??= {
          decided: 0,
          outvoted: 0,
          seasons: 0,
        });
        row.seasons += 1;
        if (new Set(outcomes.map(([, o]) => o)).size > 1) row.decided += 1;
        if (outcomes.some(([p, o]) => o !== p)) row.outvoted += 1;
        // Every season whose members have all voted settles.
        expect(outcomes.every(([, o]) => o !== null)).toBe(true);
      }
    process.stdout.write(`\n@@SOBRAS ${JSON.stringify(tally)}\n`);
    expect(tally.first.decided).toBeGreaterThan(0);
    expect(tally.first.outvoted).toBeGreaterThan(0);
    expect(tally.later.outvoted).toBeGreaterThan(0);
  });

  it('a vote no destination carries falls to the law’s default, and the record says so', () => {
    // Toe-dip has no chair: two to two, or two-one-one, still settles.
    const c = vote('toe-dip', [0, 900, 900], 'community');
    expect(surplusDestination(c.state)).toBe('members');
    c.must({ type: 'distributeSurplus', args: [] });
    expect(c.state.sobras?.destination).toBe('members');
    const details = c.state.events.map((e) => e.detail);
    expect(details).toContain(bilateralWorkplaceMessages.en.evSurplusDefault);
    // Each authored need, met or outvoted, in words.
    expect(details).toContain(bilateralWorkplaceMessages.en.needQualityOutvoted);
    expect(details).toContain(bilateralWorkplaceMessages.en.needMaintenanceMet);
    for (const key of ['needQualityOutvoted', 'needMaintenanceMet'] as const)
      expect(bilateralWorkplaceMessages.en[key]).not.toMatch(/\d/);
    // The settled season still restores.
    expect(restoreWorkplace(saveWorkplace(c.state), true).sobras?.destination).toBe('members');
  });
});

describe('review 2, finding 5: cover never releases Quality’s work', () => {
  it('an unqualified volunteer’s cover leaves the bench waiting while Quality is away', () => {
    const seed = (() => {
      for (let n = 1; n < 500; n++) {
        const d = seasonDraw(n);
        if (d.decliner === 'coordinator' && d.pressures.indexOf('repeat-cover') === 1) return n;
      }
      throw new Error('no seed');
    })();
    const c = season('cooperative', seed);
    c.play([0, 0, 0]);
    // Build Monday (the absence shift) by hand: cover agreed, active, minute 1.
    const s = structuredClone(c.state) as WorkplaceState;
    s.campaign!.shift = 1;
    s.phase = 'active';
    s.minute = 1;
    s.planId = 'cover';
    const packing = s.members.find((m) => m.id === 'packing')!;
    packing.coverConsent = true;
    s.activeCoverMemberId = 'packing';
    s.coverRemainingMinutes = 9;
    expect(shiftAbsentee(s)).toBe('quality');
    expect(absenceCovered(s)).toBe(false);
    expect(crewAway(s, 'quality')).toBe(true);
    // Maintenance is qualified for release (its eligible tasks): its cover
    // releases, and its own work waits while it covers.
    const maintenance = s.members.find((m) => m.id === 'maintenance')!;
    expect(maintenance.eligibleTasks).toContain('Quality release');
    maintenance.coverConsent = true;
    s.activeCoverMemberId = 'maintenance';
    expect(absenceCovered(s)).toBe(true);
    expect(crewAway(s, 'quality')).toBe(false);
    expect(crewAway(s, 'maintenance')).toBe(true);
  });

  it('a save from before Maintenance was qualified for release still loads, and gains it', () => {
    const c = season('cooperative', 17);
    const saved = saveWorkplace(c.state) as WorkplaceState;
    saved.members.find((m) => m.id === 'maintenance')!.eligibleTasks = [
      'Maintenance planning',
      'Pallet checks',
    ];
    const restored = restoreWorkplace(saved);
    expect(restored.campaign).not.toBeNull();
    expect(restored.members.find((m) => m.id === 'maintenance')!.eligibleTasks).toContain(
      'Quality release'
    );
  });
});

describe('review 2, finding 1: the forecast says what each plan ships', () => {
  it('resequencing ships different season kilograms from steady', () => {
    const initial = useOperationsCampaignStore.getInitialState();
    const orders = buildProgramme(initial.orders, 2, 'morning', 0);
    const RUSH = 'programme-2-order-1';
    const advice = {
      reasonToAbstain: null,
      packedLowKg: 0,
      packedHighKg: 0,
      evidence: { orderId: RUSH, finishedMaterial: null, remainingOrderKg: null },
    } as unknown as Parameters<typeof forecastPlans>[0]['advice'];
    const arms = forecastPlans({
      advice,
      dock: { nextTruckInMinutes: 10, cycleMinutes: 40, capacityKg: 5000 },
      orders,
      activeOrderId: RUSH,
      seasonOrderIds: [RUSH],
      minute: 0,
    });
    const [steady, resequence] = arms;
    expect(resequence.changesDispatch).toBe(true);
    expect(steady.seasonKg).toBeGreaterThan(0);
    expect(resequence.seasonKg).not.toBe(steady.seasonKg);
  });
});

describe('review 2, finding 7: English says surplus; one name for one thing', () => {
  it('no English workplace copy says sobras or FATES', () => {
    const catalogs = [
      bilateralWorkplaceMessages,
      workplaceCampaignMessages,
      workplaceStepMessages,
      workplaceLabMessages,
      workplaceParticipationMessages,
    ];
    for (const catalog of catalogs)
      for (const [key, value] of Object.entries(catalog.en)) {
        if (typeof value !== 'string' || /V\d$/.test(key)) continue;
        // Placeholders ({fates}) are slot names, not copy.
        expect(value.replace(/\{\w+\}/g, ''), key).not.toMatch(/sobras|FATES/i);
      }
    expect('rejSobrasSeasonEnd' in bilateralWorkplaceMessages.en).toBe(false);
  });

  it('a receipt saved with the old English wording still reads in either language', () => {
    const recorded =
      'members: 12.00 illustrative credits after 1.20 to the Reserve Fund and 0.60 to FATES; members’ shares follow the minutes each worked.';
    expect(displayEventDetail(recorded)).not.toMatch(/FATES|^members:/);
    setLocale('pt-BR');
    expect(displayEventDetail(recorded)).toMatch(/^Distribuir aos cooperados: 12,00 créditos/);
  });
});

describe('review 2, finding 11: old sobras receipts display in the active language', () => {
  it('the pre-phase-5 fixture’s receipt reads labelled, in Portuguese under pt-BR', () => {
    const saved = fixture('2026-11-13-pre-phase5-shift0-review.json');
    const events = (saved.workplace ?? saved).events as { kind: string; detail: string }[];
    const receipt = events.find((e) => e.kind === 'surplus-decided')!;
    expect(receipt.detail).toBe(
      'members: 64.00 illustrative credits; equal shares if distributed to members.'
    );
    expect(displayEventDetail(receipt.detail)).not.toMatch(/^members:/);
    setLocale('pt-BR');
    const shown = displayEventDetail(receipt.detail);
    expect(shown).toMatch(/^Distribuir aos cooperados: 64,00 créditos ilustrativos/);
    expect(shown).not.toMatch(/illustrative|equal shares/);
  });
});

describe('review 2, finding 12: the surplus receipt pins what the engine records', () => {
  it('fills all four slots from a real settlement', () => {
    const c = vote('cooperative', [900, 900, 900], 'members');
    c.must({ type: 'distributeSurplus', args: [] });
    const pool = seasonSobrasPool(c.state);
    expect(pool).toBeGreaterThan(0);
    const receipt = c.state.events.find((e) => e.kind === 'surplus-decided')!.detail;
    expect(receipt).not.toMatch(/\{\w+\}/);
    const shown = displayEventDetail(receipt);
    expect(shown).not.toMatch(/\{\w+\}|^members:/);
    expect(shown).toContain(c.state.sobras!.remainder.toFixed(2));
    expect(shown).toContain(c.state.sobras!.reserve.toFixed(2));
    expect(shown).toContain(c.state.sobras!.fates.toFixed(2));
  });
});
