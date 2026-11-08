import { describe, expect, it } from 'vitest';
import { AgentCausalLedger } from '../command/causalLedger';

describe('agent causal ledger', () => {
  it('bounds events, exports a fingerprint, rejects stale evidence, and imports schema v1', () => {
    const ledger = new AgentCausalLedger({
      eventBound: 16,
      now: () => new Date('2026-08-31T12:00:00.000Z'),
    });
    for (let index = 0; index < 20; index += 1) append(ledger, index);
    const exported = ledger.export();

    expect(exported.events).toHaveLength(16);
    expect(exported.compaction.discardedEvents).toBe(4);
    expect(exported.evidenceFingerprint).toMatch(/^r1-/);

    const tampered = structuredClone(exported);
    tampered.events[0].kind = 'tampered';
    expect(ledger.import(tampered)).toMatchObject({ imported: 0 });
    expect(ledger.import(tampered).problems.map((problem) => problem.code)).toContain(
      'EVIDENCE_FINGERPRINT_STALE'
    );

    const imported = ledger.import({
      schemaVersion: 1,
      events: [
        {
          commandId: 'legacy-command',
          correlationId: 'legacy-correlation',
          actorId: 'legacy-controller',
          domain: 'campaign',
          kind: 'state-transition',
          targetUri: 'millos://order/order-001',
          payload: { changed: true },
        },
      ],
    });
    expect(imported.imported).toBe(1);
    expect(ledger.trace({ correlationId: 'legacy-correlation' }).records[0].kind).toBe(
      'imported.v1.state-transition'
    );
  });

  it('promotes only retained evidence into bounded, explicitly-authorized lessons', () => {
    const ledger = new AgentCausalLedger();
    const event = append(ledger, 1);
    const lesson = ledger.promoteLesson(
      'A current revision prevented duplicate activation.',
      [event.eventId],
      'millos://actor/agent-driver',
      false
    );
    expect(lesson.authority).toBe('advisory');
    expect(lesson.evidenceFingerprint).toMatch(/^r1-/);
    expect(() =>
      ledger.promoteLesson(
        'Unsupported claim.',
        ['evt-missing'],
        'millos://actor/agent-driver',
        true
      )
    ).toThrow(/retained evidence/);
  });
});

function append(ledger: AgentCausalLedger, index: number) {
  return ledger.append({
    correlationId: `correlation-${index}`,
    causationId: null,
    commandId: `command-${index}`,
    actorUri: 'millos://actor/agent-driver',
    grantId: 'grant.agent-driver.simulation.v1',
    domain: 'campaign',
    kind: 'command.verified',
    wallTime: '2026-08-31T12:00:00.000Z',
    simulationTime: { day: 1, hour: 12 },
    beforeRevision: `r-${index}`,
    afterRevision: `r-${index + 1}`,
    targetUri: 'millos://order/order-001',
    payload: { changed: true },
    provenance: [{ kind: 'test', source: 'causalLedger.test.ts' }],
  });
}

describe('causal history assurance', () => {
  it('distinguishes a paged predecessor from a missing retained predecessor', () => {
    const ledger = new AgentCausalLedger();
    const parent = append(ledger, 0);
    ledger.append({ ...parent, commandId: 'linked-child', causationId: parent.eventId });
    const secondPage = ledger.trace({ cursor: '1', limit: 1 });
    expect(secondPage.records[0].causationId).toBe(parent.eventId);
    expect(secondPage.completeCausalChain).toBe(true);
    ledger.append({ ...parent, commandId: 'dangling-child', causationId: 'evt-not-retained' });
    expect(ledger.export().compaction.discardedEvents).toBe(0);
    expect(ledger.trace({ cursor: '0', limit: 1 }).completeCausalChain).toBe(false);
  });

  it('withholds assurance after genuine minimum-bound compaction', () => {
    const ledger = new AgentCausalLedger({ eventBound: 16 });
    const first = append(ledger, 0);
    let predecessor = first.eventId;
    for (let index = 1; index < 17; index += 1) {
      predecessor = ledger.append({
        ...first,
        commandId: `linked-${index}`,
        causationId: predecessor,
      }).eventId;
    }
    expect(ledger.export().compaction.discardedEvents).toBe(1);
    expect(ledger.trace().records).toHaveLength(16);
    expect(ledger.trace().completeCausalChain).toBe(false);
  });

  it('preserves schema two import remapping and deduplication without certifying origin', () => {
    const source = new AgentCausalLedger();
    const parent = append(source, 0);
    source.append({ ...parent, commandId: 'import-child', causationId: parent.eventId });
    const destination = new AgentCausalLedger();
    append(destination, 99);
    expect(destination.import(source.export()).imported).toBe(2);
    const records = destination.trace().records;
    expect(records[2].causationId).toBe(records[1].eventId);
    expect(records[1].eventId).not.toBe(parent.eventId);
    expect(destination.import(source.export()).imported).toBe(0);
    expect(destination.export().compaction.discardedEvents).toBe(0);
    expect(destination.trace().completeCausalChain).toBe(false);
  });
});
