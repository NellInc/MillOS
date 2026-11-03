import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../uiStore';
import { safeJSONStorage } from '../storage';

// App owns the AI panel's open state (a local flag, closed on every load, so
// the ChatGPT return marker and a reload never reopen the workspace). The
// store's showAIPanel has no reader, so writing it to millos-ui recorded a
// preference that nothing restores.
// Working if the saved UI record holds preferences only, not the AI panel flag.
describe('millos-ui persistence', () => {
  beforeEach(() => {
    safeJSONStorage.removeItem('millos-ui');
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('does not write the unread AI panel flag to the saved UI record', async () => {
    useUIStore.getState().setShowAIPanel(false);
    useUIStore.getState().setShowZones(true);
    const saved = (await safeJSONStorage.getItem('millos-ui')) as {
      state: Record<string, unknown>;
    } | null;
    expect(saved).not.toBeNull();
    if (!saved) return;
    expect(saved.state.showZones).toBe(true);
    expect(saved.state).not.toHaveProperty('showAIPanel');
  });
});

// An older millos-ui record still carries showAIPanel: the sanitizer must not
// parse it into the store, where nothing reads it.
describe('an older record with showAIPanel', () => {
  it('is not restored', async () => {
    const { sanitizeUIState } = await import('../persistenceMigrations');
    expect(sanitizeUIState({ showAIPanel: false, showZones: true })).toEqual({ showZones: true });
  });
});
