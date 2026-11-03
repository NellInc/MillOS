import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useChronicleStore } from '../../stores/chronicleStore';
import {
  useOperationsCampaignStore,
  type ShiftCampaignReport,
} from '../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { DEFAULT_CHARTER } from '../charter';
import { createInitialState, type ChronicleState } from '../engine';
import {
  FUNNEL_STORAGE_KEY,
  MAX_FUNNEL_CHARTERS,
  emptyFunnelLog,
  installChronicleFunnel,
  parseFunnelLog,
  startFunnelSession,
  stepFunnel,
  type FunnelLog,
} from '../funnel';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}
const read = (s: ReturnType<typeof memoryStorage>): FunnelLog =>
  JSON.parse(s.data.get(FUNNEL_STORAGE_KEY) ?? 'null');

let reportCount = 0;
function closeShift() {
  reportCount += 1;
  const report: ShiftCampaignReport = {
    id: `period-report-funnel-${reportCount}`,
    shiftKey: `day-1-${reportCount}`,
    shiftLabel: 'Morning',
    startedAtMinute: 0,
    endedAtMinute: reportCount * 480,
    metrics: {
      revenue: 2000,
      energyCost: 0,
      automationCost: 0,
      wasteCost: 0,
      maintenanceCost: 0,
      demurrageCost: 0,
      latePenalties: 0,
      dispatchedKg: 3000,
      qualityFailureKg: 0,
      incidentsResolved: 0,
      automaticActions: 0,
      commitmentMinutes: 0,
    },
    completedOrderIds: [],
    openRisks: [],
    grade: 'A',
    summary: '',
  };
  useOperationsCampaignStore.setState((s) => ({ reports: [...s.reports, report].slice(-12) }));
  useChronicleStore.getState().observe(false);
}

describe('chronicle funnel, on the real store', () => {
  let stop: () => void = () => {};
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState() });
    useGameSimulationStore.getState().resolveCrisis();
  });
  afterEach(() => stop());

  it('records a signed charter, its closed shifts and its abandonment', () => {
    const storage = memoryStorage();
    let clock = 1000;
    stop = installChronicleFunnel(useChronicleStore, storage, () => clock);
    expect(read(storage)).toMatchObject({ sessions: 1, chartersSigned: 0, charters: [] });

    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    clock = 2000;
    closeShift();
    closeShift();
    const shift = useChronicleStore.getState().chronicle.shift;
    expect(shift).toBeGreaterThan(0);
    clock = 3000;
    useChronicleStore.getState().abandon();

    const log = read(storage);
    expect(log.chartersSigned).toBe(1);
    expect(log.charters).toHaveLength(1);
    expect(log.charters[0]).toMatchObject({
      seed: 21,
      signedAt: 1000,
      sessions: 1,
      shiftsClosed: 2,
      lastShift: shift,
      outcome: 'abandoned',
      closedAt: 3000,
    });
  });

  it('counts a return: a charter in play at load gets another session', () => {
    const storage = memoryStorage();
    stop = installChronicleFunnel(useChronicleStore, storage, () => 1);
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    stop();
    // A reload: the persisted charter is still active when the next session starts.
    stop = installChronicleFunnel(useChronicleStore, storage, () => 2);
    const log = read(storage);
    expect(log.sessions).toBe(2);
    expect(log.charters[0]).toMatchObject({ seed: 21, sessions: 2, outcome: 'active' });
  });

  it('never writes to the Chronicle store', () => {
    const storage = memoryStorage();
    const before = useChronicleStore.getState().chronicle;
    stop = installChronicleFunnel(useChronicleStore, storage, () => 1);
    expect(useChronicleStore.getState().chronicle).toBe(before);
  });

  it('a localStorage whose very access throws leaves startup standing', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new DOMException('The operation is insecure.', 'SecurityError');
      },
    });
    try {
      expect(() => {
        stop = installChronicleFunnel(useChronicleStore);
      }).not.toThrow();
    } finally {
      if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    }
  });

  it('a storage that throws disables the funnel without reaching play', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    stop = installChronicleFunnel(useChronicleStore, broken, () => 1);
    expect(() => useChronicleStore.getState().sign(DEFAULT_CHARTER, 21)).not.toThrow();
  });
});

describe('chronicle funnel, pure steps', () => {
  const base = (): ChronicleState => createInitialState();
  const active = (seed: number, patch: Partial<ChronicleState> = {}): ChronicleState => ({
    ...base(),
    status: 'active',
    charter: { ...DEFAULT_CHARTER, seed },
    ...patch,
  });

  it('returns the same log when nothing worth recording changed', () => {
    const signed = stepFunnel(emptyFunnelLog(), base(), active(5), 1);
    expect(stepFunnel(signed, active(5), active(5), 2)).toBe(signed);
  });

  it('splits own decisions from delegated ones', () => {
    const signed = stepFunnel(emptyFunnelLog(), base(), active(5), 1);
    const next = active(5, {
      eventHistory: [
        { eventId: 'a', shift: 1, choiceId: 'x', actor: 'player' },
        { eventId: 'b', shift: 1, choiceId: 'y', actor: 'ai-partner' },
        { eventId: 'c', shift: 2, choiceId: 'z', actor: 'chronicle' },
      ],
    });
    const log = stepFunnel(signed, active(5), next, 2);
    expect(log.charters[0]).toMatchObject({ decisions: 1, delegatedDecisions: 2 });
  });

  it('an ended charter is ended, not abandoned', () => {
    const signed = stepFunnel(emptyFunnelLog(), base(), active(5), 1);
    const ended = stepFunnel(signed, active(5), { ...active(5), status: 'ended' }, 9);
    expect(ended.charters[0]).toMatchObject({ outcome: 'ended', closedAt: 9 });
    const fresh = stepFunnel(ended, { ...active(5), status: 'ended' }, base(), 10);
    expect(fresh.charters[0].outcome).toBe('ended');
  });

  it('a charter signed before the funnel existed is adopted, not counted as signed', () => {
    const log = startFunnelSession(emptyFunnelLog(), active(8));
    expect(log).toMatchObject({ sessions: 1, chartersSigned: 0 });
    expect(log.charters[0]).toMatchObject({ seed: 8, signedAt: null, sessions: 1 });
  });

  it('keeps only the most recent charters', () => {
    let log = emptyFunnelLog();
    for (let seed = 0; seed < MAX_FUNNEL_CHARTERS + 3; seed++) {
      log = stepFunnel(log, base(), active(seed), seed);
      log = stepFunnel(log, active(seed), base(), seed);
    }
    expect(log.charters).toHaveLength(MAX_FUNNEL_CHARTERS);
    expect(log.chartersSigned).toBe(MAX_FUNNEL_CHARTERS + 3);
    expect(log.charters[0].seed).toBe(3);
  });

  it('a corrupt or foreign stored value starts a fresh log', () => {
    expect(parseFunnelLog('{oops')).toEqual(emptyFunnelLog());
    expect(parseFunnelLog('{"version":2}')).toEqual(emptyFunnelLog());
    expect(parseFunnelLog(null)).toEqual(emptyFunnelLog());
  });
});
