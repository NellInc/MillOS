import { describe, expect, it } from 'vitest';
import { createMillOSRuntimeCommandHandlers } from '../adapters/runtime/runtimeCommandHandlers';

// The store refuses to mitigate an incident that is already mitigated, but the
// agent's preview allowed any phase short of resolved: the command ran, changed
// nothing, and its verification ("Incident phase is mitigated") passed anyway,
// so the receipt read verified and spent a command on the grant.
// Working if the preview refuses an already-mitigated incident.
describe('agent mitigation of an already-mitigated incident', () => {
  const inspect = (phase: string) => {
    const handler = createMillOSRuntimeCommandHandlers().find(
      (candidate) => candidate.capabilityId === 'incident.mitigate'
    )!;
    return handler.inspect(
      { targetUri: 'millos://incident/incident-9', mode: 'simulation' } as never,
      {
        mode: 'simulation',
        domains: { campaign: { incidents: [{ id: 'incident-9', phase }] } },
      } as never
    );
  };

  it('fails the phase precondition', async () => {
    const inspection = await inspect('mitigated');
    const blocked = inspection.preconditions.filter((check) => !check.satisfied);
    expect(blocked.map((check) => check.id)).toContain('PRE.INCIDENT.PHASE');
  });

  it('still allows a raised or acknowledged incident', async () => {
    for (const phase of ['raised', 'acknowledged']) {
      const inspection = await inspect(phase);
      expect(inspection.preconditions.every((check) => check.satisfied)).toBe(true);
    }
  });
});
