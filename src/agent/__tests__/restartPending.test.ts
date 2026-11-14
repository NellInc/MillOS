/**
 * D-096: CLEAR EMERGENCY and END DRILL leave the line idle until a person
 * presses RESTART LINE, and no agent command restarts it. An agent must be able
 * to see that state (the projection and the brief say so), and a command the
 * store would refuse under it must be refused at preview, not pass its
 * precheck and then throw at commit.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { installMillOSAgentRuntime } from '../adapters/runtime/installAgentRuntime';
import { captureMillOSAgentState } from '../adapters/runtime/runtimeProjection';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import { selectRestartPending, useGameSimulationStore } from '../../stores/gameSimulationStore';
import { createWorkplace } from '../../simulation/bilateralWorkplace';

const clearStop = () =>
  useGameSimulationStore.setState({
    emergencyActive: false,
    emergencyDrillMode: false,
    preEmergencyMachineStatuses: new Map(),
  });

/** A stop cleared with a running unit on record: the line awaits RESTART LINE. */
const awaitRestart = () =>
  useGameSimulationStore.setState({
    emergencyActive: false,
    emergencyDrillMode: false,
    preEmergencyMachineStatuses: new Map([['rm-101', 'running']]),
  });

beforeEach(() => {
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  clearStop();
});

function fixture() {
  const target = {} as Window;
  const remove = installMillOSAgentRuntime(target);
  const api = target.__MILLOS_AGENT__!;
  const draft = () =>
    api.draft({
      capabilityId: 'workplace.activate-plan',
      targetUri: 'millos://simulation/local',
      parameters: { revision: useWorkplaceStore.getState().workplace.revision },
      reason: 'Approve the exact current fictional team agreement.',
    });
  return { api, draft, remove };
}

function prepareCover() {
  const s = useWorkplaceStore.getState();
  s.start('game');
  s.selectPlan('cover');
  s.simulateResponses();
}

describe('the line awaiting RESTART LINE, as an agent sees it', () => {
  it('is projected with the reason, and only while a person must restart the line', () => {
    expect(captureMillOSAgentState().domains.simulation).toMatchObject({
      restartPending: false,
      restartPendingReason: null,
    });
    awaitRestart();
    expect(selectRestartPending(useGameSimulationStore.getState())).toBe(true);
    const simulation = captureMillOSAgentState().domains.simulation as Record<string, unknown>;
    expect(simulation.restartPending).toBe(true);
    expect(String(simulation.restartPendingReason)).toContain('RESTART LINE');
    expect(String(simulation.restartPendingReason)).toMatch(/no agent command/i);
  });

  it('is named in the brief', () => {
    awaitRestart();
    const { api, remove } = fixture();
    try {
      const health = (api.brief().data as { health: { exceptions: { id: string }[] } }).health;
      expect(health.exceptions.map((item) => item.id)).toContain('simulation-restart-pending');
    } finally {
      remove();
    }
  });

  it('refuses a workplace plan at preview, with the reason, rather than throwing at commit', async () => {
    prepareCover();
    awaitRestart();
    const { api, draft, remove } = fixture();
    try {
      const preview = await api.preview(draft());
      expect(preview.status).toBe('denied');
      expect(
        preview.problems.some(
          (problem) =>
            problem.code === 'PRE.WORKPLACE.LINE_RESTARTED' &&
            problem.message.includes('RESTART LINE')
        )
      ).toBe(true);
      expect(useWorkplaceStore.getState().workplace.phase).toBe('deliberating');
    } finally {
      remove();
    }
  });

  it('still previews the same plan once the line is running', async () => {
    prepareCover();
    const { api, draft, remove } = fixture();
    try {
      expect((await api.preview(draft())).status).toBe('requires-approval');
    } finally {
      remove();
    }
  });
});
