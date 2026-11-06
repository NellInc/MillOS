import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../uiStore';
import { safeJSONStorage } from '../storage';

// legendPosition and panelMinimized have no reader anywhere in the shipped
// interface (no legend is draggable, no panel minimises), yet millos-ui saved
// both, so the record kept preferences nothing restores. They are not saved,
// and an older record's values are ignored on load, as showAIPanel was.
// Working if the saved UI record holds neither, and an old save leaves both at
// their defaults while its real preferences still load.
describe('millos-ui unread layout fields', () => {
  beforeEach(() => {
    safeJSONStorage.removeItem('millos-ui');
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('are not written to the saved UI record', async () => {
    useUIStore.getState().setPanelMinimized(true);
    useUIStore.getState().setLegendPosition({ x: 40, y: 80 });
    useUIStore.getState().setShowZones(true);
    const saved = (await safeJSONStorage.getItem('millos-ui')) as {
      state: Record<string, unknown>;
    } | null;
    expect(saved).not.toBeNull();
    if (!saved) return;
    expect(saved.state.showZones).toBe(true);
    expect(saved.state).not.toHaveProperty('panelMinimized');
    expect(saved.state).not.toHaveProperty('legendPosition');
  });

  it('are ignored in an older saved record', async () => {
    safeJSONStorage.setItem('millos-ui', {
      state: { panelMinimized: true, legendPosition: { x: 40, y: 80 }, showZones: true },
      version: 2,
    });
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().showZones).toBe(true);
    expect(useUIStore.getState().panelMinimized).toBe(false);
    expect(useUIStore.getState().legendPosition).toEqual({ x: -1, y: -1 });
  });

  it('are ignored in a v1 record that the migration upgrades', async () => {
    safeJSONStorage.setItem('millos-ui', {
      state: { panelMinimized: true, legendPosition: { x: 40, y: 80 }, hasSeenIntro: true },
      version: 1,
    });
    await useUIStore.persist.rehydrate();
    expect(useUIStore.getState().hasSeenIntro).toBe(true);
    expect(useUIStore.getState().panelMinimized).toBe(false);
    expect(useUIStore.getState().legendPosition).toEqual({ x: -1, y: -1 });
  });
});
