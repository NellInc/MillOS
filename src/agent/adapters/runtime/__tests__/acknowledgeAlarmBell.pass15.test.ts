import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../../../stores/uiStore';
import { createMillOSRuntimeCommandHandlers } from '../runtimeCommandHandlers';
import type { AgentCommandHandler } from '../../../command/commandKernel';

/**
 * The agent's scada.acknowledge-alarm on an alarm that had returned to normal
 * archives it, and the store.ts bell bridge reads only the ACKED state back,
 * so the bell row stayed unread and the badge stayed raised (the panel path
 * was fixed in useSCADA.ts). Working if the agent acknowledgement also
 * acknowledges that alarm's bell row, and a refused one leaves it.
 */
const mocks = vi.hoisted(() => ({ acknowledge: vi.fn(() => true) }));
vi.mock('../../../../scada/SCADAService', () => ({
  getSCADAService: () => ({ acknowledgeAlarm: mocks.acknowledge }),
  peekSCADAService: () => null,
}));

const handler = (): AgentCommandHandler =>
  createMillOSRuntimeCommandHandlers().find(
    (candidate) => candidate.capabilityId === 'scada.acknowledge-alarm'
  )!;

const command = (alarmId: string) =>
  ({
    targetUri: `millos://alarm/${encodeURIComponent(alarmId)}`,
    actorUri: 'millos://agent/test',
    reason: 'test',
    parameters: {},
  }) as unknown as Parameters<AgentCommandHandler['execute']>[0];

const bellRow = (id: string) => ({
  id: `scada-${id}`,
  type: 'warning' as const,
  title: 'Returned',
  message: 'Returned to normal; acknowledge to clear.',
  timestamp: new Date(),
  acknowledged: false,
});

describe('agent acknowledgement of a returned alarm', () => {
  beforeEach(() => {
    mocks.acknowledge.mockReset();
    useUIStore.setState({ alerts: [bellRow('TT-101-HI'), bellRow('PT-201-HI')] });
  });

  it('acknowledges its bell row and no other', () => {
    mocks.acknowledge.mockReturnValue(true);
    handler().execute(command('TT-101-HI'));
    const rows = useUIStore.getState().alerts;
    expect(rows.find((row) => row.id === 'scada-TT-101-HI')?.acknowledged).toBe(true);
    expect(rows.find((row) => row.id === 'scada-PT-201-HI')?.acknowledged).toBe(false);
  });

  it('leaves the bell row when the service refuses', () => {
    mocks.acknowledge.mockReturnValue(false);
    handler().execute(command('TT-101-HI'));
    expect(
      useUIStore.getState().alerts.find((row) => row.id === 'scada-TT-101-HI')?.acknowledged
    ).toBe(false);
  });
});
