import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PackingAdvice } from '../../../types/workplaceAdvice';

// The two rehearsals are isolated local models; here they answer at once with
// usable arms, so the quality rehearsal is offered. The plant fingerprint is
// held constant, so neither comparison reads as outdated.
vi.mock('../../../stores/workplaceStore', async (original) => ({
  ...(await original<typeof import('../../../stores/workplaceStore')>()),
  captureCurrentPackingPlant: () => ({ fingerprint: 'packing-v1-0000000000000000' }),
}));
vi.mock('../../../simulation/workplaceAdvice', async (original) => {
  const actual = await original<typeof import('../../../simulation/workplaceAdvice')>();
  const arm = (arrangement: PackingAdvice['arrangement']) =>
    ({
      arrangement,
      fingerprint: 'packing-v1-0000000000000000',
      reasonToAbstain: null,
      packedLowKg: 10,
      packedHighKg: 12,
      dispatchLowerKg: 0,
      dispatchUpperKg: 0,
    }) as PackingAdvice;
  const arms = () => [arm('steady'), arm('briefing'), arm('buffer')];
  return {
    ...actual,
    runPackingRehearsals: () => ({
      fingerprint: 'packing-v1-0000000000000000',
      arms: arms(),
      firstPacking: [],
    }),
    rehearseWithheldDispatch: () => ({
      baseFingerprint: 'packing-v1-0000000000000000',
      releaseAtCapture: true,
      arms: arms(),
      reasonToAbstain: null,
    }),
  };
});

import { MatchedPackingRehearsal } from './WorkplacePackingEvidence';
import { createWorkplace } from '../../../simulation/bilateralWorkplace';
import { useWorkplaceStore } from '../../../stores/workplaceStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { endReplayClock } from '../../../simulation/workplaceReplayRuntime';
import { setLocale } from '../../../i18n';

// Browsers run the focus fixup rule: a focused control that becomes disabled
// loses focus to <body>. jsdom does not, so the test does what the browser does.
const fixupFocus = () => {
  const active = document.activeElement as HTMLButtonElement | null;
  if (!active || active === document.body || !active.disabled) return;
  // jsdom's blur() ignores a disabled element; a removed focused element does
  // send focus to <body>, as the browser's fixup does.
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
beforeEach(() => {
  setLocale('en');
  endReplayClock();
  useGameSimulationStore.getState().setGameSpeed(0);
  useWorkplaceStore.setState({
    participationMode: 'solo',
    turn: null,
    workplace: createWorkplace('game', 3),
  });
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

/** Clicks a control that disables itself while its model runs, as a browser sees it. */
async function pressSelfDisabling(name: string, after: string) {
  const control = screen.getByRole('button', { name });
  control.focus();
  expect(document.activeElement).toBe(control);
  // Clicked outside an async act, so the disabled state commits before the
  // model runs, as it does in a browser.
  fireEvent.click(control);
  expect(control).toBeDisabled();
  fixupFocus();
  expect(document.activeElement).toBe(document.body);
  await waitFor(() => expect(screen.getByRole('button', { name: after })).not.toBeDisabled());
  await nextFrame();
}

// "Run matched packing rehearsal" and "Rehearse withheld dispatch release"
// disable themselves while the model runs, so a browser drops focus to <body>,
// where Space is the forklift emergency stop. Working if focus is on an
// enabled control of the rehearsal once each run finishes.
describe('matched packing rehearsal focus (pass nineteen)', () => {
  it('returns focus to the packing rehearsal control after a run', async () => {
    render(
      <MatchedPackingRehearsal state={useWorkplaceStore.getState().workplace} report={() => {}} />
    );
    await pressSelfDisabling('Run matched packing rehearsal', 'Run matched packing rehearsal');
    const active = document.activeElement as HTMLButtonElement | null;
    expect(active).not.toBe(document.body);
    expect(active?.disabled).toBe(false);
    expect(active).toBe(screen.getByRole('button', { name: 'Run matched packing rehearsal' }));
  });

  it('returns focus to the release rehearsal control after a run', async () => {
    render(
      <MatchedPackingRehearsal state={useWorkplaceStore.getState().workplace} report={() => {}} />
    );
    await pressSelfDisabling('Run matched packing rehearsal', 'Run matched packing rehearsal');
    await pressSelfDisabling(
      'Rehearse withheld dispatch release',
      'Rehearse withheld dispatch release'
    );
    const active = document.activeElement as HTMLButtonElement | null;
    expect(active).not.toBe(document.body);
    expect(active?.disabled).toBe(false);
    expect(active).toBe(screen.getByRole('button', { name: 'Rehearse withheld dispatch release' }));
  });
});
