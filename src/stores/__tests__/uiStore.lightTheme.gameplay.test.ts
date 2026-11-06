import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../uiStore';
import { safeJSONStorage } from '../storage';
import { sanitizeUIState } from '../persistenceMigrations';

// The light theme lost its control in the December 2025 shell change: nothing
// calls toggleTheme, yet a saved 'light' was carried forward, so a player with
// an old light save kept light panels (seven ui/* panels and the keyboard help)
// with no way back short of Reset Everything. The saved theme is retired.
// Working if an old 'light' save opens dark and the saved UI record no longer
// holds a theme.
describe('a saved light theme', () => {
  beforeEach(() => {
    safeJSONStorage.removeItem('millos-ui');
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('opens dark after a reload', async () => {
    safeJSONStorage.setItem('millos-ui', {
      state: { theme: 'light', showZones: true },
      version: 2,
    });
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().theme).toBe('dark');
    expect(useUIStore.getState().showZones).toBe(true);
  });

  it('opens dark from a v1 record that the migration upgrades', async () => {
    safeJSONStorage.setItem('millos-ui', { state: { theme: 'light' }, version: 1 });
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().theme).toBe('dark');
  });

  it('is not parsed out of an older record', () => {
    expect(sanitizeUIState({ theme: 'light', hasSeenIntro: true })).toEqual({
      hasSeenIntro: true,
    });
  });

  it('is no longer written to the saved UI record', async () => {
    useUIStore.getState().setShowZones(true);
    const saved = (await safeJSONStorage.getItem('millos-ui')) as {
      state: Record<string, unknown>;
    } | null;
    expect(saved).not.toBeNull();
    if (!saved) return;
    expect(saved.state.showZones).toBe(true);
    expect(saved.state).not.toHaveProperty('theme');
  });
});
