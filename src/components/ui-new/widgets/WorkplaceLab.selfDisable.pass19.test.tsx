import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkplaceLab } from './WorkplaceLab';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../../../stores/materialFlowStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { setLocale } from '../../../i18n';

vi.mock('../../../agent/client/executeAgentCommand', () => ({ executeAgentCommand: vi.fn() }));

// Browsers run the focus fixup rule: a focused control that becomes disabled
// loses focus to <body>. jsdom does not, so the test does what the browser does
// (jsdom's blur() ignores a disabled element; removing a focused one does not).
const fixupFocus = () => {
  const active = document.activeElement as HTMLButtonElement | null;
  if (!active || active === document.body || !active.disabled) return;
  const sink = document.createElement('div');
  sink.tabIndex = -1;
  document.body.appendChild(sink);
  sink.focus();
  sink.remove();
};
const nextFrame = () =>
  act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
const get = () => useWorkplaceStore.getState();

beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useMaterialFlowStore.setState(useMaterialFlowStore.getInitialState(), true);
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  useGameSimulationStore.getState().setGameSpeed(0);
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace(),
  });
});
afterEach(cleanup);

/** Presses a control its own action disables, as a browser sees it, and returns where focus went. */
async function pressSelfDisabling(name: string) {
  const control = screen.getByRole('button', { name });
  act(() => control.focus());
  fireEvent.click(control);
  expect(control).toBeDisabled();
  fixupFocus();
  await nextFrame();
  return document.activeElement as HTMLButtonElement | null;
}

// Two Lab controls disable themselves when they succeed, and a browser drops
// focus to <body>, where Space is the forklift emergency stop: Quality's
// Monday inspection (pressed while the shift runs) and "Execute agreed
// allocation". Working if focus lands on an enabled Lab control instead.
describe('Lab controls that disable themselves (pass nineteen)', () => {
  it("Quality's inspection keeps focus on an enabled control", async () => {
    expect(get().startCampaign('toe-dip', 17).changed).toBe(true);
    const workplace = structuredClone(get().workplace);
    workplace.phase = 'active';
    workplace.minute = 30;
    workplace.campaign!.shift = 1;
    useWorkplaceStore.setState({ workplace });
    render(<WorkplaceLab />);
    const active = await pressSelfDisabling('Quality initiates five-minute inspection');
    expect(get().workplace.campaign?.inspectionUntilMinute).toBe(35);
    expect(active).not.toBe(document.body);
    expect(active?.disabled).toBe(false);
  });

  it('Execute agreed allocation keeps focus on an enabled control', async () => {
    expect(get().start('game', 17).changed).toBe(true);
    const workplace = structuredClone(get().workplace);
    workplace.phase = 'review';
    workplace.finance.operatingRevenue = 100;
    workplace.finance.cash += 100;
    workplace.surplusBallots = Object.fromEntries(
      workplace.members.map((m) => [m.id, 'members' as const])
    );
    useWorkplaceStore.setState({ workplace });
    render(<WorkplaceLab />);
    fireEvent.click(screen.getByRole('button', { name: 'Review' }));
    const active = await pressSelfDisabling('Execute agreed allocation');
    expect(get().workplace.distributionComplete).toBe(true);
    expect(active).not.toBe(document.body);
    expect(active?.disabled).toBe(false);
  });
});
