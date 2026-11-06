import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BuildCacheDiagnostics', () => ({ BuildCacheDiagnostics: () => null }));

import { SettingsPanel } from './SettingsPanel';
import { useUIStore } from '../../../stores/uiStore';
import { setLocale } from '../../../i18n';

// The status bar draws an FPS readout while uiStore.showFPSCounter is on, and
// millos-ui saves and restores that flag. Its only switch went with the old
// overlay shell, so a player who had turned the readout on kept it on every
// load with no control anywhere to hide it (and nobody could turn it on).
// Working if Settings shows the readout's state and switches it both ways.
describe('Settings FPS counter switch', () => {
  afterEach(() => {
    cleanup();
    setLocale('en');
    useUIStore.setState({ showFPSCounter: false });
  });

  it('turns a restored FPS readout off, and back on', () => {
    useUIStore.setState({ showFPSCounter: true });
    render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);
    const toggle = screen.getByRole('button', { name: 'FPS counter' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(useUIStore.getState().showFPSCounter).toBe(false);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(useUIStore.getState().showFPSCounter).toBe(true);
  });

  // The phone sheet hosts this panel too, but the compact layout mounts no
  // status bar: there the switch would change nothing on screen.
  it('is not offered in the compact layout, where no status bar is mounted', () => {
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 500 });
    try {
      render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);
      expect(screen.queryByRole('button', { name: 'FPS counter' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Wireframe Mode' })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    }
  });

  it('is named in Portuguese in pt-BR', () => {
    setLocale('pt-BR');
    render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);
    expect(screen.getByRole('button', { name: 'Contador de FPS' })).toBeInTheDocument();
  });
});
