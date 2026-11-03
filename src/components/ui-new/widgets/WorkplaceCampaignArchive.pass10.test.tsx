import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLeaveSeason } from './WorkplaceCampaignArchive';
import { useWorkplaceStore, workplaceReasonText } from '../../../stores/workplaceStore';
import { useWorkplaceReplayStore } from '../../../stores/workplaceReplayStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { setLocale } from '../../../i18n';
import type { WorkplaceTransitionResult } from '../../../types/workplace';

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

// "Season left early" is kept as a status line here and on the guided card.
// Working if it reads in the language chosen after leaving.
describe('leaving a season, tenth pass', () => {
  it('re-renders the left-early status in the language chosen after leaving', () => {
    expect(useWorkplaceStore.getState().startCampaign('toe-dip', 17).changed).toBe(true);
    render(<WorkplaceLeaveSeason />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave this season' }));
    expect(screen.getByRole('status')).toHaveTextContent('Season left early at shift 1 of 3');
    act(() => setLocale('pt-BR'));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Temporada encerrada antes do fim no turno 1 de 3'
    );
  });

  it('hands the guided card a keyed result it can re-render', () => {
    expect(useWorkplaceStore.getState().startCampaign('toe-dip', 17).changed).toBe(true);
    const onLeft = vi.fn<(message: string, result?: WorkplaceTransitionResult) => void>();
    render(<WorkplaceLeaveSeason onLeft={onLeft} />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave this season' }));
    expect(onLeft).toHaveBeenCalledTimes(1);
    const [message, result] = onLeft.mock.calls[0];
    expect(message).toMatch(/^Season left early at shift 1 of 3/);
    setLocale('pt-BR');
    expect(workplaceReasonText(result!)).toMatch(/^Temporada encerrada antes do fim no turno 1/);
  });
});
