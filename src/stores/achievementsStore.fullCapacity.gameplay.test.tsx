/**
 * Saved achievement lists across the rule changes of plan 1.14 and the new
 * achievements of 2.3. Full Capacity read the least-loaded unit against 90
 * (then 80), which a default session never reached (report 09 D2; measured in
 * achievementsStore.session.gameplay.test.ts); it now reads the line rate.
 * Decision Review counted every response, as First Preference did (D4); it now
 * counts deferrals. "Interlock Proven" was earned by the egress drill and
 * talked about interlocks (D3); it now says the drill. A list saved before the
 * game's own milestones gains them locked, every saved entry kept.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FULL_CAPACITY_LINE_RATE_PERCENT,
  useAchievementsStore,
  type Achievement,
} from './achievementsStore';
import { useUIStore } from './uiStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { setLocale } from '../i18n';

const achievement = (id: string) => useAchievementsStore.getState().getAchievement(id);

const NEW_IDS = [
  'first-on-time-delivery',
  'first-a-shift',
  'first-programme',
  'first-challenge',
  'first-hold-resolved',
  'first-season',
  'charter-signed',
];

/** A save written by the deployed build of 4 October (Full Capacity's target 90). */
const savedAchievements = (): { achievements: Achievement[] } =>
  JSON.parse(
    readFileSync(
      join(
        __dirname,
        '..',
        'utils',
        '__tests__',
        'fixtures',
        'physical-saves',
        '2026-10-04-eb1ccf28.json'
      ),
      'utf8'
    )
  ).achievements;

const withEntry = (
  saved: { achievements: Achievement[] },
  id: string,
  change: Partial<Achievement>
): { achievements: Achievement[] } => ({
  achievements: saved.achievements.map((entry) =>
    entry.id === id ? { ...entry, ...change } : entry
  ),
});

beforeEach(() => {
  vi.useFakeTimers();
  useAchievementsStore.getState().resetAchievements();
  useUIStore.setState({ alerts: [] });
});
afterEach(() => {
  vi.useRealTimers();
  setLocale('en');
  useGameSimulationStore.getState().resetGameState();
  useAchievementsStore.getState().resetAchievements();
});

describe('a list saved before the game milestones', () => {
  it('keeps every saved entry in place and gains the seven new ones, locked', () => {
    const saved = savedAchievements();
    expect(saved.achievements.map((entry) => entry.id)).not.toContain('charter-signed');
    useAchievementsStore.setState(saved);
    const restored = useAchievementsStore.getState().achievements;
    expect(restored.slice(0, saved.achievements.length).map((entry) => entry.id)).toEqual(
      saved.achievements.map((entry) => entry.id)
    );
    for (const entry of saved.achievements) {
      const now = achievement(entry.id)!;
      expect(now.unlocked).toBe(entry.unlocked);
      if (entry.id !== 'full-capacity') expect(now.progress).toBe(entry.progress);
    }
    expect(restored.slice(saved.achievements.length).map((entry) => entry.id)).toEqual(NEW_IDS);
    for (const id of NEW_IDS) {
      expect(achievement(id)).toMatchObject({ unlocked: false, progress: 0, target: 1 });
      expect(achievement(id)?.name).toBeTruthy();
      expect(achievement(id)?.description).toBeTruthy();
    }
    // And a new one can then be earned.
    useAchievementsStore.getState().unlockAchievement('charter-signed');
    expect(achievement('charter-signed')?.unlocked).toBe(true);
  });

  it('is left as it is once current (one pass settles it)', () => {
    useAchievementsStore.setState(savedAchievements());
    const settled = useAchievementsStore.getState().achievements;
    useAchievementsStore.setState({ achievements: settled });
    expect(useAchievementsStore.getState().achievements).toBe(settled);
  });

  it('names every new achievement in Brazilian Portuguese too', () => {
    setLocale('pt-BR');
    expect(achievement('charter-signed')?.name).toBe('Carta assinada');
    expect(achievement('first-on-time-delivery')?.name).toBe('No prazo');
    expect(achievement('first-hold-resolved')?.description).toMatch(/retenção de qualidade/);
  });
});

describe('Full Capacity reads the line rate', () => {
  it('restarts a saved load bar on the line-rate rule, at its new mark', () => {
    const saved = withEntry(savedAchievements(), 'full-capacity', { progress: 72 });
    expect(saved.achievements.find((a) => a.id === 'full-capacity')?.target).toBe(90);
    useAchievementsStore.setState(saved);
    expect(achievement('full-capacity')).toMatchObject({
      target: FULL_CAPACITY_LINE_RATE_PERCENT,
      progress: 0,
      basis: 'line-rate',
      unlocked: false,
    });
  });

  it('never awards a saved load bar past the new mark on arrival', () => {
    useAchievementsStore.setState(
      withEntry(savedAchievements(), 'full-capacity', { progress: 100, target: 100 })
    );
    expect(achievement('full-capacity')?.unlocked).toBe(false);
    expect(achievement('full-capacity')?.progress).toBe(0);
  });

  it('keeps one already earned', () => {
    const unlockedAt = new Date('2026-10-04T12:00:00Z');
    useAchievementsStore.setState(
      withEntry(savedAchievements(), 'full-capacity', {
        unlocked: true,
        unlockedAt,
        progress: 90,
      })
    );
    expect(achievement('full-capacity')).toMatchObject({
      unlocked: true,
      progress: 90,
      target: 90,
    });
  });
});

describe('Decision Review counts deferrals', () => {
  it('restarts a saved count of answers, and keeps one already earned', () => {
    useAchievementsStore.setState(
      withEntry(savedAchievements(), 'vote-participant', { progress: 3 })
    );
    expect(achievement('vote-participant')).toMatchObject({
      progress: 0,
      basis: 'deferrals',
      unlocked: false,
    });
    expect(achievement('vote-participant')?.description).toMatch(/^Defer five/);

    useAchievementsStore.setState(
      withEntry(savedAchievements(), 'vote-participant', {
        progress: 5,
        unlocked: true,
        unlockedAt: new Date('2026-10-04T12:00:00Z'),
      })
    );
    expect(achievement('vote-participant')).toMatchObject({ progress: 5, unlocked: true });
  });
});

describe('the drill achievement says what earned it', () => {
  it('names the egress drill, not interlocks, in both languages and in an old save', () => {
    useAchievementsStore.setState(savedAchievements());
    expect(achievement('safety-first')?.name).toBe('Egress Verified');
    expect(achievement('safety-first')?.description).toBe(
      'Run an egress verification drill to the end.'
    );
    setLocale('pt-BR');
    expect(achievement('safety-first')?.name).toBe('Rotas de saída verificadas');
    expect(achievement('safety-first')?.description).not.toMatch(/intertravamento/i);
  });
});
