import { PLAYER_COLORS, type MultiplayerMessage } from './types';

const MAX_IDENTIFIER_LENGTH = 128;
const MAX_MACHINES = 512;
const MAX_CHAT_LENGTH = 500;
const MAX_JSON_NODES = 256;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isString(value: unknown, maxLength = MAX_IDENTIFIER_LENGTH): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTimestamp(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0;
}

function isGameTime(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0 && value < 24;
}

function isWeather(value: unknown): value is string {
  return ['clear', 'cloudy', 'rain', 'storm'].includes(String(value));
}

function isVector3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((component) => isFiniteNumber(component) && Math.abs(component) <= 100_000)
  );
}

function isMachineMetrics(value: unknown, required: boolean): boolean {
  if (!isRecord(value)) return false;
  for (const key of ['rpm', 'temperature', 'vibration', 'load'] as const) {
    if (required && !isFiniteNumber(value[key])) return false;
    if (value[key] !== undefined && !isFiniteNumber(value[key])) return false;
  }
  return true;
}

function isMachineState(value: unknown, requireAll: boolean): boolean {
  if (!isRecord(value) || !isString(value.id)) return false;
  const statuses = ['running', 'idle', 'warning', 'critical'];
  if (requireAll && !statuses.includes(String(value.status))) return false;
  if (value.status !== undefined && !statuses.includes(String(value.status))) return false;
  if (requireAll && !isMachineMetrics(value.metrics, true)) return false;
  if (value.metrics !== undefined && !isMachineMetrics(value.metrics, false)) return false;
  return true;
}

function isBoundedJSON(
  value: unknown,
  state: { nodes: number } = { nodes: 0 },
  depth = 0
): boolean {
  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES || depth > 5) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 1024;
  if (Array.isArray(value)) {
    return value.length <= 64 && value.every((item) => isBoundedJSON(item, state, depth + 1));
  }
  if (!isRecord(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= 64 &&
    entries.every(
      ([key, child]) =>
        key.length > 0 &&
        key.length <= 128 &&
        key !== '__proto__' &&
        key !== 'constructor' &&
        key !== 'prototype' &&
        isBoundedJSON(child, state, depth + 1)
    )
  );
}

function isRemotePlayer(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isString(value.id, 64) &&
    isString(value.name, 20) &&
    isVector3(value.position) &&
    isFiniteNumber(value.rotation) &&
    Math.abs(value.rotation) <= 1_000_000 &&
    isVector3(value.velocity) &&
    PLAYER_COLORS.includes(value.color as (typeof PLAYER_COLORS)[number]) &&
    (value.selectedMachineId === null || isString(value.selectedMachineId)) &&
    typeof value.isInFpsMode === 'boolean' &&
    isTimestamp(value.lastUpdate)
  );
}

function isGameStateDiff(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !Number.isSafeInteger(value.sequence) ||
    (value.sequence as number) < 0 ||
    !isTimestamp(value.timestamp)
  ) {
    return false;
  }
  if (
    value.machines !== undefined &&
    (!Array.isArray(value.machines) ||
      value.machines.length > MAX_MACHINES ||
      !value.machines.every((machine) => isMachineState(machine, false)))
  ) {
    return false;
  }
  if (value.gameTime !== undefined && !isGameTime(value.gameTime)) return false;
  if (value.weather !== undefined && !isWeather(value.weather)) return false;
  if (value.emergencyActive !== undefined && typeof value.emergencyActive !== 'boolean')
    return false;
  return true;
}

function isFullGameState(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !isGameTime(value.gameTime) ||
    !isWeather(value.weather) ||
    typeof value.emergencyActive !== 'boolean' ||
    !Array.isArray(value.machines) ||
    value.machines.length > MAX_MACHINES ||
    !value.machines.every((machine) => isMachineState(machine, true)) ||
    !isRecord(value.machineLocks)
  ) {
    return false;
  }

  const locks = Object.entries(value.machineLocks);
  return (
    locks.length <= MAX_MACHINES &&
    locks.every(([machineId, playerId]) => isString(machineId) && isString(playerId, 64))
  );
}

/** Validate every PeerJS payload before it is treated as a MultiplayerMessage. */
export function isValidMultiplayerMessage(value: unknown): value is MultiplayerMessage {
  if (!isRecord(value) || typeof value.type !== 'string' || !isRecord(value.payload)) return false;
  const payload = value.payload;

  switch (value.type) {
    case 'PLAYER_UPDATE':
      return isRemotePlayer(payload);
    case 'PLAYER_JOIN':
      return (
        isString(payload.id, 64) &&
        isString(payload.name, 20) &&
        PLAYER_COLORS.includes(payload.color as (typeof PLAYER_COLORS)[number])
      );
    case 'PLAYER_LEAVE':
      return isString(payload.id, 64);
    case 'STATE_SYNC':
      return isGameStateDiff(payload);
    case 'FULL_STATE_SYNC':
      return isFullGameState(payload);
    case 'INTENT':
      return (
        isString(payload.id) &&
        ['START', 'STOP', 'ADJUST'].includes(String(payload.type)) &&
        isString(payload.machineId) &&
        isString(payload.playerId, 64) &&
        isTimestamp(payload.timestamp) &&
        (payload.parameters === undefined || isBoundedJSON(payload.parameters))
      );
    case 'INTENT_RESULT':
      return (
        isString(payload.intentId) &&
        typeof payload.success === 'boolean' &&
        (payload.error === undefined ||
          (typeof payload.error === 'string' && payload.error.length <= 512))
      );
    case 'AI_VOTE':
      return (
        isString(payload.decisionId) &&
        isString(payload.playerId, 64) &&
        typeof payload.approve === 'boolean' &&
        isTimestamp(payload.timestamp)
      );
    case 'CHAT':
      return (
        isString(payload.id) &&
        isString(payload.from, 64) &&
        isString(payload.fromName, 20) &&
        typeof payload.message === 'string' &&
        payload.message.length > 0 &&
        payload.message.length <= MAX_CHAT_LENGTH &&
        isTimestamp(payload.timestamp)
      );
    case 'PING':
      return isTimestamp(payload.timestamp);
    case 'PONG':
      return isTimestamp(payload.timestamp) && isTimestamp(payload.hostTime);
    case 'MACHINE_LOCK':
      return (
        isString(payload.machineId) && (payload.playerId === null || isString(payload.playerId, 64))
      );
    default:
      return false;
  }
}

export const MULTIPLAYER_PROTOCOL_LIMITS = {
  maxMachines: MAX_MACHINES,
  maxChatLength: MAX_CHAT_LENGTH,
  maxJsonNodes: MAX_JSON_NODES,
} as const;
