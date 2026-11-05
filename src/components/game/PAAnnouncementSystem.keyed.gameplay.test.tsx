import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnouncementsStore } from '../../stores/announcementsStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useSafetyStore } from '../../stores/safetyStore';
import { defineMessages, setLocale } from '../../i18n';
import { registerAlertCatalog } from '../../i18n/alertCopy';
import { PAAnnouncementSystem } from './PAAnnouncementSystem';

const layoutState = vi.hoisted(() => ({ compact: false }));

vi.mock('../../utils/audioManager', () => ({ audioManager: { muted: false } }));
vi.mock('./shared', () => ({
  usePAScheduler: vi.fn(),
  useEventAnnouncementScheduler: vi.fn(),
}));
vi.mock('../../hooks/useMobileDetection', () => ({
  useMobileDetection: () => ({ isCompactLayout: layoutState.compact }),
}));
vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
vi.mock('../../hooks/useAudioState', () => ({ useAudioMuted: () => false }));

const catalog = defineMessages({
  en: { restart: (p: { line: string }) => `Packing ${p.line} restarted` },
  'pt-BR': { restart: (p: { line: string }) => `Ensaque ${p.line} reiniciado` },
});
registerAlertCatalog('paKeyedCaptionTest', catalog);

// Working if a PA line queued in English reads in Portuguese, on the caption,
// the phone ticker and the screen-reader live region, once the player switches.
describe('PA captions read keyed lines in the language active now', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    layoutState.compact = false;
    useAnnouncementsStore.setState({
      announcements: [],
      lastAnnouncementTime: {},
      mode: 'focused',
      captionsEnabled: true,
    });
    useGameSimulationStore.setState((state) => ({
      emergencyActive: false,
      emergencyDrillMode: false,
      crisisState: { ...state.crisisState, active: false },
    }));
    useSafetyStore.setState({ forkliftEmergencyStop: false });
    useAnnouncementsStore.getState().addAnnouncement({
      type: 'info',
      message: 'Packing L2 restarted',
      priority: 2,
      channel: 'operational',
      cooldownMs: 0,
      copy: { catalog: 'paKeyedCaptionTest', key: 'restart', params: { line: 'L2' } },
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    setLocale('en');
  });

  const showCaption = async () => {
    render(<PAAnnouncementSystem />);
    // Past the 10 s opening suppression; the fresh line is still on screen.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_001);
    });
  };

  it('desktop caption and live region', async () => {
    await showCaption();
    expect(screen.getAllByText('Packing L2 restarted').length).toBeGreaterThan(0);

    await act(async () => {
      setLocale('pt-BR');
    });
    expect(screen.queryAllByText('Packing L2 restarted')).toHaveLength(0);
    // Caption plus the live region.
    expect(screen.getAllByText('Ensaque L2 reiniciado')).toHaveLength(2);
    expect(screen.getByRole('status')).toHaveTextContent('Ensaque L2 reiniciado');
  });

  it('phone ticker', async () => {
    layoutState.compact = true;
    await showCaption();
    await act(async () => {
      setLocale('pt-BR');
    });
    expect(screen.queryAllByText('Packing L2 restarted')).toHaveLength(0);
    expect(screen.getAllByText('Ensaque L2 reiniciado')).toHaveLength(2);
  });
});
