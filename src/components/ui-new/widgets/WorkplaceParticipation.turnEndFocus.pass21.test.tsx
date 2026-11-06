import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { useWorkplaceAutoplay } from '../../../simulation/workplaceAutoplay';
import { useUIStore } from '../../../stores/uiStore';
import { WorkplaceLab } from './WorkplaceLab';

beforeEach(() => {
  useWorkplaceAutoplay.getState().pause();
  useUIStore.setState({ hasSeenIntro: true, journeyVisible: false });
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
    completedCampaigns: [],
    leftCampaigns: [],
  });
});

// A role whose own decision changes the terms (here, choosing its work) ends
// its turn, and every control of that role is disabled under it. A browser
// then drops focus to <body>, where Space is the forklift emergency stop.
it('moves focus to the handover when a role ends its own turn by changing the terms', async () => {
  const get = () => useWorkplaceStore.getState();
  get().setParticipationMode('separate-turns');
  get().start('workshop', 17);
  render(<WorkplaceLab />);
  fireEvent.click(screen.getByRole('button', { name: 'Begin participant turn' }));
  fireEvent.click(screen.getByRole('button', { name: 'Agreement / Voices' }));
  const choice = screen.getByLabelText('Work choice: Packing') as HTMLSelectElement;
  act(() => choice.focus());
  expect(choice).toHaveFocus();
  const other = [...choice.options].find((o) => o.value !== choice.value)!.value;
  fireEvent.change(choice, { target: { value: other } });
  // The decision was recorded and the terms changed, which ends the turn.
  expect(get().workplace.members[0].chosenTask).toBe(other);
  expect(get().turn).toBeNull();
  expect(screen.getByLabelText('Work choice: Packing')).toBeDisabled();
  await waitFor(() => expect(screen.getByLabelText('Hand over to fictional role')).toHaveFocus());
});
