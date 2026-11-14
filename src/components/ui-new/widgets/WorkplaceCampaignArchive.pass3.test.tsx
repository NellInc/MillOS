import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkplaceLeaveSeason } from './WorkplaceCampaignArchive';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useWorkplaceReplayStore } from '../../../stores/workplaceReplayStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';

beforeEach(() => {
  endReplayClock();
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    completedCampaigns: [],
    leftCampaigns: [],
  });
  useWorkplaceReplayStore.setState({ activeRunId: null });
});
afterEach(cleanup);

describe('leaving a season, third pass', () => {
  it('does not keep saying a season was left once another season is under way', () => {
    fulfilFirstDelivery();
    expect(useWorkplaceStore.getState().startCampaign('toe-dip', 17).changed).toBe(true);
    render(<WorkplaceLeaveSeason />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave this season' }));
    expect(screen.getByRole('status')).toHaveTextContent('Season left early at shift 1 of 3');
    act(() => {
      fulfilFirstDelivery();
      expect(useWorkplaceStore.getState().startCampaign('team', 18).changed).toBe(true);
    });
    expect(screen.getByRole('button', { name: 'Leave this season' })).toBeEnabled();
    expect(screen.queryByText(/Season left early at shift/)).not.toBeInTheDocument();
  });
});
