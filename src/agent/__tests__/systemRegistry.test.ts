import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalStringify, validateSystemRegistry } from '../contracts/registryValidation.js';
import { parseSemanticUri } from '../ontology/semanticUri.js';
import { SYSTEM_REGISTRY_SOURCE } from '../registry/systemRegistrySource.js';

describe('MillOS agent system registry', () => {
  it('validates the canonical source with unique, resolvable contract IDs', () => {
    expect(validateSystemRegistry(SYSTEM_REGISTRY_SOURCE)).toEqual({ valid: true, problems: [] });

    expect(new Set(SYSTEM_REGISTRY_SOURCE.domains.map((domain) => domain.id)).size).toBe(
      SYSTEM_REGISTRY_SOURCE.domains.length
    );
    expect(new Set(SYSTEM_REGISTRY_SOURCE.invariants.map((invariant) => invariant.id)).size).toBe(
      SYSTEM_REGISTRY_SOURCE.invariants.length
    );
    expect(
      new Set(SYSTEM_REGISTRY_SOURCE.capabilities.map((capability) => capability.id)).size
    ).toBe(SYSTEM_REGISTRY_SOURCE.capabilities.length);

    for (const entity of SYSTEM_REGISTRY_SOURCE.entities) {
      expect(parseSemanticUri(entity.uri)).toMatchObject({
        kind: entity.kind,
        localId: entity.currentId,
      });
    }
  });

  it('maps every source reference to a current repository path', () => {
    const descriptors = [
      ...SYSTEM_REGISTRY_SOURCE.domains,
      ...SYSTEM_REGISTRY_SOURCE.invariants,
      ...SYSTEM_REGISTRY_SOURCE.entities,
      ...SYSTEM_REGISTRY_SOURCE.capabilities,
    ];

    for (const descriptor of descriptors) {
      for (const sourceRef of descriptor.sourceRefs) {
        expect(existsSync(resolve(process.cwd(), sourceRef.path)), sourceRef.path).toBe(true);
      }
    }
  });

  it('registers every implemented capability with exactly one write owner and a runtime handler', () => {
    const expected = new Map([
      ['operations.activate-order', 'campaign'],
      ['incident.acknowledge', 'campaign'],
      ['incident.mitigate', 'campaign'],
      ['ai.respond-to-decision', 'production'],
      ['maintenance.request-repair', 'maintenance'],
      ['maintenance.request-restart', 'maintenance'],
      ['quality.hold-batch', 'material'],
      ['quality.release-batch', 'material'],
      ['dispatch.release', 'logistics'],
      ['simulation.set-speed', 'simulation'],
      ['simulation.start-fire-drill', 'simulation'],
      ['scada.acknowledge-alarm', 'scada'],
      ['scada.write-setpoint', 'scada'],
    ]);

    expect(SYSTEM_REGISTRY_SOURCE.capabilities.map((capability) => capability.id).sort()).toEqual(
      [...expected.keys()].sort()
    );
    for (const capability of SYSTEM_REGISTRY_SOURCE.capabilities) {
      expect(capability.status).toBe('implemented');
      expect(capability.modes).not.toContain('live');
      expect(capability.ownerDomainId).toBe(expected.get(capability.id));
      expect(capability.writes.length).toBeGreaterThan(0);
      expect(
        capability.writes.every((field) => field.startsWith(`${capability.ownerDomainId}.`))
      ).toBe(true);
      expect(
        capability.sourceRefs.some(
          (ref) =>
            ref.kind === 'runtime' &&
            ref.path === 'src/agent/adapters/runtime/runtimeCommandHandlers.ts'
        )
      ).toBe(true);
    }
  });

  it('reports duplicate IDs and cross-owner writes deterministically', () => {
    const invalid = structuredClone(SYSTEM_REGISTRY_SOURCE);
    invalid.domains.push(structuredClone(invalid.domains[0]));
    invalid.capabilities[0].writes.push('production.productionSpeed');

    const first = validateSystemRegistry(invalid);
    const second = validateSystemRegistry(invalid);
    expect(first).toEqual(second);
    expect(first.valid).toBe(false);
    expect(first.problems.map((problem) => problem.code)).toEqual(
      expect.arrayContaining(['CAPABILITY_WRITE_OWNER', 'DOMAIN_ID_DUPLICATE'])
    );
  });

  it('rejects untyped enum drift at the runtime validation boundary', () => {
    const invalid = structuredClone(SYSTEM_REGISTRY_SOURCE) as unknown as {
      domains: Array<{ status: string }>;
      invariants: Array<{ family: string }>;
      capabilities: Array<{ risk: string; targetKinds: string[] }>;
    };
    invalid.domains[0].status = 'trusted-by-default';
    invalid.invariants[0].family = 'convenient';
    invalid.capabilities[0].risk = 'harmless';
    invalid.capabilities[0].targetKinds = ['everything'];

    const codes = validateSystemRegistry(invalid).problems.map((problem) => problem.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'CAPABILITY_RISK',
        'CAPABILITY_TARGET_KIND',
        'DOMAIN_STATUS',
        'INVARIANT_FAMILY',
      ])
    );
  });

  it('serializes object keys canonically without reordering authored arrays', () => {
    expect(canonicalStringify({ z: 1, a: { d: 2, b: 3 }, list: ['z', 'a'] })).toBe(
      '{"a":{"b":3,"d":2},"list":["z","a"],"z":1}'
    );
  });

  it('keeps generated artifacts current with the executable source', () => {
    // build/generated/ is gitignored, so a fresh checkout (CI) has no manifest
    // yet. Generate it on demand; when one already exists the assertions below
    // still catch a stale copy that predates a registry edit.
    const manifestPath = resolve(process.cwd(), 'build/generated/agent/system-manifest.json');
    if (!existsSync(manifestPath)) {
      execFileSync(
        process.execPath,
        [resolve(process.cwd(), 'scripts/generate-agent-manifest.mjs')],
        {
          stdio: 'ignore',
        }
      );
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.product).toEqual(SYSTEM_REGISTRY_SOURCE.product);
    expect(manifest.capabilities).toEqual(SYSTEM_REGISTRY_SOURCE.capabilities);
    expect(manifest.queryPlane).toEqual({
      version: 2,
      level0MaximumBytes: 4096,
      level1MaximumBytes: 12288,
      maximumPageSize: 100,
      snapshotHistorySize: 16,
      runtimeMethods: [
        'brief',
        'query',
        'capabilities',
        'trace',
        'legalOptions',
        'draft',
        'preview',
        'approve',
        'commit',
        'actors',
        'grants',
        'policy',
        'revokeGrant',
        'object',
        'resolveObjection',
        'evidence',
        'importEvidence',
        'promoteLesson',
      ],
      authority: {
        observationOnly: false,
        commandExecution: true,
        externalWrites: false,
      },
    });
    expect(manifest.generation.sourceFingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('rejects query-plane authority or budget drift', () => {
    const invalid = structuredClone(SYSTEM_REGISTRY_SOURCE) as unknown as {
      queryPlane: {
        level0MaximumBytes: number;
        authority: { commandExecution: boolean };
      };
    };
    invalid.queryPlane.level0MaximumBytes = 0;
    // v2 declares scoped command execution; quietly reverting to observation
    // only is drift in the same way that enabling external writes would be.
    invalid.queryPlane.authority.commandExecution = false;

    expect(validateSystemRegistry(invalid).problems.map((problem) => problem.code)).toEqual(
      expect.arrayContaining(['QUERY_AUTHORITY_BOUNDARY', 'QUERY_BOUND'])
    );
  });
});
