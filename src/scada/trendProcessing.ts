import type { Quality, TagHistoryPoint } from './types';

export const TREND_QUALITY_SUFFIX = '__quality';

/**
 * Hard resource envelope for trend work. The UI selects at most six tags and
 * HistoryStore returns at most 10,000 points per tag; the wider tag ceiling
 * also bounds programmatic callers without constraining the current UI.
 */
export const MAX_TREND_ROWS = 900;
export const MAX_TREND_TAGS = 64;
export const MAX_TREND_TAG_ID_LENGTH = 256;
export const MAX_TREND_INPUT_POINTS = 60_000;
export const MAX_PENDING_TREND_JOBS = 4;
export const TREND_WORKER_TIMEOUT_MS = 5_000;

const QUALITY_VALUES: ReadonlySet<Quality> = new Set(['GOOD', 'UNCERTAIN', 'BAD', 'STALE']);
const RESERVED_TREND_KEYS: ReadonlySet<string> = new Set([
  'timestamp',
  ...Object.getOwnPropertyNames(Object.prototype),
]);

export interface TrendRow {
  timestamp: number;
  [key: string]: number | Quality | undefined;
}

export interface TrendProcessingRequest {
  id: number;
  tagIds: string[];
  histories: TagHistoryPoint[][];
  maxRows?: number;
}

export interface TrendProcessingResponse {
  id: number;
  rows: TrendRow[];
}

interface PreparedTrendInput {
  tagIds: string[];
  histories: TagHistoryPoint[][];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeTrendRowLimit(maxRows: number): number {
  if (maxRows === Number.POSITIVE_INFINITY) return MAX_TREND_ROWS;
  if (!Number.isFinite(maxRows)) return 0;
  return Math.min(MAX_TREND_ROWS, Math.max(0, Math.floor(maxRows)));
}

function isSafeTrendTagId(tagId: unknown, accepted: ReadonlySet<string>): tagId is string {
  // Values and quality live in one flat row, so reserved or suffix keys would
  // overwrite structural fields or another tag's quality field.
  return (
    typeof tagId === 'string' &&
    tagId.length > 0 &&
    tagId.length <= MAX_TREND_TAG_ID_LENGTH &&
    !RESERVED_TREND_KEYS.has(tagId) &&
    !tagId.endsWith(TREND_QUALITY_SUFFIX) &&
    !accepted.has(tagId)
  );
}

function sanitizeHistoryPoint(value: unknown): TagHistoryPoint | null {
  if (!isRecord(value)) return null;

  try {
    const { timestamp, value: pointValue, quality } = value;
    if (
      typeof timestamp !== 'number' ||
      !Number.isFinite(timestamp) ||
      typeof pointValue !== 'number' ||
      !Number.isFinite(pointValue) ||
      typeof quality !== 'string' ||
      !QUALITY_VALUES.has(quality as Quality)
    ) {
      return null;
    }
    return { timestamp, value: pointValue, quality: quality as Quality };
  } catch {
    return null;
  }
}

function prepareTrendInput(tagIds: unknown, histories: unknown): PreparedTrendInput {
  if (!Array.isArray(tagIds)) return { tagIds: [], histories: [] };

  const rawHistories = Array.isArray(histories) ? histories : [];
  const acceptedIds = new Set<string>();
  const accepted: Array<{ tagId: string; historyIndex: number }> = [];

  const tagScanLimit = Math.min(tagIds.length, MAX_TREND_TAGS);
  for (let index = 0; index < tagScanLimit && accepted.length < MAX_TREND_TAGS; index += 1) {
    const tagId = tagIds[index] as unknown;
    if (!isSafeTrendTagId(tagId, acceptedIds)) continue;
    acceptedIds.add(tagId);
    accepted.push({ tagId, historyIndex: index });
  }

  if (accepted.length === 0) return { tagIds: [], histories: [] };

  const pointBudgetPerTag = Math.max(1, Math.floor(MAX_TREND_INPUT_POINTS / accepted.length));
  const sanitizedHistories = accepted.map(({ historyIndex }) => {
    const rawHistory = rawHistories[historyIndex] as unknown;
    if (!Array.isArray(rawHistory) || rawHistory.length === 0) return [];

    const candidateCount = Math.min(rawHistory.length, pointBudgetPerTag);
    const result: TagHistoryPoint[] = [];
    for (let slot = 0; slot < candidateCount; slot += 1) {
      const index =
        rawHistory.length <= pointBudgetPerTag || candidateCount === 1
          ? slot
          : Math.floor((slot * (rawHistory.length - 1)) / (candidateCount - 1));
      const point = sanitizeHistoryPoint(rawHistory[index]);
      if (point) result.push(point);
    }
    return result;
  });

  return {
    tagIds: accepted.map(({ tagId }) => tagId),
    histories: sanitizedHistories,
  };
}

function mergePreparedTrendHistory(
  { tagIds, histories }: PreparedTrendInput,
  rowLimit: number
): TrendRow[] {
  if (rowLimit === 0) return [];

  const timeMap = new Map<number, TrendRow>();

  tagIds.forEach((tagId, historyIndex) => {
    for (const point of histories[historyIndex] ?? []) {
      const timestamp = Math.floor(point.timestamp / 1000) * 1000;
      const row = timeMap.get(timestamp) ?? { timestamp };
      row[`${tagId}${TREND_QUALITY_SUFFIX}`] = point.quality;
      if (point.quality === 'GOOD' || point.quality === 'UNCERTAIN') {
        row[tagId] = point.value;
      } else {
        delete row[tagId];
      }
      timeMap.set(timestamp, row);
    }
  });

  const rows = Array.from(timeMap.values()).sort((left, right) => left.timestamp - right.timestamp);

  // Sample-and-hold. The historian writes a tag only when it moves past its
  // deadband, so a slow tag has no sample in most rows; left empty, those rows
  // break its line into invisible fragments beside a fast tag. BAD and STALE
  // samples end the hold, so real gaps stay gaps.
  const held = new Map<string, { value: number; quality: Quality }>();
  for (const row of rows) {
    for (const tagId of tagIds) {
      const qualityKey = `${tagId}${TREND_QUALITY_SUFFIX}`;
      const quality = row[qualityKey] as Quality | undefined;
      if (quality !== undefined) {
        const value = row[tagId];
        if (quality === 'BAD' || quality === 'STALE') {
          held.delete(tagId);
        } else if (typeof value === 'number') {
          held.set(tagId, { value, quality });
        }
      } else {
        const hold = held.get(tagId);
        if (hold) {
          row[tagId] = hold.value;
          row[qualityKey] = hold.quality;
        }
      }
    }
  }

  if (rows.length <= rowLimit) return rows;
  if (rowLimit === 1) return rows.slice(0, 1);

  const sampled: TrendRow[] = [rows[0]];
  const interiorCount = Math.max(0, rowLimit - 2);
  const stride = (rows.length - 2) / Math.max(1, interiorCount);
  for (let index = 0; index < interiorCount; index += 1) {
    sampled.push(rows[1 + Math.floor(index * stride)]);
  }
  sampled.push(rows[rows.length - 1]);
  return sampled;
}

/**
 * Aligns historian samples to one-second buckets, holds each tag's last good
 * sample forward, and deliberately leaves bad or stale samples as gaps. Held
 * values carry their source quality, so the table and export surfaces never
 * present a gap as data.
 */
export function mergeAndDownsampleTrendHistory(
  tagIds: string[],
  histories: TagHistoryPoint[][],
  maxRows = MAX_TREND_ROWS
): TrendRow[] {
  return mergePreparedTrendHistory(
    prepareTrendInput(tagIds, histories),
    normalizeTrendRowLimit(maxRows)
  );
}

let nextRequestId = 1;
let worker: Worker | null = null;
interface PendingTrendJob {
  owner: Worker;
  tagIds: readonly string[];
  valueKeys: ReadonlySet<string>;
  qualityKeys: ReadonlySet<string>;
  rowLimit: number;
  resolve: (rows: TrendRow[]) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

const pending = new Map<number, PendingTrendJob>();

function isTrendRow(value: unknown, job: PendingTrendJob): value is TrendRow {
  if (!isRecord(value) || !Number.isFinite(value.timestamp)) return false;

  const fieldsAreValid = Object.entries(value).every(([key, field]) => {
    if (key === 'timestamp') return Number.isFinite(field);
    if (job.valueKeys.has(key)) {
      return typeof field === 'number' && Number.isFinite(field);
    }
    if (job.qualityKeys.has(key)) {
      return typeof field === 'string' && QUALITY_VALUES.has(field as Quality);
    }
    return false;
  });
  if (!fieldsAreValid) return false;

  return job.tagIds.every((tagId) => {
    const qualityKey = `${tagId}${TREND_QUALITY_SUFFIX}`;
    const hasValue = Object.prototype.hasOwnProperty.call(value, tagId);
    const hasQuality = Object.prototype.hasOwnProperty.call(value, qualityKey);
    if (!hasValue && !hasQuality) return true;
    if (!hasQuality) return false;

    const quality = value[qualityKey];
    if (quality === 'GOOD' || quality === 'UNCERTAIN') return hasValue;
    return !hasValue && (quality === 'BAD' || quality === 'STALE');
  });
}

function isTrendResponse(value: unknown, job: PendingTrendJob): value is TrendProcessingResponse {
  return (
    isRecord(value) &&
    Number.isSafeInteger(value.id) &&
    (value.id as number) > 0 &&
    Array.isArray(value.rows) &&
    value.rows.length <= job.rowLimit &&
    value.rows.every((row) => isTrendRow(row, job))
  );
}

function clearJob(id: number): PendingTrendJob | undefined {
  const job = pending.get(id);
  if (!job) return undefined;
  pending.delete(id);
  clearTimeout(job.timeout);
  return job;
}

function detachAndTerminate(failedWorker: Worker): void {
  if (worker === failedWorker) worker = null;
  try {
    failedWorker.onmessage = null;
    failedWorker.onerror = null;
    failedWorker.onmessageerror = null;
  } catch {
    // Continue cleanup even if a nonconforming Worker rejects handler removal.
  }
  try {
    failedWorker.terminate();
  } catch {
    // The reference and pending work are already detached locally.
  }
}

function failWorker(failedWorker: Worker, error: Error): void {
  const failedJobs: PendingTrendJob[] = [];
  pending.forEach((job, id) => {
    if (job.owner !== failedWorker) return;
    const removed = clearJob(id);
    if (removed) failedJobs.push(removed);
  });
  detachAndTerminate(failedWorker);
  failedJobs.forEach((job) => job.reject(error));
}

function handleWorkerMessage(source: Worker, data: unknown): void {
  if (worker !== source) return;

  try {
    if (!isRecord(data) || !Number.isSafeInteger(data.id) || (data.id as number) <= 0) {
      failWorker(source, new Error('SCADA trend worker returned an invalid response'));
      return;
    }

    const id = data.id as number;
    const job = pending.get(id);
    if (!job || job.owner !== source) return;
    if (!isTrendResponse(data, job)) {
      failWorker(source, new Error('SCADA trend worker returned malformed rows'));
      return;
    }

    clearJob(id)?.resolve(data.rows);
  } catch (error) {
    failWorker(
      source,
      error instanceof Error ? error : new Error('SCADA trend worker response handling failed')
    );
  }
}

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (worker) return worker;

  let candidate: Worker | null = null;
  try {
    candidate = new Worker(new URL('./trendWorker.ts', import.meta.url), {
      type: 'module',
      name: 'millos-scada-trends',
    });
    const activeWorker = candidate;
    activeWorker.onmessage = (event: MessageEvent<unknown>) => {
      handleWorkerMessage(activeWorker, event.data);
    };
    activeWorker.onerror = (event) => {
      event.preventDefault?.();
      failWorker(activeWorker, new Error(event.message || 'SCADA trend worker failed'));
    };
    activeWorker.onmessageerror = () => {
      failWorker(activeWorker, new Error('SCADA trend worker response could not be decoded'));
    };
    worker = activeWorker;
    return activeWorker;
  } catch {
    if (candidate) detachAndTerminate(candidate);
    return null;
  }
}

export function processTrendHistory(
  tagIds: string[],
  histories: TagHistoryPoint[][],
  maxRows = MAX_TREND_ROWS
): Promise<TrendRow[]> {
  const rowLimit = normalizeTrendRowLimit(maxRows);
  if (rowLimit === 0) return Promise.resolve([]);

  const prepared = prepareTrendInput(tagIds, histories);
  const fallback = (): TrendRow[] => mergePreparedTrendHistory(prepared, rowLimit);
  if (
    prepared.tagIds.length === 0 ||
    prepared.histories.every((history) => history.length === 0) ||
    pending.size >= MAX_PENDING_TREND_JOBS
  ) {
    return Promise.resolve(fallback());
  }

  const activeWorker = getWorker();
  if (!activeWorker) {
    return Promise.resolve(fallback());
  }

  const id = nextRequestId++;
  return new Promise<TrendRow[]>((resolve, reject) => {
    const timeout = setTimeout(() => {
      failWorker(activeWorker, new Error('SCADA trend worker timed out'));
    }, TREND_WORKER_TIMEOUT_MS);
    pending.set(id, {
      owner: activeWorker,
      tagIds: prepared.tagIds,
      valueKeys: new Set(prepared.tagIds),
      qualityKeys: new Set(prepared.tagIds.map((tagId) => `${tagId}${TREND_QUALITY_SUFFIX}`)),
      rowLimit,
      resolve,
      reject,
      timeout,
    });

    try {
      activeWorker.postMessage({
        id,
        tagIds: prepared.tagIds,
        histories: prepared.histories,
        maxRows: rowLimit,
      } satisfies TrendProcessingRequest);
    } catch (error) {
      failWorker(
        activeWorker,
        error instanceof Error ? error : new Error('SCADA trend worker request failed')
      );
    }
  }).catch(fallback);
}
