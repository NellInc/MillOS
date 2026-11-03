import { afterEach, describe, expect, it } from 'vitest';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { createMillOSRuntimeCommandHandlers } from '../adapters/runtime/runtimeCommandHandlers';

// The store refuses to mitigate a recovery challenge's incident before it is
// acknowledged, but the agent's preview allowed any unresolved phase: the
// command ran, changed nothing and reported a failed verification. Working if
// the preview refuses with a precondition, as order activation does.
describe('agent mitigation of a recovery challenge incident', () => {
  afterEach(() => useOperationsCampaignStore.setState({ activeChallenge: null }));

  const inspect = (phase: string) => {
    const handler = createMillOSRuntimeCommandHandlers().find(
      (candidate) => candidate.capabilityId === 'incident.mitigate'
    )!;
    useOperationsCampaignStore.setState({
      activeChallenge: { incidentId: 'incident-7' } as never,
    });
    return handler.inspect(
      { targetUri: 'millos://incident/incident-7', mode: 'simulation' } as never,
      {
        mode: 'simulation',
        domains: { campaign: { incidents: [{ id: 'incident-7', phase }] } },
      } as never
    );
  };

  it('fails a precondition while the challenge incident is still raised', async () => {
    const inspection = await inspect('raised');
    const blocked = inspection.preconditions.filter((check) => !check.satisfied);
    expect(blocked.map((check) => check.id)).toContain('PRE.INCIDENT.CHALLENGE_ACKNOWLEDGED');
  });

  it('allows it once the challenge incident is acknowledged', async () => {
    const inspection = await inspect('acknowledged');
    expect(inspection.preconditions.every((check) => check.satisfied)).toBe(true);
  });
});
