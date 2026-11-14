import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useWorkplaceReplayStore } from '../../../stores/workplaceReplayStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import {
  REQUIRED_REPLAY_PARTICIPANTS,
  endReplayClock,
  registerReplayParticipant,
} from '../../../simulation/workplaceReplayRuntime';
import { setLocale } from '../../../i18n';
import { fulfilFirstDelivery } from '../../../test/firstDelivery';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

let unregister: Array<() => void> = [];
beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useWorkplaceReplayStore.setState(useWorkplaceReplayStore.getInitialState());
  useSafetyStore.setState(useSafetyStore.getInitialState());
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  // D4: a season starts only after the first delivery.
  fulfilFirstDelivery();
  useGameSimulationStore.getState().setGameSpeed(0);
  useWorkplaceStore.setState({
    workplace: createWorkplace('game', 17),
    participationMode: 'solo',
    turn: null,
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
  setLocale('en');
});

// Replay run reviews live in memory only (the replay store is not persisted),
// so the copy must not promise they are recorded or retained beyond a reload.
describe('Workplace lane, pass twenty: replay copy says runs last until the page reloads', () => {
  it.each([
    ['en', /until the page reloads/, /recorded locally/i, /Retain actual run review/],
    ['pt-BR', /até a página ser recarregada/, /registrado localmente/i, /^Guardar a revisão/],
  ] as const)('%s', (locale, lasts, recorded, retain) => {
    act(() => setLocale(locale));
    expect(useWorkplaceReplayStore.getState().capture(17).changed).toBe(true);
    expect(useWorkplaceReplayStore.getState().begin('toe-dip').changed).toBe(true);
    useWorkplaceStore.getState().stop();
    render(<WorkplaceLab />);
    fireEvent.click(screen.getAllByRole('button', { name: /Experiment|Experimento/ })[0]);
    const panel = screen.getByRole('region', { name: /Matched plant replay|Reprodução pareada/ });
    // D14 cut the capture-rules and replay-note captions; how long a run
    // lasts is now on the Keep button and in the status it answers with.
    const notes = [...panel.querySelectorAll('p')].filter((p) => lasts.test(p.textContent ?? ''));
    expect(notes).toHaveLength(0);
    const keep = [...panel.querySelectorAll('button')].find((b) =>
      /revis|review/i.test(b.textContent ?? '')
    )!;
    expect(keep.textContent).not.toMatch(retain);
    fireEvent.click(keep);
    expect(useWorkplaceReplayStore.getState().runs).toHaveLength(1);
    const status = within(panel).getByRole('status');
    expect(status.textContent).not.toMatch(recorded);
    expect(status.textContent).toMatch(lasts);
  });
});
