import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MobilePanel } from './MobilePanel';
import { useUIStore } from '../../stores/uiStore';
import { useMobileControlStore } from '../../stores/mobileControlStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { getLocale, setLocale } from '../../i18n';
vi.mock('../ui-new/panels/BuildCacheDiagnostics', () => ({ BuildCacheDiagnostics: () => null }));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => false }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: { div: 'div', aside: 'aside' },
}));

beforeEach(() => {
  useUIStore.setState({ hasSeenIntro: true });
  useMobileControlStore.getState().openMobilePanel('settings');
});
afterEach(() => {
  cleanup();
  setLocale('en');
});

// Settings on a compact layout (a phone, or any window under 768 px) is this
// sheet, not the desktop panel. It offered only the zone overlay, so once the
// tour was closed there was no way to change language or see the tour again.
it('changes the interface language from the compact settings sheet', () => {
  render(<MobilePanel isVisible content="settings" onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Português (Brasil)' }));
  expect(getLocale()).toBe('pt-BR');
  expect(screen.getByRole('button', { name: 'Português (Brasil)' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

it('replays getting started from the compact settings sheet and gets out of its way', () => {
  render(<MobilePanel isVisible content="settings" onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Replay getting started' }));
  expect(useUIStore.getState().hasSeenIntro).toBe(false);
  // The sheet sits above the tour card, so it closes for the tour to be read.
  expect(useMobileControlStore.getState().mobilePanelVisible).toBe(false);
});

it('names the replay in Brazilian Portuguese', () => {
  setLocale('pt-BR');
  render(<MobilePanel isVisible content="settings" onClose={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Rever os primeiros passos' })).toBeInTheDocument();
});

// Under 768 px this sheet is the only Settings there is. It carried language,
// the tour and the zone overlay, so resets, graphics quality, reduced motion,
// sound and PA captions could not be reached on a phone at all.
it('offers the full settings, including both resets, from the compact sheet', () => {
  render(<MobilePanel isVisible content="settings" onClose={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Reset to 10 AM' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reset Simulation' })).toBeInTheDocument();
  expect(screen.getByRole('radiogroup', { name: 'Graphics quality' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Zone Markers' })).toBeInTheDocument();
  // One tour replay and one language switcher, not a copy beside the panel's own.
  expect(screen.getAllByRole('button', { name: 'Replay getting started' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Português (Brasil)' })).toHaveLength(1);
});

it('resets the day from the compact sheet without closing it under the confirmation', () => {
  useGameSimulationStore.setState({ gameTime: 16 });
  const onClose = vi.fn();
  render(<MobilePanel isVisible content="settings" onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reset to 10 AM' }));
  const dialog = screen.getByRole('dialog', { name: 'Reset to 10 AM' });
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reset to 10 AM' }));
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Reset to 10 AM' })).getByRole('button', {
      name: 'Reset to 10 AM',
    })
  );
  expect(useGameSimulationStore.getState().gameTime).toBe(10);
});

// Under 768 px the side panel's footer, the only way to About, is not shown:
// a phone player could not reach the disclaimer or the PA voice's licence
// credit (CC BY-NC 4.0, which the voice may be used only with). The sheet ends
// with About, in both languages.
it('opens About from the compact settings sheet', () => {
  render(<MobilePanel isVisible content="settings" onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'About MillOS' }));
  const about = screen.getByRole('dialog', { name: 'About MillOS' });
  expect(about).toHaveTextContent(/Phonon 40M/);
  // Outside the sheet: inside it, a capture showed the modal centred on and
  // clipped by the sheet, its title and Close off the top.
  expect(screen.getByRole('dialog', { name: /Settings/ }).contains(about)).toBe(false);
});

it('names About in Brazilian Portuguese', () => {
  setLocale('pt-BR');
  render(<MobilePanel isVisible content="settings" onClose={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Sobre o MillOS' })).toBeInTheDocument();
});

it('stays open when opened while the tour is already running', () => {
  act(() => useUIStore.setState({ hasSeenIntro: false }));
  render(<MobilePanel isVisible content="settings" onClose={vi.fn()} />);
  expect(useMobileControlStore.getState().mobilePanelVisible).toBe(true);
});

// The sheet kept the 33vh of the small summary sheets and wrapped the embedded
// panel, which pads itself, in a second p-4: on a 390x844 phone that left about
// 180 px for language, the tour, both resets, graphics, motion and sound.
it('gives the settings sheet the tall height and a single padding', () => {
  render(<MobilePanel isVisible content="settings" onClose={vi.fn()} />);
  const sheet = screen.getByRole('dialog', { name: /Settings/ });
  // jsdom drops the env() value it cannot parse, so the inline limit can only
  // be checked for no longer being the short one.
  expect(sheet.style.maxHeight).not.toBe('33vh');
  expect(sheet.firstElementChild).toHaveClass(
    'max-h-[min(70dvh,calc(100dvh-116px-env(safe-area-inset-bottom)))]'
  );
  expect(sheet.firstElementChild).not.toHaveClass('max-h-[33vh]');
  const panelRoot = screen.getByRole('button', { name: 'Reset to 10 AM' }).closest('.space-y-6');
  expect(panelRoot).toHaveClass('p-4');
  expect(panelRoot?.parentElement).not.toHaveClass('p-4');
});
