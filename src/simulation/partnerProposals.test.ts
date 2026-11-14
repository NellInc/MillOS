import { describe, expect, it } from 'vitest';
import {
  closesAtMinute,
  compareProposal,
  isExpired,
  minutesLeft,
  priceAll,
  priceOption,
  raiseProposals,
  resolveProposal,
  sanitizeProposal,
  seededUnit,
  PROGRAMME_HOLD_MINUTES,
  PROGRAMME_WINDOW_MINUTES,
  SERVICE_WINDOW_MINUTES,
  type PlantUnitFacts,
  type PlantWorld,
} from './partnerProposals';
import {
  dispositionForOption,
  proposalDecisionView,
  proposalOptionForDisposition,
} from './partnerProposalDecision';
import { describeProposalRecord } from './shiftReview';

const unit = (overrides: Partial<PlantUnitFacts> = {}): PlantUnitFacts => ({
  machineId: 'rm-101',
  machineName: 'R.M. 101',
  wear: 62,
  breakdownWear: 90,
  wearPerMinute: 0.039,
  servicePart: 'filters',
  failureParts: ['bearings', 'belts'],
  repairMinutes: 44.5,
  workOrderRatePerHour: 90,
  qualityServiced: 99.5,
  qualityAtFailure: 97.5,
  strictestMinimum: 95,
  openWearAlertId: 'alert-00001',
  brokenDown: false,
  minimumServiceWear: 30,
  ...overrides,
});

const world = (overrides: Partial<PlantWorld> = {}): PlantWorld => ({
  sessionId: 'session-1',
  minute: 100,
  programme: {
    canAccept: true,
    programmeCount: 0,
    lastAcceptedBy: null,
    offer: {
      programmeNumber: 2,
      programmeCount: 0,
      committedKg: 11500,
      revenue: 9800,
      firstDueMinutes: 125,
      stockReadyKg: 0,
    },
  },
  units: [unit()],
  ...overrides,
});

const ids = (index: number) => `proposal-${index + 1}`;

describe('partner proposals, the pure core', () => {
  it('raises one proposal per subject, with every option priced by priceOption', () => {
    const raised = raiseProposals(world(), [], ids);
    expect(raised.map((p) => [p.kind, p.subject])).toEqual([
      ['programme', 'programme-0-ask-1'],
      ['service', 'service-alert-00001'],
    ]);
    for (const proposal of raised)
      expect(proposal.options).toEqual(priceAll(proposal.kind, proposal.facts));
    expect(raiseProposals(world(), raised, ids)).toEqual([]);
    expect(raised.find((p) => p.kind === 'programme')?.windowMinutes).toBe(
      PROGRAMME_WINDOW_MINUTES
    );
    expect(raised.find((p) => p.kind === 'service')?.windowMinutes).toBe(SERVICE_WINDOW_MINUTES);
  });

  it('prices service at one part, running on at the work order and the failure’s parts', () => {
    const facts = { ...unit(), alertId: 'alert-00001' };
    expect(priceOption('service', 'service', facts)).toMatchObject({
      currency: 0,
      parts: { filters: 1 },
      gradeRisk: false,
    });
    expect(priceOption('service', 'run-on', facts)).toMatchObject({
      currency: 66.75,
      parts: { bearings: 1, belts: 1 },
      quality: 97.5,
      gradeRisk: false,
    });
    expect(priceOption('service', 'run-on', { ...facts, qualityAtFailure: 94 }).gradeRisk).toBe(
      true
    );
  });

  it('prices a hold by the hour it holds the programme back', () => {
    const facts = { ...world().programme.offer!, ask: 1, holdMinutes: PROGRAMME_HOLD_MINUTES };
    expect(priceOption('programme', 'accept', facts)).toMatchObject({ kg: 11500, minutes: null });
    expect(priceOption('programme', 'hold', { ...facts, stockReadyKg: 4000 })).toMatchObject({
      currency: 0,
      kg: 4000,
      minutes: 60,
    });
  });

  it('expires on game minutes, and resolves at the window’s close', () => {
    const [proposal] = raiseProposals(world(), [], ids);
    expect(closesAtMinute(proposal)).toBe(100 + PROGRAMME_WINDOW_MINUTES);
    expect(minutesLeft(proposal, 110)).toBe(PROGRAMME_WINDOW_MINUTES - 10);
    expect(isExpired(proposal, 123.9)).toBe(false);
    expect(isExpired(proposal, 124)).toBe(true);
    const resolved = resolveProposal(proposal, 'accept', 'partner', closesAtMinute(proposal), true);
    expect(resolved.status).toBe('resolved');
    expect(isExpired(resolved, 200)).toBe(false);
    expect(resolveProposal(resolved, 'hold', 'operator', 300, true)).toBe(resolved);
  });

  it('compares with priceOption on the outcome facts, never a second number', () => {
    const service = raiseProposals(world(), [], ids).find((p) => p.kind === 'service')!;
    const ranOn = resolveProposal(service, 'run-on', 'operator', 110, true);
    const later = world({
      minute: 170,
      units: [unit({ wearPerMinute: 0.05, qualityAtFailure: 93, openWearAlertId: null })],
    });
    const compared = compareProposal(ranOn, later, 170);
    const outcome = { ...service.facts, wearPerMinute: 0.05, qualityAtFailure: 93 };
    expect(compared.comparison?.prices).toEqual(priceAll('service', outcome));
    // Running on always costs the service's part on top of the failure's: the
    // comparison is fixed by arithmetic, so it names no better answer (review
    // 2, finding 5), and a record saved with a verdict reads without one.
    expect(compared.comparison?.bestOptionId).toBeNull();
    const line = describeProposalRecord(compared, 'en');
    expect(line).toBe(
      // Running on uses the failure's parts and still owes the service's part;
      // the repair takes the unit offline; the stamp misses the 95 minimum.
      'You chose Run on for R.M. 101: £67 · 1 × bearings · 1 × belts · 1 × filters · 45 min offline · below 95. Service now would have cost 1 × filters.'
    );
    const saved = { ...compared, comparison: { ...compared.comparison!, bestOptionId: 'service' } };
    expect(describeProposalRecord(saved, 'en')).toBe(line);
    expect(describeProposalRecord(compared, 'pt-BR')).toMatch(/^Você escolheu Seguir rodando/);
  });

  it('a held programme is asked again after the hold, a withdrawn ask at once', () => {
    const [ask] = raiseProposals(world(), [], ids);
    const held = resolveProposal(ask, 'hold', 'operator', 100, true);
    expect(
      raiseProposals(world({ minute: 159 }), [held], ids).filter((p) => p.kind === 'programme')
    ).toEqual([]);
    const again = raiseProposals(world({ minute: 160 }), [held], ids).find(
      (p) => p.kind === 'programme'
    )!;
    expect(again.subject).toBe('programme-0-ask-2');
  });

  it('reads a saved proposal tolerantly', () => {
    const [proposal] = raiseProposals(world(), [], ids);
    const round = sanitizeProposal(JSON.parse(JSON.stringify(proposal)));
    expect(round).toEqual(proposal);
    expect(sanitizeProposal({ ...proposal, kind: 'intake' })).toBeNull();
    expect(sanitizeProposal({ ...proposal, facts: { programmeNumber: 'two' } })).toBeNull();
  });

  it('answers in the agent’s card contract', () => {
    const [proposal] = raiseProposals(world(), [], ids);
    expect(proposalOptionForDisposition(proposal, 'accepted')).toBe('accept');
    expect(proposalOptionForDisposition(proposal, 'rejected')).toBe('hold');
    expect(proposalOptionForDisposition(proposal, 'modified', 'hold')).toBe('hold');
    expect(proposalOptionForDisposition(proposal, 'modified', 'sell')).toBeNull();
    expect(proposalOptionForDisposition(proposal, 'deferred')).toBeNull();
    expect(dispositionForOption(proposal, 'hold')).toBe('rejected');
    const view = proposalDecisionView(resolveProposal(proposal, 'hold', 'agent', 101, true));
    expect(view).toMatchObject({
      type: 'proposal',
      status: 'completed',
      response: { disposition: 'rejected', decidedBy: 'agent' },
    });
  });

  it('seeds chance from a seed and an index', () => {
    expect(seededUnit(7, 3)).toBe(seededUnit(7, 3));
    expect(seededUnit(7, 3)).not.toBe(seededUnit(7, 4));
    expect(seededUnit(7, 3)).toBeGreaterThanOrEqual(0);
    expect(seededUnit(7, 3)).toBeLessThan(1);
  });
});
