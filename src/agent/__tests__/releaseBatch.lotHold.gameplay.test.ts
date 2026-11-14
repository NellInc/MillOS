import { describe, expect, it } from 'vitest';
import { createMillOSRuntimeCommandHandlers } from '../adapters/runtime/runtimeCommandHandlers';

// Plan 1.9 left this open (carried to 3.2 and 3.4): `quality.release-batch`
// checked only the alert's named batches, so an agent could release a batch
// held because it was milled from a lot an open supplier notice names.
// Working if the preview refuses that release and still allows one whose lots
// no open alert names.
describe('agent release of a batch held through a named lot', () => {
  const inspect = (alertLots: string[]) => {
    const handler = createMillOSRuntimeCommandHandlers().find(
      (candidate) => candidate.capabilityId === 'quality.release-batch'
    )!;
    return handler.inspect(
      {
        targetUri: 'millos://batch/batch-00007',
        mode: 'simulation',
        parameters: { reason: 'Agent release' },
        reason: 'Agent release',
      } as never,
      {
        mode: 'simulation',
        domains: {
          material: {
            productionBatches: [
              {
                id: 'batch-00007',
                disposition: 'hold',
                availableKg: 400,
                sourceContributions: [{ lotId: 'lot-00003', amount: 400, path: ['silo-0'] }],
              },
            ],
          },
          quality: {
            contaminationAlerts: [
              {
                id: 'contamination-00002',
                resolved: false,
                batchIds: [],
                sourceLotIds: alertLots,
              },
            ],
          },
        },
      } as never
    );
  };

  it('refuses while an open alert names a lot the batch was milled from', async () => {
    const inspection = await inspect(['lot-00003']);
    const blocked = inspection.preconditions.filter((check) => !check.satisfied);
    expect(blocked.map((check) => check.id)).toContain('PRE.BATCH.DISPOSITION');
  });

  it('allows it when the open alert names other lots', async () => {
    const inspection = await inspect(['lot-00099']);
    expect(inspection.preconditions.every((check) => check.satisfied)).toBe(true);
  });
});
