import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { useAnnouncementsStore, type AnnouncementInput } from '../../stores/announcementsStore';
import { useEventAnnouncementScheduler } from './shared';

vi.mock('../../scada/SCADAService', () => ({ peekSCADAService: () => null }));
vi.mock('../../utils/audioManager', () => ({ audioManager: { muted: false } }));

// The PA card picks its icon from the announcement type, and a machine that
// has just gone into a warning is not good news: it must not be filed as a
// 'success' line (the packed-bag icon), while its recovery still is.
describe('machine status PA lines carry the type of what happened', () => {
  afterEach(() => {
    vi.useRealTimers();
    useUIStore.setState({ alerts: [] });
  });

  it('files a warning as a warning and a recovery as a success', () => {
    vi.useFakeTimers();
    const addAnnouncement = vi.fn<(input: AnnouncementInput) => void>();
    const machine = (status: string) => ({ id: 'type-a', name: 'R.M. 951', status });
    useAnnouncementsStore.setState({ mode: 'focused' });
    useProductionStore.setState({
      addAnnouncement,
      machines: [machine('running')],
    } as never);
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5000);

    useProductionStore.setState({ machines: [machine('warning')] } as never);
    vi.advanceTimersByTime(5000);
    useProductionStore.setState({ machines: [machine('running')] } as never);
    vi.advanceTimersByTime(5000);

    const types = addAnnouncement.mock.calls.map(([input]) => input.type);
    expect(types).toEqual(['warning', 'success']);
    hook.unmount();
  });
});

// The PA store keeps safety-critical lines in every mode, and a facility E-STOP
// is captioned with the PA Off, but the machine poll returned before building a
// critical alarm. Working if Off still offers a machine's critical alarm (the
// store's own Off filter decides) and nothing routine.
describe('machine status PA lines with the PA Off', () => {
  afterEach(() => {
    vi.useRealTimers();
    useAnnouncementsStore.setState({ mode: 'focused' });
    useUIStore.setState({ alerts: [] });
  });

  it('offers a critical alarm, not a warning, when the PA is Off', () => {
    vi.useFakeTimers();
    const addAnnouncement = vi.fn<(input: AnnouncementInput) => void>();
    const machine = (id: string, status: string) => ({ id, name: id, status });
    useAnnouncementsStore.setState({ mode: 'off' });
    useProductionStore.setState({
      addAnnouncement,
      machines: [machine('off-a', 'running'), machine('off-b', 'running')],
    } as never);
    const hook = renderHook(() => useEventAnnouncementScheduler());
    vi.advanceTimersByTime(5000);
    useProductionStore.setState({
      machines: [machine('off-a', 'critical'), machine('off-b', 'warning')],
    } as never);
    vi.advanceTimersByTime(5000);
    const offered = addAnnouncement.mock.calls.map(([input]) => input);
    expect(offered.some((input) => input.type === 'emergency' || input.priority >= 4)).toBe(true);
    hook.unmount();
  });
});
