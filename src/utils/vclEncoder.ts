/**
 * Compact Value Context Language (VCL) encoder for the autonomous mill.
 * The wire glyphs are protocol data, so they intentionally remain emoji.
 */

import type { MachineData } from '../types';

const MACHINE_TYPE_GLYPH: Record<string, string> = {
  silo: '🏛️',
  'roller-mill': '⚙️',
  plansifter: '🔀',
  packer: '📦',
  'control-room': '🧠',
};

const MACHINE_STATUS_GLYPH: Record<string, string> = {
  running: '✅',
  idle: '⏸️',
  warning: '⚠️',
  critical: '🔴',
  maintenance: '🔧',
  offline: '⚫',
};

const LOAD_GLYPH = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  critical: '🔴',
};

const TIME_GLYPH = {
  morning: '🌅',
  afternoon: '☀️',
  evening: '🌆',
  night: '🌙',
};

const WEATHER_GLYPH: Record<string, string> = {
  clear: '☀️',
  cloudy: '☁️',
  rain: '🌧️',
  storm: '⛈️',
};

const RUN_WINDOW_GLYPH: Record<string, string> = {
  morning: 'A',
  afternoon: 'B',
  night: 'C',
};

function glyphForLoad(load: number): string {
  if (load < 50) return LOAD_GLYPH.low;
  if (load < 80) return LOAD_GLYPH.medium;
  if (load < 90) return LOAD_GLYPH.high;
  return LOAD_GLYPH.critical;
}

function machineFamily(machine: MachineData): keyof typeof MACHINE_TYPE_GLYPH | null {
  const id = machine.id.toLowerCase();
  if (id.includes('silo')) return 'silo';
  if (id.includes('rm-') || id.includes('roller')) return 'roller-mill';
  if (id.includes('sifter') || id.includes('plansifter')) return 'plansifter';
  if (id.includes('pack') || id.includes('line')) return 'packer';
  if (id.includes('control')) return 'control-room';
  return null;
}

export function encodeMachineVCL(machine: MachineData): string {
  if (!machine?.id) return '❓';
  const family = machineFamily(machine);
  const typeGlyph = family ? MACHINE_TYPE_GLYPH[family] : '❓';
  const statusGlyph = MACHINE_STATUS_GLYPH[machine.status] ?? '❓';
  return `${typeGlyph}${statusGlyph}${glyphForLoad(machine.metrics?.load ?? 0)}`;
}

export function encodeMachinesVCL(machines: MachineData[]): string {
  const families: Array<keyof typeof MACHINE_TYPE_GLYPH> = [
    'silo',
    'roller-mill',
    'plansifter',
    'packer',
    'control-room',
  ];

  return families
    .map((family) => {
      const members = machines.filter((machine) => machineFamily(machine) === family);
      const active = members.filter((machine) => machine.status === 'running').length;
      const degraded = members.some(
        (machine) => machine.status === 'warning' || machine.status === 'critical'
      );
      const averageLoad =
        members.length > 0
          ? members.reduce((sum, machine) => sum + (machine.metrics?.load ?? 0), 0) / members.length
          : 0;
      return `${MACHINE_TYPE_GLYPH[family]}${active}/${members.length}${glyphForLoad(averageLoad)}${degraded ? '⚠️' : ''}`;
    })
    .join('→');
}

export function encodeFactoryContextVCL(
  machines: MachineData[],
  currentRunWindow: string,
  weather: string,
  gameTime: number,
  alerts: Array<{ type: string; acknowledged?: boolean; returnedToNormal?: boolean }>
): string {
  const timeGlyph =
    gameTime < 6
      ? TIME_GLYPH.night
      : gameTime < 12
        ? TIME_GLYPH.morning
        : gameTime < 18
          ? TIME_GLYPH.afternoon
          : gameTime < 22
            ? TIME_GLYPH.evening
            : TIME_GLYPH.night;
  const runWindow = RUN_WINDOW_GLYPH[currentRunWindow] ?? '?';
  const weatherGlyph = WEATHER_GLYPH[weather] ?? WEATHER_GLYPH.clear;
  // Active alarms only: an acknowledged alert, or one whose condition cleared,
  // stays listed for the record but no longer stands.
  const criticalAlerts = alerts.filter(
    (alert) =>
      (alert.type === 'critical' || alert.type === 'safety') &&
      !alert.acknowledged &&
      !alert.returnedToNormal
  ).length;
  const alertGlyph = criticalAlerts > 0 ? `|🚨${criticalAlerts}` : '|✅0';
  return `${timeGlyph}W${runWindow}${weatherGlyph}|${encodeMachinesVCL(machines)}${alertGlyph}`;
}

export function getVCLLegend(): string {
  return `## VCL Legend\n**Run window**: WA Morning WB Afternoon WC Night\n**Machines**: 🏛️Silo ⚙️Mill 🔀Sifter 📦Packer 🧠Control\n**Load**: 🟢Low 🟡Medium 🟠High 🔴Critical\n**Health**: ✅Running ⏸️Idle ⚠️Warning 🔧Maintenance ⚫Offline\n**Alarms**: ✅0 clear 🚨N active critical alarms`;
}
