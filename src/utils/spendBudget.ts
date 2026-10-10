/** Per-tab browser-session admission budget for billable BYOK calls. */
export interface BilledUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}

export interface SpendSnapshot {
  capUsd: number | null;
  spentUsd: number;
  reservedUsd: number;
  uncertainUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  requestCount: number;
  lastRequestCost: number;
  sessionStartTime: number;
}

const STORAGE_KEY = 'millos-byok-spend-v1';
const INPUT_RATE = 0.1 / 1_000_000;
const OUTPUT_RATE = 0.5 / 1_000_000;

function finiteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export class SpendCapError extends Error {}

function readSession(): SpendSnapshot {
  const initial: SpendSnapshot = {
    capUsd: null,
    spentUsd: 0,
    reservedUsd: 0,
    uncertainUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    requestCount: 0,
    lastRequestCost: 0,
    sessionStartTime: Date.now(),
  };
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (!stored || typeof stored !== 'object') return initial;
    return {
      capUsd: finiteNonnegative(stored.capUsd) && stored.capUsd > 0 ? stored.capUsd : null,
      spentUsd: finiteNonnegative(stored.spentUsd) ? stored.spentUsd : 0,
      // A reload may have interrupted a dispatched request. Keep that reservation
      // charged against the cap until the browser session ends.
      reservedUsd: 0,
      uncertainUsd:
        (finiteNonnegative(stored.uncertainUsd) ? stored.uncertainUsd : 0) +
        (finiteNonnegative(stored.reservedUsd) ? stored.reservedUsd : 0),
      totalInputTokens: finiteNonnegative(stored.totalInputTokens) ? stored.totalInputTokens : 0,
      totalOutputTokens: finiteNonnegative(stored.totalOutputTokens) ? stored.totalOutputTokens : 0,
      requestCount: finiteNonnegative(stored.requestCount) ? stored.requestCount : 0,
      lastRequestCost: finiteNonnegative(stored.lastRequestCost) ? stored.lastRequestCost : 0,
      sessionStartTime: finiteNonnegative(stored.sessionStartTime)
        ? stored.sessionStartTime
        : Date.now(),
    };
  } catch {
    return initial;
  }
}

export class SpendBudget {
  private snapshot = readSession();
  private listeners = new Set<() => void>();
  private reservations = new Map<number, number>();
  private nextId = 0;

  getSnapshot = (): SpendSnapshot => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private update(patch: Partial<SpendSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.snapshot));
    } catch {
      // If session storage is unavailable, the cap remains enforced in memory.
    }
    for (const listener of this.listeners) listener();
  }

  setCap(value: number | null): void {
    if (value !== null && (!Number.isFinite(value) || value < 0.01 || value > 1000)) {
      throw new Error('Enter a cap between $0.01 and $1,000, or turn it off.');
    }
    this.update({ capUsd: value });
  }

  /** Synchronous reservation prevents overlapping calls admitting against the same balance. */
  reserve(prompt: string, maxOutputTokens: number): number {
    // UTF-8 bytes plus a conservative wrapper allowance estimate input tokens.
    // The provider's actual bill can still differ; this is an app-side guard.
    const estimatedInputTokens = new TextEncoder().encode(prompt).length + 512;
    const amount = estimatedInputTokens * INPUT_RATE + maxOutputTokens * OUTPUT_RATE;
    const s = this.snapshot;
    if (s.capUsd !== null && s.spentUsd + s.reservedUsd + s.uncertainUsd + amount > s.capUsd) {
      throw new SpendCapError('Session cost cap reached. No paid request was sent.');
    }
    const id = ++this.nextId;
    this.reservations.set(id, amount);
    this.update({ reservedUsd: s.reservedUsd + amount });
    return id;
  }

  /** A response with trustworthy usage is charged even if its text is unusable or stale. */
  settle(id: number, usage: BilledUsage): void {
    const reserved = this.reservations.get(id);
    if (reserved === undefined) return;
    if (!finiteNonnegative(usage.inputTokens) || !finiteNonnegative(usage.outputTokens)) return;
    const cost = finiteNonnegative(usage.costUsd)
      ? usage.costUsd
      : usage.inputTokens * INPUT_RATE + usage.outputTokens * OUTPUT_RATE;
    this.reservations.delete(id);
    const s = this.snapshot;
    this.update({
      reservedUsd: Math.max(0, s.reservedUsd - reserved),
      spentUsd: s.spentUsd + cost,
      totalInputTokens: s.totalInputTokens + usage.inputTokens,
      totalOutputTokens: s.totalOutputTokens + usage.outputTokens,
      requestCount: s.requestCount + 1,
      lastRequestCost: cost,
    });
  }

  /** A provider rejection is not a generated response and releases its reservation. */
  reject(id: number): void {
    const reserved = this.reservations.get(id);
    if (reserved === undefined) return;
    this.reservations.delete(id);
    this.update({ reservedUsd: Math.max(0, this.snapshot.reservedUsd - reserved) });
  }

  /** Network/abort/unknown usage may have incurred a charge: do not replenish it. */
  uncertain(id: number): void {
    const reserved = this.reservations.get(id);
    if (reserved === undefined) return;
    this.reservations.delete(id);
    const s = this.snapshot;
    this.update({
      reservedUsd: Math.max(0, s.reservedUsd - reserved),
      uncertainUsd: s.uncertainUsd + reserved,
    });
  }
}

export const spendBudget = new SpendBudget();
