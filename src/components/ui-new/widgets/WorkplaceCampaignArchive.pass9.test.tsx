import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkplaceLeaveSeason } from './WorkplaceCampaignArchive';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useWorkplaceReplayStore } from '../../../stores/workplaceReplayStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import {
  REQUIRED_REPLAY_PARTICIPANTS,
  endReplayClock,
  registerReplayParticipant,
} from '../../../simulation/workplaceReplayRuntime';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';

let unregister: Array<() => void> = [];
beforeEach(() => {
  endReplayClock();
  useWorkplaceReplayStore.setState(useWorkplaceReplayStore.getInitialState());
  useSafetyStore.setState(useSafetyStore.getInitialState());
  useOperationsCampaignStore.getState().initializeCampaign();
  // D4: a season starts only after the first delivery.
  fulfilFirstDelivery();
  useGameSimulationStore.getState().setGameSpeed(0);
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
    leftCampaigns: [],
  });
  const actor = { at: 1 };
  unregister = REQUIRED_REPLAY_PARTICIPANTS.map((id) =>
    registerReplayParticipant(id, {
      capture: () => ({ ...actor }),
      restore: (saved) => Object.assign(actor, saved),
    })
  );
});
afterEach(() => {
  cleanup();
  unregister.forEach((fn) => fn());
  unregister = [];
  endReplayClock();
  useWorkplaceReplayStore.setState(useWorkplaceReplayStore.getInitialState());
});

/** A replay run brought to review: stopped in deliberation, nothing owed. */
function reviewedReplay() {
  expect(useWorkplaceReplayStore.getState().capture(17).changed).toBe(true);
  expect(useWorkplaceReplayStore.getState().begin('toe-dip').changed).toBe(true);
  expect(useWorkplaceStore.getState().stop().changed).toBe(true);
}

describe('Workplace lane, ninth pass: a retained replay no longer blocks the season', () => {
  it('still blocks leaving while the replay runs', () => {
    reviewedReplay();
    render(<WorkplaceLeaveSeason />);
    expect(screen.getByRole('button', { name: 'Leave this season' })).toBeDisabled();
    expect(screen.getByText('Finish or forget the matched replay first.')).toBeInTheDocument();
  });

  // Retaining ends the replay and saves its season; the store lets it be left,
  // so the control must not keep saying the replay is unfinished.
  it('offers leaving once the review is retained, and it works', () => {
    reviewedReplay();
    expect(useWorkplaceReplayStore.getState().record().changed).toBe(true);
    render(<WorkplaceLeaveSeason />);
    expect(screen.queryByText('Finish or forget the matched replay first.')).toBeNull();
    const leave = screen.getByRole('button', { name: 'Leave this season' });
    expect(leave).toBeEnabled();
    fireEvent.click(leave);
    expect(useWorkplaceStore.getState().leftCampaigns).toHaveLength(1);
  });
});
