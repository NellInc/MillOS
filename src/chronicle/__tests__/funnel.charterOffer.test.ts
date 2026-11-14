import { afterEach, expect, it } from 'vitest';
import {
  FUNNEL_STORAGE_KEY,
  installChronicleFunnel,
  noteCharterOfferOpened,
  parseFunnelLog,
} from '../funnel';
import type { ChronicleState } from '../engine';

type Listener = (state: { chronicle: ChronicleState }, prev: { chronicle: ChronicleState }) => void;

function fakeStore(status: ChronicleState['status']) {
  const chronicle = {
    status,
    charter: null,
    shift: 0,
    lastReportId: null,
    eventHistory: [],
    quizAnswered: [],
  } as unknown as ChronicleState;
  const listeners = new Set<Listener>();
  return {
    getState: () => ({ chronicle }),
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function memoryStorage(initial?: string) {
  const data = new Map<string, string>();
  if (initial) data.set(FUNNEL_STORAGE_KEY, initial);
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

let uninstall: (() => void) | null = null;
afterEach(() => {
  uninstall?.();
  uninstall = null;
});

it('reads a log written before the charter-offer counter as zero offers', () => {
  const old = JSON.stringify({ version: 1, sessions: 3, chartersSigned: 1, charters: [] });
  expect(parseFunnelLog(old)).toMatchObject({ sessions: 3, charterOffersOpened: 0 });
});

it('counts a charter offer only while no charter is in play, and only while installed', () => {
  // Not installed (a benchmark run): nothing to count into.
  noteCharterOfferOpened();
  const storage = memoryStorage();
  uninstall = installChronicleFunnel(fakeStore('unsigned'), storage);
  noteCharterOfferOpened();
  noteCharterOfferOpened();
  expect(parseFunnelLog(storage.getItem(FUNNEL_STORAGE_KEY)).charterOffersOpened).toBe(2);
  uninstall();
  uninstall = null;
  noteCharterOfferOpened();
  expect(parseFunnelLog(storage.getItem(FUNNEL_STORAGE_KEY)).charterOffersOpened).toBe(2);

  const signed = memoryStorage();
  uninstall = installChronicleFunnel(fakeStore('active'), signed);
  noteCharterOfferOpened();
  expect(parseFunnelLog(signed.getItem(FUNNEL_STORAGE_KEY)).charterOffersOpened).toBe(0);
});
