import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { paceMessages } from '../../../simulation/pace.messages';
import { setLocale, type Locale } from '../../../i18n';
import { TeachingPace } from './PlayableShift';

// Seen at 1280 x 720: the guide card's "Paused with P. Press P again to
// resume." showed in English and was pushed below the card's fold in
// Portuguese. A P pause is the player's own, which a pace choice never
// refuses, and the HUD's paused chip already names it with its key, so the
// card carries no line for it in either language. A feature's hold keeps its.
describe('the pace control under a P pause', () => {
  afterEach(() => {
    cleanup();
    setLocale('en');
    useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  });

  it.each<Locale>(['en', 'pt-BR'])('shows no hold line in %s', (locale) => {
    setLocale(locale);
    useGameSimulationStore.setState({
      gameSpeed: 0,
      clockHolds: [{ holder: 'shortcut', resumeSpeed: 30 }],
    });
    render(<TeachingPace />);
    expect(screen.queryByText(paceMessages[locale].heldBy_shortcut)).toBeNull();
  });

  it('still names a feature hold', () => {
    useGameSimulationStore.setState({
      gameSpeed: 0,
      clockHolds: [{ holder: 'tour', resumeSpeed: 30 }],
    });
    render(<TeachingPace />);
    expect(screen.getByText(paceMessages.en.heldBy_tour)).toBeInTheDocument();
  });
});
