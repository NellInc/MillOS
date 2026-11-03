import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IncidentReplayControls } from './IncidentReplayControls';
import { useIncidentReplayStore } from '../../stores/incidentReplayStore';
import { useUIStore } from '../../stores/uiStore';
import { defineMessages, setLocale } from '../../i18n';
import { registerAlertCatalog } from '../../i18n/alertCopy';

const catalog = defineMessages({
  en: { title: 'Line held', message: 'Packer Line 2 is held for a quality check.' },
  'pt-BR': {
    title: 'Linha retida',
    message: 'A Packer Line 2 está retida para verificação de qualidade.',
  },
});
registerAlertCatalog('replay-language-test', catalog);

// The bell renders keyed notices in the language active now; the replay of the
// same notice showed the English text it was recorded with.
describe('Incident replay alert text after a language switch', () => {
  beforeEach(() => {
    setLocale('en');
    useUIStore.setState({
      alerts: [
        {
          id: 'hold-line-2',
          type: 'warning',
          title: 'Line held',
          message: 'Packer Line 2 is held for a quality check.',
          timestamp: new Date(),
          acknowledged: false,
          copy: { catalog: 'replay-language-test', title: 'title', message: 'message' },
        },
      ],
    });
    useIncidentReplayStore.setState({ replayMode: false, replayFrames: [], currentReplayIndex: 0 });
  });
  afterEach(() => {
    cleanup();
    setLocale('en');
    useUIStore.setState({ alerts: [] });
    useIncidentReplayStore.setState({ replayMode: false, replayFrames: [], currentReplayIndex: 0 });
  });

  it('shows a keyed notice recorded in English in Portuguese', () => {
    // As RuntimeController records it: id, type and the stored message.
    useIncidentReplayStore.getState().recordReplayFrame({
      timestamp: Date.now(),
      machineStates: [],
      mobileEquipmentPositions: [],
      alerts: [
        {
          id: 'hold-line-2',
          type: 'warning',
          message: 'Packer Line 2 is held for a quality check.',
        },
      ],
    });
    useIncidentReplayStore.getState().setReplayMode(true);
    render(<IncidentReplayControls />);
    expect(screen.getByText('Packer Line 2 is held for a quality check.')).toBeInTheDocument();

    act(() => setLocale('pt-BR'));
    expect(
      screen.getByText('A Packer Line 2 está retida para verificação de qualidade.')
    ).toBeInTheDocument();
  });
});
