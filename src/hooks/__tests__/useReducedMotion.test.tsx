import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FEATURE_FLAGS } from '../../config/featureFlags';
import { useMotionPreferenceStore } from '../../stores/motionPreferenceStore';
import { useReducedMotion } from '../useReducedMotion';

type Listener = (event: MediaQueryListEvent) => void;

const originalMatchMedia = window.matchMedia;
const originalGate = FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED;
let osReduce = false;
const listeners = new Set<Listener>();

beforeEach(() => {
  osReduce = false;
  listeners.clear();
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? osReduce : false,
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = originalGate;
  act(() => useMotionPreferenceStore.setState({ mode: 'system' }));
});

const changeOs = (matches: boolean) => {
  osReduce = matches;
  act(() => listeners.forEach((listener) => listener({ matches } as MediaQueryListEvent)));
};

describe('useReducedMotion', () => {
  it('follows the OS setting when the in-app setting follows the system', () => {
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = true;
    osReduce = true;
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
    osReduce = false;
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });

  it('updates when the OS setting changes', () => {
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    changeOs(true);
    expect(result.current).toBe(true);
  });

  it('reduces motion when the in-app setting is On and the OS is at full motion', () => {
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = true;
    act(() => useMotionPreferenceStore.getState().setMode('reduce'));
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true);
  });

  it('re-renders when the in-app setting changes', () => {
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = true;
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
    act(() => useMotionPreferenceStore.getState().setMode('reduce'));
    expect(result.current).toBe(true);
    act(() => useMotionPreferenceStore.getState().setMode('system'));
    expect(result.current).toBe(false);
  });

  it('ignores a saved On while the feature flag is off', () => {
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = false;
    act(() => useMotionPreferenceStore.getState().setMode('reduce'));
    expect(renderHook(() => useReducedMotion()).result.current).toBe(false);
  });
});
