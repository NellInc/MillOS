import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    expect(screen.queryByRole('radiogroup', { name: /^Reduce motion/ })).toBeNull();
    expect(screen.queryByText(/plant equipment keeps moving/i)).toBeNull();
  });

  it('offers Follow system and On, with no help line under them (D14), and switches the mode', () => {
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = true;
    renderPanel();
    // The setting holds people, machine cycles, scenery, camera and panel
    // motion; vehicles and belts keep moving because they are the process.
    // With the help line cut, the control's own label names what it reduces.
    const group = screen.getByRole('radiogroup', {
      name: 'Reduce motion: people, machines, scenery, camera',
    });
    expect(
      screen.getByText('Reduce motion: people, machines, scenery, camera', { selector: 'legend' })
    ).toBeVisible();
    const follow = within(group).getByRole('radio', { name: 'Follow system' });
    const on = within(group).getByRole('radio', { name: 'On' });
    expect(follow).toHaveAttribute('aria-checked', 'true');
    expect(on).toHaveAttribute('aria-checked', 'false');
    // Native buttons: reachable by Tab, activated by Enter and Space.
    expect(on.tagName).toBe('BUTTON');
    expect(on).toHaveAttribute('type', 'button');
    expect(screen.queryByText(/plant equipment keeps moving/i)).toBeNull();

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
    const group = screen.getByRole('radiogroup', {
      name: 'Reduzir movimento: pessoas, máquinas, cenário, câmera',
    });
    expect(within(group).getByRole('radio', { name: 'Seguir o sistema' })).toBeInTheDocument();
    expect(within(group).getByRole('radio', { name: 'Ligado' })).toBeInTheDocument();
    expect(screen.queryByText(/equipamentos da fábrica continuam se movendo/i)).toBeNull();
  });

  // Runs last: Reset Simulation suspends persistence for the rest of the page.
  it('Reset Simulation keeps the motion preference and says so', async () => {
    // The reset reloads after a bounded SCADA history clear. Unstubbed and
    // unawaited, that reload ran after teardown ("window is not defined").
    const reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { reload } });
    FEATURE_FLAGS.IN_APP_REDUCED_MOTION_ENABLED = true;
    localStorage.setItem(
      MOTION_PREFERENCE_STORAGE_KEY,
      JSON.stringify({ state: { mode: 'reduce' }, version: 1 })
    );
    localStorage.setItem('millos-physical-session', '{}');
    // Interface scale is an accessibility preference like reduced motion; it
    // shares millos-ui with tour and journey state, which the reset clears.
    localStorage.setItem(
      'millos-ui',
      JSON.stringify({ state: { uiScale: 1.5, hasSeenIntro: true }, version: 2 })
    );
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Reset Simulation' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent(
      /sound, language, motion and interface scale settings are kept/i
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reset Everything' }));
    expect(localStorage.getItem(MOTION_PREFERENCE_STORAGE_KEY)).toContain('"reduce"');
    expect(localStorage.getItem('millos-physical-session')).toBeNull();
    const ui = JSON.parse(localStorage.getItem('millos-ui') ?? 'null');
    expect(ui?.state).toEqual({ uiScale: 1.5 });
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
  });
});
