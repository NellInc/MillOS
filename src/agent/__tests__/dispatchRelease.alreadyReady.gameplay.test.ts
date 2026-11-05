import { describe, expect, it } from 'vitest';
import { createMillOSRuntimeCommandHandlers } from '../adapters/runtime/runtimeCommandHandlers';

// The truck bay marks the shipping transfer ready itself once a docked truck
// can be served, and the cockpit always offers the release. Released again,
// the command changed nothing, its verification ("Shipping transfer is ready")
// passed on the state it already had, and the receipt read verified while
// spending a command.
// Working if the preview refuses a transfer that is already released.
describe('agent dispatch release of a transfer already released', () => {
  const inspect = (transferReady: boolean) => {
    const handler = createMillOSRuntimeCommandHandlers().find(
      (candidate) => candidate.capabilityId === 'dispatch.release'
    )!;
    return handler.inspect(
      { targetUri: 'millos://dispatch/shipping', mode: 'simulation' } as never,
      {
        mode: 'simulation',
        domains: {
          logistics: { shipping: { truckDocked: true, transferReady } },
          quality: { dispatchReleased: true, dispatchHoldReason: null },
        },
      } as never
    );
  };

  it('fails a precondition when the transfer is already ready', async () => {
    const inspection = await inspect(true);
    const blocked = inspection.preconditions.filter((check) => !check.satisfied);
    expect(blocked.map((check) => check.id)).toContain('PRE.DISPATCH.NOT_RELEASED');
  });

  it('still allows releasing a docked truck that is not yet ready', async () => {
    const inspection = await inspect(false);
    expect(inspection.preconditions.every((check) => check.satisfied)).toBe(true);
  });
});
