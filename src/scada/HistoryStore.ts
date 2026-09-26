/**
 * SCADA History Store for MillOS
 *
 * Persistent storage for SCADA tag values and alarms using IndexedDB.
 * Features:
 * - 24-hour rolling retention (configurable)
 * - Batch writes for performance
 * - Time-range queries for trending
 * - Export to CSV/JSON
 * - Automatic cleanup of old data
 */

import { logger } from '../utils/logger';
import {
  TagValue,
  TagHistoryPoint,
  TagHistoryRecord,
  AlarmHistoryRecord,
  Alarm,
  SCADAExport,
} from './types';

/** Configuration for the history store */
interface HistoryStoreConfig {
  /** Retention period in milliseconds (default: 24 hours) */
  retentionMs: number;
  /** How often to write batched data (default: 1000ms) */
  batchIntervalMs: number;
  /** Maximum points to return in a single query (default: 10000) */
  maxQueryPoints: number;
  /** Maximum write buffer size before forced flush (default: 2000) */
  maxBufferSize: number;
  /** Deadband for change detection - only write if value changed by this amount (default: 0.5) */
  changeDeadband: number;
  /** Per-tag change deadband; `undefined` falls back to `changeDeadband` */
  changeDeadbandFor?: (tagId: string) => number | undefined;
  /** Longest a tag may go unwritten, even when unchanged (default: 60000ms) */
  maxSampleIntervalMs: number;
}

/** Internal record with unique ID for safe concurrent flush handling */
interface BufferedTagRecord extends TagHistoryRecord {
  _bufferId: number;
}

/** Internal alarm record with unique ID for safe concurrent flush handling */
interface BufferedAlarmRecord extends AlarmHistoryRecord {
  _bufferId: number;
}

const DEFAULT_CONFIG: HistoryStoreConfig = {
  retentionMs: 24 * 60 * 60 * 1000, // 24 hours
  batchIntervalMs: 1000,
  maxQueryPoints: 10000,
  maxBufferSize: 2000, // OPT-13: Bounded buffer
  changeDeadband: 0.5, // OPT-5: Change detection
  maxSampleIntervalMs: 60_000, // Heartbeat so a steady tag still has samples in every trend window
};

const INDEXED_DB_OPERATION_TIMEOUT_MS = 10_000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const MAX_QUERY_POINTS = 100_000;
const MAX_BUFFER_SIZE = 100_000;
const MAX_BATCH_TAGS = 256;
const MAX_BATCH_INPUT_TAGS = 1_024;
const MAX_BATCH_CONCURRENCY = 8;
const VALID_QUALITIES = new Set(['GOOD', 'UNCERTAIN', 'BAD', 'STALE']);
const VALID_ALARM_TYPES = new Set(['HIHI', 'HI', 'LO', 'LOLO', 'BAD_QUALITY', 'RATE_OF_CHANGE']);
const VALID_ALARM_STATES = new Set(['NORMAL', 'UNACK', 'ACKED', 'RTN_UNACK']);
const VALID_ALARM_PRIORITIES = new Set(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);

const isValidTimeRange = (startTime: number, endTime: number): boolean =>
  Number.isFinite(startTime) && Number.isFinite(endTime) && startTime <= endTime;

const positiveIntegerOr = (value: number, fallback: number, maximum: number): number => {
  if (!Number.isFinite(value) || value < 1 || value > maximum) return fallback;
  return Math.floor(value);
};

const sanitizeConfig = (config: Partial<HistoryStoreConfig>): HistoryStoreConfig => ({
  retentionMs: positiveIntegerOr(
    config.retentionMs ?? DEFAULT_CONFIG.retentionMs,
    DEFAULT_CONFIG.retentionMs,
    Number.MAX_SAFE_INTEGER
  ),
  batchIntervalMs: positiveIntegerOr(
    config.batchIntervalMs ?? DEFAULT_CONFIG.batchIntervalMs,
    DEFAULT_CONFIG.batchIntervalMs,
    MAX_TIMER_DELAY_MS
  ),
  maxQueryPoints: positiveIntegerOr(
    config.maxQueryPoints ?? DEFAULT_CONFIG.maxQueryPoints,
    DEFAULT_CONFIG.maxQueryPoints,
    MAX_QUERY_POINTS
  ),
  maxBufferSize: positiveIntegerOr(
    config.maxBufferSize ?? DEFAULT_CONFIG.maxBufferSize,
    DEFAULT_CONFIG.maxBufferSize,
    MAX_BUFFER_SIZE
  ),
  changeDeadband:
    Number.isFinite(config.changeDeadband) && (config.changeDeadband ?? -1) >= 0
      ? config.changeDeadband!
      : DEFAULT_CONFIG.changeDeadband,
  changeDeadbandFor:
    typeof config.changeDeadbandFor === 'function' ? config.changeDeadbandFor : undefined,
  maxSampleIntervalMs: positiveIntegerOr(
    config.maxSampleIntervalMs ?? DEFAULT_CONFIG.maxSampleIntervalMs,
    DEFAULT_CONFIG.maxSampleIntervalMs,
    Number.MAX_SAFE_INTEGER
  ),
});

const createHistoryResult = (): Record<string, TagHistoryPoint[]> =>
  Object.create(null) as Record<string, TagHistoryPoint[]>;

const forEachWithConcurrency = async <T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> => {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      if (item !== undefined) await worker(item);
    }
  });
  await Promise.all(workers);
};

/**
 * Wrap a promise with a timeout to prevent indefinite hangs
 */
const withTimeout = <T>(promise: Promise<T>, ms: number, operation: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`IndexedDB timeout: ${operation} exceeded ${ms}ms`)),
      ms
    );
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
};

export class HistoryStore {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'MillOS_SCADA';
  private readonly DB_VERSION = 1;
  private config: HistoryStoreConfig;
  private writeBuffer: BufferedTagRecord[] = [];
  private alarmBuffer: BufferedAlarmRecord[] = [];
  private batchInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;
  private cancelPendingInit: (() => void) | null = null;
  private lifecycleEpoch = 0;
  private flushQueued = false;
  private activeFlush: Promise<void> | null = null;
  private activeCleanup: Promise<void> | null = null;
  private activeClear: Promise<void> | null = null;
  private historyDisabled = false;

  // Monotonically increasing ID for buffer entries to ensure safe concurrent removal
  private nextBufferId = 0;

  // OPT-5: Track last written samples for value and quality change detection
  private lastWrittenSamples: Map<
    string,
    { value: number; quality: TagValue['quality']; timestamp: number }
  > = new Map();

  constructor(config: Partial<HistoryStoreConfig> = {}) {
    this.config = sanitizeConfig(config);
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  /**
   * Initialize the IndexedDB database
   */
  init(): Promise<void> {
    if (this.isInitialized) return Promise.resolve();
    if (this.initPromise) return this.initPromise;

    const epoch = ++this.lifecycleEpoch;
    this.historyDisabled = false;

    // Graceful fallback for environments without IndexedDB (private mode/SSR)
    if (typeof indexedDB === 'undefined') {
      this.historyDisabled = true;
      this.isInitialized = true;
      return Promise.resolve();
    }

    const initialization = new Promise<void>((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let request: IDBOpenDBRequest;

      const finish = (): void => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) clearTimeout(timeoutId);
        if (this.cancelPendingInit === finish) this.cancelPendingInit = null;
        resolve();
      };

      this.cancelPendingInit = finish;

      try {
        request = indexedDB.open(this.DB_NAME, this.DB_VERSION);
      } catch {
        if (epoch === this.lifecycleEpoch) {
          this.historyDisabled = true;
          this.isInitialized = true;
        }
        finish();
        return;
      }

      timeoutId = setTimeout(() => {
        if (epoch === this.lifecycleEpoch) {
          this.historyDisabled = true;
          this.isInitialized = true;
        }
        finish();
      }, INDEXED_DB_OPERATION_TIMEOUT_MS);

      request.onupgradeneeded = (event) => {
        if (settled || epoch !== this.lifecycleEpoch) return;
        const db = (event.target as IDBOpenDBRequest).result;

        // Tag history store
        if (!db.objectStoreNames.contains('tagHistory')) {
          const store = db.createObjectStore('tagHistory', {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('tagId', 'tagId', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('tagId_timestamp', ['tagId', 'timestamp'], { unique: false });
        }

        // Alarm history store
        if (!db.objectStoreNames.contains('alarmHistory')) {
          const store = db.createObjectStore('alarmHistory', {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('timestamp', 'raisedAt', { unique: false });
          store.createIndex('tagId', 'tagId', { unique: false });
          store.createIndex('alarmId', 'alarmId', { unique: false });
        }
      };

      request.onsuccess = () => {
        const openedDb = request.result;
        if (settled || epoch !== this.lifecycleEpoch) {
          openedDb.close();
          return;
        }

        this.db = openedDb;
        this.historyDisabled = false;
        this.isInitialized = true;

        // Start batch write interval
        this.batchInterval = setInterval(
          () => void this.flushBuffers(),
          this.config.batchIntervalMs
        );

        // Start cleanup interval (every hour)
        this.cleanupInterval = setInterval(() => void this.cleanup(), 60 * 60 * 1000);

        // Initial cleanup
        void this.cleanup();

        finish();
      };

      request.onerror = () => {
        if (!settled && epoch === this.lifecycleEpoch) {
          this.historyDisabled = true;
          this.isInitialized = true;
        }
        finish(); // Continue in disabled mode instead of rejecting
      };
    });

    const trackedInitialization = initialization.finally(() => {
      if (this.initPromise === trackedInitialization) this.initPromise = null;
    });
    this.initPromise = trackedInitialization;
    return trackedInitialization;
  }

  /**
   * Close the database connection
   * @param flush - If true (default), flush pending buffers before closing
   */
  async close(flush = true): Promise<void> {
    ++this.lifecycleEpoch;
    this.cancelPendingInit?.();

    // Stop intervals first to prevent new flushes during shutdown
    if (this.batchInterval !== null) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.initPromise) await this.initPromise;
    if (this.activeClear) {
      // clearAll retains its own rejection contract. Shutdown still needs to
      // close the database after the bounded clear transactions settle.
      await this.activeClear.catch(() => undefined);
    }
    if (this.activeCleanup) await this.activeCleanup;

    // Never close a database underneath an already-running transaction. When
    // flushing is requested, joining the active promise also requests one
    // final pass for writes that arrived after its snapshot.
    let flushAttempted = false;
    if (this.activeFlush) {
      if (flush) this.flushQueued = true;
      flushAttempted = flush;
      await this.activeFlush;
    } else if (flush && this.db) {
      flushAttempted = true;
      await this.flushBuffers();
    }

    // Only a flush that was actually attempted and left records behind is a
    // failure. With no database there is nothing to flush; throwing here made
    // every later close() throw forever once one flush had failed.
    const flushIncomplete =
      flushAttempted && (this.writeBuffer.length > 0 || this.alarmBuffer.length > 0);

    if (this.db) {
      this.db.close();
      this.db = null;
    }

    // A caller that explicitly skips flushing is asking to discard pending
    // data. A failed bounded flush retains its buffers for a later init/retry.
    if (!flush || !flushIncomplete) {
      const retained = this.writeBuffer.length + this.alarmBuffer.length;
      if (flush && !flushAttempted && retained > 0) {
        logger.warn(
          `[HistoryStore] close() discarded ${retained} buffered record(s); no database was open to flush them`
        );
      }
      this.writeBuffer = [];
      this.alarmBuffer = [];
      this.lastWrittenSamples.clear();
    }
    this.flushQueued = false;
    this.activeFlush = null;
    this.activeCleanup = null;
    this.activeClear = null;
    this.isInitialized = false;
    this.historyDisabled = false;

    if (flushIncomplete) {
      throw new Error('HistoryStore closed with records that could not be flushed');
    }
  }

  // =========================================================================
  // Write Operations
  // =========================================================================

  /**
   * Buffer a single tag value for batch writing
   * OPT-5: Only writes if value changed beyond deadband
   * OPT-13: Force flush if buffer exceeds max size
   */
  writeTagValue(tagValue: TagValue): void {
    if (this.historyDisabled) return;

    // TagHistoryPoint is a numeric contract. Preserve BOOL tags as 0/1 and
    // reject other non-numeric or non-finite samples before they can poison
    // deadband state or IndexedDB key ordering.
    const numValue =
      typeof tagValue.value === 'boolean' ? (tagValue.value ? 1 : 0) : tagValue.value;
    if (
      typeof tagValue.tagId !== 'string' ||
      tagValue.tagId.length === 0 ||
      typeof numValue !== 'number' ||
      !Number.isFinite(numValue) ||
      !Number.isFinite(tagValue.timestamp) ||
      !VALID_QUALITIES.has(tagValue.quality)
    ) {
      return;
    }

    // OPT-5: Change detection - skip if value hasn't changed significantly,
    // unless the tag has gone unwritten for the heartbeat interval.
    const lastSample = this.lastWrittenSamples.get(tagValue.tagId);
    if (lastSample !== undefined && lastSample.quality === tagValue.quality) {
      const delta = Math.abs(numValue - lastSample.value);
      const resolved = this.config.changeDeadbandFor?.(tagValue.tagId);
      const deadband =
        typeof resolved === 'number' && Number.isFinite(resolved) && resolved >= 0
          ? resolved
          : this.config.changeDeadband;
      if (
        delta < deadband &&
        tagValue.timestamp - lastSample.timestamp < this.config.maxSampleIntervalMs
      ) {
        return; // Skip unchanged values
      }
    }

    // Quality changes are meaningful historian events even when the numeric
    // value remains within the configured change deadband.
    this.lastWrittenSamples.set(tagValue.tagId, {
      value: numValue,
      quality: tagValue.quality,
      timestamp: tagValue.timestamp,
    });

    this.writeBuffer.push({
      tagId: tagValue.tagId,
      timestamp: tagValue.timestamp,
      value: numValue,
      quality: tagValue.quality,
      _bufferId: this.nextBufferId++,
    });

    // A forced flush is best-effort. IndexedDB may be unavailable or stalled,
    // so enforce the memory bound independently and retain the freshest data.
    if (this.writeBuffer.length > this.config.maxBufferSize) {
      const evicted = this.writeBuffer.splice(
        0,
        this.writeBuffer.length - this.config.maxBufferSize
      );
      const retainedTagIds = new Set(this.writeBuffer.map((record) => record.tagId));
      for (const record of evicted) {
        // An evicted tag no longer has a pending snapshot. Clear its deadband
        // baseline so a later identical sample can restore that lost point.
        if (!retainedTagIds.has(record.tagId)) this.lastWrittenSamples.delete(record.tagId);
      }
    }

    // OPT-13: Bounded buffer - force flush if buffer exceeds max size
    if (this.writeBuffer.length >= this.config.maxBufferSize) {
      this.flushBuffers();
    }
  }

  /**
   * Buffer multiple tag values for batch writing
   * OPT-5: Filters values based on change detection
   */
  writeTagValues(values: TagValue[]): void {
    values.forEach((v) => this.writeTagValue(v));
  }

  /**
   * Buffer an alarm for batch writing
   */
  writeAlarm(alarm: Alarm): void {
    if (this.historyDisabled) return;
    if (
      typeof alarm.id !== 'string' ||
      alarm.id.length === 0 ||
      typeof alarm.tagId !== 'string' ||
      alarm.tagId.length === 0 ||
      !VALID_ALARM_TYPES.has(alarm.type) ||
      !VALID_ALARM_STATES.has(alarm.state) ||
      !VALID_ALARM_PRIORITIES.has(alarm.priority) ||
      !Number.isFinite(alarm.value) ||
      !Number.isFinite(alarm.threshold) ||
      !Number.isFinite(alarm.timestamp) ||
      (alarm.acknowledgedAt !== undefined && !Number.isFinite(alarm.acknowledgedAt)) ||
      (alarm.clearedAt !== undefined && !Number.isFinite(alarm.clearedAt))
    ) {
      return;
    }

    this.alarmBuffer.push({
      alarmId: alarm.id,
      tagId: alarm.tagId,
      type: alarm.type,
      state: alarm.state,
      priority: alarm.priority,
      value: alarm.value,
      threshold: alarm.threshold,
      raisedAt: alarm.timestamp,
      acknowledgedAt: alarm.acknowledgedAt,
      clearedAt: alarm.clearedAt,
      acknowledgedBy: alarm.acknowledgedBy,
      _bufferId: this.nextBufferId++,
    });

    if (this.alarmBuffer.length > this.config.maxBufferSize) {
      this.alarmBuffer.splice(0, this.alarmBuffer.length - this.config.maxBufferSize);
    }

    if (this.alarmBuffer.length >= this.config.maxBufferSize) {
      void this.flushBuffers();
    }
  }

  /**
   * Flush all buffered data to IndexedDB
   */
  private flushBuffers(): Promise<void> {
    if (this.historyDisabled || !this.db) return Promise.resolve();
    if (this.activeClear) return Promise.resolve();

    // All callers join the same flush wave. This makes close() wait for an
    // existing transaction instead of closing the database underneath it.
    if (this.activeFlush) {
      this.flushQueued = true;
      return this.activeFlush;
    }

    const db = this.db;
    const activeFlush = Promise.resolve().then(async () => {
      try {
        do {
          this.flushQueued = false;
          await this.flushBufferedSnapshot(db);
        } while (this.flushQueued && this.db === db);
      } finally {
        if (this.activeFlush === activeFlush) this.activeFlush = null;
      }
    });
    this.activeFlush = activeFlush;
    return activeFlush;
  }

  private async waitForTransaction(transaction: IDBTransaction, operation: string): Promise<void> {
    const completion = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error(`${operation} aborted`));
    });

    await this.withTransactionTimeout(transaction, completion, operation);
  }

  private async withTransactionTimeout<T>(
    transaction: IDBTransaction,
    operationPromise: Promise<T>,
    operation: string
  ): Promise<T> {
    try {
      return await withTimeout(operationPromise, INDEXED_DB_OPERATION_TIMEOUT_MS, operation);
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already have completed or aborted.
      }
      throw error;
    }
  }

  private async withTransactionsTimeout<T>(
    transactions: IDBTransaction[],
    operationPromise: Promise<T>,
    operation: string
  ): Promise<T> {
    try {
      return await withTimeout(operationPromise, INDEXED_DB_OPERATION_TIMEOUT_MS, operation);
    } catch (error) {
      for (const transaction of transactions) {
        try {
          transaction.abort();
        } catch {
          // The transaction may already have completed or aborted.
        }
      }
      throw error;
    }
  }

  private async flushBufferedSnapshot(db: IDBDatabase): Promise<void> {
    // Flush tag history
    if (this.writeBuffer.length > 0) {
      const records = [...this.writeBuffer];
      const flushedIds = new Set(records.map((record) => record._bufferId));

      try {
        const transaction = db.transaction('tagHistory', 'readwrite');
        const store = transaction.objectStore('tagHistory');

        records.forEach((record) => {
          const { _bufferId: _, ...dbRecord } = record;
          store.add(dbRecord);
        });

        await this.waitForTransaction(transaction, 'flush tag history');
        this.writeBuffer = this.writeBuffer.filter((record) => !flushedIds.has(record._bufferId));
      } catch {
        // Records remain in the bounded buffer for the next attempt.
      }
    }

    // Flush alarm history
    if (this.alarmBuffer.length > 0) {
      const records = [...this.alarmBuffer];
      const flushedIds = new Set(records.map((record) => record._bufferId));

      try {
        const transaction = db.transaction('alarmHistory', 'readwrite');
        const store = transaction.objectStore('alarmHistory');

        records.forEach((record) => {
          const { _bufferId: _, ...dbRecord } = record;
          store.add(dbRecord);
        });

        await this.waitForTransaction(transaction, 'flush alarm history');
        this.alarmBuffer = this.alarmBuffer.filter((record) => !flushedIds.has(record._bufferId));
      } catch {
        // Records remain in the bounded buffer for the next attempt.
      }
    }
  }

  // =========================================================================
  // Read Operations
  // =========================================================================

  /**
   * Get history for a single tag within a time range
   */
  async getHistory(
    tagId: string,
    startTime: number,
    endTime: number = Date.now()
  ): Promise<TagHistoryPoint[]> {
    if (this.historyDisabled) return [];
    if (!isValidTimeRange(startTime, endTime)) return [];

    const db = this.db;
    if (!db) return [];

    const transaction = db.transaction('tagHistory', 'readonly');
    const query = new Promise<TagHistoryPoint[]>((resolve, reject) => {
      const store = transaction.objectStore('tagHistory');
      const index = store.index('tagId_timestamp');

      const range = IDBKeyRange.bound([tagId, startTime], [tagId, endTime]);
      const limit = this.config.maxQueryPoints;

      const readForward = (keyRange: IDBKeyRange): void => {
        const request = index.getAll(keyRange, limit);

        request.onsuccess = () => {
          try {
            resolve(
              request.result.map((r) => ({
                timestamp: r.timestamp,
                value: r.value,
                quality: r.quality,
              }))
            );
          } catch (error) {
            reject(error);
          }
        };

        request.onerror = () => reject(request.error);
      };

      if (typeof index.openKeyCursor !== 'function') {
        readForward(range);
        return;
      }

      // getAll truncates from the OLDEST end, which drops the recent data a
      // 4h or 24h trend is anchored to. Step back `limit` keys from the newest
      // sample and read forward from there, so the cap keeps the recent end.
      const probe = index.openKeyCursor(range, 'prev');
      let advanced = false;
      probe.onsuccess = () => {
        try {
          const cursor = probe.result;
          if (!cursor) {
            // No rows at all, or fewer than `limit`: the whole window fits.
            if (advanced) readForward(range);
            else resolve([]);
            return;
          }
          if (!advanced && limit > 1) {
            advanced = true;
            cursor.advance(limit - 1);
            return;
          }
          readForward(IDBKeyRange.bound(cursor.key, [tagId, endTime]));
        } catch (error) {
          reject(error);
        }
      };
      probe.onerror = () => reject(probe.error);
    });

    return this.withTransactionTimeout(transaction, query, `getHistory(${tagId})`);
  }

  /**
   * Get history for multiple tags within a time range
   */
  async getMultipleTagHistory(
    tagIds: string[],
    startTime: number,
    endTime: number = Date.now()
  ): Promise<Record<string, TagHistoryPoint[]>> {
    if (!Array.isArray(tagIds)) {
      throw new TypeError('HistoryStore tagIds must be an array');
    }
    if (tagIds.length > MAX_BATCH_INPUT_TAGS) {
      throw new RangeError(
        `HistoryStore batches are limited to ${MAX_BATCH_INPUT_TAGS} input entries`
      );
    }

    const uniqueTagIds: string[] = [];
    const seenTagIds = new Set<string>();
    for (let index = 0; index < tagIds.length; index += 1) {
      const tagId = tagIds[index];
      if (typeof tagId !== 'string' || tagId.length === 0) {
        throw new TypeError('HistoryStore tagIds must be non-empty strings');
      }
      if (seenTagIds.has(tagId)) continue;
      seenTagIds.add(tagId);
      uniqueTagIds.push(tagId);
      if (uniqueTagIds.length > MAX_BATCH_TAGS) {
        throw new RangeError(`HistoryStore batches are limited to ${MAX_BATCH_TAGS} unique tags`);
      }
    }

    const result = createHistoryResult();
    if (this.historyDisabled) return result;

    // Per-tag isolation: a single tag's IDB timeout/error must not reject the
    // whole batch and discard every other tag's data (Record partial-result contract).
    await forEachWithConcurrency(uniqueTagIds, MAX_BATCH_CONCURRENCY, async (tagId) => {
      try {
        result[tagId] = await this.getHistory(tagId, startTime, endTime);
      } catch {
        result[tagId] = [];
      }
    });

    return result;
  }

  /**
   * Get the latest value for a tag from history
   */
  async getLatestValue(tagId: string): Promise<TagHistoryPoint | null> {
    if (this.historyDisabled) return null;

    const db = this.db;
    if (!db) return null;

    const transaction = db.transaction('tagHistory', 'readonly');
    const query = new Promise<TagHistoryPoint | null>((resolve, reject) => {
      const store = transaction.objectStore('tagHistory');
      const index = store.index('tagId_timestamp');

      const range = IDBKeyRange.bound([tagId, 0], [tagId, Date.now()]);

      const request = index.openCursor(range, 'prev');

      request.onsuccess = () => {
        try {
          const cursor = request.result;
          if (cursor) {
            resolve({
              timestamp: cursor.value.timestamp,
              value: cursor.value.value,
              quality: cursor.value.quality,
            });
          } else {
            resolve(null);
          }
        } catch (error) {
          reject(error);
        }
      };

      request.onerror = () => reject(request.error);
    });

    return this.withTransactionTimeout(transaction, query, `getLatestValue(${tagId})`);
  }

  /**
   * Get alarm history within a time range
   */
  async getAlarmHistory(
    startTime: number,
    endTime: number = Date.now(),
    limit = 100
  ): Promise<AlarmHistoryRecord[]> {
    if (this.historyDisabled) return [];
    if (!isValidTimeRange(startTime, endTime) || !Number.isFinite(limit) || limit <= 0) return [];

    const db = this.db;
    if (!db) return [];

    const transaction = db.transaction('alarmHistory', 'readonly');
    const query = new Promise<AlarmHistoryRecord[]>((resolve, reject) => {
      const store = transaction.objectStore('alarmHistory');
      const index = store.index('timestamp');

      const range = IDBKeyRange.bound(startTime, endTime);
      const results: AlarmHistoryRecord[] = [];
      const safeLimit = Math.min(Math.floor(limit), this.config.maxQueryPoints);

      const request = index.openCursor(range, 'prev');

      request.onsuccess = () => {
        try {
          const cursor = request.result;
          if (cursor && results.length < safeLimit) {
            results.push({ ...cursor.value });
            cursor.continue();
          } else {
            resolve(results);
          }
        } catch (error) {
          reject(error);
        }
      };

      request.onerror = () => reject(request.error);
    });

    return this.withTransactionTimeout(transaction, query, 'getAlarmHistory');
  }

  /**
   * Get statistics for the history store
   */
  async getStats(): Promise<{
    tagHistoryCount: number;
    alarmHistoryCount: number;
    oldestTimestamp: number | null;
    newestTimestamp: number | null;
  }> {
    if (this.historyDisabled) {
      return {
        tagHistoryCount: 0,
        alarmHistoryCount: 0,
        oldestTimestamp: null,
        newestTimestamp: null,
      };
    }

    const db = this.db;
    if (!db) {
      return {
        tagHistoryCount: 0,
        alarmHistoryCount: 0,
        oldestTimestamp: null,
        newestTimestamp: null,
      };
    }

    const transactions: IDBTransaction[] = [];

    const getCount = (storeName: string): Promise<number> => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        transactions.push(transaction);
        const store = transaction.objectStore(storeName);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    };

    const getFirstTimestamp = (): Promise<number | null> => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('tagHistory', 'readonly');
        transactions.push(transaction);
        const store = transaction.objectStore('tagHistory');
        const index = store.index('timestamp');
        const request = index.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          resolve(cursor ? cursor.value.timestamp : null);
        };
        request.onerror = () => reject(request.error);
      });
    };

    const getLastTimestamp = (): Promise<number | null> => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('tagHistory', 'readonly');
        transactions.push(transaction);
        const store = transaction.objectStore('tagHistory');
        const index = store.index('timestamp');
        const request = index.openCursor(null, 'prev');
        request.onsuccess = () => {
          const cursor = request.result;
          resolve(cursor ? cursor.value.timestamp : null);
        };
        request.onerror = () => reject(request.error);
      });
    };

    const statsPromise = Promise.all([
      getCount('tagHistory'),
      getCount('alarmHistory'),
      getFirstTimestamp(),
      getLastTimestamp(),
    ]);
    const [tagHistoryCount, alarmHistoryCount, oldestTimestamp, newestTimestamp] =
      await this.withTransactionsTimeout(transactions, statsPromise, 'getStats');

    return {
      tagHistoryCount,
      alarmHistoryCount,
      oldestTimestamp,
      newestTimestamp,
    };
  }

  // =========================================================================
  // Export Operations
  // =========================================================================

  /**
   * Export tag history to CSV format
   */
  async exportToCSV(
    tagIds: string[],
    startTime: number,
    endTime: number = Date.now()
  ): Promise<string> {
    if (this.historyDisabled) return '';

    const rows = ['timestamp,tagId,value,quality'];
    const histories = await this.getMultipleTagHistory(tagIds, startTime, endTime);

    for (const tagId of tagIds) {
      const history = histories[tagId] ?? [];
      history.forEach((h) => {
        rows.push(`${h.timestamp},${tagId},${h.value},${h.quality}`);
      });
    }

    return rows.join('\n');
  }

  /**
   * Export tag history to JSON format
   */
  async exportToJSON(
    tagIds: string[],
    startTime: number,
    endTime: number = Date.now(),
    includeAlarms = false
  ): Promise<SCADAExport> {
    if (this.historyDisabled) {
      return {
        exportTime: Date.now(),
        startTime,
        endTime,
        format: 'MillOS-SCADA-Export-v1',
        tags: {},
      };
    }

    // Same limits, concurrency and null-prototype result as any other batch read.
    const tags = await this.getMultipleTagHistory(tagIds, startTime, endTime);

    const result: SCADAExport = {
      exportTime: Date.now(),
      startTime,
      endTime,
      format: 'MillOS-SCADA-Export-v1',
      tags,
    };

    if (includeAlarms) {
      result.alarms = await this.getAlarmHistory(startTime, endTime, 1000);
    }

    return result;
  }

  /**
   * Download export as a file
   */
  downloadExport(data: string | object, filename: string): void {
    const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    const blob = new Blob([content], {
      type: typeof data === 'string' ? 'text/csv' : 'application/json',
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Revoking in the same tick as click() has cancelled downloads in Firefox.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  // =========================================================================
  // Cleanup Operations
  // =========================================================================

  /**
   * Remove data older than retention period
   */
  private cleanup(): Promise<void> {
    if (this.historyDisabled) return Promise.resolve();
    if (this.activeClear) return Promise.resolve();

    const db = this.db;
    if (!db) return Promise.resolve();
    if (this.activeCleanup) return this.activeCleanup;

    const activeCleanup = this.performCleanup(db).finally(() => {
      if (this.activeCleanup === activeCleanup) this.activeCleanup = null;
    });
    this.activeCleanup = activeCleanup;
    return activeCleanup;
  }

  private async performCleanup(db: IDBDatabase): Promise<void> {
    const cutoff = Date.now() - this.config.retentionMs;
    const alarmCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // The stores are disjoint, so start both transactions together. Their
    // independent timeout clocks keep the whole cleanup wave within one bound.
    await Promise.allSettled([
      this.deleteBefore(db, 'tagHistory', cutoff),
      this.deleteBefore(db, 'alarmHistory', alarmCutoff),
    ]);
  }

  private async deleteBefore(
    db: IDBDatabase,
    storeName: 'tagHistory' | 'alarmHistory',
    cutoff: number
  ): Promise<void> {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const index = store.index('timestamp');

    const range = IDBKeyRange.upperBound(cutoff);
    const request = index.openCursor(range);

    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        try {
          cursor.delete();
          cursor.continue();
        } catch {
          try {
            transaction.abort();
          } catch {
            // The transaction may already have completed or aborted.
          }
        }
      }
    };

    await this.waitForTransaction(transaction, `cleanup ${storeName}`);
  }

  /**
   * Clear all history data (use with caution!)
   */
  clearAll(): Promise<void> {
    if (this.activeClear) return this.activeClear;

    const db = this.db;
    if (this.historyDisabled || !db) {
      this.clearPendingHistory();
      return Promise.resolve();
    }

    const activeClear = (async () => {
      // Block new maintenance waves first, then join any transactions that
      // already captured data. Clearing starts only after both have settled.
      await Promise.allSettled(
        [this.activeFlush, this.activeCleanup].filter(
          (operation): operation is Promise<void> => operation !== null
        )
      );

      // Pending records are part of the pre-clear state. Discard them before
      // clearing IndexedDB, then discard anything buffered while clear was in
      // progress in the finally block so it cannot be flushed back later.
      this.clearPendingHistory();

      const clearStore = async (storeName: string): Promise<void> => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        store.clear();
        await this.waitForTransaction(transaction, `clear ${storeName}`);
      };

      try {
        const results = await Promise.allSettled([
          clearStore('tagHistory'),
          clearStore('alarmHistory'),
        ]);
        const failure = results.find(
          (result): result is PromiseRejectedResult => result.status === 'rejected'
        );
        if (failure) throw failure.reason;
      } finally {
        this.clearPendingHistory();
      }
    })().finally(() => {
      if (this.activeClear === activeClear) this.activeClear = null;
    });

    this.activeClear = activeClear;
    return activeClear;
  }

  private clearPendingHistory(): void {
    this.writeBuffer = [];
    this.alarmBuffer = [];
    this.lastWrittenSamples.clear();
    this.flushQueued = false;
  }
}
