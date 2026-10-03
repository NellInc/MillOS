import { describe, expect, it } from 'vitest';
import {
  compareWorkplacePlans,
  createWorkplace,
  exportWorkplace,
  projectWorkplace,
  restoreWorkplace,
  saveWorkplace,
  transitionWorkplace,
  workplaceCapacity,
  workplaceReadiness,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import type { WorkplaceMode, WorkplacePlanId, WorkplaceState } from '../types/workplace';

function scenario(plan: WorkplacePlanId = 'steady', mode: WorkplaceMode = 'game') {
  let state = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    state = result.state;
    return result;
  };
  run({ type: 'start', args: [mode, 17] });
  if (plan !== 'steady') run({ type: 'selectPlan', args: [plan] });
  const respond = () => {
    for (const m of state.members) {
      run({ type: 'understand', args: [m.id] });
      run({ type: 'vote', args: [m.id, true] });
    }
  };
  const activate = () => run({ type: 'activate', args: [state.revision] });
  return {
    run,
    respond,
    activate,
    get state() {
      return state;
    },
  };
}
function conserved(s: WorkplaceState) {
  const f = s.finance;
  expect(f.cash).toBeCloseTo(
    f.initialCapital +
      f.operatingRevenue -
      f.operatingCost -
      f.improvementSpend -
      f.wagesPaid -
      f.compensationPaid -
      f.distributed -
      f.communityAllocation,
    7
  );
  expect(f.compensationPaid).toBeCloseTo(
    s.members.reduce((n, m) => n + m.compensationPaid, 0),
    7
  );
  expect(s.members.reduce((n, m) => n + m.earnedPay, 0)).toBeCloseTo(
    f.wagesPaid + f.distributed,
    7
  );
  expect(f.cash + 1e-7).toBeGreaterThanOrEqual(f.wageReserve + f.compensationReserve);
}

describe('bilateral workplace laboratory', () => {
  it('records rest and recovery only as model time is delivered, never at creation or settlement', () => {
    const c = scenario('cover');
    expect(c.state.members.every((m) => m.restMinutes === 0 && m.recoveryMinutes === 0)).toBe(true);
    c.run({ type: 'simulateResponses', args: [] });
    c.activate();
    c.run({ type: 'tick', args: [4, 0, false] });
    const id = c.state.activeCoverMemberId!;
    expect(c.state.members.find((m) => m.id === id)?.recoveryOwedMinutes).toBe(10);
    c.run({ type: 'stop', args: [] });
    expect(c.state.promisesKept).toBe(0);
    expect(c.state.members.find((m) => m.id === id)?.recoveryMinutes).toBe(0);
    expect(c.run({ type: 'start', args: ['game'] }).changed).toBe(false);
    const restored = restoreWorkplace(saveWorkplace(c.state));
    expect(restored.members.find((m) => m.id === id)?.recoveryOwedMinutes).toBe(10);
    expect(restored.promisesKept).toBe(0);
    c.run({ type: 'tick', args: [6, 999, false] });
    expect(c.state.promisesKept).toBe(0);
    expect(c.state.members.find((m) => m.id === id)?.recoveryMinutes).toBe(6);
    const money = { ...c.state.finance };
    c.run({ type: 'tick', args: [4, 999, false] });
    expect(c.state.promisesKept).toBe(1);
    expect(c.state.finance).toEqual(money);
    expect(c.state.shippedKg).toBe(0);
    expect(c.run({ type: 'start', args: ['game'] }).changed).toBe(true);
    const ordinary = scenario();
    ordinary.respond();
    ordinary.activate();
    ordinary.run({ type: 'tick', args: [80, 0, false] });
    expect(ordinary.state.members.every((m) => m.restMinutes === 5)).toBe(true);
    ordinary.run({ type: 'tick', args: [10, 0, false] });
    expect(ordinary.state.members.every((m) => m.restMinutes === 15)).toBe(true);
  });
  it('delivers recovery after cover finishes inside a coarse tick without double counting cover time', () => {
    const c = scenario('cover');
    c.run({ type: 'simulateResponses', args: [] });
    c.activate();
    c.run({ type: 'tick', args: [15, 0, false] });
    const m = c.state.members.find((m) => m.extraMinutes > 0)!;
    expect(m.extraMinutes).toBe(10);
    expect(m.recoveryMinutes).toBe(5);
    expect(m.recoveryOwedMinutes).toBe(5);
    expect(c.state.promisesKept).toBe(0);
    c.run({ type: 'tick', args: [5, 0, false] });
    expect(c.state.promisesKept).toBe(1);
    c.run({ type: 'stop', args: [] });
    expect(c.state.promisesKept).toBe(1);
  });
  it('never replaces a manually declined ballot or cover response with authored simulation', () => {
    const c = scenario('cover');
    c.run({ type: 'understand', args: ['packing'] });
    c.run({ type: 'vote', args: ['packing', false] });
    c.run({ type: 'consentToCover', args: ['packing', false] });
    c.run({ type: 'simulateResponses', args: [] });
    expect(c.state.members[0].ballot).toBe(false);
    expect(c.state.members[0].coverConsent).toBe(false);
    expect(c.state.refusalsRespected).toBe(0);
    c.activate();
    expect(c.state.activeCoverMemberId).toBe('maintenance');
    expect(c.state.refusalsRespected).toBe(3);
    expect(c.state.aiActions).toBe(1);
  });
  it('does not inflate refusal evidence through toggles before an actual exclusion', () => {
    const c = scenario('cover');
    c.run({ type: 'understand', args: ['packing'] });
    for (let i = 0; i < 10; i++) {
      c.run({ type: 'consentToCover', args: ['packing', true] });
      c.run({ type: 'consentToCover', args: ['packing', false] });
    }
    expect(c.state.refusalsRespected).toBe(0);
    c.run({ type: 'simulateResponses', args: [] });
    c.activate();
    expect(c.state.refusalsRespected).toBe(3);
    expect(c.activate().changed).toBe(false);
    expect(c.state.refusalsRespected).toBe(3);
  });
  it('separates consultative voice, team consent, member voting and bounded authority', () => {
    const c = scenario();
    c.run({ type: 'configure', args: [{ governance: 'consultative' }] });
    for (const m of c.state.members) {
      c.run({ type: 'understand', args: [m.id] });
      c.run({ type: 'vote', args: [m.id, false] });
    }
    expect(c.activate().changed).toBe(true);
    const team = scenario();
    team.run({ type: 'configure', args: [{ governance: 'team-consent' }] });
    team.respond();
    team.run({ type: 'vote', args: ['packing', false] });
    expect(team.activate().changed).toBe(false);
    const advice = scenario();
    advice.run({ type: 'configure', args: [{ aiAuthority: 'advice' }] });
    advice.respond();
    expect(advice.activate().reason).toContain('Advice-only');
  });
  it('keeps pilot role decisions entirely read-only while permitting planning choices', () => {
    const c = scenario('steady', 'pilot');
    const before = c.state;
    const commands: WorkplaceCommand[] = [
      { type: 'understand', args: ['packing'] },
      { type: 'vote', args: ['packing', true] },
      { type: 'sharePreference', args: ['packing', true] },
      { type: 'object', args: ['mind', 'rest'] },
      { type: 'elect', args: ['packing', 'packing'] },
      { type: 'chooseTask', args: ['packing', 'Pallet checks'] },
      { type: 'voteSurplus', args: ['packing', 'members'] },
    ];
    for (const command of commands) {
      expect(c.run(command).changed).toBe(false);
      expect(c.state).toBe(before);
    }
    expect(c.run({ type: 'configure', args: [{ aiAuthority: 'advice' }] }).changed).toBe(true);
    expect(c.run({ type: 'selectPlan', args: ['cover'] }).changed).toBe(true);
  });
  it('bounds objection history at the same limit accepted by persistence', () => {
    const c = scenario();
    for (let i = 0; i < 32; i++) {
      expect(c.run({ type: 'object', args: ['mind', 'authority'] }).changed).toBe(true);
      c.run({ type: 'resolveObjection', args: [c.state.objections.at(-1)!.id, 'mind'] });
    }
    expect(c.run({ type: 'object', args: ['mind', 'rest'] }).changed).toBe(false);
    c.respond();
    c.activate();
    c.run({ type: 'tick', args: [4, 30, false] });
    expect(restoreWorkplace(saveWorkplace(c.state)).finance).toEqual({
      ...c.state.finance,
      wageReserve: 0,
      compensationReserve: 0,
    });
  });

  it('is deterministic, isolated and neutral before opt-in', () => {
    const a = createWorkplace();
    expect(a).toEqual(createWorkplace());
    expect(workplaceCapacity(a)).toBe(1);
    expect(a.finance.cash).toBe(400);
    a.members[0].eligibleTasks.push('Unsafe');
    expect(createWorkplace().members[0].eligibleTasks).not.toContain('Unsafe');
  });
  it('requires individual understanding before every ballot', () => {
    const c = scenario();
    const before = c.state;
    expect(c.run({ type: 'vote', args: ['packing', true] }).changed).toBe(false);
    expect(c.state).toBe(before);
    expect(c.activate().changed).toBe(false);
    c.respond();
    expect(c.activate().changed).toBe(true);
    expect(workplaceCapacity(c.state)).toBe(0.78);
    expect(c.state.finance.wageReserve).toBe(108);
    conserved(c.state);
  });
  it('blocks an illegal rush even with unanimous understanding and approval', () => {
    const c = scenario('rush');
    c.respond();
    const before = c.state;
    expect(c.activate().reason).toContain('minimum rest');
    expect(c.state).toBe(before);
    expect(c.state.finance.wageReserve).toBe(0);
  });
  it('never treats a majority vote as cover consent', () => {
    const c = scenario('cover');
    c.respond();
    expect(c.activate().reason).toContain('separately consent');
    expect(c.run({ type: 'consentToCover', args: ['quality', true] }).changed).toBe(false);
    c.run({ type: 'consentToCover', args: ['packing', true] });
    expect(c.activate().changed).toBe(true);
    expect(c.state.activeCoverMemberId).toBe('packing');
    expect(c.state.finance.compensationReserve).toBe(8);
  });
  it('clears understanding, ballots and cover consent when any terms change', () => {
    const c = scenario('cover');
    c.run({ type: 'simulateResponses', args: [] });
    const old = c.state.revision;
    c.run({ type: 'configure', args: [{ aiAuthority: 'advice' }] });
    expect(
      c.state.members.every((m) => !m.understood && m.ballot === null && m.coverConsent === null)
    ).toBe(true);
    expect(c.run({ type: 'activate', args: [old] }).reason).toContain('Stale');
    expect(c.activate().changed).toBe(false);
  });
  it('rechecks sufficient funds atomically', () => {
    const c = scenario('resequence');
    c.respond();
    const poor = { ...c.state, finance: { ...c.state.finance, cash: 147 } };
    const result = transitionWorkplace(poor, { type: 'activate', args: [poor.revision] });
    expect(result.changed).toBe(false);
    expect(result.state).toBe(poor);
    expect(poor.finance.improvementSpend).toBe(0);
  });
  it('keeps simulation responses Game-only and respects authored refusals', () => {
    const c = scenario('cover');
    c.run({ type: 'simulateResponses', args: [] });
    expect(c.state.members.filter((m) => m.coverConsent === false).length).toBeGreaterThanOrEqual(
      1
    );
    c.activate();
    c.run({ type: 'tick', args: [10, 50, false] });
    for (const m of c.state.members.filter((m) => m.coverConsent === false)) {
      expect(m.extraMinutes).toBe(0);
      expect(m.earnedPay).toBe(3);
    }
    expect(c.state.members.filter((m) => m.extraMinutes > 0)).toHaveLength(1);
    expect(c.state.finance.compensationPaid).toBe(8);
    expect(c.state.finance.compensationReserve).toBe(0);
    expect(workplaceCapacity(c.state)).toBe(0.78);
    conserved(c.state);
    for (const mode of ['workshop', 'pilot'] as const)
      expect(scenario('steady', mode).run({ type: 'simulateResponses', args: [] }).changed).toBe(
        false
      );
  });
  it('selects the least burdened eligible consenting member fairly', () => {
    const c = scenario('cover');
    c.run({ type: 'simulateResponses', args: [] });
    c.state.members.find((m) => m.id === 'maintenance')!.extraMinutes = 5;
    expect(c.activate().changed).toBe(true);
    expect(c.state.activeCoverMemberId).toBe('packing');
  });
  it('withdrawal immediately stops burden, retains earned compensation and releases only unused earmarks', () => {
    const c = scenario('cover');
    c.run({ type: 'simulateResponses', args: [] });
    c.activate();
    const id = c.state.activeCoverMemberId!;
    c.run({ type: 'tick', args: [4, 0, false] });
    expect(c.state.finance.compensationPaid).toBeCloseTo(3.2);
    expect(c.state.finance.compensationReserve).toBeCloseTo(4.8);
    c.run({ type: 'withdraw', args: [id] });
    const cash = c.state.finance.cash;
    expect(c.state.finance.compensationReserve).toBe(0);
    expect(c.state.activeCoverMemberId).toBeNull();
    expect(c.state.members.find((m) => m.id === id)?.recoveryOwedMinutes).toBe(10);
    const before = c.state;
    expect(c.run({ type: 'withdraw', args: [id] }).changed).toBe(false);
    expect(c.state).toBe(before);
    c.run({ type: 'tick', args: [3, 0, false] });
    expect(c.state.finance.compensationPaid).toBeCloseTo(3.2);
    expect(c.state.finance.cash).toBeCloseTo(cash - 3.6);
    conserved(c.state);
  });
  it('respects bounded consent expiry and prevents double activation or settlement', () => {
    const c = scenario('cover');
    c.run({ type: 'simulateResponses', args: [] });
    c.activate();
    const started = c.state;
    expect(c.activate().changed).toBe(false);
    expect(c.state).toBe(started);
    c.run({ type: 'tick', args: [100, 100, false] });
    expect(c.state.minute).toBe(90);
    expect(c.state.phase).toBe('review');
    expect(c.state.shippedKg).toBe(90);
    expect(c.state.members.every((m) => m.coverConsent === null && !m.sharing)).toBe(true);
    expect(c.state.finance.wagesPaid).toBe(108);
    expect(c.state.finance.compensationPaid).toBe(8);
    const before = c.state;
    c.run({ type: 'tick', args: [10, 1000, false] });
    c.run({ type: 'stop', args: [] });
    expect(c.state).toBe(before);
    conserved(c.state);
  });
  it('requires current unexpired consent at activation even on adversarial state', () => {
    const c = scenario('cover');
    c.run({ type: 'simulateResponses', args: [] });
    c.state.minute = 90;
    expect(workplaceReadiness(c.state).reasons.join(' ')).toContain('expired');
    expect(c.activate().changed).toBe(false);
  });
  it('permits optional sharing, immediately redacts on revoke and never exports explanations', () => {
    const c = scenario();
    const explanation = c.state.members[0].preference;
    expect(JSON.stringify(projectWorkplace(c.state))).not.toContain(explanation);
    c.run({ type: 'sharePreference', args: ['packing', true] });
    expect(JSON.stringify(projectWorkplace(c.state))).toContain(explanation);
    expect(JSON.stringify(exportWorkplace(c.state))).not.toContain(explanation);
    c.run({ type: 'sharePreference', args: ['packing', false] });
    expect(JSON.stringify(projectWorkplace(c.state))).not.toContain(explanation);
    expect(JSON.stringify(saveWorkplace(c.state))).not.toContain(explanation);
  });
  it('allows human and mind objections, with raiser-only recorded resolution', () => {
    const c = scenario();
    c.respond();
    c.run({ type: 'object', args: ['mind', 'authority'] });
    expect(c.activate().changed).toBe(false);
    const id = c.state.objections[0].id;
    expect(c.run({ type: 'resolveObjection', args: [id, 'coordinator'] }).changed).toBe(false);
    expect(c.run({ type: 'configure', args: [{ practices: [] }] }).changed).toBe(false);
    expect(c.run({ type: 'resolveObjection', args: [id, 'mind'] }).changed).toBe(true);
    expect(c.state.objections[0].resolution).toContain('reviewed');
    expect(c.activate().changed).toBe(true);
    c.run({ type: 'object', args: ['packing', 'rest'] });
    expect(c.state.phase).toBe('review');
    expect(workplaceCapacity(c.state)).toBe(1);
  });
  it('halts immediately on emergency without adding work or product', () => {
    const c = scenario('cover');
    c.run({ type: 'simulateResponses', args: [] });
    c.activate();
    c.run({ type: 'tick', args: [1, 20, false] });
    const before = c.state.finance.compensationPaid;
    c.run({ type: 'tick', args: [10, 500, true] });
    expect(c.state.shippedKg).toBe(20);
    expect(c.state.finance.compensationPaid).toBe(before);
    expect(c.state.phase).toBe('review');
    conserved(c.state);
  });
  it('rejects active reconfiguration and preserves the minimum even with optional modules disabled', () => {
    const c = scenario();
    c.run({ type: 'configure', args: [{ practices: [] }] });
    c.respond();
    c.activate();
    expect(c.state.members.every((m) => m.restMinutes === 0)).toBe(true);
    expect(c.run({ type: 'configure', args: [{ governance: 'consultative' }] }).changed).toBe(
      false
    );
    expect(c.run({ type: 'selectPlan', args: ['rush'] }).changed).toBe(false);
    expect(c.run({ type: 'object', args: ['mind', 'rest'] }).changed).toBe(true);
  });
  it('restricts qualified work choice and invalidates changed tasks', () => {
    const c = scenario();
    c.respond();
    expect(c.run({ type: 'chooseTask', args: ['packing', 'Quality release'] }).changed).toBe(false);
    expect(c.run({ type: 'chooseTask', args: ['packing', 'Pallet checks'] }).changed).toBe(true);
    expect(c.state.members[0].understood).toBe(false);
  });
  it('requires cooperative member votes and a real majority to elect a chair', () => {
    const c = scenario();
    expect(c.run({ type: 'elect', args: ['mind', 'packing'] }).changed).toBe(false);
    c.run({ type: 'elect', args: ['packing', 'packing'] });
    c.run({ type: 'elect', args: ['quality', 'packing'] });
    expect(c.state.electedChair).toBeNull();
    c.run({ type: 'elect', args: ['maintenance', 'packing'] });
    expect(c.state.electedChair).toBe('packing');
    c.run({ type: 'elect', args: ['quality', 'quality'] });
    expect(c.state.electedChair).toBeNull();
  });
  it('never distributes starting capital, and distributes positive net surplus once in equal shares', () => {
    const empty = scenario();
    empty.respond();
    empty.activate();
    empty.run({ type: 'stop', args: [] });
    for (const id of ['packing', 'quality', 'maintenance'])
      empty.run({ type: 'voteSurplus', args: [id, 'members'] });
    expect(empty.run({ type: 'distributeSurplus', args: [] }).changed).toBe(false);
    expect(empty.state.finance.cash).toBe(400);
    const c = scenario('resequence');
    c.respond();
    c.activate();
    c.run({ type: 'tick', args: [90, 600, false] });
    for (const id of ['packing', 'quality', 'maintenance'])
      c.run({ type: 'voteSurplus', args: [id, 'members'] });
    expect(c.run({ type: 'distributeSurplus', args: [] }).changed).toBe(true);
    expect(c.state.finance.distributed).toBeCloseTo(32);
    expect(c.state.finance.cash).toBeCloseTo(400);
    expect(new Set(c.state.members.map((m) => m.earnedPay)).size).toBe(1);
    const before = c.state;
    expect(c.run({ type: 'distributeSurplus', args: [] }).changed).toBe(false);
    expect(c.state).toBe(before);
    conserved(c.state);
  });
  it('workshop uses manual responses with no production effect; pilot never activates', () => {
    const workshop = scenario('steady', 'workshop');
    workshop.respond();
    expect(workshop.activate().changed).toBe(true);
    expect(workplaceCapacity(workshop.state)).toBe(1);
    workshop.run({ type: 'tick', args: [10, 500, false] });
    expect(workshop.state.shippedKg).toBe(0);
    const pilot = scenario('steady', 'pilot');
    pilot.respond();
    expect(pilot.activate().changed).toBe(false);
    const before = pilot.state;
    pilot.run({ type: 'tick', args: [90, 600, false] });
    expect(pilot.state).toBe(before);
    expect(workplaceCapacity(pilot.state)).toBe(1);
  });
  it('forecasts derive from the same seed and supply with no democracy bonus', () => {
    expect(compareWorkplacePlans(1)).toEqual(compareWorkplacePlans(1));
    expect(compareWorkplacePlans(1)).not.toEqual(compareWorkplacePlans(2));
    const forecasts = compareWorkplacePlans(17);
    expect(forecasts.find((p) => p.planId === 'rush')?.permitted).toBe(false);
    expect(forecasts.every((p) => p.forecastKg <= 600)).toBe(true);
    expect(exportWorkplace(createWorkplace()).forecastLabel).toContain('not measured outcomes');
  });
  it('rejects non-finite ticks, unknown actions and invalid config without publishing writes', () => {
    const c = scenario();
    c.respond();
    c.activate();
    const before = c.state;
    for (const args of [
      [NaN, 0, false],
      [1, Infinity, false],
      [-1, 3, false],
      [1, -4, false],
    ] as [number, number, boolean][])
      expect(c.run({ type: 'tick', args }).changed).toBe(false);
    expect(c.state).toBe(before);
    const d = scenario();
    expect(d.run({ type: 'configure', args: [{ practices: ['rest', 'rest'] }] }).changed).toBe(
      false
    );
  });
  it('bounds event history without retaining preference explanations in logs', () => {
    const c = scenario();
    c.run({ type: 'understand', args: ['packing'] });
    for (let i = 0; i < 150; i++) c.run({ type: 'vote', args: ['packing', i % 2 === 0] });
    expect(c.state.events).toHaveLength(120);
    expect(new Set(c.state.events.map((e) => e.id)).size).toBe(120);
    expect(JSON.stringify(c.state.events)).not.toContain(c.state.members[0].preference);
  });
});

describe('defensive settled persistence', () => {
  it('saves active work already settled, with incurred compensation, wages and recovery retained', () => {
    const c = scenario('cover');
    c.run({ type: 'simulateResponses', args: [] });
    c.activate();
    c.run({ type: 'tick', args: [4, 30, false] });
    const saved = saveWorkplace(c.state);
    const restored = restoreWorkplace(saved);
    expect(c.state.phase).toBe('active');
    expect(restored.phase).toBe('review');
    expect(restored.minute).toBe(4);
    expect(restored.finance.compensationPaid).toBeCloseTo(3.2);
    expect(restored.finance.wagesPaid).toBeCloseTo(4.8);
    expect(restored.finance.wageReserve).toBe(0);
    expect(restored.finance.compensationReserve).toBe(0);
    expect(restored.activeCoverMemberId).toBeNull();
    expect(
      restored.members.every((m) => m.coverConsent === null && !m.sharing && !m.understood)
    ).toBe(true);
    expect(workplaceCapacity(restored)).toBe(1);
    conserved(restored);
    const again = restoreWorkplace(saveWorkplace(restored));
    expect(again.finance).toEqual(restored.finance);
  });
  it('rejects raw active snapshots instead of restoring authority', () => {
    const c = scenario();
    c.respond();
    c.activate();
    expect(restoreWorkplace(c.state)).toEqual(createWorkplace());
  });
  it('rejects malformed, invented identities, malicious values and unbacked balances', () => {
    const c = scenario('cover');
    c.run({ type: 'simulateResponses', args: [] });
    c.activate();
    c.run({ type: 'tick', args: [4, 30, false] });
    const saved = saveWorkplace(c.state) as WorkplaceState;
    const mutators: ((s: WorkplaceState) => void)[] = [
      (s) => {
        s.finance.cash = Infinity;
      },
      (s) => {
        s.finance.cash += 100;
      },
      (s) => {
        s.members[0].id = 'real-person';
      },
      (s) => {
        s.members[0].eligibleTasks.push('Quality release');
      },
      (s) => {
        s.members[0].coverConsent = true;
      },
      (s) => {
        s.members[0].sharing = true;
      },
      (s) => {
        s.members[0].earnedPay = 500;
      },
      (s) => {
        s.finance.distributed = 100;
      },
      (s) => {
        s.chairBallots.mind = 'packing';
      },
      (s) => {
        s.practices.push('rest');
      },
      (s) => {
        s.members[0].preference = 'Private real health data';
      },
    ];
    for (const mutate of mutators) {
      const tampered = structuredClone(saved);
      mutate(tampered);
      expect(restoreWorkplace(tampered)).toEqual(createWorkplace());
    }
    for (const bad of [null, [], {}, { workplace: saved }, 'bad'])
      expect(restoreWorkplace(bad)).toEqual(createWorkplace());
  });
  it('round trips idle and distributed review records', () => {
    expect(restoreWorkplace(saveWorkplace(createWorkplace())).phase).toBe('idle');
    const c = scenario();
    c.respond();
    c.activate();
    c.run({ type: 'tick', args: [90, 600, false] });
    for (const id of ['packing', 'quality', 'maintenance'])
      c.run({ type: 'voteSurplus', args: [id, 'members'] });
    c.run({ type: 'distributeSurplus', args: [] });
    const restored = restoreWorkplace(saveWorkplace(c.state));
    expect(restored.finance).toEqual(c.state.finance);
    expect(restored.distributionComplete).toBe(true);
    conserved(restored);
  });
});
