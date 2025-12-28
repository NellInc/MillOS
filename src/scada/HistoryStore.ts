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
}

const DEFAULT_CONFIG: HistoryStoreConfig = {
  retentionMs: 24 * 60 * 60 * 1000, // 24 hours
  batchIntervalMs: 1000,
  maxQueryPoints: 10000,
  maxBufferSize: 2000, // OPT-13: Bounded buffer
  changeDeadband: 0.5, // OPT-5: Change detection
};

/**
 * Wrap a promise with a timeout to prevent indefinite hangs
 */
const withTimeout = <T>(promise: Promise<T>, ms: number, operation: string): Promise<T> => {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`IndexedDB timeout: ${operation} exceeded ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
};

export class HistoryStore {
  private db: IDBDatabase | null = null;
  private readonly DB_NAME = 'MillOS_SCADA';
  private readonly DB_VERSION = 1;
  private config: HistoryStoreConfig;
  private writeBuffer: TagHistoryRecord[] = [];
  private alarmBuffer: AlarmHistoryRecord[] = [];
  private batchInterval: ReturnType<typeof setInterval> | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;
  private isInitialized = false;
  private isFlushing = false;
  private flushQueued = false;
  private historyDisabled = false;

  // OPT-5: Track last written values for change detection
  private lastWrittenValues: Map<string, number> = new Map();

  constructor(config: Partial<HistoryStoreConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // =========================================================================
  // Initialization
  // =========================================================================

  /**
   * Initialize the IndexedDB database
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    // Graceful fallback for environments without IndexedDB (private mode/SSR)
    if (typeof indexedDB === 'undefined') {
      this.historyDisabled = true;
      this.isInitialized = true;
      return;
    }

    return new Promise((resolve, _reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = (event) => {
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
        this.db = request.result;
        this.isInitialized = true;

        // Start batch write interval
        this.batchInterval = setInterval(() => this.flushBuffers(), this.config.batchIntervalMs);

        // Start cleanup interval (every hour)
        this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 60 * 1000);

        // Initial cleanup
        this.cleanup();

        resolve();
      };

      request.onerror = () => {
        this.historyDisabled = true;
        this.isInitialized = true;
        resolve(); // Continue in disabled mode instead of rejecting
      };
    });
  }

  /**
   * Close the database connection
   * @param flush - If true (default), flush pending buffers before closing
   */
  async close(flush = true): Promise<void> {
    // Stop intervals first to prevent new flushes during shutdown
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Flush any pending data before closing (unless explicitly skipped)
    if (flush && this.db) {
      await this.flushBuffers();
    }

    if (this.db) {
      this.db.close();
      this.db = null;
    }
    // Reset buffers and caches so next init starts clean
    this.writeBuffer = [];
    this.alarmBuffer = [];
    this.lastWrittenValues.clear();
    this.isFlushing = false;
    this.flushQueued = false;
    this.isInitialized = false;
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

    const numValue = tagValue.value as number;

    // OPT-5: Change detection - skip if value hasn't changed significantly
    const lastValue = this.lastWrittenValues.get(tagValue.tagId);
    if (lastValue !== undefined) {
      const delta = Math.abs(numValue - lastValue);
      if (delta < this.config.changeDeadband) {
        return; // Skip unchanged values
      }
    }

    // Update last written value
    this.lastWrittenValues.set(tagValue.tagId, numValue);

    this.writeBuffer.push({
      tagId: tagValue.tagId,
      timestamp: tagValue.timestamp,
      value: numValue,
      quality: tagValue.quality,
    });

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
    });
  }

  /**
   * Flush all buffered data to IndexedDB
   */
  private async flushBuffers(): Promise<void> {
    if (this.historyDisabled) return;

    const db = this.db;
    if (!db) return;

    // Prevent overlapping flushes which can duplicate writes
    if (this.isFlushing) {
      this.flushQueued = true;
      return;
    }
    this.isFlushing = true;

    try {
      // Flush tag history
      if (this.writeBuffer.length > 0) {
        const records = [...this.writeBuffer];

        try {
          const transaction = db.transaction('tagHistory', 'readwrite');
          const store = transaction.objectStore('tagHistory');

          records.forEach((record) => {
            store.add(record);
          });

          await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
          });

          // Only clear buffer after successful transaction
          this.writeBuffer = this.writeBuffer.filter((r) => !records.includes(r));
        } catch {
          // Records remain in buffer for next attempt
        }
      }

      // Flush alarm history
      if (this.alarmBuffer.length > 0) {
        const records = [...this.alarmBuffer];

        try {
          const transaction = db.transaction('alarmHistory', 'readwrite');
          const store = transaction.objectStore('alarmHistory');

          records.forEach((record) => {
            store.add(record);
          });

          await new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
          });

          // Only clear buffer after successful transaction
          this.alarmBuffer = this.alarmBuffer.filter((r) => !records.includes(r));
        } catch {
          // Records remain in buffer for next attempt
        }
      }
    } finally {
      this.isFlushing = false;
      if (this.flushQueued) {
        this.flushQueued = false;
        void this.flushBuffers();
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

    const db = this.db;
    if (!db) return [];

    const query = new Promise<TagHistoryPoint[]>((resolve, reject) => {
      const transaction = db.transaction('tagHistory', 'readonly');
      const store = transaction.objectStore('tagHistory');
      const index = store.index('tagId_timestamp');

      const range = IDBKeyRange.bound([tagId, startTime], [tagId, endTime]);

      const request = index.getAll(range, this.config.maxQueryPoints);

      request.onsuccess = () => {
        resolve(
          request.result.map((r) => ({
            timestamp: r.timestamp,
            value: r.value,
            quality: r.quality,
          }))
        );
      };

      request.onerror = () => reject(request.error);
    });

    return withTimeout(query, 10000, `getHistory(${tagId})`);
  }

  /**
   * Get history for multiple tags within a time range
   */
  async getMultipleTagHistory(
    tagIds: string[],
    startTime: number,
    endTime: number = Date.now()
  ): Promise<Record<string, TagHistoryPoint[]>> {
    if (this.historyDisabled) return {};

    const result: Record<string, TagHistoryPoint[]> = {};

    await Promise.all(
      tagIds.map(async (tagId) => {
        result[tagId] = await this.getHistory(tagId, startTime, endTime);
      })
    );

    return result;
  }

  /**
   * Get the latest value for a tag from history
   */
  async getLatestValue(tagId: string): Promise<TagHistoryPoint | null> {
    if (this.historyDisabled) return null;

    const db = this.db;
    if (!db) return null;

    const query = new Promise<TagHistoryPoint | null>((resolve, reject) => {
      const transaction = db.transaction('tagHistory', 'readonly');
      const store = transaction.objectStore('tagHistory');
      const index = store.index('tagId_timestamp');

      const range = IDBKeyRange.bound([tagId, 0], [tagId, Date.now()]);

      const request = index.openCursor(range, 'prev');

      request.onsuccess = () => {
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
      };

      request.onerror = () => reject(request.error);
    });

    return withTimeout(query, 10000, `getLatestValue(${tagId})`);
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

    const db = this.db;
    if (!db) return [];

    const query = new Promise<AlarmHistoryRecord[]>((resolve, reject) => {
      const transaction = db.transaction('alarmHistory', 'readonly');
      const store = transaction.objectStore('alarmHistory');
      const index = store.index('timestamp');

      const range = IDBKeyRange.bound(startTime, endTime);
      const results: AlarmHistoryRecord[] = [];

      const request = index.openCursor(range, 'prev');

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => reject(request.error);
    });

    return withTimeout(query, 10000, 'getAlarmHistory');
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

    const getCount = (storeName: string): Promise<number> => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    };

    const getFirstTimestamp = (): Promise<number | null> => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('tagHistory', 'readonly');
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

    const [tagHistoryCount, alarmHistoryCount, oldestTimestamp, newestTimestamp] =
      await Promise.all([
        getCount('tagHistory'),
        getCount('alarmHistory'),
        getFirstTimestamp(),
        getLastTimestamp(),
      ]);

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

    for (const tagId of tagIds) {
      const history = await this.getHistory(tagId, startTime, endTime);
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

    const tags: Record<string, TagHistoryPoint[]> = {};

    for (const tagId of tagIds) {
      tags[tagId] = await this.getHistory(tagId, startTime, endTime);
    }

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
    URL.revokeObjectURL(url);
  }

  // =========================================================================
  // Cleanup Operations
  // =========================================================================

  /**
   * Remove data older than retention period
   */
  private async cleanup(): Promise<void> {
    if (this.historyDisabled) return;

    const db = this.db;
    if (!db) return;

    const cutoff = Date.now() - this.config.retentionMs;
    let deletedCount = 0;

    // Cleanup tag history
    try {
      const transaction = db.transaction('tagHistory', 'readwrite');
      const store = transaction.objectStore('tagHistory');
      const index = store.index('timestamp');

      const range = IDBKeyRange.upperBound(cutoff);
      const request = index.openCursor(range);

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        }
      };

      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch {
      // Cleanup failed - will retry on next interval
    }

    // Cleanup alarm history (keep longer - 7 days)
    const alarmCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    try {
      const transaction = db.transaction('alarmHistory', 'readwrite');
      const store = transaction.objectStore('alarmHistory');
      const index = store.index('timestamp');

      const range = IDBKeyRange.upperBound(alarmCutoff);
      const request = index.openCursor(range);
      let alarmDeletedCount = 0;

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          cursor.delete();
          alarmDeletedCount++;
          cursor.continue();
        }
      };

      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
      });
    } catch {
      // Cleanup failed - will retry on next interval
    }
  }

  /**
   * Clear all history data (use with caution!)
   */
  async clearAll(): Promise<void> {
    if (this.historyDisabled) return;

    const db = this.db;
    if (!db) return;

    const clearStore = (storeName: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    };

    await Promise.all([clearStore('tagHistory'), clearStore('alarmHistory')]);
  }
}
