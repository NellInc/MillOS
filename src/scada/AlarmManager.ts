/**
 * SCADA Alarm Manager for MillOS
 *
 * Implements ISA-18.2 compliant alarm management:
 * - State machine: NORMAL -> UNACK -> ACKED -> RTN_UNACK -> NORMAL
 * - Priority levels: CRITICAL, HIGH, MEDIUM, LOW
 * - Deadband support to prevent alarm chattering
 * - Alarm shelving and suppression
 * - Alarm history for post-incident analysis
 */

import { logger } from '../utils/logger';
import {
  TagDefinition,
  TagValue,
  Alarm,
  AlarmState,
  AlarmPriority,
  AlarmType,
  AlarmSuppression,
} from './types';

export class AlarmManager {
  private activeAlarms: Map<string, Alarm> = new Map();
  private alarmHistory: Alarm[] = [];
  private suppressions: Map<string, AlarmSuppression> = new Map();
  private tagThresholds: Map<string, TagDefinition> = new Map();
  private listeners: Set<(alarms: Alarm[]) => void> = new Set();

  // Suppression cleanup throttling (avoid per-tag work when evaluating large batches)
  private lastSuppressionCleanup = 0;
  private static SUPPRESSION_CLEANUP_INTERVAL_MS = 1000;

  // Track last alarm state per tag to handle deadband
  private lastAlarmStates: Map<
    string,
    {
      inAlarm: boolean;
      type?: AlarmType;
      value: number;
    }
  > = new Map();

  // Log throttling - prevent spam for repeated alarms
  private lastLogTime: Map<string, number> = new Map();
  private static LOG_THROTTLE_MS = 30000; // 30 seconds between repeated log entries

  // Startup warmup - suppress alarms during initialization
  private startupTime: number;
  private static WARMUP_PERIOD_MS = 5000; // 5 seconds warmup for system stabilization

  constructor(tags: TagDefinition[]) {
    this.startupTime = Date.now();
    tags.forEach((t) => {
      this.tagThresholds.set(t.id, t);
      this.lastAlarmStates.set(t.id, { inAlarm: false, value: t.engLow });
    });
  }

  /**
   * Check if we're still in the startup warmup period
   */
  private isInWarmup(now: number): boolean {
    return now - this.startupTime < AlarmManager.WARMUP_PERIOD_MS;
  }

  // =========================================================================
  // Core Alarm Evaluation
  // =========================================================================

  /**
   * Evaluate a tag value against alarm thresholds.
   * Call this for every SCADA value update.
   */
  evaluate(tagValue: TagValue): void {
    const now = Date.now();
    const tag = this.tagThresholds.get(tagValue.tagId);
    if (!tag) return;

    // Clean expired suppressions periodically
    this.maybeCleanExpiredSuppressions(now);

    // Skip alarm evaluation during startup warmup
    if (this.isInWarmup(now)) {
      // Still update the last known value for proper state tracking
      const lastState = this.lastAlarmStates.get(tag.id);
      if (lastState) {
        lastState.value = tagValue.value as number;
      }
      return;
    }

    const numValue = tagValue.value as number;
    const lastState = this.lastAlarmStates.get(tag.id);
    const deadband = tag.deadband ?? 0;

    // Check if alarm is suppressed
    if (this.isAlarmSuppressed(tag.id)) {
      return;
    }

    // Check quality alarm first
    if (tagValue.quality === 'BAD') {
      this.raiseAlarm(tag, 'BAD_QUALITY', numValue, 0, 'HIGH');
      this.lastAlarmStates.set(tag.id, { inAlarm: true, type: 'BAD_QUALITY', value: numValue });
      return;
    }

    // Determine alarm condition (check from most severe to least)
    let alarmType: AlarmType | null = null;
    let threshold = 0;
    let priority: AlarmPriority = 'MEDIUM';

    if (tag.alarmHiHi !== undefined && numValue >= tag.alarmHiHi) {
      alarmType = 'HIHI';
      threshold = tag.alarmHiHi;
      priority = 'CRITICAL';
    } else if (tag.alarmHi !== undefined && numValue >= tag.alarmHi) {
      // Apply deadband for returning from higher alarm
      if (lastState?.type === 'HIHI' && tag.alarmHiHi !== undefined) {
        if (numValue >= tag.alarmHi - deadband) {
          alarmType = 'HIHI';
          threshold = tag.alarmHiHi;
          priority = 'CRITICAL';
        } else {
          alarmType = 'HI';
          threshold = tag.alarmHi;
          priority = 'HIGH';
        }
      } else {
        alarmType = 'HI';
        threshold = tag.alarmHi;
        priority = 'HIGH';
      }
    } else if (tag.alarmLoLo !== undefined && numValue <= tag.alarmLoLo) {
      alarmType = 'LOLO';
      threshold = tag.alarmLoLo;
      priority = 'CRITICAL';
    } else if (tag.alarmLo !== undefined && numValue <= tag.alarmLo) {
      // Apply deadband for returning from lower alarm
      if (lastState?.type === 'LOLO' && tag.alarmLoLo !== undefined) {
        if (numValue <= tag.alarmLo + deadband) {
          alarmType = 'LOLO';
          threshold = tag.alarmLoLo;
          priority = 'CRITICAL';
        } else {
          alarmType = 'LO';
          threshold = tag.alarmLo;
          priority = 'HIGH';
        }
      } else {
        alarmType = 'LO';
        threshold = tag.alarmLo;
        priority = 'HIGH';
      }
    }

    // Check if alarm state has changed
    if (alarmType) {
      // Value is in alarm condition
      if (!lastState?.inAlarm || lastState.type !== alarmType) {
        // New alarm or alarm type changed
        this.raiseAlarm(tag, alarmType, numValue, threshold, priority);
      }
      this.lastAlarmStates.set(tag.id, { inAlarm: true, type: alarmType, value: numValue });
    } else {
      // Value returned to normal - apply deadband
      if (lastState?.inAlarm) {
        const shouldClear = this.checkDeadbandForClear(tag, numValue, lastState);
        if (shouldClear) {
          this.clearAlarm(tag.id);
          this.lastAlarmStates.set(tag.id, { inAlarm: false, value: numValue });
        }
      } else {
        this.lastAlarmStates.set(tag.id, { inAlarm: false, value: numValue });
      }
    }
  }

  private checkDeadbandForClear(
    tag: TagDefinition,
    value: number,
    lastState: { type?: AlarmType }
  ): boolean {
    const deadband = tag.deadband ?? 0;

    switch (lastState.type) {
      case 'HIHI':
        return tag.alarmHiHi !== undefined && value < tag.alarmHiHi - deadband;
      case 'HI':
        return tag.alarmHi !== undefined && value < tag.alarmHi - deadband;
      case 'LOLO':
        return tag.alarmLoLo !== undefined && value > tag.alarmLoLo + deadband;
      case 'LO':
        return tag.alarmLo !== undefined && value > tag.alarmLo + deadband;
      default:
        return true;
    }
  }

  // =========================================================================
  // Alarm State Management
  // =========================================================================

  /**
   * Throttled logging to prevent console spam
   */
  private throttledLog(key: string, message: string): void {
    const now = Date.now();
    const lastLog = this.lastLogTime.get(key) ?? 0;

    if (now - lastLog >= AlarmManager.LOG_THROTTLE_MS) {
      logger.scada.debug(message);
      this.lastLogTime.set(key, now);
    }
  }

  private raiseAlarm(
    tag: TagDefinition,
    type: AlarmType,
    value: number,
    threshold: number,
    priority: AlarmPriority
  ): void {
    const alarmId = `${tag.id}-${type}`;
    const existing = this.activeAlarms.get(alarmId);

    if (!existing) {
      const alarm: Alarm = {
        id: alarmId,
        tagId: tag.id,
        tagName: tag.name,
        type,
        state: 'UNACK',
        priority,
        value,
        threshold,
        timestamp: Date.now(),
        machineId: tag.machineId,
      };

      this.activeAlarms.set(alarmId, alarm);
      this.throttledLog(
        `raise-${alarmId}`,
        `[AlarmManager] ALARM RAISED: ${tag.name} - ${type} (${value} ${tag.engUnit})`
      );
      this.notifyListeners();
    } else {
      // Update value in existing alarm
      existing.value = value;
    }
  }

  private clearAlarm(tagId: string): void {
    const toClear: string[] = [];

    this.activeAlarms.forEach((alarm, id) => {
      if (alarm.tagId === tagId) {
        toClear.push(id);
      }
    });

    toClear.forEach((id) => {
      const alarm = this.activeAlarms.get(id);
      if (alarm) {
        const now = Date.now();

        if (alarm.state === 'UNACK') {
          // Alarm was never acknowledged - move to RTN_UNACK
          alarm.state = 'RTN_UNACK';
          alarm.clearedAt = now;
          this.throttledLog(
            `rtn-${id}`,
            `[AlarmManager] ALARM RTN_UNACK: ${alarm.tagName} - ${alarm.type}`
          );
        } else if (alarm.state === 'ACKED') {
          // Alarm was acknowledged - clear completely
          this.archiveAlarm(alarm, now);
          this.activeAlarms.delete(id);
          this.throttledLog(
            `clear-${id}`,
            `[AlarmManager] ALARM CLEARED: ${alarm.tagName} - ${alarm.type}`
          );
        }
      }
    });

    if (toClear.length > 0) {
      this.notifyListeners();
    }
  }

  /**
   * Acknowledge an alarm. Operator must acknowledge to clear RTN_UNACK alarms.
   */
  acknowledge(alarmId: string, operator: string): boolean {
    const alarm = this.activeAlarms.get(alarmId);
    if (!alarm) {
      return false;
    }

    const now = Date.now();
    alarm.acknowledgedBy = operator;
    alarm.acknowledgedAt = now;

    if (alarm.state === 'UNACK') {
      // Active alarm - mark as acknowledged
      alarm.state = 'ACKED';
      logger.scada.info(`[AlarmManager] ALARM ACKED: ${alarm.tagName} by ${operator}`);
    } else if (alarm.state === 'RTN_UNACK') {
      // Returned to normal - archive and clear
      this.archiveAlarm(alarm, now);
      this.activeAlarms.delete(alarmId);
      logger.scada.info(`[AlarmManager] ALARM CLEARED (RTN): ${alarm.tagName} by ${operator}`);
    }

    this.notifyListeners();
    return true;
  }

  /**
   * Acknowledge all active alarms
   */
  acknowledgeAll(operator: string): number {
    let count = 0;
    const alarmIds = Array.from(this.activeAlarms.keys());

    alarmIds.forEach((id) => {
      if (this.acknowledge(id, operator)) {
        count++;
      }
    });

    return count;
  }

  private archiveAlarm(alarm: Alarm, clearedAt: number): void {
    this.alarmHistory.push({
      ...alarm,
      state: 'NORMAL',
      clearedAt,
    });

    // Keep only last 1000 historical alarms
    if (this.alarmHistory.length > 1000) {
      this.alarmHistory = this.alarmHistory.slice(-1000);
    }
  }

  // =========================================================================
  // Alarm Suppression (Shelving)
  // =========================================================================

  /**
   * Suppress alarms for a tag (shelving)
   */
  suppress(tagId: string, operator: string, reason: string, durationMs?: number): void {
    this.suppressions.set(tagId, {
      tagId,
      suppressedAt: Date.now(),
      suppressedBy: operator,
      reason,
      expiresAt: durationMs ? Date.now() + durationMs : undefined,
    });
    logger.scada.info(`[AlarmManager] Alarms suppressed for ${tagId}: ${reason}`);
  }

  /**
   * Remove suppression for a tag
   */
  unsuppress(tagId: string): void {
    this.suppressions.delete(tagId);
    logger.scada.info(`[AlarmManager] Suppression removed for ${tagId}`);
  }

  /**
   * Check if alarms are suppressed for a tag
   */
  isAlarmSuppressed(tagId: string): boolean {
    const suppression = this.suppressions.get(tagId);
    if (!suppression) return false;

    // Check expiration
    if (suppression.expiresAt && Date.now() >= suppression.expiresAt) {
      this.suppressions.delete(tagId);
      return false;
    }

    return true;
  }

  // =========================================================================
  // Query Methods
  // =========================================================================

  /**
   * Get all active alarms, sorted by priority and time
   */
  getActiveAlarms(): Alarm[] {
    return Array.from(this.activeAlarms.values()).sort((a, b) => {
      const priorityOrder: Record<AlarmPriority, number> = {
        CRITICAL: 0,
        HIGH: 1,
        MEDIUM: 2,
        LOW: 3,
      };

      // Sort by priority first
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }

      // Then by timestamp (newest first)
      return b.timestamp - a.timestamp;
    });
  }

  /**
   * Get active alarms filtered by state
   */
  getAlarmsByState(state: AlarmState): Alarm[] {
    return this.getActiveAlarms().filter((a) => a.state === state);
  }

  /**
   * Get active alarms for a specific machine
   */
  getAlarmsForMachine(machineId: string): Alarm[] {
    return this.getActiveAlarms().filter((a) => a.machineId === machineId);
  }

  /**
   * Get count of unacknowledged alarms
   */
  getUnacknowledgedCount(): number {
    let count = 0;
    this.activeAlarms.forEach((alarm) => {
      if (alarm.state === 'UNACK' || alarm.state === 'RTN_UNACK') {
        count++;
      }
    });
    return count;
  }

  /**
   * Get count by priority
   */
  getCountByPriority(): Record<AlarmPriority, number> {
    const counts: Record<AlarmPriority, number> = {
      CRITICAL: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    this.activeAlarms.forEach((alarm) => {
      counts[alarm.priority]++;
    });

    return counts;
  }

  /**
   * Get alarm history
   */
  getAlarmHistory(limit = 100): Alarm[] {
    return this.alarmHistory.slice(-limit).reverse();
  }

  /**
   * Clean expired alarm suppressions
   */
  private maybeCleanExpiredSuppressions(now: number): void {
    if (now - this.lastSuppressionCleanup < AlarmManager.SUPPRESSION_CLEANUP_INTERVAL_MS) return;
    this.lastSuppressionCleanup = now;
    this.cleanExpiredSuppressions(now);
  }

  private cleanExpiredSuppressions(now: number): void {
    this.suppressions.forEach((sup, tagId) => {
      if (sup.expiresAt && now >= sup.expiresAt) {
        this.suppressions.delete(tagId);
      }
    });
  }

  /**
   * Get suppressed tags
   */
  getSuppressedTags(): AlarmSuppression[] {
    // Clean up expired suppressions first
    this.cleanExpiredSuppressions(Date.now());
    return Array.from(this.suppressions.values());
  }

  // =========================================================================
  // Subscriptions
  // =========================================================================

  /**
   * Subscribe to alarm changes
   */
  subscribe(callback: (alarms: Alarm[]) => void): () => void {
    this.listeners.add(callback);

    // Immediately notify with current alarms
    callback(this.getActiveAlarms());

    return () => {
      this.listeners.delete(callback);
    };
  }

  private notifyListeners(): void {
    const alarms = this.getActiveAlarms();
    // Create copy of listeners to prevent modification during iteration
    const listenersCopy = [...this.listeners];
    listenersCopy.forEach((cb) => {
      try {
        cb(alarms);
      } catch (e) {
        // Listener callback error - remove faulty listener to prevent memory leak
        console.error('Listener callback error, removing listener:', e);
        this.listeners.delete(cb);
      }
    });
  }

  // =========================================================================
  // Utility
  // =========================================================================

  /**
   * Check if any critical alarms are active
   */
  hasCriticalAlarms(): boolean {
    let hasCritical = false;
    this.activeAlarms.forEach((alarm) => {
      if (alarm.priority === 'CRITICAL') {
        hasCritical = true;
      }
    });
    return hasCritical;
  }

  /**
   * Get alarm summary for dashboard
   */
  getSummary(): {
    total: number;
    unacknowledged: number;
    critical: number;
    high: number;
    suppressed: number;
  } {
    const counts = this.getCountByPriority();
    return {
      total: this.activeAlarms.size,
      unacknowledged: this.getUnacknowledgedCount(),
      critical: counts.CRITICAL,
      high: counts.HIGH,
      suppressed: this.suppressions.size,
    };
  }

  /**
   * Reset alarm manager state (for testing)
   */
  reset(): void {
    this.activeAlarms.clear();
    this.alarmHistory = [];
    this.suppressions.clear();
    this.lastLogTime.clear();
    this.startupTime = Date.now();
    this.lastAlarmStates.forEach((state) => {
      state.inAlarm = false;
      state.type = undefined;
    });
    this.notifyListeners();
  }
}
