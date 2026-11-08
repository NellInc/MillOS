import { describe, expect, it } from 'vitest';
import type { AgentDomainCapture, AgentJsonValue } from '../contracts/queryContracts';
import type { AgentDomainId } from '../contracts/systemManifest';
import {
  AGENT_LEVEL0_MAXIMUM_BYTES,
  AGENT_LEVEL1_MAXIMUM_BYTES,
  byteLength,
  createAgentQueryService,
} from '../query/queryService.js';
import { SYSTEM_REGISTRY_SOURCE } from '../registry/systemRegistrySource.js';

const OBSERVED_AT = '2026-08-31T12:00:00.000Z';

describe('MillOS agent query service', () => {
  it('answers the driver brief within the Level 0 budget with mandatory truth metadata', () => {
    const fixture = createFixture();
    const brief = fixture.service.brief();

    expect(byteLength(brief)).toBeLessThanOrEqual(AGENT_LEVEL0_MAXIMUM_BYTES);
    expect(brief.mode).toBe('simulation');
    expect(brief.build).toBe('test-build');
    expect(brief.seed).toBe('test-seed');
    expect(brief.freshness).not.toHaveLength(0);
    expect(brief.data).toMatchObject({
      authority: { observationOnly: true, commandExecution: false, externalWrites: false },
      objectives: expect.any(Array),
      health: expect.any(Object),
      criticalPath: expect.any(Object),
      evidence: expect.any(Object),
      recommendedQueries: expect.any(Array),
    });
    expect(JSON.stringify(brief)).not.toContain('rawWorld');
    expect(Object.isFrozen(brief)).toBe(true);
    expect(Object.isFrozen(brief.data)).toBe(true);
  });

  it('returns a minimal unchanged domain delta', () => {
    const fixture = createFixture();
    const full = fixture.service.query({ view: 'domain', domainId: 'production', limit: 100 });
    const productionRevision = full.domainRevisions.production;
    expect(productionRevision).toBeTypeOf('string');

    const unchanged = fixture.service.query({
      view: 'domain',
      domainId: 'production',
      sinceRevision: productionRevision,
    });

    expect(unchanged.data).toEqual({ domainId: 'production', changed: false, changes: {} });
    expect(byteLength(unchanged)).toBeLessThan(byteLength(full));
  });

  it('returns a field-level changed delta at least 80 percent smaller than the full snapshot', () => {
    const fixture = createFixture(45);
    const full = fixture.service.query({ view: 'domain', domainId: 'production', limit: 100 });
    const productionRevision = full.domainRevisions.production;
    fixture.machines[22].metrics.temperature += 1;

    const delta = fixture.service.query({
      view: 'domain',
      domainId: 'production',
      sinceRevision: productionRevision,
    });

    expect(delta.data).toMatchObject({ domainId: 'production', changed: true });
    expect(byteLength(delta) / byteLength(full)).toBeLessThanOrEqual(0.2);
  });

  it('enforces hard Level 0 and Level 1 envelope limits under oversized source strings', () => {
    const fixture = createFixture();
    const campaign = fixture.domains.campaign as {
      orders: Array<{ customer: string }>;
    };
    campaign.orders[0].customer = 'customer'.repeat(5000);
    fixture.machines[0].name = 'machine'.repeat(5000);

    const brief = fixture.service.brief();
    const domain = fixture.service.query({
      view: 'domain',
      domainId: 'production',
      limit: 100,
    });

    expect(byteLength(brief)).toBeLessThanOrEqual(AGENT_LEVEL0_MAXIMUM_BYTES);
    expect(byteLength(domain)).toBeLessThanOrEqual(AGENT_LEVEL1_MAXIMUM_BYTES);
    expect(domain.warnings.map((warning) => warning.code)).toContain('LEVEL1_TRUNCATED');
    expect(domain.data).toMatchObject({ domainId: 'production', truncated: true });
  });

  it('selects fields, paginates collections, and resolves semantic relationships', () => {
    const fixture = createFixture(8);
    const page = fixture.service.query({
      view: 'domain',
      domainId: 'production',
      fields: ['machines', 'metrics.throughput'],
      collection: 'machines',
      limit: 3,
      cursor: '3',
    });
    expect(page.data).toMatchObject({
      collection: 'machines',
      collectionFound: true,
      items: [{ id: 'rm-004' }, { id: 'rm-005' }, { id: 'rm-006' }],
      page: { returned: 3, total: 8, nextCursor: '6', truncated: true },
    });

    const entity = fixture.service.query({
      view: 'entity',
      uri: 'millos://machine/rm-001',
      fields: ['id', 'status'],
    });
    expect(entity.data).toMatchObject({
      uri: 'millos://machine/rm-001',
      ownerDomainId: 'production',
      state: { id: 'rm-001', status: 'running' },
    });

    const relationship = fixture.service.query({
      view: 'relationship',
      uri: 'millos://order/order-001',
    });
    expect(relationship.data).toMatchObject({
      uri: 'millos://order/order-001',
      ownerDomainId: 'campaign',
      relations: expect.arrayContaining([
        { predicate: 'self', target: 'millos://order/order-001' },
      ]),
    });
  });

  it('keeps capability discovery non-executable and labels causal evidence partial', () => {
    const fixture = createFixture();
    const capabilities = fixture.service.capabilities();
    // The standalone read service installs no kernel, so it must describe
    // itself as observation only even though the registry's query plane (v2)
    // declares scoped command execution for the installed runtime.
    expect(capabilities.data.authority).toMatchObject({
      observationOnly: true,
      commandExecution: false,
      externalWrites: false,
      reason: expect.stringContaining('installs no command kernel'),
    });
    expect(SYSTEM_REGISTRY_SOURCE.queryPlane.authority.commandExecution).toBe(true);
    expect(capabilities.data.items.every((item) => item.executable === false)).toBe(true);

    const trace = fixture.service.trace({ uri: 'millos://machine/rm-001' });
    expect(trace.completeness).toBe('partial');
    expect(trace.data).toMatchObject({ completeCausalChain: false });
    expect(trace.warnings.map((warning) => warning.code)).toContain('CAUSAL_CHAIN_UNAVAILABLE');
  });

  it('does not mutate source state while observing or querying it', () => {
    const fixture = createFixture();
    const before = JSON.stringify(fixture.capture());
    fixture.service.brief();
    fixture.service.query({ view: 'domain', domainId: 'campaign' });
    fixture.service.query({ view: 'entity', uri: 'millos://machine/rm-001' });
    fixture.service.trace();
    expect(JSON.stringify(fixture.capture())).toBe(before);
  });
});

function createFixture(machineCount = 12) {
  const machines = Array.from({ length: machineCount }, (_, index) => ({
    id: `rm-${String(index + 1).padStart(3, '0')}`,
    name: `Roller Mill ${index + 1}`,
    type: 'ROLLER_MILL',
    status: 'running',
    metrics: {
      rpm: 740 + index,
      temperature: 58 + index / 10,
      vibration: 1.2,
      load: 72,
      wear: 12,
      efficiency: 94,
    },
  }));
  const domains = Object.fromEntries(
    (
      [
        'simulation',
        'production',
        'material',
        'quality',
        'maintenance',
        'campaign',
        'logistics',
        'safety',
        'scada',
        'experience',
        'evidence',
      ] satisfies AgentDomainId[]
    ).map((domainId) => [domainId, {}])
  ) as Record<AgentDomainId, AgentJsonValue>;
  domains.simulation = {
    gameDay: 2,
    gameTime: 10.5,
    gameSpeed: 1,
    emergencyActive: false,
    emergencyMachineId: null,
    crisis: { active: false },
  };
  domains.production = {
    productionSpeed: 82,
    machines,
    metrics: { throughput: 1100, efficiency: 94, uptime: 98, quality: 96 },
  };
  domains.material = {
    productionBatches: [{ id: 'batch-001', availableKg: 900, disposition: 'released' }],
    manifests: [{ id: 'manifest-001', kind: 'shipping', actualKg: 500 }],
  };
  domains.quality = {
    dispatchReleased: true,
    dispatchHoldReason: null,
    contaminationAlerts: [],
  };
  domains.maintenance = { activeBreakdowns: [], workOrders: [], partsInventory: {} };
  domains.campaign = {
    activeOrderId: 'order-001',
    orders: [
      {
        id: 'order-001',
        customer: 'Test Cooperative',
        priority: 'critical',
        status: 'active',
        requiredKg: 6000,
        dueAtMinute: 240,
        recipe: { minimumQuality: 95 },
        batchIds: ['batch-001'],
        manifestIds: ['manifest-001'],
      },
    ],
    incidents: [],
    constraints: [],
    execution: { stage: 'milling', lineSetpointPercent: 82 },
  };
  domains.logistics = {
    receiving: { lifecyclePhase: 'approaching' },
    shipping: { lifecyclePhase: 'docked' },
  };
  domains.safety = { forkliftEmergencyStop: false, safetyMetrics: {}, safetyIncidents: [] };
  domains.scada = { externalObservationClaimed: false, connectionVerified: false };
  domains.experience = { operationalProjectionOnly: true };
  domains.evidence = {
    replayFrameCount: 4,
    decisionHistoryCount: 1,
    commands: [
      {
        timestamp: 1,
        category: 'control',
        action: 'observe',
        targetId: 'rm-001',
        targetUri: 'millos://machine/rm-001',
      },
    ],
  };

  const capture = (): AgentDomainCapture => ({
    domains,
    simulationTime: { day: 2, hour: 10.5 },
    mode: 'simulation',
    build: 'test-build',
    seed: 'test-seed',
    completeness: 'complete',
    freshness: [
      { source: 'fixture', observedAt: OBSERVED_AT, staleAfterMs: 1000, quality: 'good' },
    ],
    warnings: [],
  });

  return {
    machines,
    domains,
    capture,
    service: createAgentQueryService({
      registry: SYSTEM_REGISTRY_SOURCE,
      capture,
      now: () => new Date(OBSERVED_AT),
    }),
  };
}

describe('trace capture completeness', () => {
  it('preserves degraded capture through ordinary and overflowing observation budgets', () => {
    for (const oversized of [false, true]) {
      const fixture = createFixture();
      if (oversized) {
        fixture.domains.evidence = {
          commands: [{ action: 'x'.repeat(20000), targetUri: 'millos://machine/rm-001' }],
        };
      }
      const service = createAgentQueryService({
        registry: SYSTEM_REGISTRY_SOURCE,
        capture: () => ({ ...fixture.capture(), completeness: 'degraded' }),
        now: () => new Date(OBSERVED_AT),
      });
      const trace = service.trace();
      expect(trace.completeness).toBe('degraded');
      expect(byteLength(trace)).toBeLessThanOrEqual(AGENT_LEVEL1_MAXIMUM_BYTES);
      expect(trace.warnings.map((warning) => warning.code)).toContain(
        oversized ? 'LEVEL1_TRUNCATED' : 'CAUSAL_CHAIN_UNAVAILABLE'
      );
    }
  });
});
