/**
 * SCADA Tag Database for MillOS
 *
 * Complete SCADA definition covering all 4 production zones:
 * - Zone 1: Silos (raw material storage)
 * - Zone 2: Roller Mills (milling floor)
 * - Zone 3: Plansifters (sifting)
 * - Zone 4: Packers (packaging)
 * - Utility: Ambient and system-wide measurements
 * - Operations: Conserved material flow, dispatch and maintenance supply
 *
 * Naming Convention: AREA.TAG_TYPE.INSTANCE.ATTRIBUTE
 * - AREA: Equipment area (SILO_ALPHA, RM101, SIFTER_A, PACKER_1, AMBIENT, UTILITY)
 * - TAG_TYPE: Measurement type (TT=temp, LT=level, VT=vibration, ST=speed, etc.)
 * - INSTANCE: Sensor instance number (001, 002, etc.)
 * - ATTRIBUTE: PV=process value, SP=setpoint, CMD=command
 */

import { UTILITY_ASSET_DEFINITIONS } from '../constants/utilityAssets';
import { formatFixed, translate } from '../i18n';
import { tagDatabaseMessages as msg } from './tagDatabase.messages';
import { TagDefinition } from './types';

// Tag display names are getters, so a tag read after a language switch (the
// SCADA panel, a newly raised alarm) resolves in the current language. Tag ids,
// units and machine tokens stay fixed.

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
    get name() {
      return translate(msg, 'siloLevel', { silo: name });
    },
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
    get name() {
      return translate(msg, 'siloTemperature', { silo: name });
    },
    description: `Grain temperature in Silo ${name}`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: '°C',
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
    get name() {
      return translate(msg, 'siloMoisture', { silo: name });
    },
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
      // Stable per-silo baseline keeps benchmark captures and replay sessions
      // reproducible while the adapter still supplies live measurement noise.
      baseValue: [12.4, 13.1, 12.7, 13.6, 12.2][idx],
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
    get name() {
      return translate(msg, 'siloFeederVibration', { silo: name });
    },
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
// Zone 2: Roller Mills (4 mills x 6 tags = 24 tags)
// ============================================================================

const MILL_IDS = ['rm-101', 'rm-102', 'rm-103', 'rm-104'];
const MILL_NUMBERS = ['101', '102', '103', '104'];

const rollerMillTags: TagDefinition[] = MILL_NUMBERS.flatMap((num, idx) => [
  // Roll Speed
  {
    id: `RM${num}.ST001.PV`,
    get name() {
      return translate(msg, 'millRollSpeed', { mill: num });
    },
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
    get name() {
      return translate(msg, 'millBearingTemp', { mill: num });
    },
    description: `Roller Mill ${num} front bearing temperature`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: '°C',
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
    get name() {
      return translate(msg, 'millVibration', { mill: num });
    },
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
    get name() {
      return translate(msg, 'millMotorCurrent', { mill: num });
    },
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
    get name() {
      return translate(msg, 'millFeedRate', { mill: num });
    },
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
    get name() {
      return translate(msg, 'millSpeedSetpoint', { mill: num });
    },
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
    get name() {
      return translate(msg, 'sifterVibration', { sifter: name });
    },
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
    get name() {
      return translate(msg, 'sifterTemperature', { sifter: name });
    },
    description: `Plansifter ${name} housing temperature`,
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: '°C',
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
    get name() {
      return translate(msg, 'sifterMotorCurrent', { sifter: name });
    },
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
    get name() {
      return translate(msg, 'sifterSieveCondition', { sifter: name });
    },
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
    get name() {
      return translate(msg, 'packerBagCount', { packer: num });
    },
    description: `Packing Line ${num} bags produced in the active run window`,
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
    get name() {
      return translate(msg, 'packerBagWeight', { packer: num });
    },
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
    get name() {
      return translate(msg, 'packerSpeed', { packer: num });
    },
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
    get name() {
      return translate(msg, 'packerAirPressure', { packer: num });
    },
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
    get name() {
      return translate(msg, 'ambientTemperature');
    },
    description: 'Factory floor ambient temperature',
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: '°C',
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
    get name() {
      return translate(msg, 'ambientHumidity');
    },
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
    get name() {
      return translate(msg, 'outsideTemperature');
    },
    description: 'External ambient temperature',
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: '°C',
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
    get name() {
      return translate(msg, 'compressedAirPressure');
    },
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
    get name() {
      return translate(msg, 'totalPower');
    },
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
    get name() {
      return translate(msg, 'dustCollectorDp');
    },
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
    get name() {
      return translate(msg, 'coolingWaterTemp');
    },
    description: 'Cooling water supply temperature',
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: '°C',
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
    get name() {
      return translate(msg, 'coolingWaterFlow');
    },
    description: 'Cooling water flow rate',
    dataType: 'FLOAT32' as const,
    accessMode: 'READ' as const,
    engUnit: 'm³/h',
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
    get name() {
      return translate(msg, 'nitrogenPressure');
    },
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
    get name() {
      return translate(msg, 'totalThroughput');
    },
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

export interface UtilityAssetTagIds {
  level: string;
  temperature: string;
  pressure: string;
}

const utilityAssetArea = (assetId: string): string =>
  assetId
    .replace(/^utility-/, 'UTILITY_')
    .replaceAll('-', '_')
    .toUpperCase();

/** Stable SCADA identities for the instruments mounted on each visible vessel. */
export const getUtilityAssetTagIds = (assetId: string): UtilityAssetTagIds => {
  const area = utilityAssetArea(assetId);
  return {
    level: `${area}.LT001.PV`,
    temperature: `${area}.TT001.PV`,
    pressure: `${area}.PT001.PV`,
  };
};

export const UTILITY_ASSET_TAG_IDS: Readonly<Record<string, UtilityAssetTagIds>> =
  Object.fromEntries(
    UTILITY_ASSET_DEFINITIONS.map((asset) => [asset.id, getUtilityAssetTagIds(asset.id)])
  );

const utilityAssetTags: TagDefinition[] = UTILITY_ASSET_DEFINITIONS.flatMap((asset) => {
  const ids = UTILITY_ASSET_TAG_IDS[asset.id];
  const isPressurised = asset.kind === 'lpg_vessel';
  return [
    {
      id: ids.level,
      get name() {
        return translate(msg, 'assetLevel', { asset: asset.label });
      },
      description: `${asset.contents} level in ${asset.label}`,
      dataType: 'FLOAT32' as const,
      accessMode: 'READ' as const,
      engUnit: '%',
      engLow: 0,
      engHigh: 100,
      alarmLo: 20,
      alarmLoLo: 10,
      deadband: 0.5,
      machineId: asset.id,
      group: 'LEVEL' as const,
      simulation: {
        baseValue: asset.nominalLevelPercent,
        noiseAmplitude: 0,
        driftRate: 0,
      },
    },
    {
      id: ids.temperature,
      get name() {
        return translate(msg, 'assetTemperature', { asset: asset.label });
      },
      description: `${asset.contents} bulk temperature in ${asset.label}`,
      dataType: 'FLOAT32' as const,
      accessMode: 'READ' as const,
      engUnit: '°C',
      engLow: -40,
      engHigh: 80,
      alarmHi: isPressurised ? 40 : 38,
      alarmHiHi: isPressurised ? 50 : 48,
      deadband: 0.5,
      machineId: asset.id,
      group: 'TEMPERATURE' as const,
      simulation: {
        baseValue: asset.nominalTemperatureC,
        noiseAmplitude: 0,
        driftRate: 0,
      },
    },
    {
      id: ids.pressure,
      get name() {
        return translate(msg, 'assetPressure', { asset: asset.label });
      },
      description: `${asset.contents} vessel pressure in ${asset.label}`,
      dataType: 'FLOAT32' as const,
      accessMode: 'READ' as const,
      engUnit: 'bar',
      engLow: 0,
      engHigh: isPressurised ? 16 : 2,
      alarmHi: isPressurised ? 10 : 0.6,
      alarmHiHi: isPressurised ? 12 : 1,
      deadband: isPressurised ? 0.1 : 0.02,
      machineId: asset.id,
      group: 'PRESSURE' as const,
      simulation: {
        baseValue: asset.nominalPressureBar,
        noiseAmplitude: 0,
        driftRate: 0,
      },
    },
  ];
});

export interface VehicleTagIds {
  speed: string;
  steeringOrArticulation: string;
  phase: string;
  interlock: string;
}

/** Stable read-only telemetry identities for the autonomous vehicle fleet. */
export const VEHICLE_TAG_IDS = {
  'forklift-1': {
    speed: 'FLT01.ST001.PV',
    steeringOrArticulation: 'FLT01.PT001.PV',
    phase: 'FLT01.ZS001.PV',
    interlock: 'FLT01.ZS002.PV',
  },
  'forklift-2': {
    speed: 'FLT02.ST001.PV',
    steeringOrArticulation: 'FLT02.PT001.PV',
    phase: 'FLT02.ZS001.PV',
    interlock: 'FLT02.ZS002.PV',
  },
  'shipping-truck': {
    speed: 'TRUCK_SHIPPING.ST001.PV',
    steeringOrArticulation: 'TRUCK_SHIPPING.PT001.PV',
    phase: 'TRUCK_SHIPPING.ZS001.PV',
    interlock: 'TRUCK_SHIPPING.ZS002.PV',
  },
  'receiving-truck': {
    speed: 'TRUCK_RECEIVING.ST001.PV',
    steeringOrArticulation: 'TRUCK_RECEIVING.PT001.PV',
    phase: 'TRUCK_RECEIVING.ZS001.PV',
    interlock: 'TRUCK_RECEIVING.ZS002.PV',
  },
} as const satisfies Readonly<Record<string, VehicleTagIds>>;

function vehicleLabel(vehicleId: string, fallback: string): string {
  if (vehicleId === 'shipping-truck') return translate(msg, 'ofShippingTruck');
  if (vehicleId === 'receiving-truck') return translate(msg, 'ofReceivingTruck');
  const forklift = /^forklift-(\d+)$/.exec(vehicleId);
  if (forklift) {
    return translate(msg, 'ofForklift', { number: formatFixed(Number(forklift[1]), 0) });
  }
  return fallback;
}

const vehicleTags: TagDefinition[] = Object.entries(VEHICLE_TAG_IDS).flatMap(([vehicleId, ids]) => {
  const isTruck = vehicleId.endsWith('-truck');
  const label = vehicleId
    .split('-')
    .map((part) => `${part[0].toUpperCase()}${part.slice(1)}`)
    .join(' ');
  const vehicleName = (): string => vehicleLabel(vehicleId, label);
  return [
    {
      id: ids.speed,
      get name() {
        return translate(msg, 'vehicleGroundSpeed', { vehicle: vehicleName() });
      },
      description: `Distance-derived ground speed for autonomous ${label}`,
      dataType: 'FLOAT32' as const,
      accessMode: 'READ' as const,
      engUnit: isTruck ? 'km/h' : 'm/s',
      engLow: 0,
      engHigh: isTruck ? 80 : 4,
      deadband: 0.05,
      machineId: vehicleId,
      group: 'SPEED' as const,
      simulation: { baseValue: 0, noiseAmplitude: 0, driftRate: 0 },
    },
    {
      id: ids.steeringOrArticulation,
      get name() {
        return translate(msg, isTruck ? 'vehicleArticulation' : 'vehicleSteering', {
          vehicle: vehicleName(),
        });
      },
      description: isTruck
        ? `Tractor to trailer articulation angle for autonomous ${label}`
        : `Rear axle steering angle for autonomous ${label}`,
      dataType: 'FLOAT32' as const,
      accessMode: 'READ' as const,
      engUnit: 'deg',
      engLow: isTruck ? -40 : -35,
      engHigh: isTruck ? 40 : 35,
      // Controller-bounded kinematic state, not a process variable: a normal
      // docking peaks near 0.62 rad (36 deg) on the 14 m yard turns, inside
      // the 0.7 rad (40.1 deg) truckController coupling limit.
      // Working if no steering/articulation tag alarms inside that limit.
      alarmLo: undefined,
      alarmHi: undefined,
      alarmLoLo: undefined,
      alarmHiHi: undefined,
      deadband: 0.25,
      machineId: vehicleId,
      group: 'POSITION' as const,
      simulation: { baseValue: 0, noiseAmplitude: 0, driftRate: 0 },
    },
    {
      id: ids.phase,
      get name() {
        return translate(msg, 'vehicleMotionPhase', { vehicle: vehicleName() });
      },
      description: `Encoded deterministic route or service phase for autonomous ${label}`,
      dataType: 'INT16' as const,
      accessMode: 'READ' as const,
      engUnit: 'state',
      engLow: 0,
      // Highest phase code in store.ts buildOperationalTelemetry ('departure-ready').
      // Working if unchocking (33) and departure-ready (34) are not clamped to 32.
      engHigh: 34,
      deadband: 0,
      machineId: vehicleId,
      group: 'STATUS' as const,
      simulation: { baseValue: 0, noiseAmplitude: 0, driftRate: 0 },
    },
    {
      id: ids.interlock,
      get name() {
        return translate(msg, isTruck ? 'vehicleTransferInterlock' : 'vehicleStopReason', {
          vehicle: vehicleName(),
        });
      },
      description: isTruck
        ? `Dock transfer-ready permissive for autonomous ${label}`
        : `Encoded safety or logistics stop reason for autonomous ${label}`,
      dataType: isTruck ? ('BOOL' as const) : ('INT16' as const),
      accessMode: 'READ' as const,
      engUnit: isTruck ? 'ready' : 'state',
      engLow: 0,
      engHigh: isTruck ? 1 : 16,
      deadband: 0,
      machineId: vehicleId,
      group: 'STATUS' as const,
      simulation: { baseValue: 0, noiseAmplitude: 0, driftRate: 0 },
    },
  ];
});

/** Stable IDs used by the material-flow bridge and control workspace. */
export const OPERATION_TAG_IDS = {
  rawInventory: 'OPERATIONS.WT001.PV',
  inProcess: 'OPERATIONS.WT002.PV',
  finishedGoods: 'OPERATIONS.WT003.PV',
  packerFlow: 'OPERATIONS.FT001.PV',
  materialBalanceError: 'OPERATIONS.WT004.PV',
  lastReceiving: 'OPERATIONS.WT005.PV',
  lastShipping: 'OPERATIONS.WT006.PV',
  partsStock: 'MAINT.QT001.PV',
  shippingReleased: 'QUALITY.ZS001.PV',
  activeQualityHolds: 'QUALITY.QT001.PV',
  recalledBatches: 'QUALITY.QT002.PV',
  openWorkOrders: 'MAINT.QT002.PV',
  maintenanceDowntime: 'MAINT.TT001.PV',
} as const;

const operationalTags: TagDefinition[] = [
  {
    id: OPERATION_TAG_IDS.rawInventory,
    get name() {
      return translate(msg, 'rawGrainInventory');
    },
    description: 'Conserved grain held in the five intake silos',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 't',
    engLow: 0,
    engHigh: 250,
    alarmLo: 25,
    alarmLoLo: 10,
    deadband: 1,
    machineId: 'operations',
    group: 'WEIGHT',
    simulation: { baseValue: 100, noiseAmplitude: 0, driftRate: 0 },
  },
  {
    id: OPERATION_TAG_IDS.inProcess,
    get name() {
      return translate(msg, 'materialInProcess');
    },
    description: 'Material in machine buffers and conveyor transit',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 't',
    engLow: 0,
    engHigh: 60,
    machineId: 'operations',
    group: 'WEIGHT',
    simulation: { baseValue: 5, noiseAmplitude: 0, driftRate: 0 },
  },
  {
    id: OPERATION_TAG_IDS.finishedGoods,
    get name() {
      return translate(msg, 'finishedGoodsInventory');
    },
    description: 'Packaged flour and semolina awaiting dispatch',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 't',
    engLow: 0,
    engHigh: 15,
    machineId: 'operations',
    group: 'WEIGHT',
    simulation: { baseValue: 0.6, noiseAmplitude: 0, driftRate: 0 },
  },
  {
    id: OPERATION_TAG_IDS.packerFlow,
    get name() {
      return translate(msg, 'finalPackingFlow');
    },
    description: 'Causal final-stage production throughput',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 't/h',
    engLow: 0,
    engHigh: 400,
    machineId: 'operations',
    group: 'FLOW',
    simulation: { baseValue: 270, noiseAmplitude: 0, driftRate: 0 },
  },
  {
    id: OPERATION_TAG_IDS.materialBalanceError,
    get name() {
      return translate(msg, 'materialBalanceError');
    },
    description: 'Difference between expected and accounted conserved material',
    dataType: 'FLOAT64',
    accessMode: 'READ',
    engUnit: 'kg',
    engLow: -100,
    engHigh: 100,
    alarmHi: 5,
    alarmHiHi: 20,
    alarmLo: -5,
    alarmLoLo: -20,
    deadband: 0.1,
    machineId: 'operations',
    group: 'WEIGHT',
    simulation: { baseValue: 0, noiseAmplitude: 0, driftRate: 0 },
  },
  {
    id: OPERATION_TAG_IDS.lastReceiving,
    get name() {
      return translate(msg, 'lastReceivingManifest');
    },
    description: 'Actual grain mass unloaded by the latest receiving truck',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 't',
    engLow: 0,
    engHigh: 20,
    machineId: 'operations',
    group: 'WEIGHT',
    simulation: { baseValue: 0, noiseAmplitude: 0, driftRate: 0 },
  },
  {
    id: OPERATION_TAG_IDS.lastShipping,
    get name() {
      return translate(msg, 'lastShippingManifest');
    },
    description: 'Actual finished-goods mass loaded by the latest shipping truck',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 't',
    engLow: 0,
    engHigh: 10,
    machineId: 'operations',
    group: 'WEIGHT',
    simulation: { baseValue: 0, noiseAmplitude: 0, driftRate: 0 },
  },
  {
    id: OPERATION_TAG_IDS.partsStock,
    get name() {
      return translate(msg, 'maintenancePartsStock');
    },
    description: 'Total on-hand bearings, belts, filters, motors and sensors',
    dataType: 'INT16',
    accessMode: 'READ',
    engUnit: 'items',
    engLow: 0,
    engHigh: 100,
    alarmLo: 10,
    alarmLoLo: 5,
    deadband: 1,
    machineId: 'maintenance',
    group: 'STATUS',
    simulation: { baseValue: 50, noiseAmplitude: 0, driftRate: 0 },
  },
  {
    id: OPERATION_TAG_IDS.shippingReleased,
    get name() {
      return translate(msg, 'shippingQualityRelease');
    },
    description: 'QC interlock: 1 permits dispatch, 0 holds the shipping truck',
    dataType: 'BOOL',
    accessMode: 'READ',
    engUnit: 'released',
    engLow: 0,
    engHigh: 1,
    alarmLo: 0.5,
    deadband: 0,
    machineId: 'quality',
    group: 'STATUS',
    simulation: { baseValue: 1, noiseAmplitude: 0, driftRate: 0 },
  },
  {
    id: OPERATION_TAG_IDS.activeQualityHolds,
    get name() {
      return translate(msg, 'activeQualityHolds');
    },
    description: 'Available production batches isolated from dispatch pending disposition',
    dataType: 'INT16',
    accessMode: 'READ',
    engUnit: 'batches',
    engLow: 0,
    engHigh: 100,
    alarmHi: 1,
    deadband: 0.5,
    machineId: 'quality',
    group: 'STATUS',
    simulation: { baseValue: 0, noiseAmplitude: 0, driftRate: 0 },
  },
  {
    id: OPERATION_TAG_IDS.recalledBatches,
    get name() {
      return translate(msg, 'recalledProductBatches');
    },
    description:
      'Recalled production batches whose recall is unresolved: stock held, or recalled lot material still in the plant',
    dataType: 'INT16',
    accessMode: 'READ',
    engUnit: 'batches',
    engLow: 0,
    engHigh: 100,
    alarmHi: 1,
    deadband: 0.5,
    machineId: 'quality',
    group: 'STATUS',
    simulation: { baseValue: 0, noiseAmplitude: 0, driftRate: 0 },
  },
  {
    id: OPERATION_TAG_IDS.openWorkOrders,
    get name() {
      return translate(msg, 'openMaintenanceWorkOrders');
    },
    description: 'Causal repair work orders not yet returned to service',
    dataType: 'INT16',
    accessMode: 'READ',
    engUnit: 'orders',
    engLow: 0,
    engHigh: 100,
    alarmHi: 1,
    deadband: 0.5,
    machineId: 'maintenance',
    group: 'STATUS',
    simulation: { baseValue: 0, noiseAmplitude: 0, driftRate: 0 },
  },
  {
    id: OPERATION_TAG_IDS.maintenanceDowntime,
    get name() {
      return translate(msg, 'maintenanceDowntime');
    },
    description: 'Accumulated downtime across currently open maintenance work orders',
    dataType: 'FLOAT32',
    accessMode: 'READ',
    engUnit: 's',
    engLow: 0,
    engHigh: 86400,
    alarmHi: 600,
    alarmHiHi: 1800,
    deadband: 1,
    machineId: 'maintenance',
    group: 'STATUS',
    simulation: { baseValue: 0, noiseAmplitude: 0, driftRate: 0 },
  },
];

// ============================================================================
// Complete Tag Database Export
// ============================================================================

/** All process, utility, and operational SCADA tags for MillOS. */
export const MILL_TAGS: TagDefinition[] = [
  ...siloTags, // 20 tags
  ...rollerMillTags, // 24 tags (4 mills x 6)
  ...plansifterTags, // 12 tags
  ...packerTags, // 12 tags
  ...utilityTags, // 10 tags
  ...utilityAssetTags, // 15 tags (5 visible vessels x 3 instruments)
  ...vehicleTags, // 16 tags (4 autonomous vehicles x 4)
  ...operationalTags, // 13 tags
];

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

// Tag database loaded: 122 tags total
// Zone 1 (Silos): 20 tags, Zone 2 (Mills): 24 tags, Zone 3 (Sifters): 12 tags
// Zone 4 (Packers): 12 tags, Utility: 10 tags, Visible utility assets: 15 tags,
// Autonomous vehicles: 16 tags, Operations: 13 tags
