import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ShiftDebrief } from './PlayableShift';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useWorkplaceReplayStore } from '../../../stores/workplaceReplayStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { setLocale } from '../../../i18n';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';

beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useOperationsCampaignStore.getState().resetCampaign();
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

// The debrief kept 'Season left early ...' as a plain string, so after a switch
// to pt-BR it stayed in English. Working if it follows the language.
describe('the shift debrief keeps the left-season status in the active language', () => {
  it('re-renders the status after a switch to pt-BR', () => {
    useOperationsCampaignStore.getState().initializeCampaign();
    fulfilFirstDelivery();
    expect(useWorkplaceStore.getState().startMission('toe-dip').changed).toBe(true);
    render(<ShiftDebrief />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave this season' }));
    const debrief = screen.getByRole('region', { name: /reports|relatórios/i });
    expect(
      within(debrief)
        .getAllByRole('status')
        .map((s) => s.textContent)
        .join(' ')
    ).toMatch(/Season left early at shift 1 of 3/);
    act(() => setLocale('pt-BR'));
    const statuses = within(debrief)
      .getAllByRole('status')
      .map((s) => s.textContent)
      .join(' ');
    expect(statuses).toMatch(/Temporada encerrada antes do fim no turno 1 de 3/);
    expect(statuses).not.toMatch(/Season left early/);
  });
});
