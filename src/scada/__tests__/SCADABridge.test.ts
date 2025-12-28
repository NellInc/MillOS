/**
 * Unit Tests for SCADABridge
 */

import { describe, it, expect } from 'vitest';
import {
  temperatureToColor,
  vibrationToColor,
  levelToColor,
  calculateMachineVisuals,
  scadaToStoreMetrics,
  getAlarmVisualConfig,
} from '../SCADABridge';
import { TagValue, Alarm } from '../types';

describe('SCADABridge', () => {
  describe('temperatureToColor', () => {
    it('should return blue for cold temperatures (at or below normalMin)', () => {
      expect(temperatureToColor(15)).toBe('#3b82f6');
      expect(temperatureToColor(20)).toBe('#3b82f6'); // exactly at normalMin boundary
    });

    it('should return interpolated blue-to-green for normal range temperatures', () => {
      // temp=35: t = (35-20)/(50-20) = 0.5, interpolate blue->green
      expect(temperatureToColor(35)).toBe('#2fa4aa');
      // temp=50: exactly at normalMax, should be pure green
      expect(temperatureToColor(50)).toBe('#22c55e');
    });

    it('should return interpolated green-to-yellow for warm temperatures', () => {
      // temp=60: t = (60-50)/15 = 0.667, interpolate green->yellow
      expect(temperatureToColor(60)).toBe('#a7b925');
      // temp=65: exactly at midpoint, should be pure yellow
      expect(temperatureToColor(65)).toBe('#eab308');
    });

    it('should return red for hot temperatures (at or above criticalMax)', () => {
      expect(temperatureToColor(80)).toBe('#ef4444'); // exactly at criticalMax
      expect(temperatureToColor(85)).toBe('#ef4444'); // above criticalMax
    });

    it('should respect custom thresholds', () => {
      // With custom thresholds: normalMin=10, normalMax=30, criticalMax=50
      // temp=30: exactly at normalMax, should be green
      expect(temperatureToColor(30, 10, 30, 50)).toBe('#22c55e');
      // temp=10: exactly at normalMin, should be blue
      expect(temperatureToColor(10, 10, 30, 50)).toBe('#3b82f6');
    });

    it('should produce different colors at threshold boundaries', () => {
      const coldColor = temperatureToColor(20);
      const normalColor = temperatureToColor(50);
      const warmColor = temperatureToColor(65);
      const hotColor = temperatureToColor(80);

      // Each zone should have a distinct color
      expect(coldColor).not.toBe(normalColor);
      expect(normalColor).not.toBe(warmColor);
      expect(warmColor).not.toBe(hotColor);

      // Verify exact boundary colors
      expect(coldColor).toBe('#3b82f6'); // blue
      expect(normalColor).toBe('#22c55e'); // green
      expect(warmColor).toBe('#eab308'); // yellow
      expect(hotColor).toBe('#ef4444'); // red
    });
  });

  describe('vibrationToColor', () => {
    it('should return green for low vibration (at or below normalMax)', () => {
      expect(vibrationToColor(1)).toBe('#22c55e');
      expect(vibrationToColor(2.5)).toBe('#22c55e');
      expect(vibrationToColor(3)).toBe('#22c55e'); // exactly at normalMax boundary
    });

    it('should return interpolated green-to-orange for medium vibration', () => {
      // vib=4: t = (4-3)/(5-3) = 0.5, interpolate green->orange
      expect(vibrationToColor(4)).toBe('#8cb235');
      // vib=5: exactly at warningMax, should be orange
      expect(vibrationToColor(5)).toBe('#f59e0b');
    });

    it('should return interpolated orange-to-red for high vibration', () => {
      // vib=6.5: t = (6.5-5)/(8-5) = 0.5, interpolate orange->red
      expect(vibrationToColor(6.5)).toBe('#f27128');
      // vib=8: exactly at criticalMax, should be red
      expect(vibrationToColor(8)).toBe('#ef4444');
    });

    it('should return red for critical vibration (above criticalMax)', () => {
      expect(vibrationToColor(10)).toBe('#ef4444');
      expect(vibrationToColor(15)).toBe('#ef4444');
    });

    it('should produce different colors at threshold boundaries', () => {
      const normalColor = vibrationToColor(3);
      const warningColor = vibrationToColor(5);
      const criticalColor = vibrationToColor(8);

      // Each zone boundary should have a distinct color
      expect(normalColor).not.toBe(warningColor);
      expect(warningColor).not.toBe(criticalColor);

      // Verify exact boundary colors
      expect(normalColor).toBe('#22c55e'); // green
      expect(warningColor).toBe('#f59e0b'); // orange
      expect(criticalColor).toBe('#ef4444'); // red
    });
  });

  describe('levelToColor', () => {
    it('should return red for critical low levels', () => {
      expect(levelToColor(3)).toBe('#ef4444');
    });

    it('should return orange for warning low levels', () => {
      expect(levelToColor(10)).toBe('#f59e0b');
    });

    it('should return green for normal levels', () => {
      expect(levelToColor(50)).toBe('#22c55e');
    });

    it('should return yellow for warning high levels', () => {
      expect(levelToColor(90)).toBe('#eab308');
    });

    it('should return red for critical high levels', () => {
      expect(levelToColor(98)).toBe('#ef4444');
    });
  });

  describe('calculateMachineVisuals', () => {
    const createTagValue = (tagId: string, value: number): TagValue => ({
      tagId,
      value,
      quality: 'GOOD',
      timestamp: Date.now(),
    });

    it('should return default properties for unknown machine', () => {
      const values = new Map<string, TagValue>();
      const alarms: Alarm[] = [];

      const visuals = calculateMachineVisuals('unknown-machine', values, alarms);

      expect(visuals.derivedStatus).toBe('running');
      expect(visuals.statusColor).toBe('#22c55e');
      expect(visuals.rpmMultiplier).toBe(1);
    });

    it('should calculate temperature color from SCADA values', () => {
      const values = new Map<string, TagValue>();
      // RM101 has alarmHi=65 (normalMax), alarmHiHi=75 (criticalMax)
      // temp=70 is exactly at the midpoint (65+75)/2, so should be yellow
      values.set('RM101.TT001.PV', createTagValue('RM101.TT001.PV', 70));

      const visuals = calculateMachineVisuals('rm-101', values, []);

      expect(visuals.tagValues.temperature).toBe(70);
      // 70 degrees is at the warm/hot boundary (midpoint), should be yellow
      expect(visuals.temperatureColor).toBe('#eab308');
      // Glow should be active since temp is above normalMax (65)
      expect(visuals.temperatureGlow).toBeGreaterThan(0);
      expect(visuals.temperatureGlow).toBe(0.25); // (70-65)/(75-65)*0.5 = 0.25
    });

    it('should calculate vibration intensity from SCADA values', () => {
      const values = new Map<string, TagValue>();
      values.set('RM101.VT001.PV', createTagValue('RM101.VT001.PV', 4.0));

      const visuals = calculateMachineVisuals('rm-101', values, []);

      expect(visuals.tagValues.vibration).toBe(4.0);
      expect(visuals.vibrationIntensity).toBeGreaterThan(1);
    });

    it('should calculate RPM multiplier from SCADA values', () => {
      const values = new Map<string, TagValue>();
      values.set('RM101.ST001.PV', createTagValue('RM101.ST001.PV', 1000));

      const visuals = calculateMachineVisuals('rm-101', values, []);

      expect(visuals.tagValues.rpm).toBe(1000);
      expect(visuals.rpmMultiplier).toBeGreaterThan(0);
      expect(visuals.rpmMultiplier).toBeLessThanOrEqual(1);
    });

    it('should detect active alarms', () => {
      const values = new Map<string, TagValue>();
      const alarms: Alarm[] = [
        {
          id: 'alarm-1',
          tagId: 'RM101.TT001.PV',
          tagName: 'RM101 Temperature',
          type: 'HIHI',
          state: 'UNACK',
          priority: 'CRITICAL',
          value: 85,
          threshold: 80,
          timestamp: Date.now(),
          machineId: 'rm-101',
        },
      ];

      const visuals = calculateMachineVisuals('rm-101', values, alarms);

      expect(visuals.hasActiveAlarm).toBe(true);
      expect(visuals.alarmPriority).toBe('CRITICAL');
      expect(visuals.derivedStatus).toBe('critical');
      expect(visuals.alarmPulseSpeed).toBe(4);
    });

    it('should calculate fill level for silos', () => {
      const values = new Map<string, TagValue>();
      values.set('SILO_ALPHA.LT001.PV', createTagValue('SILO_ALPHA.LT001.PV', 75));

      const visuals = calculateMachineVisuals('silo-0', values, []);

      expect(visuals.fillLevel).toBe(75);
      expect(visuals.fillColor).toBe('#22c55e');
    });
  });

  describe('scadaToStoreMetrics', () => {
    const createTagValue = (tagId: string, value: number): TagValue => ({
      tagId,
      value,
      quality: 'GOOD',
      timestamp: Date.now(),
    });

    it('should return null for unknown machine', () => {
      const values = new Map<string, TagValue>();
      const result = scadaToStoreMetrics('unknown-machine', values, []);
      expect(result).toBeNull();
    });

    it('should extract metrics from SCADA values', () => {
      const values = new Map<string, TagValue>();
      values.set('RM101.TT001.PV', createTagValue('RM101.TT001.PV', 55));
      values.set('RM101.VT001.PV', createTagValue('RM101.VT001.PV', 2.5));
      values.set('RM101.ST001.PV', createTagValue('RM101.ST001.PV', 1400));

      const result = scadaToStoreMetrics('rm-101', values, []);

      expect(result).not.toBeNull();
      expect(result!.machineId).toBe('rm-101');
      expect(result!.metrics.temperature).toBe(55);
      expect(result!.metrics.vibration).toBe(2.5);
      expect(result!.metrics.rpm).toBe(1400);
    });

    it('should derive status from alarms', () => {
      const values = new Map<string, TagValue>();
      const alarms: Alarm[] = [
        {
          id: 'alarm-1',
          tagId: 'RM101.TT001.PV',
          tagName: 'RM101 Temperature',
          type: 'HIHI',
          state: 'UNACK',
          priority: 'CRITICAL',
          value: 85,
          threshold: 80,
          timestamp: Date.now(),
          machineId: 'rm-101',
        },
      ];

      const result = scadaToStoreMetrics('rm-101', values, alarms);

      expect(result!.status).toBe('critical');
    });
  });

  describe('getAlarmVisualConfig', () => {
    it('should return correct config for CRITICAL alarms', () => {
      const config = getAlarmVisualConfig('CRITICAL', 'UNACK');

      expect(config.color).toBe('#ef4444');
      expect(config.pulseSpeed).toBe(4);
      expect(config.icon).toBe('alert-octagon');
      expect(config.size).toBe(1.2);
      expect(config.opacity).toBe(1);
    });

    it('should return correct config for HIGH alarms', () => {
      const config = getAlarmVisualConfig('HIGH', 'UNACK');

      expect(config.color).toBe('#f97316');
      expect(config.pulseSpeed).toBe(2.5);
      expect(config.icon).toBe('alert-triangle');
    });

    it('should not pulse for acknowledged alarms', () => {
      const config = getAlarmVisualConfig('CRITICAL', 'ACKED');

      expect(config.pulseSpeed).toBe(0);
      expect(config.opacity).toBe(1);
    });

    it('should pulse for return-to-normal unacknowledged', () => {
      const config = getAlarmVisualConfig('HIGH', 'RTN_UNACK');

      expect(config.pulseSpeed).toBe(2.5);
      expect(config.opacity).toBe(0.5);
    });

    it('should reduce opacity for normal state alarms', () => {
      const config = getAlarmVisualConfig('MEDIUM', 'NORMAL');

      expect(config.pulseSpeed).toBe(0);
      expect(config.opacity).toBe(0.5);
    });
  });
});
