import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { useEventAnnouncementScheduler } from './shared';
import { sharedMessages } from './shared.messages';

vi.mock('../../scada/SCADAService', () => ({ peekSCADAService: () => null }));
vi.mock('../../utils/audioManager', () => ({ audioManager: { muted: false } }));

const en = sharedMessages.en;
const NAME = 'R.M. 949';
const WARNING = en.machineWarning.replace('{machine}', NAME);
const CRITICAL = en.machineCritical.replace('{machine}', NAME);

const live = (): string[] =>
  useAnnouncementsStore
    .getState()
    .announcements.filter((announcement) => !announcement.dismissed)
    .map((announcement) => announcement.message);

// Each test uses its own machine id: the scheduler's per-machine status and
// cooldown records are module state and outlive a single test.
let machineId = 'fault-recovery-rm';
let serial = 0;
const setStatus = (status: string) =>
  useProductionStore.setState({
    machines: [{ id: machineId, name: NAME, status }],
  } as never);

// A fault caption describes a machine in trouble. Once the machine is out of
// trouble the caption is false, whether or not a recovery line gets spoken.
describe('a machine fault caption goes when the machine recovers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUIStore.setState({ alerts: [] });
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
      mode: 'focused',
      captionsEnabled: true,
    });
    serial += 1;
    machineId = `fault-recovery-rm-${serial}`;
    setStatus('running');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retires the fault line when the recovery line is held by its cooldown', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5_000); // t5: baseline running
    setStatus('warning');
    vi.advanceTimersByTime(5_000); // t10: warning captioned
    vi.advanceTimersByTime(20_000);
    setStatus('running');
    vi.advanceTimersByTime(5_000); // t35: recovery captioned
    setStatus('warning');
    vi.advanceTimersByTime(10_000); // t45: second warning captioned
    expect(live()).toContain(WARNING);
    setStatus('running');
    vi.advanceTimersByTime(5_000); // t50: recovery inside its 30 s cooldown
    expect(live()).not.toContain(WARNING);
    hook.unmount();
  });

  it('retires a critical line when the machine recovers with the PA off', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5_000);
    setStatus('critical');
    vi.advanceTimersByTime(5_000);
    expect(live()).toContain(CRITICAL);
    // Priority 4 captions show even with the PA off.
    useAnnouncementsStore.getState().setMode('off');
    setStatus('running');
    vi.advanceTimersByTime(5_000);
    expect(live()).not.toContain(CRITICAL);
    hook.unmount();
  });

  it('retires a critical line when the machine is taken to idle', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5_000);
    setStatus('critical');
    vi.advanceTimersByTime(5_000);
    expect(live()).toContain(CRITICAL);
    setStatus('idle');
    vi.advanceTimersByTime(5_000);
    expect(live()).not.toContain(CRITICAL);
    hook.unmount();
  });

  it('keeps the recovery line and a fault line that still stands', () => {
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5_000);
    setStatus('critical');
    vi.advanceTimersByTime(5_000);
    expect(live()).toContain(CRITICAL);
    // Unrelated production-store writes do not retire a standing fault.
    useProductionStore.setState({ dailyBagsProduced: 1 } as never);
    vi.advanceTimersByTime(5_000);
    expect(live()).toContain(CRITICAL);
    setStatus('running');
    vi.advanceTimersByTime(5_000);
    expect(live()).toContain(en.machineRecovered.replace('{machine}', NAME));
    hook.unmount();
  });
});
