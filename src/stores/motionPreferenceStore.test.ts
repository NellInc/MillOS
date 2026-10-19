import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { FEATURE_FLAGS } from '../config/featureFlags';
import {
  MOTION_PREFERENCE_STORAGE_KEY,
  sanitizeMotionPreferenceMode,
  selectInAppReducedMotion,
  useMotionPreferenceStore,
} from './motionPreferenceStore';

const originalGate = FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED;

afterEach(() => {
  FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = originalGate;
  useMotionPreferenceStore.setState({ mode: 'system' });
  delete document.documentElement.dataset.motion;
});

describe('motion preference store', () => {
  it('follows the system by default under its own storage key', () => {
    expect(useMotionPreferenceStore.getState().mode).toBe('system');
    expect(MOTION_PREFERENCE_STORAGE_KEY).toBe('millos-motion-preference');
  });

  it('accepts only the two known modes', () => {
    expect(sanitizeMotionPreferenceMode('reduce')).toBe('reduce');
    expect(sanitizeMotionPreferenceMode('system')).toBe('system');
    expect(sanitizeMotionPreferenceMode('always')).toBe('system');
    expect(sanitizeMotionPreferenceMode(undefined)).toBe('system');
    expect(sanitizeMotionPreferenceMode(1)).toBe('system');
  });

  it('persists the chosen mode under its own key and restores it', async () => {
    useMotionPreferenceStore.getState().setMode('reduce');
    const storage = useMotionPreferenceStore.persist.getOptions().storage;
    expect(storage?.getItem(MOTION_PREFERENCE_STORAGE_KEY)).toMatchObject({
      state: { mode: 'reduce' },
    });
    useMotionPreferenceStore.setState({ mode: 'system' }, false);
    storage?.setItem(MOTION_PREFERENCE_STORAGE_KEY, { state: { mode: 'reduce' }, version: 1 });
    await useMotionPreferenceStore.persist.rehydrate();
    expect(useMotionPreferenceStore.getState().mode).toBe('reduce');
  });

  it('restores an unknown or damaged saved value as Follow system', async () => {
    const storage = useMotionPreferenceStore.persist.getOptions().storage;
    storage?.setItem(MOTION_PREFERENCE_STORAGE_KEY, {
      state: { mode: 'sideways' },
      version: 1,
    } as never);
    await useMotionPreferenceStore.persist.rehydrate();
    expect(useMotionPreferenceStore.getState().mode).toBe('system');
    storage?.setItem(MOTION_PREFERENCE_STORAGE_KEY, { state: null, version: 1 } as never);
    await useMotionPreferenceStore.persist.rehydrate();
    expect(useMotionPreferenceStore.getState().mode).toBe('system');
  });

  it('forces reduced motion only when the gate is open and the mode is reduce', () => {
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = false;
    expect(selectInAppReducedMotion({ mode: 'reduce' })).toBe(false);
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = true;
    expect(selectInAppReducedMotion({ mode: 'reduce' })).toBe(true);
    expect(selectInAppReducedMotion({ mode: 'system' })).toBe(false);
  });

  it('marks the document so CSS animations stop, and only while the gate is open', () => {
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = false;
    useMotionPreferenceStore.getState().setMode('reduce');
    expect(document.documentElement.dataset.motion).toBeUndefined();

    useMotionPreferenceStore.getState().setMode('system');
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = true;
    useMotionPreferenceStore.getState().setMode('reduce');
    expect(document.documentElement.dataset.motion).toBe('reduce');
    useMotionPreferenceStore.getState().setMode('system');
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it('holds the pre-React loading bar still for a saved On before any module loads', () => {
    const html = readFileSync('index.html', 'utf8');
    const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
      .map((match) => match[1])
      .find((code) => code.includes(MOTION_PREFERENCE_STORAGE_KEY));
    expect(script).toBeDefined();
    expect(html).toMatch(/html\[data-motion='reduce'\] \.loading-bar::after \{\s*animation: none;/);
    const run = new Function(script ?? '');
    try {
      localStorage.setItem(
        MOTION_PREFERENCE_STORAGE_KEY,
        JSON.stringify({ state: { mode: 'reduce' }, version: 1 })
      );
      run();
      expect(document.documentElement.dataset.motion).toBe('reduce');
      delete document.documentElement.dataset.motion;

      localStorage.setItem(MOTION_PREFERENCE_STORAGE_KEY, 'not json');
      run();
      expect(document.documentElement.dataset.motion).toBeUndefined();
    } finally {
      localStorage.removeItem(MOTION_PREFERENCE_STORAGE_KEY);
    }
  });

  it('mirrors every prefers-reduced-motion block of the stylesheet for the in-app mode', () => {
    const css = readFileSync('src/index.css', 'utf8');
    expect(css.match(/@media \(prefers-reduced-motion: reduce\)/g)).toHaveLength(2);
    expect(css).toContain("html[data-motion='reduce'] *::after");
    expect(css).toContain("html[data-motion='reduce'] .animate-pulse");
    expect(css).toContain("html[data-motion='reduce']::view-transition-group(*)");
  });
});
