import { cleanup, render, screen } from '@testing-library/react';
import { useReducedMotionConfig } from 'framer-motion';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_FLAGS } from '../config/featureFlags';
import { useMotionPreferenceStore } from '../stores/motionPreferenceStore';
import { AppMotionConfig } from './AppMotionConfig';

const originalGate = FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED;

const Probe = () => <span>{useReducedMotionConfig() ? 'reduced' : 'full'}</span>;

beforeEach(() => {
  // The operating system asks for full motion throughout.
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = originalGate;
  useMotionPreferenceStore.setState({ mode: 'system' });
});

describe('AppMotionConfig', () => {
  it('follows the system preference by default', () => {
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = true;
    render(
      <AppMotionConfig>
        <Probe />
      </AppMotionConfig>
    );
    expect(screen.getByText('full')).toBeInTheDocument();
  });

  it('reduces every framer animation when the in-app setting is On', () => {
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = true;
    useMotionPreferenceStore.setState({ mode: 'reduce' });
    render(
      <AppMotionConfig>
        <Probe />
      </AppMotionConfig>
    );
    expect(screen.getByText('reduced')).toBeInTheDocument();
  });

  it('ignores a saved On while the in-app control is gated off', () => {
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = false;
    useMotionPreferenceStore.setState({ mode: 'reduce' });
    render(
      <AppMotionConfig>
        <Probe />
      </AppMotionConfig>
    );
    expect(screen.getByText('full')).toBeInTheDocument();
  });
});
