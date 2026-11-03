import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingGuide } from './OnboardingGuide';
import { FirstDeliveryJourney } from './PlayableShift';
import { useUIStore } from '../../../stores/uiStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
vi.mock('../../knowledge/LearningNote', () => ({ LearningNote: () => null }));

/**
 * The soundtrack's playlist stays open beside the tour and the guided delivery
 * (GameInterface leaves the player alone for both), and collapses on Escape
 * from inside it with a React onKeyDown that stops the event
 * (MillOSMusicPlayer). The tour and the guide listened in the document's
 * capture phase, so they took that Escape first: the card closed (the tour for
 * good) and the playlist stayed open. This stand-in reproduces the player's
 * handler exactly.
 */
function Playlist() {
  const [expanded, setExpanded] = useState(true);
  return (
    <section
      aria-label="Music player"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && expanded) {
          event.preventDefault();
          event.stopPropagation();
          setExpanded(false);
        }
      }}
    >
      <button type="button" aria-expanded={expanded}>
        Collapse playlist
      </button>
      {expanded && <ul aria-label="Playlist" />}
    </section>
  );
}

beforeEach(() => {
  useUIStore.setState(useUIStore.getInitialState(), true);
  useGameSimulationStore.setState({ gameSpeed: 30, clockHolds: [] });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
});
afterEach(cleanup);

describe('Escape inside the open playlist', () => {
  it('collapses the playlist and keeps the tour', () => {
    const onClose = vi.fn();
    render(
      <>
        <Playlist />
        <OnboardingGuide
          step={{ title: 'Grain', content: 'Follow the grain.', icon: 'factory' }}
          stepIndex={0}
          stepCount={3}
          onNext={vi.fn()}
          onBack={vi.fn()}
          onSkip={vi.fn()}
          onClose={onClose}
        />
      </>
    );
    const collapse = screen.getByRole('button', { name: 'Collapse playlist' });
    collapse.focus();
    fireEvent.keyDown(collapse, { key: 'Escape' });
    expect(screen.queryByRole('list', { name: 'Playlist' })).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // From the scene, Escape still closes the tour.
    collapse.blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledWith('escape');
  });

  it('collapses the playlist and keeps the guided delivery', () => {
    useUIStore.getState().startDeliveryJourney(useOperationsCampaignStore.getState().activeOrderId);
    render(
      <>
        <Playlist />
        <FirstDeliveryJourney selectedMachine={null} onOpenWorkspace={vi.fn()} />
      </>
    );
    const collapse = screen.getByRole('button', { name: 'Collapse playlist' });
    collapse.focus();
    fireEvent.keyDown(collapse, { key: 'Escape' });
    expect(screen.queryByRole('list', { name: 'Playlist' })).not.toBeInTheDocument();
    expect(useUIStore.getState().journeyVisible).toBe(true);
    collapse.blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(useUIStore.getState().journeyVisible).toBe(false);
  });
});
