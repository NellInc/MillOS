type PlainRecord = Record<string, unknown>;

function asRecord(value: unknown): PlainRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as PlainRecord)
    : null;
}

function finiteNumber(value: unknown, minimum: number, maximum: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function stringArray(value: unknown, maximum = 500): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return [...new Set(value.filter((item): item is string => typeof item === 'string'))].slice(
    -maximum
  );
}

export const MAX_GAME_SPEED = 10800;

export function sanitizeGameSpeed(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(MAX_GAME_SPEED, Math.max(0, value))
    : fallback;
}

export interface PersistedGameSimulationState {
  gameTime?: number;
  gameDay?: number;
  gameSpeed?: number;
  weather?: 'clear' | 'cloudy' | 'rain' | 'storm';
}

export function sanitizeGameSimulationState(value: unknown): PersistedGameSimulationState {
  const source = asRecord(value);
  if (!source) return {};
  const output: PersistedGameSimulationState = {};

  if (typeof source.gameTime === 'number' && Number.isFinite(source.gameTime)) {
    output.gameTime = ((source.gameTime % 24) + 24) % 24;
  }
  if (typeof source.gameDay === 'number' && Number.isFinite(source.gameDay)) {
    output.gameDay = Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(source.gameDay)));
  }
  if (typeof source.gameSpeed === 'number' && Number.isFinite(source.gameSpeed)) {
    output.gameSpeed = sanitizeGameSpeed(source.gameSpeed);
  }
  if (
    source.weather === 'clear' ||
    source.weather === 'cloudy' ||
    source.weather === 'rain' ||
    source.weather === 'storm'
  ) {
    output.weather = source.weather;
  }

  return output;
}

export interface PersistedUIState {
  hasSeenIntro?: boolean;
  journeyVisible?: boolean;
  journeyOrderId?: string | null;
  inspectedMachineIds?: string[];
  showZones?: boolean;
  showAIPanel?: boolean;
  panelMinimized?: boolean;
  theme?: 'dark' | 'light';
  uiScale?: number;
  legendPosition?: { x: number; y: number };
  showMiniMap?: boolean;
  fpsMode?: boolean;
  showFPSCounter?: boolean;
  blueprintMode?: boolean;
}

export function sanitizeUIState(value: unknown): PersistedUIState {
  const source = asRecord(value);
  if (!source) return {};
  const output: PersistedUIState = {};
  const booleanKeys = [
    'hasSeenIntro',
    'journeyVisible',
    'showZones',
    'showAIPanel',
    'panelMinimized',
    'showMiniMap',
    'fpsMode',
    'showFPSCounter',
    'blueprintMode',
  ] as const;
  booleanKeys.forEach((key) => {
    const candidate = booleanValue(source[key]);
    if (candidate !== undefined) output[key] = candidate;
  });
  if (source.journeyOrderId === null || typeof source.journeyOrderId === 'string')
    output.journeyOrderId = source.journeyOrderId;
  const inspections = stringArray(source.inspectedMachineIds, 100);
  if (inspections) output.inspectedMachineIds = inspections;
  if (source.theme === 'dark' || source.theme === 'light') output.theme = source.theme;
  const uiScale = finiteNumber(source.uiScale, 0.9, 1.5);
  if (uiScale !== undefined) output.uiScale = uiScale;
  const position = asRecord(source.legendPosition);
  const x = finiteNumber(position?.x, -100000, 100000);
  const y = finiteNumber(position?.y, -100000, 100000);
  if (x !== undefined && y !== undefined) output.legendPosition = { x, y };
  return output;
}

export interface PersistedKnowledgeState {
  unlockedEntries?: string[];
  readEntries?: string[];
  showTooltips?: boolean;
  showLoadingQuotes?: boolean;
  showAINarration?: boolean;
  showUnlockNotifications?: boolean;
}

export function sanitizeKnowledgeState(value: unknown): PersistedKnowledgeState {
  const source = asRecord(value);
  if (!source) return {};
  const output: PersistedKnowledgeState = {};
  const unlockedEntries = stringArray(source.unlockedEntries, 2000);
  const readEntries = stringArray(source.readEntries, 2000);
  if (unlockedEntries) output.unlockedEntries = unlockedEntries;
  if (readEntries) output.readEntries = readEntries;
  const booleanKeys = [
    'showTooltips',
    'showLoadingQuotes',
    'showAINarration',
    'showUnlockNotifications',
  ] as const;
  booleanKeys.forEach((key) => {
    const candidate = booleanValue(source[key]);
    if (candidate !== undefined) output[key] = candidate;
  });
  return output;
}
