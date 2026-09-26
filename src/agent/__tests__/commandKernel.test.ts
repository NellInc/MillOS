import { describe, expect, it } from 'vitest';
import {
  AgentAuthorityEngine,
  createDefaultActors,
  createDefaultGrants,
  createDefaultPolicy,
} from '../command/authority';
import { AgentCausalLedger } from '../command/causalLedger';
import { createAgentCommandKernel, type AgentCommandHandler } from '../command/commandKernel';
import type { AgentCommandEnvelope } from '../contracts/commandContracts';
import type { AgentDomainCapture, AgentJsonValue } from '../contracts/queryContracts';
import type { AgentDomainId } from '../contracts/systemManifest';
import { SYSTEM_REGISTRY_SOURCE } from '../registry/systemRegistrySource.js';

const DOMAIN_IDS: AgentDomainId[] = [
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
];

describe('agent command kernel', () => {
  it('previews, executes, verifies, and deduplicates activation without a second mutation', async () => {
    const fixture = createFixture();
    const command = fixture.kernel.draft({
      capabilityId: 'operations.activate-order',
      targetUri: 'millos://order/order-001',
      parameters: { orderUri: 'millos://order/order-001' },
      reason: 'Run the highest priority order.',
      idempotencyKey: 'activate-order-001',
    });

    const preview = await fixture.kernel.preview(command);
    expect(preview.status).toBe('ready');
    expect(preview.effects).toContain('Activate order-001.');

    const receipt = await fixture.kernel.commit(preview);
    expect(receipt.status).toBe('verified');
    expect(receipt.changedDomains).toEqual(['campaign']);
    expect(fixture.state.activationCount).toBe(1);

    const duplicate = await fixture.kernel.commit(preview);
    expect(duplicate.status).toBe('duplicate');
    expect(duplicate.duplicateOfReceiptId).toBe(receipt.receiptId);
    expect(fixture.state.activationCount).toBe(1);
    expect(
      fixture.ledger.trace({ correlationId: command.commandId }).records.map((event) => event.kind)
    ).toEqual(['command.previewed', 'command.verified']);
  });

  it.each([
    [
      'stale revision',
      (command: AgentCommandEnvelope, fixture: Fixture) => {
        fixture.state.orders.push({ id: 'order-002', status: 'planned' });
        return command;
      },
      'STALE_REVISION',
    ],
    [
      'missing grant',
      (command: AgentCommandEnvelope) => ({ ...command, grantId: 'grant.missing' }),
      'AUTHORITY_DENIED',
    ],
    [
      'wrong mode',
      (command: AgentCommandEnvelope) => ({ ...command, mode: 'live-external' as const }),
      'MODE_MISMATCH',
    ],
    [
      'mismatched target parameter',
      (command: AgentCommandEnvelope) => ({
        ...command,
        parameters: { orderUri: 'millos://order/order-999' },
      }),
      'TARGET_PARAMETER_MISMATCH',
    ],
    [
      // Handlers resolve targets through parseSemanticUri, which throws on a
      // non-canonical id; preview must deny rather than reject.
      'non-canonical target',
      (command: AgentCommandEnvelope) => ({
        ...command,
        targetUri: 'millos://order/order 001',
        parameters: { orderUri: 'millos://order/order 001' },
      }),
      'TARGET_URI_INVALID',
    ],
    [
      'target of the wrong kind',
      (command: AgentCommandEnvelope) => ({
        ...command,
        targetUri: 'millos://incident/incident-001',
        parameters: { orderUri: 'millos://incident/incident-001' },
      }),
      'TARGET_URI_INVALID',
    ],
  ])('denies %s before execution', async (_label, alter, code) => {
    const fixture = createFixture();
    const drafted = fixture.kernel.draft({
      capabilityId: 'operations.activate-order',
      targetUri: 'millos://order/order-001',
      parameters: { orderUri: 'millos://order/order-001' },
      reason: 'Exercise the rejection path.',
    });
    const command = alter(drafted, fixture) as AgentCommandEnvelope;

    const preview = await fixture.kernel.preview(command);
    expect(preview.status).toBe('denied');
    expect(preview.problems.map((problem) => problem.code)).toContain(code);
    const receipt = await fixture.kernel.commit(preview);
    expect(receipt.status).toBe('rejected');
    expect(fixture.state.activationCount).toBe(0);
  });

  it('denies an unknown order through executable preconditions', async () => {
    const fixture = createFixture();
    const command = fixture.kernel.draft({
      capabilityId: 'operations.activate-order',
      targetUri: 'millos://order/order-404',
      parameters: { orderUri: 'millos://order/order-404' },
      reason: 'Check target existence.',
    });
    const preview = await fixture.kernel.preview(command);
    expect(preview.status).toBe('denied');
    expect(preview.problems.map((problem) => problem.code)).toContain('PRE.ORDER.EXISTS');
  });

  it('binds high-risk approval to the exact preview, revision, and material parameters', async () => {
    const fixture = createFixture();
    const command = fixture.kernel.draft({
      capabilityId: 'incident.mitigate',
      targetUri: 'millos://incident/incident-001',
      parameters: { incidentUri: 'millos://incident/incident-001' },
      reason: 'Mitigate the active incident.',
    });
    const preview = await fixture.kernel.preview(command);
    expect(preview.status).toBe('requires-approval');

    const withoutApproval = await fixture.kernel.commit(preview);
    expect(withoutApproval.status).toBe('rejected');
    expect(withoutApproval.problems.map((problem) => problem.code)).toContain('APPROVAL_REQUIRED');

    const approval = fixture.kernel.approve(
      preview.previewId,
      'Human reviewed the current effect and invariant set.'
    );
    const tampered = {
      ...preview,
      command: { ...preview.command, reason: 'Changed after approval.' },
    };
    const rejected = await fixture.kernel.commit(tampered, approval);
    expect(rejected.status).toBe('rejected');
    expect(rejected.problems.map((problem) => problem.code)).toContain('PREVIEW_COMMAND_MISMATCH');
    expect(fixture.state.mitigationCount).toBe(0);

    const receipt = await fixture.kernel.commit(preview, approval);
    expect(receipt.status).toBe('verified');
    expect(fixture.state.mitigationCount).toBe(1);
  });

  it('applies revocation and active objections immediately without widening another grant', async () => {
    const fixture = createFixture();
    const first = fixture.kernel.draft({
      capabilityId: 'operations.activate-order',
      targetUri: 'millos://order/order-001',
      parameters: { orderUri: 'millos://order/order-001' },
      reason: 'Preview before an objection.',
    });
    expect((await fixture.kernel.preview(first)).status).toBe('ready');

    const objection = fixture.authority.object(
      ['operations.activate-order'],
      'Pause order changes while priorities are being reconciled.',
      'pause',
      ['simulation']
    );
    const objected = await fixture.kernel.preview(
      fixture.kernel.draft({
        capabilityId: 'operations.activate-order',
        targetUri: 'millos://order/order-001',
        parameters: { orderUri: 'millos://order/order-001' },
        reason: 'Observe the active objection.',
      })
    );
    expect(objected.status).toBe('denied');
    expect(objected.authority.reasons.join(' ')).toContain('Active objection');
    expect(fixture.authority.resolveObjection(objection.id, 'Priorities reconciled.')).toBe(true);

    expect(
      fixture.authority.revoke('grant.agent-driver.simulation.v1', 'Session authority withdrawn.')
    ).toBe(true);
    const revoked = await fixture.kernel.preview(
      fixture.kernel.draft({
        capabilityId: 'operations.activate-order',
        targetUri: 'millos://order/order-001',
        parameters: { orderUri: 'millos://order/order-001' },
        reason: 'Observe immediate revocation.',
      })
    );
    expect(revoked.status).toBe('denied');
    expect(revoked.authority.reasons.join(' ')).toContain('revoked');
  });
});

type Fixture = ReturnType<typeof createFixture>;

function createFixture() {
  const state = {
    orders: [{ id: 'order-001', status: 'planned' }],
    incidents: [{ id: 'incident-001', phase: 'raised' }],
    activeOrderId: null as string | null,
    activationCount: 0,
    mitigationCount: 0,
    elapsedMinutes: 0,
  };
  let id = 0;
  const now = () => new Date('2026-08-31T12:00:00.000Z');
  const capture = (): AgentDomainCapture => ({
    domains: Object.fromEntries(
      DOMAIN_IDS.map((domainId) => [
        domainId,
        domainId === 'campaign'
          ? json({
              orders: state.orders,
              incidents: state.incidents,
              activeOrderId: state.activeOrderId,
              elapsedMinutes: state.elapsedMinutes,
            })
          : json({ domainId }),
      ])
    ) as Record<AgentDomainId, AgentJsonValue>,
    simulationTime: { day: 1, hour: 12 },
    mode: 'simulation',
    build: 'test',
    seed: 'test-seed',
    completeness: 'complete',
    freshness: [],
    warnings: [],
  });
  const handlers: AgentCommandHandler[] = [
    {
      capabilityId: 'operations.activate-order',
      allowedDomains: ['campaign'],
      inspect: (command) => {
        const id = command.targetUri.split('/').at(-1);
        const exists = state.orders.some((order) => order.id === id);
        return {
          effects: [`Activate ${id}.`],
          uncertainties: [],
          preconditions: [
            { id: 'PRE.ORDER.EXISTS', satisfied: exists, detail: 'Order must exist.' },
          ],
          invariants: [
            { id: 'INV.RESOURCE.BOUNDED', satisfied: true, detail: 'Fixture is bounded.' },
          ],
        };
      },
      execute: (command) => {
        state.activeOrderId = command.targetUri.split('/').at(-1) ?? null;
        state.orders = state.orders.map((order) => ({
          ...order,
          status: order.id === state.activeOrderId ? 'active' : 'planned',
        }));
        state.activationCount += 1;
        return { changed: true };
      },
      verify: () => [
        {
          id: 'VERIFY.ORDER',
          passed: state.activeOrderId === 'order-001',
          detail: 'Order is active.',
        },
      ],
    },
    {
      capabilityId: 'incident.mitigate',
      allowedDomains: ['campaign'],
      inspect: () => ({
        effects: ['Mitigate incident-001.'],
        uncertainties: [],
        preconditions: [{ id: 'PRE.INCIDENT.EXISTS', satisfied: true, detail: 'Incident exists.' }],
        invariants: [
          { id: 'INV.SAFETY.EMERGENCY_DOMINANCE', satisfied: true, detail: 'No emergency.' },
        ],
      }),
      execute: () => {
        state.incidents[0].phase = 'mitigated';
        state.mitigationCount += 1;
        return { changed: true };
      },
      verify: () => [
        {
          id: 'VERIFY.INCIDENT',
          passed: state.incidents[0].phase === 'mitigated',
          detail: 'Incident mitigated.',
        },
      ],
    },
  ];
  const authority = new AgentAuthorityEngine({
    actors: createDefaultActors(),
    grants: createDefaultGrants(now()),
    policy: createDefaultPolicy(),
    now,
  });
  const ledger = new AgentCausalLedger({ now });
  return {
    state,
    authority,
    ledger,
    kernel: createAgentCommandKernel({
      registry: SYSTEM_REGISTRY_SOURCE,
      capture,
      handlers,
      authority,
      ledger,
      now,
      idFactory: () => String(++id).padStart(4, '0'),
    }),
  };
}

function json(value: unknown): AgentJsonValue {
  return JSON.parse(JSON.stringify(value)) as AgentJsonValue;
}

describe('agent command kernel regressions', () => {
  it('executes a command once when two commits race on the same idempotency key', async () => {
    const fixture = createFixture();
    const command = fixture.kernel.draft({
      capabilityId: 'operations.activate-order',
      targetUri: 'millos://order/order-001',
      parameters: { orderUri: 'millos://order/order-001' },
      reason: 'Race two commits.',
      idempotencyKey: 'race-001',
    });
    const preview = await fixture.kernel.preview(command);
    const [first, second] = await Promise.all([
      fixture.kernel.commit(preview),
      fixture.kernel.commit(preview),
    ]);
    expect([first.status, second.status].sort()).toEqual(['rejected', 'verified']);
    const rejected = first.status === 'rejected' ? first : second;
    expect(rejected.problems.map((problem) => problem.code)).toContain('COMMAND_IN_FLIGHT');
    expect(fixture.state.activationCount).toBe(1);
  });

  it('does not let the requesting actor approve its own preview', async () => {
    const fixture = createFixture();
    const command = fixture.kernel.draft({
      capabilityId: 'incident.mitigate',
      targetUri: 'millos://incident/incident-001',
      parameters: { incidentUri: 'millos://incident/incident-001' },
      reason: 'Self-approval attempt.',
    });
    const preview = await fixture.kernel.preview(command);
    expect(preview.status).toBe('requires-approval');
    expect(() => fixture.kernel.approve(preview.previewId, 'ok', command.actorUri)).toThrow(
      /cannot be approved by the actor that requested it/
    );
    expect(() => fixture.kernel.approve(preview.previewId, 'ok', 'millos://actor/nobody')).toThrow(
      /registered human actor/
    );
  });

  it('consumes an approval on its first execution and rejects a re-keyed replay', async () => {
    const fixture = createFixture();
    const command = fixture.kernel.draft({
      capabilityId: 'incident.mitigate',
      targetUri: 'millos://incident/incident-001',
      parameters: { incidentUri: 'millos://incident/incident-001' },
      reason: 'One approval, one execution.',
      idempotencyKey: 'mitigate-once',
    });
    const preview = await fixture.kernel.preview(command);
    const approval = fixture.kernel.approve(preview.previewId, 'Reviewed.');
    const receipt = await fixture.kernel.commit(preview, approval);
    expect(receipt.status).toBe('verified');

    const replayed = await fixture.kernel.commit(
      { ...preview, command: { ...preview.command, idempotencyKey: 'mitigate-again' } },
      approval
    );
    expect(replayed.status).toBe('rejected');
    expect(replayed.problems.map((problem) => problem.code)).toEqual(
      expect.arrayContaining(['PREVIEW_COMMAND_MISMATCH', 'APPROVAL_UNKNOWN'])
    );
    expect(fixture.state.mitigationCount).toBe(1);
  });

  it('keeps a preview current while only the simulation clock advances', async () => {
    const fixture = createFixture();
    const command = fixture.kernel.draft({
      capabilityId: 'operations.activate-order',
      targetUri: 'millos://order/order-001',
      parameters: { orderUri: 'millos://order/order-001' },
      reason: 'Commit after a tick.',
    });
    const preview = await fixture.kernel.preview(command);
    expect(preview.status).toBe('ready');
    fixture.state.elapsedMinutes += 5;
    const receipt = await fixture.kernel.commit(preview);
    expect(receipt.status).toBe('verified');
  });
});

describe('agent command kernel legal options', () => {
  it('offers only commands that pass every check, and writes nothing while enumerating', async () => {
    const fixture = createFixture();
    const eventsBefore = fixture.ledger.export().events.length;

    const set = await fixture.kernel.legalOptions({ targetUri: 'millos://order/order-001' });
    expect(set.options.map((option) => option.optionId)).toEqual(['operations.activate-order']);
    expect(set.options[0].effects).toContain('Activate order-001.');
    expect(fixture.ledger.export().events.length).toBe(eventsBefore);
    expect(fixture.state.activationCount).toBe(0);

    // A chosen option still goes through the full gate with the chooser's own reason.
    const preview = await fixture.kernel.preview(
      fixture.kernel.draft({ ...set.options[0].draft, reason: 'Chosen from legal options.' })
    );
    expect(preview.status).toBe('ready');
  });

  it('excludes a command whose handler precondition fails', async () => {
    const fixture = createFixture();
    const set = await fixture.kernel.legalOptions({ targetUri: 'millos://order/order-999' });
    expect(set.options).toEqual([]);
    expect(set.excluded).toEqual([
      {
        optionId: 'operations.activate-order',
        capabilityId: 'operations.activate-order',
        reasons: ['Order must exist.'],
      },
    ]);
  });

  it('expands required enum parameters into one option each', async () => {
    const fixture = createFixture();
    const set = await fixture.kernel.legalOptions({ targetUri: 'millos://decision/decision-001' });
    // The fixture registers no handler for this capability, so every variant is excluded.
    expect(set.excluded.map((entry) => entry.optionId)).toEqual([
      'ai.respond-to-decision:disposition=accepted',
      'ai.respond-to-decision:disposition=modified',
      'ai.respond-to-decision:disposition=rejected',
      'ai.respond-to-decision:disposition=deferred',
    ]);
    expect(set.excluded[0].reasons).toContain('No runtime handler is registered.');
  });

  it('reports permitted commands that need free-form input instead of offering them', async () => {
    const fixture = createFixture();
    const set = await fixture.kernel.legalOptions({ targetUri: 'millos://batch/batch-001' });
    expect(set.options).toEqual([]);
    expect(set.needsInput).toEqual([
      { capabilityId: 'quality.hold-batch', parameters: ['reason'] },
      { capabilityId: 'quality.release-batch', parameters: ['reason'] },
    ]);
  });

  it('offers nothing under a revoked grant or for a malformed target', async () => {
    const fixture = createFixture();
    fixture.authority.revoke('grant.agent-driver.simulation.v1', 'Test revocation.');
    const revoked = await fixture.kernel.legalOptions({ targetUri: 'millos://order/order-001' });
    expect(revoked.options).toEqual([]);
    expect(
      revoked.excluded[0].reasons.some((reason) => reason.startsWith('Grant was revoked'))
    ).toBe(true);

    const malformed = await fixture.kernel.legalOptions({ targetUri: 'not-a-uri' });
    expect(malformed.options).toEqual([]);
    expect(malformed.needsInput).toEqual([]);
  });
});
