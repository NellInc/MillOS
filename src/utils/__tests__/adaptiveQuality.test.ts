import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGraphicsStore } from '../../stores/graphicsStore';
import {
  adaptiveQualityManager,
  applySessionQuality,
  restoreSessionScopedQuality,
} from '../adaptiveQuality';

// An automatic or recovery downgrade belongs to the session that needed it;
// only an explicit choice in Settings may follow the visitor to the next one.
describe('session-scoped quality downgrades', () => {
  let idle: Array<() => void>;

  const dropOneTierAdaptively = (): void => {
    for (let frame = 0; frame < 96; frame++) adaptiveQualityManager.update(1 / 20);
    expect(idle).toHaveLength(1);
    idle[0]();
  };

  // A reload builds a new manager over whatever quality the store restored.
  const startNextSession = (): void => {
    adaptiveQualityManager.reset();
    restoreSessionScopedQuality();
    adaptiveQualityManager.initialize();
    adaptiveQualityManager.setEnabled(true);
  };

  beforeEach(() => {
    window.localStorage.clear();
    useGraphicsStore.setState(useGraphicsStore.getInitialState(), true);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(120000);
    idle = [];
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      idle.push(callback);
      return idle.length;
    });
    restoreSessionScopedQuality();
    adaptiveQualityManager.reset();
    adaptiveQualityManager.initialize();
    adaptiveQualityManager.setEnabled(true);
  });

  afterEach(() => {
    adaptiveQualityManager.setEnabled(false);
    adaptiveQualityManager.reset();
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('starts the next session at the chosen tier after an adaptive downgrade', () => {
    dropOneTierAdaptively();
    expect(useGraphicsStore.getState().graphics.quality).toBe('low');
    startNextSession();
    expect(useGraphicsStore.getState().graphics.quality).toBe('medium');
  });

  it('keeps the original choice across several adaptive steps', () => {
    useGraphicsStore.getState().setGraphicsQuality('high');
    adaptiveQualityManager.update(1 / 20);
    vi.setSystemTime(132001);
    dropOneTierAdaptively();
    expect(useGraphicsStore.getState().graphics.quality).toBe('medium');
    vi.setSystemTime(144002);
    for (let frame = 0; frame < 96; frame++) adaptiveQualityManager.update(1 / 20);
    expect(idle).toHaveLength(2);
    idle[1]();
    expect(useGraphicsStore.getState().graphics.quality).toBe('low');
    startNextSession();
    expect(useGraphicsStore.getState().graphics.quality).toBe('high');
  });

  it('persists an explicit Settings choice, including one made after an adaptive drop', () => {
    dropOneTierAdaptively();
    useGraphicsStore.getState().setGraphicsQuality('low');
    startNextSession();
    expect(useGraphicsStore.getState().graphics.quality).toBe('low');
  });

  it('holds a recovery downgrade for this session only', () => {
    applySessionQuality('low');
    expect(useGraphicsStore.getState().graphics.quality).toBe('low');
    // Adaptive must not climb back over the visitor's recovery choice mid-session.
    vi.setSystemTime(240000);
    for (let frame = 0; frame < 1600; frame++) adaptiveQualityManager.update(1 / 60);
    expect(idle).toHaveLength(0);
    expect(useGraphicsStore.getState().graphics.quality).toBe('low');
    startNextSession();
    expect(useGraphicsStore.getState().graphics.quality).toBe('medium');
  });

  it('leaves a session alone when nothing was downgraded automatically', () => {
    useGraphicsStore.getState().setGraphicsQuality('high');
    startNextSession();
    expect(useGraphicsStore.getState().graphics.quality).toBe('high');
  });
});
