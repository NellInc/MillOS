import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createWorkplace,
  projectWorkplace,
  transitionWorkplace,
  workplaceReadiness,
  type WorkplaceCommand,
} from './bilateralWorkplace';
import { requiredChecks, WORKPLACE_CHECKS } from './workplaceCampaign';
import { setLocale } from '../i18n';
import { alertText, keyedText } from '../i18n/alertCopy';
import { useWorkplaceStore, workplaceReasonText } from '../stores/workplaceStore';
import { useWorkplaceAutoplay } from './workplaceAutoplay';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { endReplayClock } from './workplaceReplayRuntime';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useUIStore } from '../stores/uiStore';

function season() {
  let state = createWorkplace();
  const run = (command: WorkplaceCommand) => {
    const result = transitionWorkplace(state, command);
    state = result.state;
    return result;
  };
  run({ type: 'startCampaign', args: ['cooperative', 23] });
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
  return {
    run,
    get state() {
      return state;
    },
    set state(next) {
      state = next;
    },
  };
}

beforeEach(() => {
  setLocale('en');
});
afterEach(() => {
  setLocale('en');
});

// Activation refused on readiness returned the joined reasons as text with no
// key, so the Lab status line and an automatic-season stop on it (readyFunds is
// the realistic one) stayed in the language they were produced in.
describe('activation refused on readiness is keyed (pass eighteen)', () => {
  it('re-renders the refusal in the language chosen after it', () => {
    const s = season();
    s.state = { ...s.state, finance: { ...s.state.finance, cash: 0 } };
    const refused = s.run({ type: 'activate', args: [s.state.revision] });
    expect(refused.changed).toBe(false);
    expect(refused.reason).toMatch(/Funds cannot cover/);
    setLocale('pt-BR');
    const pt = workplaceReasonText(refused);
    expect(pt).not.toMatch(/Funds cannot cover/);
    expect(pt).toBe(workplaceReadiness(s.state).reasons.join(' '));
  });

  it('exposes each readiness reason as a keyed line beside the text', () => {
    const s = season();
    s.state = { ...s.state, finance: { ...s.state.finance, cash: 0 } };
    const en = workplaceReadiness(s.state);
    expect(en.reasons.length).toBeGreaterThan(0);
    expect(en.reasonsCopy).toHaveLength(en.reasons.length);
    expect(en.reasonsCopy.map((line, i) => keyedText(line, en.reasons[i]))).toEqual(en.reasons);
    setLocale('pt-BR');
    const pt = workplaceReadiness(s.state).reasons;
    expect(en.reasonsCopy.map((line) => keyedText(line, ''))).toEqual(pt);
    expect(pt).not.toEqual(en.reasons);
    // The agent projection keeps its strings and carries the keyed form.
    expect(projectWorkplace(s.state).readiness.reasonsCopy).toEqual(en.reasonsCopy);
  });

  it('keys the prohibited plan reason too', () => {
    const s = season();
    s.state = { ...s.state, planId: 'rush' };
    const readiness = workplaceReadiness(s.state);
    const idx = readiness.reasons.findIndex((r) => /cannot be waived/.test(r));
    expect(idx).toBeGreaterThanOrEqual(0);
    setLocale('pt-BR');
    expect(keyedText(readiness.reasonsCopy[idx], '')).not.toMatch(/cannot be waived/);
    expect(keyedText(readiness.reasonsCopy[idx], '')).toBe(
      workplaceReadiness(s.state).reasons[idx]
    );
  });
});

describe('an automatic season stopped on unpaid wages follows a language switch (pass eighteen)', () => {
  beforeEach(() => {
    useWorkplaceAutoplay.getState().pause();
    endReplayClock();
    useGameSimulationStore.getState().resetGameState();
    useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
    useUIStore.setState({ alerts: [] });
    useWorkplaceStore.setState({
      workplace: createWorkplace(),
      participationMode: 'solo',
      turn: null,
    });
    useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
    useOperationsCampaignStore.getState().initializeCampaign();
  });
  afterEach(() => {
    useWorkplaceAutoplay.getState().pause();
    vi.useRealTimers();
  });

  it('files a keyed stop notice and keys the runner status', () => {
    vi.useFakeTimers();
    useWorkplaceAutoplay.getState().start('team');
    vi.advanceTimersByTime(400);
    const opened = useWorkplaceStore.getState().workplace;
    expect(opened.phase).toBe('deliberating');
    useWorkplaceStore.setState({
      workplace: { ...opened, finance: { ...opened.finance, cash: 0 } },
    });
    vi.advanceTimersByTime(60_000);
    const runner = useWorkplaceAutoplay.getState();
    expect(runner.running).toBe(false);
    expect(runner.message).toMatch(/Funds cannot cover/);
    const stopped = useUIStore
      .getState()
      .alerts.find((a) => a.title === 'Automatic cooperative season stopped');
    expect(stopped).toBeDefined();
    expect(stopped!.message).toMatch(/Funds cannot cover/);
    setLocale('pt-BR');
    expect(alertText(stopped!).message).not.toMatch(/Funds cannot cover/);
    expect(alertText(stopped!).message).toMatch(/Os fundos não cobrem/);
    expect(
      workplaceReasonText({ reason: runner.message, reasonCopy: runner.reasonCopy ?? undefined })
    ).not.toMatch(/Funds cannot cover/);
  });

  // The runner has already walked every consent step when activation refuses
  // on readiness, and nothing in deliberation adds cash, so running it again
  // re-selects the same plan and stops the same way. The notice must not say
  // "To run it again...".
  it('offers no restart that would stop the same way', () => {
    vi.useFakeTimers();
    useWorkplaceAutoplay.getState().start('team');
    vi.advanceTimersByTime(400);
    const opened = useWorkplaceStore.getState().workplace;
    useWorkplaceStore.setState({
      workplace: { ...opened, finance: { ...opened.finance, cash: 0 } },
    });
    vi.advanceTimersByTime(60_000);
    const stopped = useUIStore
      .getState()
      .alerts.find((a) => a.title === 'Automatic cooperative season stopped');
    expect(stopped).toBeDefined();
    expect(stopped!.message).not.toMatch(/To run it again/);
    // It names the ways that do work: change the agreement, or leave.
    expect(stopped!.message).toMatch(/Leave this season/);
    setLocale('pt-BR');
    expect(alertText(stopped!).message).not.toMatch(/Para rodá-la de novo/);
    expect(alertText(stopped!).message).toMatch(/Sair desta temporada/);
    // Running it again does stop the same way.
    setLocale('en');
    useWorkplaceAutoplay.getState().start('team');
    vi.advanceTimersByTime(60_000);
    expect(useWorkplaceAutoplay.getState().running).toBe(false);
    expect(useWorkplaceAutoplay.getState().message).toMatch(/Funds cannot cover/);
  });
});
