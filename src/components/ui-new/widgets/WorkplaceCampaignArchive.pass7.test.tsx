import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkplaceCampaignArchive } from './WorkplaceCampaignArchive';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { bilateralWorkplaceMessages } from '../../../simulation/bilateralWorkplace.messages';
import { createWorkplace, transitionWorkplace } from '../../../simulation/bilateralWorkplace';
import type { WorkplaceState } from '../../../types/workplace';

afterEach(cleanup);

/** A final-shift review, ended by a reload (resumable) or by an explicit stop. */
function finalReview(reason: string): WorkplaceState {
  const started = transitionWorkplace(createWorkplace(), {
    type: 'startCampaign',
    args: ['cooperative', 17],
  }).state;
  return {
    ...started,
    phase: 'review',
    minute: 20,
    reviewReason: reason,
    campaign: { ...started.campaign!, shift: 2 },
  };
}

describe('Archive control, seventh pass', () => {
  it('is not offered for a final shift a reload paused, and says why', () => {
    useWorkplaceStore.setState({
      workplace: finalReview(bilateralWorkplaceMessages.en.evReloadSafety),
      completedCampaigns: [],
      leftCampaigns: [],
    });
    render(<WorkplaceCampaignArchive onFreshExercise={() => undefined} />);
    expect(
      screen.getByRole('button', { name: 'Archive review and open a fresh exercise' })
    ).toBeDisabled();
    expect(screen.getByText(/A reload paused the final shift/)).toBeInTheDocument();
  });

  it.each([
    [
      bilateralWorkplaceMessages.en.settleEmergencyPaused,
      /An emergency stop or drill paused the final shift/,
    ],
    [bilateralWorkplaceMessages.en.settleObjectionPaused, /An objection paused the final shift/],
  ])('names a safety or objection pause as the hold, not a reload (%s)', (reason, copy) => {
    useWorkplaceStore.setState({
      workplace: finalReview(reason),
      completedCampaigns: [],
      leftCampaigns: [],
    });
    render(<WorkplaceCampaignArchive onFreshExercise={() => undefined} />);
    expect(
      screen.getByRole('button', { name: 'Archive review and open a fresh exercise' })
    ).toBeDisabled();
    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.queryByText(/A reload paused/)).toBeNull();
  });

  it('is offered for a final shift that was ended', () => {
    useWorkplaceStore.setState({
      workplace: finalReview('Shift stopped.'),
      completedCampaigns: [],
      leftCampaigns: [],
    });
    render(<WorkplaceCampaignArchive onFreshExercise={() => undefined} />);
    expect(
      screen.getByRole('button', { name: 'Archive review and open a fresh exercise' })
    ).toBeEnabled();
  });
});
