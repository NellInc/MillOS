import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BuildCacheDiagnostics', () => ({ BuildCacheDiagnostics: () => null }));

import { SettingsPanel } from './SettingsPanel';
import { FEATURE_FLAGS } from '../../../config/featureFlags';
import {
  MOTION_PREFERENCE_STORAGE_KEY,
  useMotionPreferenceStore,
} from '../../../stores/motionPreferenceStore';
import { setLocale } from '../../../i18n';

const originalGate = FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED;

const renderPanel = () =>
  render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);

describe('SettingsPanel reduce motion control', () => {
  beforeEach(() => setLocale('en'));
  afterEach(() => {
    cleanup();
    setLocale('en');
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = originalGate;
    useMotionPreferenceStore.setState({ mode: 'system' });
    localStorage.clear();
  });

  it('is absent while the in-app setting is gated off', () => {
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = false;
    renderPanel();
    expect(screen.queryByRole('radiogroup', { name: 'Reduce motion' })).toBeNull();
    expect(screen.queryByText(/plant equipment keeps moving/i)).toBeNull();
  });

  it('offers Follow system and On, explains them, and switches the mode', () => {
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = true;
    renderPanel();
    const group = screen.getByRole('radiogroup', { name: 'Reduce motion' });
    const follow = within(group).getByRole('radio', { name: 'Follow system' });
    const on = within(group).getByRole('radio', { name: 'On' });
    expect(follow).toHaveAttribute('aria-checked', 'true');
    expect(on).toHaveAttribute('aria-checked', 'false');
    // Native buttons: reachable by Tab, activated by Enter and Space.
    expect(on.tagName).toBe('BUTTON');
    expect(on).toHaveAttribute('type', 'button');
    expect(screen.getByText(/plant equipment keeps moving/i)).toBeInTheDocument();

    fireEvent.click(on);
    expect(useMotionPreferenceStore.getState().mode).toBe('reduce');
    expect(on).toHaveAttribute('aria-checked', 'true');
    expect(follow).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(follow);
    expect(useMotionPreferenceStore.getState().mode).toBe('system');
  });

  it('speaks Brazilian Portuguese', () => {
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = true;
    setLocale('pt-BR');
    renderPanel();
    const group = screen.getByRole('radiogroup', { name: 'Reduzir movimento' });
    expect(within(group).getByRole('radio', { name: 'Seguir o sistema' })).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: 'Ligado' })).toBeInTheDocument();
    expect(screen.getByText(/equipamentos da fábrica continuam se movendo/i)).toBeInTheDocument();
  });

  // Runs last: Reset Simulation suspends persistence for the rest of the page.
  it('Reset Simulation keeps the motion preference and says so', () => {
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = true;
    localStorage.setItem(
      MOTION_PREFERENCE_STORAGE_KEY,
      JSON.stringify({ state: { mode: 'reduce' }, version: 1 })
    );
    localStorage.setItem('millos-physical-session', '{}');
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Simulation' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(/sound, language and motion settings are kept/i);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset Everything' }));
    expect(localStorage.getItem(MOTION_PREFERENCE_STORAGE_KEY)).toContain('"reduce"');
    expect(localStorage.getItem('millos-physical-session')).toBeNull();
  });
});
