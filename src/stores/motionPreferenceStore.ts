/**
 * The person's in-app reduced-motion choice.
 *
 * `system` follows the operating system's `prefers-reduced-motion`; `reduce`
 * asks for reduced motion whatever the OS says. The OS preference is always
 * honoured, so there is no "force full motion" mode. This is a person's
 * preference, not simulation state: Reset Simulation keeps it.
 *
 * Every reader goes through `selectInAppReducedMotion`, which also applies
 * `FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED`. Working if, with the flag
 * on, choosing On reduces the framer interface, the CSS animations, the
 * loading cover and (with the hook change) the 3D scene; with it off,
 * nothing reads a saved On.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { safeJSONStorage } from './storage';

export type MotionPreferenceMode = 'system' | 'reduce';

export const MOTION_PREFERENCE_STORAGE_KEY = 'millos-motion-preference';

export interface MotionPreferenceState {
  mode: MotionPreferenceMode;
  setMode: (mode: MotionPreferenceMode) => void;
}

export const sanitizeMotionPreferenceMode = (value: unknown): MotionPreferenceMode =>
  value === 'reduce' ? 'reduce' : 'system';

/** True when the in-app setting asks for reduced motion (the OS is read separately). */
export const selectInAppReducedMotion = (state: Pick<MotionPreferenceState, 'mode'>): boolean =>
  FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED && state.mode === 'reduce';

export const useMotionPreferenceStore = create<MotionPreferenceState>()(
  persist(
    (set) => ({
      mode: 'system',
      setMode: (mode) => set({ mode: sanitizeMotionPreferenceMode(mode) }),
    }),
    {
      name: MOTION_PREFERENCE_STORAGE_KEY,
      storage: safeJSONStorage,
      version: 1,
      partialize: (state) => ({ mode: state.mode }),
      merge: (persisted, current) => ({
        ...current,
        mode: sanitizeMotionPreferenceMode(
          (persisted as Partial<{ mode: unknown }> | null | undefined)?.mode
        ),
      }),
    }
  )
);

// CSS cannot read the store, so the in-app choice is mirrored onto <html> as
// `data-motion="reduce"`, which src/index.css and index.html match alongside
// the `prefers-reduced-motion` media query.
function applyMotionPreferenceToDocument(reduce: boolean): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (reduce) root.dataset.motion = 'reduce';
  else delete root.dataset.motion;
}

applyMotionPreferenceToDocument(selectInAppReducedMotion(useMotionPreferenceStore.getState()));
useMotionPreferenceStore.subscribe((state) =>
  applyMotionPreferenceToDocument(selectInAppReducedMotion(state))
);
