/**
 * The forklift-only stop was on the X key alone, so a phone could not set it
 * (report 04 F8). The Safety panel now sets it beside its release, through the
 * same path as X: the klaxon, the PA line on the forklift-stop topic and an
 * incident. And under D-012 the drill and the safety config carry no captions.
 */
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useAnnouncementsStore } from '../../../stores/announcementsStore';
import { audioManager } from '../../../utils/audioManager';
import { FORKLIFT_STOP_TOPIC } from '../../game/shared';
import { SafetyPanel } from './SafetyPanel';
import { SafetyConfigPanel } from '../../ui/SafetyConfigPanel';

beforeEach(() => {
  vi.spyOn(audioManager, 'playEmergencyStop').mockImplementation(() => {});
  vi.spyOn(audioManager, 'startEmergencyStopAlarm').mockImplementation(() => {});
  vi.spyOn(audioManager, 'stopEmergencyStopAlarm').mockImplementation(() => {});
  useAnnouncementsStore.setState({ announcements: [] });
  useSafetyStore.setState({ forkliftEmergencyStop: false, safetyIncidents: [] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  const game = useGameSimulationStore.getState();
  game.endEmergencyDrill();
  if (game.emergencyActive) useGameSimulationStore.getState().resolveEmergency();
  useGameSimulationStore.setState({ safetyEvents: [], activeSafetyEventId: null });
  useSafetyStore.setState({ forkliftEmergencyStop: false });
});

describe('the Safety panel sets and releases the forklift stop', () => {
  it('sets it as X does, then releases it', () => {
    render(<SafetyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'STOP FORKLIFTS' }));

    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(true);
    expect(audioManager.startEmergencyStopAlarm).toHaveBeenCalledTimes(1);
    const line = useAnnouncementsStore
      .getState()
      .announcements.find((announcement) => announcement.topic === FORKLIFT_STOP_TOPIC);
    expect(line?.message).toBe("Forklifts stopped. The mill's still running.");
    const incident = useSafetyStore.getState().safetyIncidents[0];
    expect(incident?.descriptionKey).toBe('panelForkliftStop');
    expect(incident?.description).toBe('Forklift stop set from the Safety panel');

    // The set control gives way to the release, in the same place.
    expect(screen.queryByRole('button', { name: 'STOP FORKLIFTS' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'RELEASE FORKLIFT STOP' }));
    expect(useSafetyStore.getState().forkliftEmergencyStop).toBe(false);
    expect(audioManager.stopEmergencyStopAlarm).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'STOP FORKLIFTS' })).toBeTruthy();
  });

  // The drill holds the forklifts itself and owns their release.
  it('offers neither control while a drill holds the forklifts', () => {
    render(<SafetyPanel />);
    act(() => useGameSimulationStore.getState().startEmergencyDrill());
    expect(screen.queryByRole('button', { name: 'STOP FORKLIFTS' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'RELEASE FORKLIFT STOP' })).toBeNull();
  });
});

describe('no captions under the drill or the safety-config controls (D-012)', () => {
  it('shows the drill as its title and its control', () => {
    render(<SafetyPanel />);
    const drill = screen.getByRole('group', { name: 'Emergency egress verification drill' });
    expect(drill.querySelectorAll('p')).toHaveLength(0);
    expect(within(drill).queryByText(/verify themselves|sensors/i)).toBeNull();
  });

  it('shows an active event as its cause, with no response line under it', () => {
    act(() => useGameSimulationStore.getState().triggerEmergency('E-STOP'));
    render(<SafetyPanel />);
    const card = screen.getAllByRole('status').find((node) => node.querySelector('p'));
    expect(card?.querySelectorAll('p')).toHaveLength(1);
  });

  it('shows each safety-config control as its label, value and slider', () => {
    render(<SafetyConfigPanel />);
    fireEvent.click(screen.getByRole('button', { name: /Safety Configuration/ }));
    expect(screen.getAllByRole('slider')).toHaveLength(4);
    expect(document.querySelectorAll('p')).toHaveLength(0);
  });
});
