import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSafetyStore } from '../../../stores/safetyStore';
import { ZoneCustomizationPanel } from '../ZoneCustomizationPanel';
import { setLocale } from '../../../i18n';

const openPanel = () => fireEvent.click(screen.getByRole('button', { name: /Speed Zones|Zonas/ }));

// The six default zones were named in the language of the first load and
// persisted that way, and no control renames them, so a player who switched
// to Portuguese read "Central Area" for good. Working if an untouched default
// zone reads in the language active now, and a zone the player named keeps it.
describe('ZoneCustomizationPanel default zone names', () => {
  beforeEach(() => {
    setLocale('en');
    useSafetyStore.setState(useSafetyStore.getInitialState(), true);
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
    useSafetyStore.setState(useSafetyStore.getInitialState(), true);
  });

  it('reads an English-named default zone in Portuguese after a switch', () => {
    useSafetyStore.setState({
      speedZones: [{ id: 'zone-1', x: 0, z: 0, radius: 5, name: 'Central Area' }],
    });
    setLocale('pt-BR');
    render(<ZoneCustomizationPanel />);
    openPanel();
    expect(screen.getByText('Área central')).toBeInTheDocument();
    expect(screen.queryByText('Central Area')).toBeNull();
    expect(screen.getByRole('button', { name: 'Remover a zona Área central' })).toBeInTheDocument();
  });

  it('reads a Portuguese-named default zone in English after a switch back', () => {
    useSafetyStore.setState({
      speedZones: [{ id: 'zone-2', x: 0, z: 28, radius: 4, name: 'Carregamento norte' }],
    });
    render(<ZoneCustomizationPanel />);
    openPanel();
    expect(screen.getByText('North Loading')).toBeInTheDocument();
  });

  it('keeps a name the player gave, even on a default zone id', () => {
    useSafetyStore.setState({
      speedZones: [
        { id: 'zone-1', x: 0, z: 0, radius: 5, name: 'Mezzanine' },
        { id: 'zone-77', x: 3, z: 3, radius: 2, name: 'Central Area' },
      ],
    });
    setLocale('pt-BR');
    render(<ZoneCustomizationPanel />);
    openPanel();
    expect(screen.getByText('Mezzanine')).toBeInTheDocument();
    expect(screen.getByText('Central Area')).toBeInTheDocument();
  });
});
