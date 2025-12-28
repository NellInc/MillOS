/**
 * SCADA Tag Database for MillOS
 *
 * Complete definition of 90+ SCADA tags covering all 4 production zones:
 * - Zone 1: Silos (raw material storage)
 * - Zone 2: Roller Mills (milling floor)
 * - Zone 3: Plansifters (sifting)
 * - Zone 4: Packers (packaging)
 * - Utility: Ambient and system-wide measurements
 *
 * Naming Convention: AREA.TAG_TYPE.INSTANCE.ATTRIBUTE
 * - AREA: Equipment area (SILO_ALPHA, RM101, SIFTER_A, PACKER_1, AMBIENT, UTILITY)
 * - TAG_TYPE: Measurement type (TT=temp, LT=level, VT=vibration, ST=speed, etc.)
 * - INSTANCE: Sensor instance number (001, 002, etc.)
 * - ATTRIBUTE: PV=process value, SP=setpoint, CMD=command
 */

import { TagDefinition } from './types';

// ============================================================================
// Zone 1: Silos (5 silos x 4 tags = 20 tags)
// ============================================================================

const SILO_NAMES = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'];
const SILO_IDS = ['silo-0', 'silo-1', 'silo-2', 'silo-3', 'silo-4'];
const GRAIN_TYPES = ['Wheat', 'Corn', 'Barley', 'Oats', 'Rye'];

const siloTags: TagDefinition[] = SILO_NAMES.flatMap((name, idx) => [
  // Level Transmitter
  {
    id: `SILO_${name}.LT001.PV`,
    name: `Silo ${name} Level`,
    description: `Grain level in Silo ${name} (${GRAIN_TYPES[idx]})`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: '%',
    engLow: 0,
    engHigh: 100,
    alarmLo: 10,
    alarmLoLo: 5,
    alarmHi: 95,
    alarmHiHi: 98,
    deadband: 2,
    machineId: SILO_IDS[idx],
    group: 'LEVEL' as const,
    simulation: {
      baseValue: 50 + Math.sin(idx * 1.5) * 30,
      noiseAmplitude: 0.3,
      driftRate: -0.005, // Slowly drains
      loadFactor: false,
      statusDependent: false,
    },
  },
  // Temperature Transmitter
  {
    id: `SILO_${name}.TT001.PV`,
    name: `Silo ${name} Temperature`,
    description: `Grain temperature in Silo ${name}`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'C',
    engLow: -10,
    engHigh: 60,
    alarmHi: 35,
    alarmHiHi: 40,
    deadband: 1,
    machineId: SILO_IDS[idx],
    group: 'TEMPERATURE' as const,
    simulation: {
      baseValue: 20 + idx * 0.3, // Lowered from 22 + idx*0.5 to give more headroom
      noiseAmplitude: 0.15, // Reduced noise
      driftRate: 0,
      correlatedWith: ['AMBIENT.TT001.PV'],
      loadFactor: false,
      statusDependent: false,
    },
  },
  // Moisture Transmitter
  {
    id: `SILO_${name}.MT001.PV`,
    name: `Silo ${name} Moisture`,
    description: `Grain moisture content in Silo ${name}`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: '%',
    engLow: 0,
    engHigh: 25,
    alarmHi: 14,
    alarmHiHi: 16,
    deadband: 0.5,
    machineId: SILO_IDS[idx],
    group: 'HUMIDITY' as const,
    simulation: {
      baseValue: 12 + Math.random() * 2,
      noiseAmplitude: 0.15,
      driftRate: 0.0005,
      correlatedWith: ['AMBIENT.HT001.PV'],
      loadFactor: false,
      statusDependent: false,
    },
  },
  // Feeder Vibration
  {
    id: `SILO_${name}.VT001.PV`,
    name: `Silo ${name} Feeder Vibration`,
    description: `Discharge feeder vibration for Silo ${name}`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'mm/s',
    engLow: 0,
    engHigh: 10,
    alarmHi: 4,
    alarmHiHi: 6,
    deadband: 0.3,
    machineId: SILO_IDS[idx],
    group: 'VIBRATION' as const,
    simulation: {
      baseValue: 1.2, // Lowered from 1.5
      noiseAmplitude: 0.2, // Reduced noise from 0.4
      driftRate: 0,
      loadFactor: true,
      statusDependent: false,
    },
  },
]);

// ============================================================================
// Zone 2: Roller Mills (6 mills x 6 tags = 36 tags)
// ============================================================================

const MILL_IDS = ['rm-101', 'rm-102', 'rm-103', 'rm-104', 'rm-105', 'rm-106'];
const MILL_NUMBERS = ['101', '102', '103', '104', '105', '106'];

const rollerMillTags: TagDefinition[] = MILL_NUMBERS.flatMap((num, idx) => [
  // Roll Speed
  {
    id: `RM${num}.ST001.PV`,
    name: `RM-${num} Roll Speed`,
    description: `Roller Mill ${num} roller speed`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'RPM',
    engLow: 0,
    engHigh: 2000,
    alarmLoLo: 400,
    alarmLo: 600,
    alarmHi: 1600,
    alarmHiHi: 1800,
    deadband: 20,
    machineId: MILL_IDS[idx],
    group: 'SPEED' as const,
    simulation: {
      baseValue: 1200 + idx * 50,
      noiseAmplitude: 5,
      driftRate: 0,
      loadFactor: false,
      statusDependent: true,
    },
  },
  // Bearing Temperature
  {
    id: `RM${num}.TT001.PV`,
    name: `RM-${num} Bearing Temp`,
    description: `Roller Mill ${num} front bearing temperature`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'C',
    engLow: 0,
    engHigh: 120,
    alarmHi: 65,
    alarmHiHi: 75,
    deadband: 2,
    machineId: MILL_IDS[idx],
    group: 'TEMPERATURE' as const,
    simulation: {
      baseValue: 38 + idx * 2, // Lowered from 45 to give headroom
      noiseAmplitude: 0.5, // Reduced noise
      driftRate: 0, // Removed drift - was causing runaway values
      loadFactor: true,
      statusDependent: true,
    },
  },
  // Vibration
  {
    id: `RM${num}.VT001.PV`,
    name: `RM-${num} Vibration`,
    description: `Roller Mill ${num} vibration velocity`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'mm/s',
    engLow: 0,
    engHigh: 10,
    alarmHi: 3.5,
    alarmHiHi: 4.5,
    deadband: 0.2,
    machineId: MILL_IDS[idx],
    group: 'VIBRATION' as const,
    simulation: {
      baseValue: 1.5 + idx * 0.1, // Lowered and made deterministic
      noiseAmplitude: 0.15, // Reduced noise
      driftRate: 0, // Removed drift
      loadFactor: true,
      statusDependent: true,
      correlatedWith: [`RM${num}.ST001.PV`],
    },
  },
  // Motor Current
  {
    id: `RM${num}.IT001.PV`,
    name: `RM-${num} Motor Current`,
    description: `Roller Mill ${num} motor current draw`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'A',
    engLow: 0,
    engHigh: 150,
    alarmHi: 120,
    alarmHiHi: 135,
    deadband: 5,
    machineId: MILL_IDS[idx],
    group: 'CURRENT' as const,
    simulation: {
      baseValue: 70 + idx * 2, // Lowered from 85 to give headroom
      noiseAmplitude: 2, // Reduced noise
      driftRate: 0,
      loadFactor: true,
      statusDependent: true,
    },
  },
  // Feed Rate
  {
    id: `RM${num}.FT001.PV`,
    name: `RM-${num} Feed Rate`,
    description: `Roller Mill ${num} grain feed rate`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 't/h',
    engLow: 0,
    engHigh: 50,
    alarmLo: 10,
    alarmLoLo: 5,
    machineId: MILL_IDS[idx],
    group: 'FLOW' as const,
    simulation: {
      baseValue: 25 + idx * 2,
      noiseAmplitude: 1.5,
      driftRate: 0,
      loadFactor: true,
      statusDependent: true,
    },
  },
  // Speed Setpoint (writable)
  {
    id: `RM${num}.ST001.SP`,
    name: `RM-${num} Speed Setpoint`,
    description: `Roller Mill ${num} speed setpoint`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ_WRITE' as const,
    engUnit: 'RPM',
    engLow: 0,
    engHigh: 2000,
    machineId: MILL_IDS[idx],
    group: 'SETPOINT' as const,
    simulation: {
      baseValue: 1200 + idx * 50,
      noiseAmplitude: 0,
      driftRate: 0,
    },
  },
]);

// ============================================================================
// Zone 3: Plansifters (3 sifters x 4 tags = 12 tags)
// ============================================================================

const SIFTER_NAMES = ['A', 'B', 'C'];
const SIFTER_IDS = ['sifter-a', 'sifter-b', 'sifter-c'];

const plansifterTags: TagDefinition[] = SIFTER_NAMES.flatMap((name, idx) => [
  // Oscillation Amplitude
  {
    id: `SIFTER_${name}.VT001.PV`,
    name: `Sifter ${name} Vibration`,
    description: `Plansifter ${name} oscillation amplitude`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'mm',
    engLow: 0,
    engHigh: 15,
    alarmLo: 4,
    alarmLoLo: 3,
    alarmHi: 9,
    alarmHiHi: 10,
    deadband: 0.3,
    machineId: SIFTER_IDS[idx],
    group: 'VIBRATION' as const,
    simulation: {
      baseValue: 6.5 + idx * 0.3,
      noiseAmplitude: 0.4,
      driftRate: 0,
      statusDependent: true,
    },
  },
  // Temperature
  {
    id: `SIFTER_${name}.TT001.PV`,
    name: `Sifter ${name} Temperature`,
    description: `Plansifter ${name} housing temperature`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'C',
    engLow: 0,
    engHigh: 60,
    alarmHi: 40,
    alarmHiHi: 50,
    deadband: 1,
    machineId: SIFTER_IDS[idx],
    group: 'TEMPERATURE' as const,
    simulation: {
      baseValue: 26 + idx, // Lowered from 30 to give headroom
      noiseAmplitude: 0.3, // Reduced noise
      driftRate: 0, // Removed drift
      loadFactor: true,
      statusDependent: true,
    },
  },
  // Motor Current
  {
    id: `SIFTER_${name}.IT001.PV`,
    name: `Sifter ${name} Motor Current`,
    description: `Plansifter ${name} motor current`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'A',
    engLow: 0,
    engHigh: 80,
    alarmHi: 60,
    alarmHiHi: 70,
    deadband: 2,
    machineId: SIFTER_IDS[idx],
    group: 'CURRENT' as const,
    simulation: {
      baseValue: 32 + idx * 2, // Lowered from 35 to give headroom
      noiseAmplitude: 1.0, // Reduced noise
      driftRate: 0,
      loadFactor: true,
      statusDependent: true,
    },
  },
  // Sieve Condition (0-100% efficiency)
  {
    id: `SIFTER_${name}.QT001.PV`,
    name: `Sifter ${name} Sieve Condition`,
    description: `Plansifter ${name} sieve efficiency indicator`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: '%',
    engLow: 0,
    engHigh: 100,
    alarmLo: 70,
    alarmLoLo: 50,
    deadband: 2,
    machineId: SIFTER_IDS[idx],
    group: 'STATUS' as const,
    simulation: {
      baseValue: 95,
      noiseAmplitude: 1,
      driftRate: -0.001, // Sieves degrade over time
      statusDependent: true,
    },
  },
]);

// ============================================================================
// Zone 4: Packers (3 packers x 4 tags = 12 tags)
// ============================================================================

const PACKER_NUMBERS = ['1', '2', '3'];
const PACKER_IDS = ['packer-0', 'packer-1', 'packer-2'];

const packerTags: TagDefinition[] = PACKER_NUMBERS.flatMap((num, idx) => [
  // Bag Counter
  {
    id: `PACKER_${num}.CT001.PV`,
    name: `Packer ${num} Bag Count`,
    description: `Packing Line ${num} bags produced this shift`,
    dataType: 'INT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'bags',
    engLow: 0,
    engHigh: 10000,
    machineId: PACKER_IDS[idx],
    group: 'FLOW' as const,
    simulation: {
      baseValue: 0,
      noiseAmplitude: 0,
      driftRate: 0.5, // ~1800 bags/hour when running
      statusDependent: true,
    },
  },
  // Bag Weight
  {
    id: `PACKER_${num}.WT001.PV`,
    name: `Packer ${num} Bag Weight`,
    description: `Packing Line ${num} current bag weight`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'kg',
    engLow: 0,
    engHigh: 100,
    alarmLo: 24.5,
    alarmLoLo: 24.0,
    alarmHi: 25.5,
    alarmHiHi: 26.0,
    deadband: 0.1,
    machineId: PACKER_IDS[idx],
    group: 'WEIGHT' as const,
    simulation: {
      baseValue: 25.0,
      noiseAmplitude: 0.08,
      driftRate: 0,
      statusDependent: true,
    },
  },
  // Packing Speed
  {
    id: `PACKER_${num}.ST001.PV`,
    name: `Packer ${num} Speed`,
    description: `Packing Line ${num} bags per minute`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'bags/min',
    engLow: 0,
    engHigh: 60,
    alarmLo: 15,
    alarmLoLo: 10,
    machineId: PACKER_IDS[idx],
    group: 'SPEED' as const,
    simulation: {
      baseValue: 30 + idx * 2,
      noiseAmplitude: 2,
      driftRate: 0,
      loadFactor: true,
      statusDependent: true,
    },
  },
  // Pneumatic Pressure
  {
    id: `PACKER_${num}.PT001.PV`,
    name: `Packer ${num} Air Pressure`,
    description: `Packing Line ${num} pneumatic pressure`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'bar',
    engLow: 0,
    engHigh: 10,
    alarmLo: 5.5,
    alarmLoLo: 5.0,
    deadband: 0.2,
    machineId: PACKER_IDS[idx],
    group: 'PRESSURE' as const,
    simulation: {
      baseValue: 6.2,
      noiseAmplitude: 0.1,
      driftRate: 0,
      correlatedWith: ['UTILITY.PT001.PV'],
    },
  },
]);

// ============================================================================
// Utility & Ambient (10 tags)
// ============================================================================

const utilityTags: TagDefinition[] = [
  // Ambient Temperature
  {
    id: 'AMBIENT.TT001.PV',
    name: 'Ambient Temperature',
    description: 'Factory floor ambient temperature',
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'C',
    engLow: -20,
    engHigh: 50,
    alarmHi: 35,
    alarmHiHi: 40,
    alarmLo: 5,
    alarmLoLo: 0,
    deadband: 1,
    machineId: 'ambient',
    group: 'TEMPERATURE' as const,
    simulation: {
      baseValue: 24,
      noiseAmplitude: 0.4,
      driftRate: 0,
    },
  },
  // Ambient Humidity
  {
    id: 'AMBIENT.HT001.PV',
    name: 'Ambient Humidity',
    description: 'Factory floor relative humidity',
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: '%',
    engLow: 0,
    engHigh: 100,
    alarmHi: 70,
    alarmHiHi: 80,
    alarmLo: 20,
    alarmLoLo: 15,
    deadband: 3,
    machineId: 'ambient',
    group: 'HUMIDITY' as const,
    simulation: {
      baseValue: 45,
      noiseAmplitude: 2,
      driftRate: 0,
    },
  },
  // Outside Temperature
  {
    id: 'AMBIENT.TT002.PV',
    name: 'Outside Temperature',
    description: 'External ambient temperature',
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'C',
    engLow: -40,
    engHigh: 50,
    machineId: 'ambient',
    group: 'TEMPERATURE' as const,
    simulation: {
      baseValue: 20,
      noiseAmplitude: 0.5,
      driftRate: 0,
    },
  },
  // Compressed Air Header
  {
    id: 'UTILITY.PT001.PV',
    name: 'Compressed Air Pressure',
    description: 'Main compressed air header pressure',
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'bar',
    engLow: 0,
    engHigh: 12,
    alarmLo: 6.0,
    alarmLoLo: 5.5,
    alarmHi: 8.5,
    alarmHiHi: 9.0,
    deadband: 0.2,
    machineId: 'utility',
    group: 'PRESSURE' as const,
    simulation: {
      baseValue: 7.0,
      noiseAmplitude: 0.15,
      driftRate: 0,
    },
  },
  // Total Power
  {
    id: 'UTILITY.PT002.PV',
    name: 'Total Power',
    description: 'Total plant power consumption',
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'kW',
    engLow: 0,
    engHigh: 2000,
    alarmHi: 1500,
    alarmHiHi: 1800,
    machineId: 'utility',
    group: 'POWER' as const,
    simulation: {
      baseValue: 800, // Increased from 450 for realism but well below alarm
      noiseAmplitude: 10, // Reduced noise
      driftRate: 0,
      loadFactor: true,
    },
  },
  // Dust Collector Differential Pressure
  {
    id: 'UTILITY.DP001.PV',
    name: 'Dust Collector DP',
    description: 'Dust collector differential pressure',
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'mbar',
    engLow: 0,
    engHigh: 100,
    alarmHi: 60,
    alarmHiHi: 80,
    deadband: 2,
    machineId: 'utility',
    group: 'PRESSURE' as const,
    simulation: {
      baseValue: 25,
      noiseAmplitude: 3,
      driftRate: 0.002, // Increases as filter loads
    },
  },
  // Cooling Water Temperature
  {
    id: 'UTILITY.TT001.PV',
    name: 'Cooling Water Temp',
    description: 'Cooling water supply temperature',
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'C',
    engLow: 0,
    engHigh: 50,
    alarmHi: 35,
    alarmHiHi: 40,
    deadband: 1,
    machineId: 'utility',
    group: 'TEMPERATURE' as const,
    simulation: {
      baseValue: 20,
      noiseAmplitude: 0.5,
      driftRate: 0,
    },
  },
  // Cooling Water Flow
  {
    id: 'UTILITY.FT001.PV',
    name: 'Cooling Water Flow',
    description: 'Cooling water flow rate',
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'm3/h',
    engLow: 0,
    engHigh: 100,
    alarmLo: 30,
    alarmLoLo: 20,
    machineId: 'utility',
    group: 'FLOW' as const,
    simulation: {
      baseValue: 50,
      noiseAmplitude: 2,
      driftRate: 0,
    },
  },
  // Nitrogen Pressure (for product quality preservation)
  {
    id: 'UTILITY.PT003.PV',
    name: 'Nitrogen Pressure',
    description: 'Nitrogen supply pressure for packaging',
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'bar',
    engLow: 0,
    engHigh: 10,
    alarmLo: 4.0,
    alarmLoLo: 3.5,
    machineId: 'utility',
    group: 'PRESSURE' as const,
    simulation: {
      baseValue: 5.5,
      noiseAmplitude: 0.1,
      driftRate: 0,
    },
  },
  // Total Throughput (calculated from all mills)
  {
    id: 'UTILITY.FT002.PV',
    name: 'Total Throughput',
    description: 'Combined throughput from all roller mills',
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 't/h',
    engLow: 0,
    engHigh: 300,
    alarmLo: 100,
    alarmLoLo: 50,
    machineId: 'utility',
    group: 'FLOW' as const,
    simulation: {
      baseValue: 150,
      noiseAmplitude: 10,
      driftRate: 0,
      loadFactor: true,
    },
  },
];

// ============================================================================
// Complete Tag Database Export
// ============================================================================

/** All SCADA tags for MillOS (90+ tags) */
export const MILL_TAGS: TagDefinition[] = [
  ...siloTags, // 20 tags
  ...rollerMillTags, // 36 tags
  ...plansifterTags, // 12 tags
  ...packerTags, // 12 tags
  ...utilityTags, // 10 tags
]; // Total: 90 tags

/** Get tags by machine ID */
export function getTagsByMachine(machineId: string): TagDefinition[] {
  return MILL_TAGS.filter((t) => t.machineId === machineId);
}

/** Get tags by functional group */
export function getTagsByGroup(group: TagDefinition['group']): TagDefinition[] {
  return MILL_TAGS.filter((t) => t.group === group);
}

/** Get a specific tag by ID */
export function getTagById(tagId: string): TagDefinition | undefined {
  return MILL_TAGS.find((t) => t.id === tagId);
}

/** Get all writable tags (setpoints and commands) */
export function getWritableTags(): TagDefinition[] {
  return MILL_TAGS.filter((t) => t.accessMode !== 'READ');
}

/** Get all tags with alarm thresholds */
export function getTagsWithAlarms(): TagDefinition[] {
  return MILL_TAGS.filter(
    (t) =>
      t.alarmHiHi !== undefined ||
      t.alarmHi !== undefined ||
      t.alarmLo !== undefined ||
      t.alarmLoLo !== undefined
  );
}

// Tag database loaded: 90 tags total
// Zone 1 (Silos): 20 tags, Zone 2 (Mills): 36 tags, Zone 3 (Sifters): 12 tags
// Zone 4 (Packers): 12 tags, Utility: 10 tags
