import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { useWorkplaceAutoplay } from '../../../simulation/workplaceAutoplay';
import { workplaceAutoplayMessages } from '../../../simulation/workplaceAutoplay.messages';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';
import { WorkplaceAutomaticDemo } from './WorkplaceParticipation';
import { workplaceParticipationMessages } from './WorkplaceParticipation.messages';
import { LOCALES, setLocale } from '../../../i18n';

beforeEach(() => {
  setLocale('en');
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  // D4: a season starts only after the first delivery.
  fulfilFirstDelivery();
});
afterEach(() => {
  useWorkplaceAutoplay.getState().pause();
  cleanup();
  setLocale('en');
  vi.useRealTimers();
});

describe('the automatic season names its controls for what they do', () => {
  it('"Keep decisions manual" is disabled while the runner is stopped and already manual', () => {
    render(<WorkplaceAutomaticDemo profile="toe-dip" />);
    expect(screen.getByRole('button', { name: 'Keep decisions manual' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Let fictional roles decide' })).toBeEnabled();
  });

  it('before any choice it still opts out of the default season', () => {
    useWorkplaceAutoplay.setState({ manual: false, resumeProfile: null });
    render(<WorkplaceAutomaticDemo profile="toe-dip" />);
    const keep = screen.getByRole('button', { name: 'Keep decisions manual' });
    expect(keep).toBeEnabled();
    fireEvent.click(keep);
    expect(useWorkplaceAutoplay.getState().manual).toBe(true);
    expect(screen.getByRole('button', { name: 'Keep decisions manual' })).toBeDisabled();
  });

  it('pausing hands focus back to the hand-back control, not to the page', async () => {
    vi.useFakeTimers();
    render(<WorkplaceAutomaticDemo profile="toe-dip" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let fictional roles decide' }));
    const pause = screen.getByRole('button', { name: 'Pause automatic demo' });
    expect(document.activeElement).toBe(pause);
    fireEvent.click(pause);
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    expect(useWorkplaceAutoplay.getState().running).toBe(false);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Let fictional roles decide' })
    );
  });

  it('a season that stops by itself moves focus off the disabled control', () => {
    render(<WorkplaceAutomaticDemo profile="toe-dip" />);
    fireEvent.click(screen.getByRole('button', { name: 'Let fictional roles decide' }));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Pause automatic demo' })
    );
    act(() => useWorkplaceAutoplay.getState().pause());
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Let fictional roles decide' })
    );
  });

  // D14: the stop notice no longer carries a restart hint; the hand-back
  // control keeps its label beside the stop's reason in the panel.
  it.each(LOCALES)('in %s no stop line points the player at the hand-back control', (locale) => {
    for (const line of Object.values(workplaceAutoplayMessages[locale]))
      expect(line).not.toContain(workplaceParticipationMessages[locale].skipGuide);
  });

  it.each([
    ['en', /finished/, /archive/],
    ['pt-BR', /concluída/, /arquive/],
  ] as const)(
    'in %s the finished season says to review and archive it',
    (locale, done, archive) => {
      const line = workplaceAutoplayMessages[locale].seasonComplete;
      expect(line).toMatch(done);
      expect(line).toMatch(archive);
      expect(line).not.toMatch(/reload|recarreg/i);
    }
  );
});
