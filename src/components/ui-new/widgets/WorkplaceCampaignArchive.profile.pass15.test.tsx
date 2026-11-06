import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceCampaignArchive } from './WorkplaceCampaignArchive';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useWorkplaceReplayStore } from '../../../stores/workplaceReplayStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import {
  MANAGEMENT_APPROACHES,
  requiredChecks,
  WORKPLACE_CHECKS,
} from '../../../simulation/workplaceCampaign';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { setLocale } from '../../../i18n';
import type { WorkplaceProfile } from '../../../types/workplace';

function finishCampaign(profile: WorkplaceProfile) {
  const store = useWorkplaceStore.getState();
  expect(store.startCampaign(profile, 17).changed).toBe(true);
  for (let shift = 0; shift < 3; shift++) {
    if (shift !== 1)
      store.campaignDecision(shift === 0 ? 'keep-target' : 'protect-refusal', 'coordinator');
    for (const actor of ['packing', 'mind']) {
      for (const check of requiredChecks(actor))
        store.answerCheck(
          actor,
          check,
          WORKPLACE_CHECKS.find((item) => item.id === check)!.correct
        );
      if (actor === 'packing') store.understand(actor);
    }
    store.vote('packing', true);
    store.simulateResponses();
    expect(store.activate(useWorkplaceStore.getState().workplace.revision).changed).toBe(true);
    while (useWorkplaceStore.getState().workplace.phase === 'active') {
      const state = useWorkplaceStore.getState().workplace;
      if (shift === 1 && state.minute >= 25 && !state.campaign?.decision)
        store.campaignDecision('inspect', 'quality');
      store.tick(5, 0, false);
    }
    if (shift < 2) store.nextCampaignShift();
  }
}

beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
    completedCampaigns: [],
    leftCampaigns: [],
  });
  useWorkplaceReplayStore.setState({ activeRunId: null });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

// The archived season's summary named its approach by internal id in English
// ("toe-dip, seed 19: ..."), where every other surface, and the Portuguese
// summary, names it ("Coordinator-led"). Working if each approach reads by the
// title the setup form gave it.
describe('a retained season names its approach, not its id (pass fifteen)', () => {
  it.each(['toe-dip', 'team', 'cooperative'] as const)('names the %s approach', (profile) => {
    finishCampaign(profile);
    render(<WorkplaceCampaignArchive onFreshExercise={vi.fn()} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Archive review and open a fresh exercise' })
    );
    const title = MANAGEMENT_APPROACHES.find((a) => a.id === profile)!.title;
    const summary = screen.getByText(/, seed \d+: delivery /);
    expect(summary.textContent).toMatch(new RegExp(`^${title}, seed \\d+: delivery `));
    expect(summary.textContent).not.toContain(`${profile},`);
  });
});
