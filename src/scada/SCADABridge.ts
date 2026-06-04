/**
 * SCADA Bridge for MillOS
 *
 * Bidirectional bridge between SCADA values and 3D visualization.
 * Maps real-time SCADA tag values to:
 * - Color gradients (temperature → red, vibration → intensity)
 * - Animation speeds (RPM → roller rotation, etc.)
 * - Alarm visual indicators (flashing, pulsing effects)
 */

import { TagValue, Alarm, AlarmPriority } from './types';
import { MILL_TAGS, getTagsByMachine } from './tagDatabase';

// ============================================================================
// Color Gradient Utilities
// ============================================================================

/**
 * Interpolate between two hex colors
 */
function lerpColor(color1: string, color2: string, t: number): string {
  const c1 = parseInt(color1.slice(1), 16);
  const c2 = parseInt(color2.slice(1), 16);

  const r1 = (c1 >> 16) & 0xff;
  const g1 = (c1 >> 8) & 0xff;
  const b1 = c1 & 0xff;

  const r2 = (c2 >> 16) & 0xff;
  const g2 = (c2 >> 8) & 0xff;
  const b2 = c2 & 0xff;

  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);

  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/**
 * Temperature to color gradient
 * Cold (blue) → Normal (green) → Warm (yellow) → Hot (red)
 */
export function temperatureToColor(
  temp: number,
  normalMin = 20,
  normalMax = 50,
  criticalMax = 80
): string {
  if (temp <= normalMin) {
    // Cold range: blue
    return '#3b82f6';
  } else if (temp <= normalMax) {
    // Normal range: blue → green
    const t = (temp - normalMin) / (normalMax - normalMin);
    return lerpColor('#3b82f6', '#22c55e', t);
  } else if (temp <= (normalMax + criticalMax) / 2) {
    // Warm range: green → yellow
    const t = (temp - normalMax) / ((criticalMax - normalMax) / 2);
    return lerpColor('#22c55e', '#eab308', t);
  } else {
    // Hot range: yellow → red
    const t = (temp - (normalMax + criticalMax) / 2) / ((criticalMax - normalMax) / 2);
    return lerpColor('#eab308', '#ef4444', Math.min(t, 1));
  }
}

/**
 * Vibration intensity to color
 * Low (green) → Medium (yellow) → High (orange) → Critical (red)
 */
export function vibrationToColor(
  vibration: number,
  normalMax = 3,
  warningMax = 5,
  criticalMax = 8
): string {
  if (vibration <= normalMax) {
    return '#22c55e'; // Green - normal
  } else if (vibration <= warningMax) {
    const t = (vibration - normalMax) / (warningMax - normalMax);
    return lerpColor('#22c55e', '#f59e0b', t);
  } else if (vibration <= criticalMax) {
    const t = (vibration - warningMax) / (criticalMax - warningMax);
    return lerpColor('#f59e0b', '#ef4444', t);
  } else {
    return '#ef4444'; // Red - critical
  }
}

/**
 * Level percentage to color
 * Empty (red) → Low (orange) → Normal (green) → High (yellow) → Full (red)
 */
export function levelToColor(level: number): string {
  if (level <= 5) {
    return '#ef4444'; // Critical low
  } else if (level <= 15) {
    return '#f59e0b'; // Warning low
  } else if (level <= 85) {
    return '#22c55e'; // Normal range
  } else if (level <= 95) {
    return '#eab308'; // Warning high
  } else {
    return '#ef4444'; // Critical high
  }
}

// ============================================================================
// Machine Visual Properties
// ============================================================================

export interface MachineVisualProperties {
  // Status derived from SCADA alarms
  derivedStatus: 'running' | 'idle' | 'warning' | 'critical';
  statusColor: string;

  // Temperature visualization
  temperatureColor: string;
  temperatureGlow: number; // 0-1 emissive intensity

  // Vibration visualization
  vibrationColor: string;
  vibrationIntensity: number; // multiplier for vibration animation

  // Animation speeds
  rpmMultiplier: number; // 0-1 multiplier for RPM-based animations

  // Alarm indicators
  hasActiveAlarm: boolean;
  alarmPriority: AlarmPriority | null;
  alarmPulseSpeed: number; // 0 = no pulse, higher = faster

  // Fill level (for silos)
  fillLevel: number | null;
  fillColor: string | null;

  // Individual tag values for detailed display
  tagValues: {
    temperature?: number;
    vibration?: number;
    rpm?: number;
    current?: number;
    level?: number;
    pressure?: number;
  };
}

/**
 * Get machine ID to SCADA tag prefix mapping
 */
function getMachineTagPrefix(machineId: string, machineName?: string): string | null {
  // Silo mapping: silo-0 → SILO_ALPHA, etc.
  const siloNames = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'];
  if (machineId.startsWith('silo-')) {
    const index = parseInt(machineId.replace('silo-', ''), 10);
    if (index >= 0 && index < siloNames.length) {
      return `SILO_${siloNames[index]}`;
    }
  }

  // Roller mill mapping: rm-101 → RM101, etc.
  if (machineId.startsWith('rm-')) {
    const num = machineId.replace('rm-', '');
    return `RM${num}`;
  }

  // Backwards compatibility: roller mills named RM-101 in display name
  if (machineName && machineName.toUpperCase().startsWith('RM-')) {
    return machineName.toUpperCase().replace('-', '');
  }

  // Plansifter mapping: sifter-a → SIFTER_A, etc.
  if (machineId.startsWith('sifter-')) {
    const letter = machineId.replace('sifter-', '').toUpperCase();
    return `SIFTER_${letter}`;
  }

  if (machineName && machineName.toUpperCase().startsWith('SIFTER ')) {
    const letter = machineName.split(' ')[1]?.toUpperCase();
    if (letter) {
      return `SIFTER_${letter}`;
    }
  }

  // Packer mapping: packer-0 → PACKER_1, etc.
  if (machineId.startsWith('packer-')) {
    const index = parseInt(machineId.replace('packer-', ''), 10);
    return `PACKER_${index + 1}`;
  }

  if (machineName && machineName.toUpperCase().startsWith('PACK LINE')) {
    const lineNum = parseInt(machineName.split(' ').pop() ?? '', 10);
    if (!Number.isNaN(lineNum)) {
      return `PACKER_${lineNum}`;
    }
  }

  return null;
}

/**
 * Extract numeric value from TagValue
 */
function getNumericValue(tagValue: TagValue | undefined): number | undefined {
  if (!tagValue || tagValue.quality !== 'GOOD') return undefined;
  return typeof tagValue.value === 'number' ? tagValue.value : undefined;
}

/**
 * Calculate visual properties for a machine based on SCADA values
 */
export function calculateMachineVisuals(
  machineId: string,
  values: Map<string, TagValue>,
  alarms: Alarm[],
  machineStatus: 'running' | 'idle' | 'warning' | 'critical' = 'running',
  machineName?: string
): MachineVisualProperties {
  // Thread machineName to getMachineTagPrefix so name-only machines resolve a
  // prefix here too, matching scadaToStoreMetrics (avoids blank visuals while
  // store metrics sync for machines whose id misses the prefix patterns).
  const prefix = getMachineTagPrefix(machineId, machineName);
  const machineTags = getTagsByMachine(machineId);
  const machineAlarms = alarms.filter((a) => a.machineId === machineId);

  // Default properties
  const props: MachineVisualProperties = {
    derivedStatus: machineStatus,
    statusColor: '#22c55e',
    temperatureColor: '#22c55e',
    temperatureGlow: 0,
    vibrationColor: '#22c55e',
    vibrationIntensity: 1,
    rpmMultiplier: 1,
    hasActiveAlarm: false,
    alarmPriority: null,
    alarmPulseSpeed: 0,
    fillLevel: null,
    fillColor: null,
    tagValues: {},
  };

  if (!prefix) return props;

  // Get tag values
  const tempTag = values.get(`${prefix}.TT001.PV`);
  const vibTag = values.get(`${prefix}.VT001.PV`);
  const speedTag = values.get(`${prefix}.ST001.PV`);
  const currentTag = values.get(`${prefix}.IT001.PV`);
  const levelTag = values.get(`${prefix}.LT001.PV`);

  // Temperature processing
  const temp = getNumericValue(tempTag);
  if (temp !== undefined) {
    props.tagValues.temperature = temp;

    // Find tag definition for alarm thresholds
    const tempDef = machineTags.find((t) => t.id === `${prefix}.TT001.PV`);
    const normalMax = tempDef?.alarmHi ?? 65;
    const criticalMax = tempDef?.alarmHiHi ?? 75;

    props.temperatureColor = temperatureToColor(temp, 20, normalMax, criticalMax);
    props.temperatureGlow =
      criticalMax > normalMax
        ? Math.max(0, (temp - normalMax) / (criticalMax - normalMax)) * 0.5
        : 0;
  }

  // Vibration processing
  const vib = getNumericValue(vibTag);
  if (vib !== undefined) {
    props.tagValues.vibration = vib;

    const vibDef = machineTags.find((t) => t.id === `${prefix}.VT001.PV`);
    const normalMax = vibDef?.alarmHi ?? 3.5;
    const criticalMax = vibDef?.alarmHiHi ?? 4.5;

    props.vibrationColor = vibrationToColor(vib, normalMax * 0.8, normalMax, criticalMax);
    // Vibration intensity: 0.5 at normal, up to 2.0 at critical
    props.vibrationIntensity = 0.5 + Math.min(vib / (normalMax * 2), 1.5);
  }

  // RPM processing
  const rpm = getNumericValue(speedTag);
  if (rpm !== undefined) {
    props.tagValues.rpm = rpm;

    const rpmDef = machineTags.find((t) => t.id === `${prefix}.ST001.PV`);
    const maxRpm = rpmDef?.engHigh ?? 2000;

    // RPM multiplier: 0 when stopped, 1 at max speed
    props.rpmMultiplier = Math.min(rpm / maxRpm, 1);
  }

  // Current processing
  const current = getNumericValue(currentTag);
  if (current !== undefined) {
    props.tagValues.current = current;
  }

  // Level processing (for silos)
  const level = getNumericValue(levelTag);
  if (level !== undefined) {
    props.tagValues.level = level;
    props.fillLevel = level;
    props.fillColor = levelToColor(level);
  }

  // Alarm processing
  if (machineAlarms.length > 0) {
    props.hasActiveAlarm = true;

    // Find highest priority alarm
    const priorities: AlarmPriority[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    for (const priority of priorities) {
      const alarm = machineAlarms.find((a) => a.priority === priority);
      if (alarm) {
        props.alarmPriority = priority;
        break;
      }
    }

    // Set pulse speed based on priority
    switch (props.alarmPriority) {
      case 'CRITICAL':
        props.alarmPulseSpeed = 4; // Very fast pulse
        props.derivedStatus = 'critical';
        props.statusColor = '#ef4444';
        break;
      case 'HIGH':
        props.alarmPulseSpeed = 2.5; // Fast pulse
        props.derivedStatus = 'warning';
        props.statusColor = '#f59e0b';
        break;
      case 'MEDIUM':
        props.alarmPulseSpeed = 1.5; // Medium pulse
        props.derivedStatus = 'warning';
        props.statusColor = '#eab308';
        break;
      case 'LOW':
        props.alarmPulseSpeed = 0.8; // Slow pulse
        props.statusColor = '#3b82f6';
        break;
    }
  } else {
    // No alarms - derive status from machine status
    switch (machineStatus) {
      case 'running':
        props.statusColor = '#22c55e';
        break;
      case 'idle':
        props.statusColor = '#eab308';
        break;
      case 'warning':
        props.statusColor = '#f59e0b';
        props.alarmPulseSpeed = 1;
        break;
      case 'critical':
        props.statusColor = '#ef4444';
        props.alarmPulseSpeed = 3;
        break;
    }
  }

  return props;
}

// ============================================================================
// Bidirectional Sync - SCADA → Store
// ============================================================================

export interface SCADAToStoreSync {
  machineId: string;
  metrics: {
    rpm?: number;
    temperature?: number;
    vibration?: number;
    load?: number;
  };
  fillLevel?: number;
  status?: 'running' | 'idle' | 'warning' | 'critical';
}

/**
 * Convert SCADA values to store-compatible machine metrics
 */
export function scadaToStoreMetrics(
  machineId: string,
  values: Map<string, TagValue>,
  alarms: Alarm[],
  machineName?: string
): SCADAToStoreSync | null {
  const prefix = getMachineTagPrefix(machineId, machineName);
  if (!prefix) return null;

  const sync: SCADAToStoreSync = {
    machineId,
    metrics: {},
  };

  // Get tag values
  const tempTag = values.get(`${prefix}.TT001.PV`);
  const vibTag = values.get(`${prefix}.VT001.PV`);
  const speedTag = values.get(`${prefix}.ST001.PV`);
  const levelTag = values.get(`${prefix}.LT001.PV`);
  const feedTag = values.get(`${prefix}.FT001.PV`);

  // Map values
  const temp = getNumericValue(tempTag);
  if (temp !== undefined) sync.metrics.temperature = temp;

  const vib = getNumericValue(vibTag);
  if (vib !== undefined) sync.metrics.vibration = vib;

  const rpm = getNumericValue(speedTag);
  if (rpm !== undefined) sync.metrics.rpm = rpm;

  const level = getNumericValue(levelTag);
  if (level !== undefined) {
    sync.fillLevel = level;
    sync.metrics.load = level; // Use level as load for silos
  }

  const feed = getNumericValue(feedTag);
  if (feed !== undefined && sync.metrics.load === undefined) {
    // Use feed rate as proxy for load if no level
    sync.metrics.load = Math.min(100, (feed / 30) * 100);
  }

  // Derive status from alarms
  const machineAlarms = alarms.filter((a) => a.machineId === machineId);
  if (machineAlarms.some((a) => a.priority === 'CRITICAL')) {
    sync.status = 'critical';
  } else if (machineAlarms.some((a) => a.priority === 'HIGH' || a.priority === 'MEDIUM')) {
    sync.status = 'warning';
  } else if (rpm !== undefined) {
    // Check machine type specific thresholds
    // Packers run at ~30-60 RPM, so the >100 check was forcing them to 'idle'
    const isPacker = machineId.includes('packer');
    const runningThreshold = isPacker ? 1 : 100;

    if (rpm > runningThreshold) {
      sync.status = 'running';
    } else {
      sync.status = 'idle';
    }
  }

  return sync;
}

// ============================================================================
// Tag to Machine Mapping
// ============================================================================

/**
 * Get the machine ID from a SCADA tag ID
 */
export function getMachineIdFromTag(tagId: string): string | null {
  const tag = MILL_TAGS.find((t) => t.id === tagId);
  return tag?.machineId ?? null;
}

/**
 * Get all tag IDs for a machine
 */
export function getTagIdsForMachine(machineId: string): string[] {
  return getTagsByMachine(machineId).map((t) => t.id);
}

// ============================================================================
// Alarm Visual Helpers
// ============================================================================

export interface AlarmVisualConfig {
  color: string;
  pulseSpeed: number;
  icon: 'alert-triangle' | 'alert-circle' | 'alert-octagon' | 'info';
  size: number;
  opacity: number;
}

/**
 * Get visual configuration for an alarm indicator
 */
export function getAlarmVisualConfig(
  priority: AlarmPriority,
  state: 'UNACK' | 'ACKED' | 'RTN_UNACK' | 'NORMAL'
): AlarmVisualConfig {
  const isActive = state === 'UNACK' || state === 'ACKED';
  const needsAck = state === 'UNACK' || state === 'RTN_UNACK';

  const configs: Record<AlarmPriority, AlarmVisualConfig> = {
    CRITICAL: {
      color: '#ef4444',
      pulseSpeed: needsAck ? 4 : 0,
      icon: 'alert-octagon',
      size: 1.2,
      opacity: isActive ? 1 : 0.5,
    },
    HIGH: {
      color: '#f97316',
      pulseSpeed: needsAck ? 2.5 : 0,
      icon: 'alert-triangle',
      size: 1.0,
      opacity: isActive ? 1 : 0.5,
    },
    MEDIUM: {
      color: '#eab308',
      pulseSpeed: needsAck ? 1.5 : 0,
      icon: 'alert-circle',
      size: 0.9,
      opacity: isActive ? 1 : 0.5,
    },
    LOW: {
      color: '#3b82f6',
      pulseSpeed: needsAck ? 0.8 : 0,
      icon: 'info',
      size: 0.8,
      opacity: isActive ? 0.9 : 0.4,
    },
  };

  return configs[priority];
}
