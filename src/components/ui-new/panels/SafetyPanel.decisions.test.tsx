import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGameSimulationStore } from '../../../stores/gameSimulationStore';
import { useSafetyStore } from '../../../stores/safetyStore';
import { useOperationsCampaignStore } from '../../../stores/operationsCampaignStore';
import { audioManager } from '../../../utils/audioManager';
import { createMillOSRuntimeCommandHandlers } from '../../../agent/adapters/runtime/runtimeCommandHandlers';
import { HUMAN_OPERATOR_URI } from '../../../agent/command/authority';
import { SafetyPanel } from './SafetyPanel';

// PLAYTEST-6: a drill and the facility E-stop are the player's decisions, so
// the shift review lists them. A press the store refuses is not logged.

const lines = (actor: 'operator' | 'agent' = 'operator') =>
  useOperationsCampaignStore
    .getState()
    .logbook.filter((entry) => entry.actor === actor)
    .map((entry) => entry.message);

beforeEach(() => {
  useOperationsCampaignStore.getState().resetCampaign();
  vi.spyOn(audioManager, 'startEmergencyStopAlarm').mockImplementation(() => {});
  vi.spyOn(audioManager, 'stopEmergencyStopAlarm').mockImplementation(() => {});
  vi.spyOn(audioManager, 'playEmergencyStop').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  const game = useGameSimulationStore.getState();
  game.endEmergencyDrill();
  if (useGameSimulationStore.getState().emergencyActive)
    useGameSimulationStore.getState().resolveEmergency();
  useGameSimulationStore.setState({ safetyEvents: [], activeSafetyEventId: null });
  useSafetyStore.setState({ forkliftEmergencyStop: false });
  useOperationsCampaignStore.getState().resetCampaign();
});

describe('SafetyPanel records drills and the facility stop as decisions', () => {
  it('logs START DRILL and END DRILL', () => {
    render(<SafetyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'START DRILL' }));
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'END DRILL' }));
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(false);
    expect(lines()).toEqual([
      'Started an egress verification drill.',
      'Ended the egress verification drill.',
    ]);
  });

  it('logs the confirmed E-stop and its release', () => {
    render(<SafetyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'TRIGGER EMERGENCY STOP' }));
    fireEvent.click(screen.getByRole('button', { name: 'Trigger emergency stop' }));
    expect(useGameSimulationStore.getState().emergencyMachineId).toBe('E-STOP');
    fireEvent.click(screen.getByRole('button', { name: 'CLEAR EMERGENCY' }));
    expect(useGameSimulationStore.getState().emergencyActive).toBe(false);
    expect(lines()).toEqual([
      'Pressed the facility emergency stop.',
      'Released the facility emergency stop.',
    ]);
  });

  it('logs no E-stop when a drill took the interlock while the dialog was open', () => {
    render(<SafetyPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'TRIGGER EMERGENCY STOP' }));
    act(() => useGameSimulationStore.getState().startEmergencyDrill());
    fireEvent.click(screen.getByRole('button', { name: 'Trigger emergency stop' }));
    expect(useGameSimulationStore.getState().emergencyMachineId).toBe('DRILL');
    expect(lines()).toEqual([]);
  });
});

describe('the agent fire-drill capability records who started the drill', () => {
  const handler = () =>
    createMillOSRuntimeCommandHandlers().find(
      (candidate) => candidate.capabilityId === 'simulation.start-fire-drill'
    )!;

  it('logs a drill the agent started as the agent', async () => {
    await handler().execute({ targetUri: 'millos://simulation/local', parameters: {} } as never);
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(true);
    expect(lines('agent')).toEqual(['Started an egress verification drill.']);
    expect(lines()).toEqual([]);
  });

  it('logs a drill issued by the human operator through the command path as the operator', async () => {
    await handler().execute({
      targetUri: 'millos://simulation/local',
      actorUri: HUMAN_OPERATOR_URI,
      parameters: {},
    } as never);
    expect(lines()).toEqual(['Started an egress verification drill.']);
  });

  it('logs nothing when the store refuses the drill under an active stop', async () => {
    useGameSimulationStore.getState().triggerEmergency('E-STOP');
    await handler().execute({ targetUri: 'millos://simulation/local', parameters: {} } as never);
    expect(useGameSimulationStore.getState().emergencyDrillMode).toBe(false);
    expect(lines('agent')).toEqual([]);
  });
});
