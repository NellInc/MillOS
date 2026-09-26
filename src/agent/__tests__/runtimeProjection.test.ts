import { describe, expect, it, vi } from 'vitest';
import { captureMillOSAgentState } from '../adapters/runtime/runtimeProjection';
import { installMillOSAgentRuntime } from '../adapters/runtime/installAgentRuntime';
import { AGENT_LEVEL0_MAXIMUM_BYTES, byteLength } from '../query/queryService.js';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useProductionStore } from '../../stores/productionStore';

describe('MillOS runtime agent projection', () => {
  it('reads canonical stores without publishing a store mutation', () => {
    const simulationListener = vi.fn();
    const productionListener = vi.fn();
    const unsubscribeSimulation = useGameSimulationStore.subscribe(simulationListener);
    const unsubscribeProduction = useProductionStore.subscribe(productionListener);

    try {
      const capture = captureMillOSAgentState(new Date('2026-08-31T12:00:00.000Z'));
      expect(capture.mode).toMatch(/^(simulation|replay)$/);
      expect(capture.freshness).not.toHaveLength(0);
      expect(capture.domains.production).toMatchObject({ machines: expect.any(Array) });
      expect(capture.domains.experience).toEqual({
        operationalProjectionOnly: true,
        cosmeticStateExcludedFromRevision: true,
        frameTelemetryExcludedFromRevision: true,
        legacyRuntimeTelemetryPreserved: true,
      });
      const projectedProduction = capture.domains.production as {
        machines: Array<{ status: string }>;
      };
      const sourceStatus = useProductionStore.getState().machines[0]?.status;
      if (projectedProduction.machines[0]) projectedProduction.machines[0].status = 'critical';
      expect(useProductionStore.getState().machines[0]?.status).toBe(sourceStatus);
      expect(simulationListener).not.toHaveBeenCalled();
      expect(productionListener).not.toHaveBeenCalled();
    } finally {
      unsubscribeSimulation();
      unsubscribeProduction();
    }
  });

  it('installs a versioned non-writable browser observation surface and removes it cleanly', () => {
    const legacyBefore = window.__MILLOS_RUNTIME__;
    const remove = installMillOSAgentRuntime(window);
    try {
      expect(window.__MILLOS_AGENT__?.version).toBe(2);
      expect(Object.getOwnPropertyDescriptor(window, '__MILLOS_AGENT__')).toMatchObject({
        configurable: true,
        enumerable: false,
        writable: false,
      });
      const brief = window.__MILLOS_AGENT__?.brief();
      expect(brief).toMatchObject({
        schemaVersion: 1,
        mode: expect.stringMatching(/^(simulation|replay)$/),
        freshness: expect.any(Array),
      });
      // The installed surface can execute scoped simulation commands, so its
      // brief must not describe itself as observation only.
      expect(brief?.data).toMatchObject({
        authority: {
          observationOnly: false,
          commandExecution: true,
          externalWrites: false,
          grantCount: expect.any(Number),
          executableCapabilityCount: 13,
        },
      });
      expect(byteLength(brief)).toBeLessThanOrEqual(AGENT_LEVEL0_MAXIMUM_BYTES);
      expect(window.__MILLOS_AGENT__?.capabilities().data.authority).toMatchObject({
        observationOnly: false,
        commandExecution: true,
        externalWrites: false,
      });
      expect(window.__MILLOS_RUNTIME__).toBe(legacyBefore);
    } finally {
      remove();
    }
    expect(window.__MILLOS_AGENT__).toBeUndefined();
    expect(window.__MILLOS_RUNTIME__).toBe(legacyBefore);
  });

  it('lists legal options from live stores without writing evidence', async () => {
    const remove = installMillOSAgentRuntime(window);
    try {
      const agent = window.__MILLOS_AGENT__;
      const eventsBefore = agent?.evidence().events.length;
      const set = await agent?.legalOptions({ targetUri: 'millos://simulation/local' });
      expect(agent?.evidence().events.length).toBe(eventsBefore);
      if (set?.mode === 'simulation') {
        expect(set.options).toContainEqual(
          expect.objectContaining({
            optionId: 'simulation.start-fire-drill',
            approvalRequired: true,
          })
        );
        expect(set.needsInput).toContainEqual({
          capabilityId: 'simulation.set-speed',
          parameters: ['speed'],
        });
      }
    } finally {
      remove();
    }
  });

  // Runs last: the composition deliberately outlives an install, so the
  // revocation below persists on this window for the rest of the file.
  it('reuses one composed agent plane across re-installs so a revocation survives', () => {
    const removeFirst = installMillOSAgentRuntime(window);
    const first = window.__MILLOS_AGENT__;
    const grantId = first?.grants().find((grant) => !grant.revokedAt)?.id;
    expect(grantId).toBeDefined();
    expect(first?.revokeGrant(String(grantId), 'Operator withdrew the agent grant.')).toBe(true);
    removeFirst();
    expect(window.__MILLOS_AGENT__).toBeUndefined();

    // A camera-controls change re-runs the installing effect.
    const removeSecond = installMillOSAgentRuntime(window);
    try {
      expect(window.__MILLOS_AGENT__).toBe(first);
      expect(
        window.__MILLOS_AGENT__?.grants().find((grant) => grant.id === grantId)?.revokedAt
      ).toBeTruthy();
    } finally {
      removeSecond();
    }
  });
});
