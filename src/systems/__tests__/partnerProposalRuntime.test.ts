import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STANDARD_GAME_SPEED } from '../../simulation/pace';
import { resetUnifiedTickState, unifiedGameTick } from '../UnifiedGameTick';
import type { TickContext } from '../CentralTickSystem';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { useQCLabStore } from '../../stores/qcLabStore';
import { useTruckScheduleStore } from '../../stores/truckScheduleStore';
import { useUIStore } from '../../stores/uiStore';
import { selectRestartPending, useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useProductionStore } from '../../stores/productionStore';
import { useBreakdownStore, type BreakdownType } from '../../stores/breakdownStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import {
  useLogisticsLayoutStore,
  defaultSavedLogisticsLayout,
} from '../../stores/logisticsLayoutStore';
import { readSavedProposals, usePartnerProposalStore } from '../../stores/partnerProposalStore';
import {
  answerPartnerProposal,
  EXPECTED_REPAIR_MINUTES,
  FAILURE_PARTS,
} from '../partnerProposalRuntime';
import {
  defaultDelegationFor,
  PROGRAMME_WINDOW_MINUTES,
  PROPOSAL_KIND_IDS,
  SERVICE_WINDOW_MINUTES,
  type PartnerProposal,
} from '../../simulation/partnerProposals';
import {
  capturePhysicalSession,
  decodePhysicalSession,
  encodePhysicalSession,
} from '../../utils/physicalSession';
import {
  registerReplayParticipant,
  REQUIRED_REPLAY_PARTICIPANTS,
} from '../../simulation/workplaceReplayRuntime';
import { MachineType, type MachineData } from '../../types';
import { PART_PRICE, wearWarningIgnored } from '../../stores/breakdownStore';
import { getWearConfig } from '../../stores/productionStore';
import { serviceAwaitingCrew, unitInService } from '../unitService';
import { formatProposalPrice, proposalReasonText } from '../../simulation/partnerProposalText';
import { setLocale } from '../../i18n';

// Plan item 3.0. A floor decision arrives as the partner's proposal with a
// window on the game clock; unanswered, the partner's choice runs at the
// window's close. These tests run the real tick and the real stores.

const tick = (gameSpeed = STANDARD_GAME_SPEED, n = 1): void => {
  for (let i = 0; i < n; i++)
    unifiedGameTick({
      deltaSeconds: 0.5,
      gameTime: useGameSimulationStore.getState().gameTime,
      gameSpeed,
      elapsedTime: 0,
      tickCount: i,
    } satisfies TickContext);
};
const minute = () => useOperationsCampaignStore.getState().elapsedMinutes;
/**
 * A fresh proposal store with every kind on "ask me", as the player can set
 * it: these cases follow the asking path, while a kind's default follows the
 * delegation rule (DELEGATION_EVIDENCE, pinned in partnerProposals.commitment.test.ts).
 */
function askEveryKind() {
  usePartnerProposalStore.getState().reset();
  for (const kind of PROPOSAL_KIND_IDS)
    usePartnerProposalStore.getState().setDelegation(kind, 'ask');
}
const proposals = () => usePartnerProposalStore.getState().proposals;
const open = (kind: PartnerProposal['kind']) =>
  proposals().find((proposal) => proposal.kind === kind && proposal.status === 'open');

function completeProgramme() {
  const campaign = useOperationsCampaignStore.getState();
  useOperationsCampaignStore.setState({
    orders: campaign.orders.map((order) => ({
      ...order,
      status: 'fulfilled' as const,
      shippedKg: order.requiredKg,
      completedAtMinute: 1,
    })),
    activeOrderId: null,
  });
}

const mill = (overrides: Partial<MachineData> = {}): MachineData => ({
  id: 'rm-101',
  name: 'R.M. 101',
  type: MachineType.ROLLER_MILL,
  position: [0, 0, 0],
  size: [1, 1, 1],
  rotation: 0,
  status: 'warning',
  metrics: { rpm: 450, temperature: 50, vibration: 1, load: 80, wear: 70, efficiency: 86 },
  lastMaintenance: '2026-11-01',
  nextMaintenance: '2026-11-08',
  ...overrides,
});

beforeEach(() => {
  setLocale('en');
  window.history.replaceState(null, '', '/');
  resetUnifiedTickState();
  useLogisticsLayoutStore.getState().restoreSaved(defaultSavedLogisticsLayout());
  useMaterialFlowStore.getState().resetMaterialFlow();
  useOperationsCampaignStore.getState().resetCampaign();
  useTruckScheduleStore.getState().resetTruckSchedule();
  useBreakdownStore.getState().resetBreakdownStore();
  useQCLabStore.getState().resetQCLab();
  useGameSimulationStore.getState().resetGameState();
  useGameSimulationStore.getState().setGameSpeed(STANDARD_GAME_SPEED);
  useProductionStore.setState({ ...useProductionStore.getInitialState(), machines: [] });
  askEveryKind();
  useUIStore.setState({ alerts: [] });
  tick();
});
afterEach(() => window.history.replaceState(null, '', '/'));

describe('a programme proposal', () => {
  it('is raised once the programme is complete, rings the bell, and runs the partner’s choice at its window', () => {
    completeProgramme();
    tick();
    const proposal = open('programme')!;
    expect(proposal).toBeDefined();
    expect(proposal.defaultOptionId).toBe('accept');
    expect(proposal.options.map((option) => option.id)).toEqual(['accept', 'hold']);
    expect(
      useUIStore.getState().alerts.some((alert) => alert.id === `partner-proposal-${proposal.id}`)
    ).toBe(true);
    const closes = proposal.raisedAtMinute + PROGRAMME_WINDOW_MINUTES;
    while (minute() < closes - 0.5) tick();
    expect(open('programme')?.id).toBe(proposal.id);
    expect(useOperationsCampaignStore.getState().programmeCount).toBe(0);
    while (minute() < closes + 0.5) tick();
    const resolved = proposals().find((candidate) => candidate.id === proposal.id)!;
    expect(resolved.status).toBe('resolved');
    expect(resolved.resolution).toMatchObject({
      optionId: 'accept',
      decidedBy: 'partner',
      atMinute: closes,
      ran: true,
    });
    expect(useOperationsCampaignStore.getState().programmeCount).toBe(1);
  });

  it('holds while the clock is held, and pace does not change the minute it resolves at', () => {
    const resolvedAt = (pace: number) => {
      askEveryKind();
      useOperationsCampaignStore.getState().resetCampaign();
      tick(pace);
      completeProgramme();
      tick(pace);
      const proposal = open('programme')!;
      // P holds the clock: the tick does nothing at speed 0, however long.
      tick(0, 400);
      expect(open('programme')?.id).toBe(proposal.id);
      while (open('programme')) tick(pace);
      const resolved = proposals().find((candidate) => candidate.id === proposal.id)!;
      return {
        raised: proposal.raisedAtMinute,
        at: resolved.resolution!.atMinute,
      };
    };
    const standard = resolvedAt(STANDARD_GAME_SPEED);
    const fast = resolvedAt(120);
    expect(standard.at - standard.raised).toBe(PROGRAMME_WINDOW_MINUTES);
    expect(fast.at - fast.raised).toBe(PROGRAMME_WINDOW_MINUTES);
  });

  it('is answered as the operator by the guide’s Accept button (acceptNextProgramme)', () => {
    completeProgramme();
    tick();
    const proposal = open('programme')!;
    expect(useOperationsCampaignStore.getState().acceptNextProgramme('operator')).toBe(true);
    tick();
    expect(proposals().find((candidate) => candidate.id === proposal.id)?.resolution).toMatchObject(
      { optionId: 'accept', decidedBy: 'operator' }
    );
  });

  it('held, is offered again an hour later; and an hour after any answer the record compares both', () => {
    completeProgramme();
    tick();
    const first = open('programme')!;
    expect(answerPartnerProposal(first.id, 'hold')).toBe(true);
    expect(useOperationsCampaignStore.getState().programmeCount).toBe(0);
    const heldAt = minute();
    while (minute() < heldAt + 59) tick();
    expect(open('programme')).toBeUndefined();
    while (!open('programme')) tick();
    const second = open('programme')!;
    expect(second.subject).toBe('programme-0-ask-2');
    const compared = proposals().find((candidate) => candidate.id === first.id)!;
    expect(compared.comparison?.chosenOptionId).toBe('hold');
    // Holding always carries its hour against none: the record says what
    // each answer cost and names no better one (review 2, finding 5).
    expect(compared.comparison?.bestOptionId).toBeNull();
    const line = useOperationsCampaignStore
      .getState()
      .logbook.find((entry) => entry.relatedId === first.id);
    expect(line).toMatchObject({ actor: 'operator' });
    expect(line?.message).toMatch(
      /^You chose Hold for programme 2: .*60 min\. Accept now would have cost/
    );
    expect(line?.message).not.toMatch(/The other answer was better\./);
  });

  it('is never raised in benchmark runtime, and nothing expires there', () => {
    window.history.replaceState(null, '', '/?benchmark=1');
    completeProgramme();
    tick(STANDARD_GAME_SPEED, 400);
    expect(proposals()).toEqual([]);
    expect(useOperationsCampaignStore.getState().programmeCount).toBe(0);
  });
});

describe('a service proposal', () => {
  const raiseWear = () => {
    useProductionStore.setState({ machines: [mill()] });
    useBreakdownStore
      .getState()
      .addPredictiveAlert(
        'rm-101',
        'R.M. 101',
        { vibration: 1, temperature: 50, load: 80 },
        600,
        'mechanical'
      );
    tick();
    return open('service')!;
  };

  it('prices service at one part and its minutes offline, running on at the repair, its parts and the service still owed', () => {
    const proposal = raiseWear();
    expect(proposal.defaultOptionId).toBe('service');
    const service = proposal.options.find((option) => option.id === 'service')!;
    const runOn = proposal.options.find((option) => option.id === 'run-on')!;
    expect(service.price).toMatchObject({
      currency: PART_PRICE.filters,
      parts: { filters: 1 },
      offlineMinutes: getWearConfig(MachineType.ROLLER_MILL).serviceMinutes,
    });
    // The repaired unit comes back worn, so the service is still to do.
    expect(runOn.price.parts).toEqual({ bearings: 1, belts: 1, filters: 1 });
    expect(runOn.price.currency).toBeCloseTo(
      (90 * EXPECTED_REPAIR_MINUTES) / 60 +
        PART_PRICE.bearings +
        PART_PRICE.belts +
        PART_PRICE.filters,
      2
    );
  });

  it('unanswered, the partner services the unit at the window’s close with Maintain’s own calls', () => {
    const proposal = raiseWear();
    const partsBefore = useBreakdownStore.getState().partsInventory.filters;
    const closes = proposal.raisedAtMinute + SERVICE_WINDOW_MINUTES;
    while (minute() < closes + 0.5) tick();
    const resolved = proposals().find((candidate) => candidate.id === proposal.id)!;
    expect(resolved.resolution).toMatchObject({
      optionId: 'service',
      decidedBy: 'partner',
      ran: true,
    });
    // The service is under way: the unit is offline, the part taken, the
    // prediction closed; its wear comes off when the minutes have run (D7).
    expect(unitInService('rm-101')).toBe(true);
    expect(useProductionStore.getState().machines[0].status).toBe('idle');
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(partsBefore - 1);
    expect(useBreakdownStore.getState().predictiveAlerts.every((alert) => alert.acknowledged)).toBe(
      true
    );
    const done = minute() + getWearConfig(MachineType.ROLLER_MILL).serviceMinutes;
    while (minute() < done + 0.5) tick();
    expect(unitInService('rm-101')).toBe(false);
    expect(useProductionStore.getState().machines[0].metrics.wear).toBeLessThan(70);
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(partsBefore - 1);
  });

  it('is answered as the operator by the Inspector’s Maintain', () => {
    const proposal = raiseWear();
    useProductionStore.getState().performMaintenance('rm-101');
    useBreakdownStore.getState().acknowledgeMachinePredictiveAlerts('rm-101');
    tick();
    expect(proposals().find((candidate) => candidate.id === proposal.id)?.resolution).toMatchObject(
      { optionId: 'service', decidedBy: 'operator' }
    );
  });

  it('run on, it is compared an hour later: the record states both costs and names no better answer', () => {
    const proposal = raiseWear();
    expect(answerPartnerProposal(proposal.id, 'run-on')).toBe(true);
    const at = minute();
    while (minute() < at + 61) tick();
    const compared = proposals().find((candidate) => candidate.id === proposal.id)!;
    // Running on always costs the service's part on top of the failure's: a
    // comparison fixed by arithmetic is no verdict (review 2, finding 5).
    expect(compared.comparison?.bestOptionId).toBeNull();
    const line = useOperationsCampaignStore
      .getState()
      .logbook.find((entry) => entry.relatedId === proposal.id);
    expect(line?.message).toMatch(/^You chose Run on for R\.M\. 101: £\d+ · 1 × bearings/);
    expect(line?.message).toMatch(/Service now would have cost/);
    expect(line?.message).not.toMatch(/The other answer was better\./);
  });

  it('refused by a stop, is offered again once the stop clears, and a failure meanwhile is not a warning ignored', () => {
    const proposal = raiseWear();
    useGameSimulationStore.setState({ emergencyActive: true });
    expect(answerPartnerProposal(proposal.id, 'service')).toBe(true);
    const refused = proposals().find((candidate) => candidate.id === proposal.id)!;
    expect(refused.resolution).toMatchObject({ ran: false, refusal: 'stopped' });
    // Asked for and refused by the stop: not ignored.
    expect(
      wearWarningIgnored(useBreakdownStore.getState().predictiveAlerts, 'rm-101'),
      'not blamed'
    ).toBe(false);
    tick(STANDARD_GAME_SPEED, 5);
    expect(open('service')).toBeUndefined();
    useGameSimulationStore.setState({ emergencyActive: false });
    tick();
    const again = open('service')!;
    expect(again?.subject).toBe(`${proposal.subject}-again-1`);
    expect(proposalReasonText(again, 'en')).toMatch(/^The stop has cleared\. R\.M\. 101 will fail/);
    expect(proposalReasonText(again, 'pt-BR')).toMatch(/^A parada terminou\./);
    // Answered "run on" this time, the warning is the player's to ignore.
    expect(answerPartnerProposal(again.id, 'run-on')).toBe(true);
    expect(wearWarningIgnored(useBreakdownStore.getState().predictiveAlerts, 'rm-101')).toBe(true);
    tick(STANDARD_GAME_SPEED, 5);
    expect(open('service')).toBeUndefined();
  });

  it('waiting for RESTART LINE after a stop is cleared (D-096): not refused; the service starts, holds until the restart, then finishes', () => {
    // Coordinator's report (14 November): a service in this state was said to
    // be refused with no reason. Measured here it is not refused: only a stop
    // or drill itself refuses (beginUnitService). The service starts, its
    // minutes hold while the restart is pending (stepUnitWork), and it
    // finishes after RESTART LINE, so nothing is left to offer again and no
    // warning is left open to blame.
    const proposal = raiseWear();
    useGameSimulationStore.getState().triggerEmergency('rm-101');
    useGameSimulationStore.getState().resolveEmergency();
    expect(useGameSimulationStore.getState().emergencyActive).toBe(false);
    expect(selectRestartPending(useGameSimulationStore.getState())).toBe(true);
    expect(answerPartnerProposal(proposal.id, 'service')).toBe(true);
    const resolved = proposals().find((candidate) => candidate.id === proposal.id)!;
    expect(resolved.resolution).toMatchObject({ ran: true });
    expect(resolved.resolution?.refusal).toBeUndefined();
    expect(unitInService('rm-101')).toBe(true);
    expect(wearWarningIgnored(useBreakdownStore.getState().predictiveAlerts, 'rm-101')).toBe(false);
    // Held while the restart is pending, however long.
    const minutes = getWearConfig(MachineType.ROLLER_MILL).serviceMinutes;
    const heldFrom = minute();
    while (minute() < heldFrom + minutes + 5) tick();
    expect(unitInService('rm-101')).toBe(true);
    useGameSimulationStore.getState().restartLine();
    const restartedAt = minute();
    while (minute() < restartedAt + 2) tick();
    expect(unitInService('rm-101')).toBe(false);
    expect(useProductionStore.getState().machines[0].metrics.wear).toBeLessThan(70);
    expect(wearWarningIgnored(useBreakdownStore.getState().predictiveAlerts, 'rm-101')).toBe(false);
    expect(open('service')).toBeUndefined();
  });

  it('refused for want of a part, its button says so, and it is offered again when a part arrives', () => {
    const empty = { bearings: 0, belts: 0, filters: 0, motors: 0, sensors: 0 };
    const stocked = { ...useBreakdownStore.getState().partsInventory };
    useBreakdownStore.setState({ partsInventory: empty });
    const proposal = raiseWear();
    const service = proposal.options.find((option) => option.id === 'service')!;
    expect(service.price.held).toBe('no-part');
    expect(formatProposalPrice(service.price, 'en')).toMatch(/^no spare part: waits for a parts/);
    expect(formatProposalPrice(service.price, 'pt-BR')).toMatch(/^sem peça de reposição/);
    while (open('service')) tick();
    expect(proposals().find((candidate) => candidate.id === proposal.id)?.resolution).toMatchObject(
      { ran: false, refusal: 'no-part' }
    );
    expect(wearWarningIgnored(useBreakdownStore.getState().predictiveAlerts, 'rm-101')).toBe(false);
    useBreakdownStore.setState({ partsInventory: stocked });
    tick();
    expect(open('service')?.subject).toBe(`${proposal.subject}-again-1`);
  });

  it('asked while the crew is away and refused when they are back, it did not run, and is offered again', () => {
    const proposal = raiseWear();
    const stocked = { ...useBreakdownStore.getState().partsInventory };
    // The crew's wait (5.4): asked for, nothing taken yet.
    useBreakdownStore.setState({ servicesAwaitingCrew: ['rm-101'] });
    expect(answerPartnerProposal(proposal.id, 'service')).toBe(true);
    expect(proposals().find((candidate) => candidate.id === proposal.id)?.resolution?.ran).toBe(
      true
    );
    // Back, and no part free: the service cannot start.
    useBreakdownStore.setState({
      partsInventory: { bearings: 0, belts: 0, filters: 0, motors: 0, sensors: 0 },
    });
    tick(STANDARD_GAME_SPEED, 2);
    expect(serviceAwaitingCrew('rm-101')).toBe(false);
    expect(proposals().find((candidate) => candidate.id === proposal.id)?.resolution).toMatchObject(
      { ran: false, refusal: 'no-part' }
    );
    expect(wearWarningIgnored(useBreakdownStore.getState().predictiveAlerts, 'rm-101')).toBe(false);
    useBreakdownStore.setState({ partsInventory: stocked });
    tick();
    expect(open('service')?.subject).toBe(`${proposal.subject}-again-1`);
  });

  it('a physical save holding it open restores and resolves', () => {
    const proposal = raiseWear();
    const owners = REQUIRED_REPLAY_PARTICIPANTS.map((id) =>
      registerReplayParticipant(id, { capture: () => ({ id }), restore: () => {} })
    );
    let saved: ReturnType<typeof decodePhysicalSession>;
    try {
      saved = decodePhysicalSession(encodePhysicalSession(capturePhysicalSession()));
    } finally {
      owners.forEach((remove) => remove());
    }
    expect(saved.proposals.proposals.map((candidate) => candidate.id)).toEqual([proposal.id]);
    askEveryKind();
    usePartnerProposalStore.getState().restoreSaved(saved.proposals);
    expect(open('service')?.id).toBe(proposal.id);
    while (minute() < proposal.raisedAtMinute + SERVICE_WINDOW_MINUTES + 0.5) tick();
    expect(proposals().find((candidate) => candidate.id === proposal.id)?.resolution).toMatchObject(
      { optionId: 'service', decidedBy: 'partner' }
    );
  });
});

describe('what the runtime reads from other stores', () => {
  it('pins each failure’s parts and the expected repair minutes against triggerBreakdown', () => {
    const minutes: number[] = [];
    for (const type of Object.keys(FAILURE_PARTS) as BreakdownType[]) {
      useBreakdownStore.getState().resetBreakdownStore();
      const breakdown = useBreakdownStore.getState().triggerBreakdown('rm-101', 'R.M. 101', type)!;
      const order = useBreakdownStore
        .getState()
        .workOrders.find((candidate) => candidate.id === breakdown.workOrderId)!;
      expect(order.requiredParts, type).toEqual(FAILURE_PARTS[type]);
    }
    useBreakdownStore.getState().resetBreakdownStore();
    for (let i = 0; i < 30; i++) {
      const breakdown = useBreakdownStore
        .getState()
        .triggerBreakdown(`unit-${i}`, `Unit ${i}`, 'mechanical')!;
      minutes.push(breakdown.estimatedRepairTime);
    }
    expect(minutes.reduce((sum, value) => sum + value, 0) / minutes.length).toBe(
      EXPECTED_REPAIR_MINUTES
    );
  });

  it('restores a real save from before proposals existed with none, and an unreadable proposal is dropped', () => {
    const fixture = join(
      __dirname,
      '../../utils/__tests__/fixtures/physical-saves/2026-11-02-15c8b571.json'
    );
    const old = JSON.parse(readFileSync(fixture, 'utf8'));
    old.participants = REQUIRED_REPLAY_PARTICIPANTS.map((id) => ({
      id,
      value: { phase: 'waiting' },
    }));
    expect('proposals' in old).toBe(false);
    const saved = decodePhysicalSession(JSON.stringify(old));
    // Every kind takes its default by the delegation rule; none was chosen.
    const defaults = Object.fromEntries(
      PROPOSAL_KIND_IDS.map((kind) => [kind, defaultDelegationFor(kind)])
    );
    expect(saved.proposals).toEqual({
      proposals: [],
      delegation: defaults,
      delegationChosen: [],
      sequence: 0,
      settledSubjects: [],
    });
    // A save from before `delegationChosen`: "ask" was then every kind's
    // default, so only a saved "decide" is the player's choice and is kept.
    const read = readSavedProposals({
      proposals: [{ id: 'proposal-00009', kind: 'rumour' }],
      delegation: { programme: 'decide', service: 'sometimes', dispatch: 'ask' },
      sequence: 4,
    });
    expect(read).toEqual({
      proposals: [],
      delegation: { ...defaults, programme: 'decide' },
      delegationChosen: ['programme'],
      sequence: 4,
      settledSubjects: [],
    });
    // From then on a chosen "ask" is kept, and an unchosen one takes the default.
    expect(
      readSavedProposals({
        delegation: { programme: 'ask', service: 'ask', dispatch: 'ask', commitment: 'ask' },
        delegationChosen: ['service'],
      }).delegation
    ).toEqual({ ...defaults, service: 'ask' });
  });

  it('never asks again about a prediction answered "run on", after its record leaves the tail', () => {
    useProductionStore.setState({ machines: [mill()] });
    useBreakdownStore
      .getState()
      .addPredictiveAlert('rm-101', 'R.M. 101', { vibration: 1, temperature: 50, load: 80 }, 600);
    tick();
    const first = open('service')!;
    answerPartnerProposal(first.id, 'run-on');
    // Thirteen later settled proposals push it out of the store's tail.
    const filler = Array.from({ length: 13 }, (_, index) => ({
      ...first,
      id: `proposal-9${String(index).padStart(4, '0')}`,
      subject: `service-filler-${index}`,
      comparison: {
        atMinute: 0,
        prices: first.options,
        chosenOptionId: 'service',
        bestOptionId: null,
      },
      status: 'resolved' as const,
      resolution: { optionId: 'service', decidedBy: 'partner' as const, atMinute: 0, ran: true },
    }));
    const store = usePartnerProposalStore.getState();
    store.setProposals([{ ...store.proposals[0], comparison: filler[0].comparison }, ...filler]);
    expect(proposals().some((candidate) => candidate.id === first.id)).toBe(false);
    expect(usePartnerProposalStore.getState().settledSubjects).toContain(
      `service:${first.subject}`
    );
    tick(STANDARD_GAME_SPEED, 20);
    expect(open('service')).toBeUndefined();
  });
});
