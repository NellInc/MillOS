import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { createWorkplace, restoreWorkplace, saveWorkplace } from './bilateralWorkplace';
import { autoplayWorkplaceStep, useWorkplaceAutoplay } from './workplaceAutoplay';
import { demonstrationBeats } from './workplaceFairness';
import { shiftResumable } from './workplaceCampaign';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { endReplayClock } from './workplaceReplayRuntime';
import { setLocale } from '../i18n';
import { fulfilFirstDelivery } from '../test/firstDelivery';

/*
 * A campaign shift now pauses for a drill, an E-stop or an objection and
 * resumes afterwards, as it does after a reload. The "Rehearse safe reload"
 * beat must still count only a reload, not every resume.
 */

beforeEach(() => {
  setLocale('en');
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
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
afterEach(() => setLocale('en'));

const workplace = () => useWorkplaceStore.getState().workplace;
const RELOAD_BEAT = 6;

function startCampaignShift() {
  for (let i = 0; i < 400 && workplace().phase !== 'active'; i++) autoplayWorkplaceStep('toe-dip');
  expect(workplace().phase).toBe('active');
  useWorkplaceStore.getState().tick(30, 0, false);
}

describe('the safe-reload beat counts a reload, not every resume', () => {
  it.each(['en', 'pt-BR'] as const)(
    'a shift resumed after a safety stop (%s) does not rehearse a reload',
    (locale) => {
      setLocale(locale);
      startCampaignShift();
      useWorkplaceStore.getState().tick(5, 0, true);
      expect(shiftResumable(workplace())).toBe(true);
      expect(useWorkplaceStore.getState().resumeShift(workplace().revision).changed).toBe(true);
      expect(workplace().events.some((e) => e.kind === 'shift-resumed')).toBe(true);
      expect(demonstrationBeats(workplace())[RELOAD_BEAT].observed).toBe(false);
    }
  );

  it('a shift resumed after a reload still does', () => {
    startCampaignShift();
    useWorkplaceStore.setState({ workplace: restoreWorkplace(saveWorkplace(workplace())) });
    expect(useWorkplaceStore.getState().resumeShift(workplace().revision).changed).toBe(true);
    expect(workplace().phase).not.toBe('review');
    expect(demonstrationBeats(workplace())[RELOAD_BEAT].observed).toBe(true);
  });
});
