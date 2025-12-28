/**
 * Energy Calculations Utility
 *
 * Shared energy consumption models for the factory simulation.
 * Used by ProductionMetrics, EnergyDashboard, and AI grounding.
 */

import { MachineType, MachineData } from '../types';

/**
 * Energy consumption by machine type (kWh)
 * Running = full operation, Idle = standby power
 */
export const MACHINE_ENERGY_CONSUMPTION: Record<MachineType, { running: number; idle: number }> = {
  [MachineType.SILO]: { running: 2, idle: 0.5 },
  [MachineType.ROLLER_MILL]: { running: 45, idle: 2 },
  [MachineType.PLANSIFTER]: { running: 25, idle: 1.5 },
  [MachineType.PACKER]: { running: 15, idle: 1 },
  [MachineType.CONTROL_ROOM]: { running: 5, idle: 5 },
};

/**
 * Machine type display names for UI
 */
export const MACHINE_TYPE_LABELS: Record<MachineType, string> = {
  [MachineType.SILO]: 'Silo',
  [MachineType.ROLLER_MILL]: 'Roller Mill',
  [MachineType.PLANSIFTER]: 'Plansifter',
  [MachineType.PACKER]: 'Packer',
  [MachineType.CONTROL_ROOM]: 'Control Room',
};

export interface MachineEnergyBreakdown {
  baseEnergy: number;
  loadFactor: number;
  warningPenalty: number;
  maintenancePenalty: number;
  finalEnergy: number;
}

/**
 * Calculate energy for a single machine based on its current state.
 * Includes load factor, warning status, and maintenance penalties.
 */
export function getMachineEnergy(machine: MachineData): number {
  return getMachineEnergyDetailed(machine).finalEnergy;
}

/**
 * Get detailed energy breakdown for a machine including all modifiers.
 */
export function getMachineEnergyDetailed(machine: MachineData): MachineEnergyBreakdown {
  const consumption = MACHINE_ENERGY_CONSUMPTION[machine.type] || { running: 20, idle: 1 };

  // Maintenance penalty calculation
  // 0 or negative = overdue, uses 25% more energy
  // 0-24 hours = soon due, uses 5-25% more energy (linear)
  // >24 hours = well maintained, normal energy
  let maintenancePenalty = 1.0;
  if (machine.maintenanceCountdown !== undefined) {
    if (machine.maintenanceCountdown <= 0) {
      maintenancePenalty = 1.25; // 25% penalty when overdue
    } else if (machine.maintenanceCountdown < 24) {
      // Linear interpolation from 5% to 25% penalty as maintenance becomes due
      maintenancePenalty = 1.05 + (1 - machine.maintenanceCountdown / 24) * 0.2;
    }
  }

  let baseEnergy: number;
  let loadFactor = 1.0;
  let warningPenalty = 1.0;

  switch (machine.status) {
    case 'running':
      // Running machines factor in load - 70-100% based on load
      loadFactor = 0.7 + (machine.metrics.load / 100) * 0.3;
      baseEnergy = consumption.running * loadFactor;
      break;
    case 'warning':
      // Warning state - running but inefficient (+10% energy)
      warningPenalty = 1.1;
      baseEnergy = consumption.running * warningPenalty;
      break;
    case 'critical':
      // Critical - still consuming but erratically
      baseEnergy = consumption.running * 0.8;
      break;
    case 'idle':
    default:
      baseEnergy = consumption.idle;
      break;
  }

  // Apply maintenance penalty (only affects running machines)
  const finalEnergy = machine.status === 'idle' ? baseEnergy : baseEnergy * maintenancePenalty;

  return {
    baseEnergy: consumption.running,
    loadFactor,
    warningPenalty,
    maintenancePenalty,
    finalEnergy,
  };
}

export interface FacilityBaseLoad {
  lighting: number;
  hvac: number;
  other: number;
  total: number;
  timeDescription: string;
}

/**
 * Calculate base facility load based on time of day.
 *
 * Lighting: 8 kWh day → 35 kWh night (dawn/dusk transitions 6-8am, 5-7pm)
 * HVAC: 20 kWh night → 30 kWh morning → 45 kWh afternoon peak → 35 kWh evening
 * Other: 15 kWh constant (security, IT, fire systems)
 */
export function getFacilityBaseLoad(gameTime: number): FacilityBaseLoad {
  // Normalize hour to 0-24
  const hour = ((gameTime % 24) + 24) % 24;

  // Lighting: Full power at night, reduced during day
  let lighting: number;
  let lightingDesc: string;

  if (hour >= 8 && hour < 17) {
    lighting = 8;
    lightingDesc = 'Day (natural light)';
  } else if (hour >= 6 && hour < 8) {
    const progress = (hour - 6) / 2;
    lighting = 35 - progress * 27;
    lightingDesc = 'Dawn transition';
  } else if (hour >= 17 && hour < 19) {
    const progress = (hour - 17) / 2;
    lighting = 8 + progress * 27;
    lightingDesc = 'Dusk transition';
  } else {
    lighting = 35;
    lightingDesc = 'Night (full artificial)';
  }

  // HVAC: Temperature-based load curve
  let hvac: number;
  let hvacDesc: string;

  if (hour >= 10 && hour < 16) {
    hvac = 45;
    hvacDesc = 'Afternoon peak cooling';
  } else if (hour >= 6 && hour < 10) {
    hvac = 30;
    hvacDesc = 'Morning ramp-up';
  } else if (hour >= 16 && hour < 22) {
    hvac = 35;
    hvacDesc = 'Evening cool-down';
  } else {
    hvac = 20;
    hvacDesc = 'Night maintenance';
  }

  // Other: Constant base systems
  const other = 15;

  return {
    lighting,
    hvac,
    other,
    total: lighting + hvac + other,
    timeDescription: `${lightingDesc} | ${hvacDesc}`,
  };
}

export interface EmergencyLoad {
  lighting: number;
  hvac: number;
  baseSystems: number;
  total: number;
}

/**
 * Calculate emergency mode energy consumption.
 * Only 30% lighting + 50% HVAC + base systems (~40-50 kWh)
 */
export function getEmergencyLoad(baseLoad: FacilityBaseLoad): EmergencyLoad {
  const lighting = baseLoad.lighting * 0.3;
  const hvac = baseLoad.hvac * 0.5;
  const baseSystems = baseLoad.other + 10; // Extra for emergency systems

  return {
    lighting,
    hvac,
    baseSystems,
    total: Math.round(lighting + hvac + baseSystems),
  };
}

export interface MachineTypeEnergyStats {
  type: MachineType;
  label: string;
  runningCount: number;
  idleCount: number;
  warningCount: number;
  overdueCount: number;
  totalEnergy: number;
  nominalRunning: number;
  nominalIdle: number;
}

/**
 * Aggregate energy statistics by machine type.
 */
export function getMachineEnergyByType(machines: MachineData[]): MachineTypeEnergyStats[] {
  const stats: Map<MachineType, MachineTypeEnergyStats> = new Map();

  // Initialize stats for all machine types
  for (const type of Object.values(MachineType)) {
    const consumption = MACHINE_ENERGY_CONSUMPTION[type];
    if (consumption) {
      stats.set(type, {
        type,
        label: MACHINE_TYPE_LABELS[type],
        runningCount: 0,
        idleCount: 0,
        warningCount: 0,
        overdueCount: 0,
        totalEnergy: 0,
        nominalRunning: consumption.running,
        nominalIdle: consumption.idle,
      });
    }
  }

  // Aggregate machine data
  for (const machine of machines) {
    const stat = stats.get(machine.type);
    if (stat) {
      stat.totalEnergy += getMachineEnergy(machine);

      if (machine.status === 'running') {
        stat.runningCount++;
      } else if (machine.status === 'warning') {
        stat.warningCount++;
      } else {
        stat.idleCount++;
      }

      if (machine.maintenanceCountdown !== undefined && machine.maintenanceCountdown <= 0) {
        stat.overdueCount++;
      }
    }
  }

  // Filter to only types with machines and sort by energy consumption
  return Array.from(stats.values())
    .filter((s) => s.runningCount + s.idleCount + s.warningCount > 0)
    .sort((a, b) => b.totalEnergy - a.totalEnergy);
}
