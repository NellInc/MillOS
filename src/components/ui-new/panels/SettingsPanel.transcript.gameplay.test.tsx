import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BuildCacheDiagnostics', () => ({ BuildCacheDiagnostics: () => null }));

import { SettingsPanel } from './SettingsPanel';
import { useAnnouncementsStore } from '../../../stores/announcementsStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { defineMessages, setLocale } from '../../../i18n';
import { registerAlertCatalog } from '../../../i18n/alertCopy';

registerAlertCatalog(
  'settingsTranscriptTest',
  defineMessages({
    en: { line: (p: { n: number }) => `Line ${p.n} restarted` },
    'pt-BR': { line: (p: { n: number }) => `Linha ${p.n} reiniciada` },
  })
);

const renderPanel = () =>
  render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);

const transcriptLog = () => screen.getByRole('log');

describe('PA transcript', () => {
  beforeEach(() => {
    setLocale('en');
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
      mode: 'focused',
    });
    useGameSimulationStore.setState({ gameDay: 2, gameTime: 14.5 });
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
    useAnnouncementsStore.setState({ announcements: [], lastAnnouncementTime: {} });
    useGameSimulationStore.getState().resetGameState();
  });

  // A PA line is a plant event: it reads on the plant clock, "Day 3, 14:30".
  it('stamps each line with the plant clock and shows it', () => {
    useAnnouncementsStore
      .getState()
      .addAnnouncement({ type: 'warning', message: 'Check the bin level.', priority: 2 });
    expect(useAnnouncementsStore.getState().announcements[0].gameClock).toEqual({
      day: 2,
      hour: 14.5,
    });
    renderPanel();
    expect(within(transcriptLog()).getByText('Day 3, 14:30')).toBeInTheDocument();
  });

  // The transcript persists: a restored line keeps its plant stamp.
  it('keeps the plant stamp on a line restored from storage', () => {
    const persist = useAnnouncementsStore.persist;
    const merged = persist.getOptions().merge?.(
      {
        announcements: [
          {
            id: 'r1',
            type: 'info',
            message: 'Restored line',
            timestamp: new Date().toISOString(),
            priority: 1,
            gameClock: { day: 0, hour: 9.75 },
          },
        ],
      },
      useAnnouncementsStore.getState()
    );
    expect(merged?.announcements[0].gameClock).toEqual({ day: 0, hour: 9.75 });
  });

  // A keyed line reads, and is found, in the language active now: a line made
  // in English before a switch to pt-BR (or restored by a reload) is
  // Portuguese in the transcript. Working if the stored English is the fallback only.
  it('shows and searches a keyed line in the language active now', () => {
    useAnnouncementsStore.getState().addAnnouncement({
      type: 'info',
      message: 'Line 2 restarted',
      priority: 2,
      copy: { catalog: 'settingsTranscriptTest', key: 'line', params: { n: 2 } },
    });
    setLocale('pt-BR');
    renderPanel();
    expect(within(transcriptLog()).getByText('Linha 2 reiniciada')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'reiniciada' } });
    expect(within(transcriptLog()).getByText('Linha 2 reiniciada')).toBeInTheDocument();
  });

  // The channel is shown translated, so a search for the shown word finds it.
  it('finds a line by the channel name shown in pt-BR', () => {
    useAnnouncementsStore
      .getState()
      .addAnnouncement({ type: 'emergency', message: 'Linha de teste', priority: 4 });
    setLocale('pt-BR');
    renderPanel();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'segurança' } });
    expect(within(transcriptLog()).getByText('Linha de teste')).toBeInTheDocument();
  });
});
