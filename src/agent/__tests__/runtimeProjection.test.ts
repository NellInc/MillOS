import { describe, expect, it, vi } from 'vitest';
import { captureMillOSAgentState } from '../adapters/runtime/runtimeProjection';
import { installMillOSAgentRuntime } from '../adapters/runtime/installAgentRuntime';
import { AGENT_LEVEL0_MAXIMUM_BYTES, byteLength } from '../query/queryService.js';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useProductionStore } from '../../stores/productionStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';

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
      expect(capture.domains.experience).toMatchObject({
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
          executableCapabilityCount: 14,
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

  // A day of play ends with 24 orders (programme 136 in the play-test), past the
  // Level 1 byte budget; the live run crossed it at 21. A whole-domain read then
  // keeps the FIRST five of every array - the five oldest orders - and says so.
  // The 9115ad52 pt-BR play-test read that view and froze an order it could no
  // longer see as "active 5,000/6,000". Paging the orders collection is the
  // read that sees every order, the open one included.
  it('pages every campaign order once a day of programmes outgrows the Level 1 read', () => {
    const campaign = useOperationsCampaignStore.getState();
    campaign.resetCampaign();
    const fulfilAll = () =>
      useOperationsCampaignStore.setState((state) => ({
        orders: state.orders.map((order, index) => ({
          ...order,
          status: 'fulfilled' as const,
          shippedKg: order.requiredKg,
          completedAtMinute: 100 + index,
          // A packed batch per tonne and a 5,000 kg truck per manifest.
          batchIds: Array.from(
            { length: Math.ceil(order.requiredKg / 1000) },
            (_, batch) => `batch-${String(index * 10 + batch).padStart(5, '0')}`
          ),
          manifestIds: Array.from(
            { length: Math.ceil(order.requiredKg / 5000) },
            (_, truck) => `shipping-${String(index * 2 + truck).padStart(4, '0')}`
          ),
        })),
      }));
    for (let programme = 0; programme < 7; programme++) {
      fulfilAll();
      expect(useOperationsCampaignStore.getState().acceptNextProgramme()).toBe(true);
    }
    const orders = useOperationsCampaignStore.getState().orders;
    expect(orders).toHaveLength(24);
    const open = orders.filter((order) => order.status !== 'fulfilled').map((order) => order.id);
    expect(open).toHaveLength(3);

    const remove = installMillOSAgentRuntime(window);
    try {
      const agent = window.__MILLOS_AGENT__!;
      const whole = agent.query({
        view: 'domain',
        domainId: 'campaign',
        fields: ['elapsedMinutes', 'activeOrderId', 'orders', 'incidents', 'currentShiftLabel'],
      });
      expect(whole.warnings.map((warning) => warning.code)).toContain('LEVEL1_TRUNCATED');
      const wholeOrders = (whole.data as { state: { orders: Array<{ id: string }> } }).state.orders;
      expect(wholeOrders.map((order) => order.id)).toEqual(orders.slice(0, 5).map((o) => o.id));

      const paged: Array<{ id: string; status: string }> = [];
      let cursor: string | undefined;
      for (let guard = 0; guard < 20; guard++) {
        const page = agent.query({
          view: 'domain',
          domainId: 'campaign',
          collection: 'orders',
          limit: 4,
          cursor,
        });
        expect(page.warnings.map((warning) => warning.code)).not.toContain('LEVEL1_TRUNCATED');
        const data = page.data as {
          items: Array<{ id: string; status: string }>;
          page: { nextCursor: string | null; total: number };
        };
        paged.push(...data.items);
        expect(data.page.total).toBe(24);
        if (!data.page.nextCursor) break;
        cursor = data.page.nextCursor;
      }
      expect(paged.map((order) => order.id)).toEqual(orders.map((order) => order.id));
      expect(paged.filter((order) => order.status !== 'fulfilled').map((o) => o.id)).toEqual(open);
    } finally {
      remove();
      useOperationsCampaignStore.getState().resetCampaign();
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
