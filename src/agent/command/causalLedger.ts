import type {
  AgentCausalEvent,
  AgentEvidenceExport,
  AgentLesson,
} from '../contracts/commandContracts';
import type { AgentStructuredProblem } from '../contracts/queryContracts';
import { revisionFor } from '../query/queryService.js';

export const DEFAULT_AGENT_EVENT_BOUND = 1000;
export const DEFAULT_AGENT_LESSON_BOUND = 100;

export class AgentCausalLedger {
  private events: AgentCausalEvent[] = [];
  private lessons: AgentLesson[] = [];
  private discardedEvents = 0;
  private sequence = 0;
  // Dedupe keys of imported events that carried no wallTime of their own, by
  // event id. Such an event is stamped with the import clock, so its stored
  // wallTime says nothing about the source and cannot identify it again.
  private readonly untimedImportKeys = new Map<string, string>();
  private readonly eventBound: number;
  private readonly lessonBound: number;
  private readonly now: () => Date;

  constructor(options: { eventBound?: number; lessonBound?: number; now?: () => Date } = {}) {
    this.eventBound = Math.max(16, options.eventBound ?? DEFAULT_AGENT_EVENT_BOUND);
    this.lessonBound = Math.max(1, options.lessonBound ?? DEFAULT_AGENT_LESSON_BOUND);
    this.now = options.now ?? (() => new Date());
  }

  append(event: Omit<AgentCausalEvent, 'eventId' | 'schemaVersion'>): AgentCausalEvent {
    this.sequence += 1;
    const fullEvent: AgentCausalEvent = {
      ...structuredClone(event),
      eventId: `evt-${String(this.sequence).padStart(8, '0')}`,
      schemaVersion: 2,
    };
    this.events.push(fullEvent);
    this.enforceEventBound();
    return structuredClone(fullEvent);
  }

  /** Latest event id for a correlation, without cloning or paging the ledger. */
  lastEventIdFor(correlationId: string): string | null {
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      if (this.events[index].correlationId === correlationId) return this.events[index].eventId;
    }
    return null;
  }

  trace(
    filters: {
      uri?: string;
      correlationId?: string;
      cursor?: string;
      limit?: number;
    } = {}
  ): {
    completeCausalChain: boolean;
    records: AgentCausalEvent[];
    page: {
      cursor: string;
      limit: number;
      returned: number;
      total: number;
      nextCursor: string | null;
    };
  } {
    const retainedIds = new Set(this.events.map((event) => event.eventId));
    const completeCausalChain =
      this.discardedEvents === 0 &&
      this.events.every(
        (event) =>
          (event.causationId === null || retainedIds.has(event.causationId)) &&
          !event.provenance.some((reference) => reference.kind === 'import')
      );

    const matching = this.events.filter(
      (event) =>
        (!filters.uri || event.targetUri === filters.uri) &&
        (!filters.correlationId || event.correlationId === filters.correlationId)
    );
    const offset = filters.cursor && /^\d+$/.test(filters.cursor) ? Number(filters.cursor) : 0;
    const limit = Math.max(
      1,
      Math.min(100, Number.isSafeInteger(filters.limit) ? Number(filters.limit) : 25)
    );
    const records = matching.slice(offset, offset + limit).map((event) => structuredClone(event));
    const nextOffset = offset + records.length;
    return {
      completeCausalChain,
      records,
      page: {
        cursor: String(offset),
        limit,
        returned: records.length,
        total: matching.length,
        nextCursor: nextOffset < matching.length ? String(nextOffset) : null,
      },
    };
  }

  export(): AgentEvidenceExport {
    const core = {
      schemaVersion: 2 as const,
      events: this.events,
      lessons: this.lessons,
      compaction: {
        discardedEvents: this.discardedEvents,
        oldestRetainedEventId: this.events[0]?.eventId ?? null,
        newestRetainedEventId: this.events.at(-1)?.eventId ?? null,
      },
    };
    return structuredClone({
      ...core,
      evidenceFingerprint: revisionFor(core),
      exportedAt: this.now().toISOString(),
      eventBound: this.eventBound,
    });
  }

  import(value: unknown): { imported: number; problems: AgentStructuredProblem[] } {
    const problems: AgentStructuredProblem[] = [];
    if (!value || typeof value !== 'object') {
      return {
        imported: 0,
        problems: [
          {
            code: 'EVIDENCE_IMPORT_INVALID',
            severity: 'blocking',
            message: 'Evidence export must be an object.',
          },
        ],
      };
    }
    const source = value as Record<string, unknown>;
    if (source.schemaVersion !== 1 && source.schemaVersion !== 2) {
      return {
        imported: 0,
        problems: [
          {
            code: 'EVIDENCE_SCHEMA_UNSUPPORTED',
            severity: 'blocking',
            message: 'Only evidence schema versions 1 and 2 are supported.',
          },
        ],
      };
    }
    const sourceEvents = Array.isArray(source.events) ? source.events : [];
    if (source.schemaVersion === 2 && typeof source.evidenceFingerprint === 'string') {
      const expected = revisionFor({
        schemaVersion: 2,
        events: source.events,
        lessons: source.lessons,
        compaction: source.compaction,
      });
      if (source.evidenceFingerprint !== expected) {
        return {
          imported: 0,
          problems: [
            {
              code: 'EVIDENCE_FINGERPRINT_STALE',
              severity: 'blocking',
              message:
                'Evidence fingerprint does not match the supplied events, lessons, and compaction record.',
            },
          ],
        };
      }
    }

    let imported = 0;
    let duplicates = 0;
    // Imported events are renumbered into this ledger's sequence, so their
    // causation and correlation references must be rewritten through the same
    // map or every chain would point at unrelated local events.
    const idMap = new Map<string, string>();
    const known = new Set(
      this.events.map((event) => this.untimedImportKeys.get(event.eventId) ?? importIdentity(event))
    );
    const staged: Array<{ event: AgentCausalEvent; sourceId: string | null }> = [];
    for (const candidate of sourceEvents) {
      const event = normalizeImportedEvent(candidate, source.schemaVersion, this.now());
      if (!event) {
        problems.push({
          code: 'EVIDENCE_EVENT_SKIPPED',
          severity: 'warning',
          message: 'One malformed event was skipped.',
        });
        continue;
      }
      const untimed = typeof (candidate as { wallTime?: unknown }).wallTime !== 'string';
      const identity = untimed ? untimedImportIdentity(event) : importIdentity(event);
      if (known.has(identity)) {
        duplicates += 1;
        continue;
      }
      known.add(identity);
      const sourceId =
        candidate &&
        typeof candidate === 'object' &&
        typeof (candidate as { eventId?: unknown }).eventId === 'string'
          ? ((candidate as { eventId: string }).eventId as string)
          : null;
      this.sequence += 1;
      const eventId = `evt-${String(this.sequence).padStart(8, '0')}`;
      if (sourceId) idMap.set(sourceId, eventId);
      if (untimed) this.untimedImportKeys.set(eventId, identity);
      staged.push({ event: { ...event, eventId }, sourceId });
    }
    for (const { event } of staged) {
      this.events.push({
        ...event,
        causationId: event.causationId ? (idMap.get(event.causationId) ?? null) : null,
        correlationId: idMap.get(event.correlationId) ?? event.correlationId,
      });
      imported += 1;
    }
    if (duplicates > 0) {
      problems.push({
        code: 'EVIDENCE_EVENT_DUPLICATE',
        severity: 'info',
        message: `${duplicates} already-retained event(s) were not imported again.`,
      });
    }
    this.enforceEventBound();
    return { imported, problems };
  }

  private enforceEventBound(): void {
    if (this.events.length <= this.eventBound) return;
    const overflow = this.events.length - this.eventBound;
    for (const evicted of this.events.splice(0, overflow)) {
      this.untimedImportKeys.delete(evicted.eventId);
    }
    this.discardedEvents += overflow;
  }

  promoteLesson(
    statement: string,
    evidenceEventIds: string[],
    promotedBy: string,
    humanReviewed: boolean
  ): AgentLesson {
    const uniqueEventIds = [...new Set(evidenceEventIds)];
    if (
      uniqueEventIds.length === 0 ||
      uniqueEventIds.some((id) => !this.events.some((event) => event.eventId === id))
    ) {
      throw new Error(
        'A lesson requires at least one retained evidence event, and every referenced event must exist.'
      );
    }
    const evidenceFingerprint = revisionFor(
      this.events.filter((event) => uniqueEventIds.includes(event.eventId))
    );
    const priorId = `lesson-${revisionFor({ statement, uniqueEventIds, promotedBy }).slice(3)}`;
    const prior = this.lessons.find((candidate) => candidate.id === priorId);
    // A human-reviewed lesson is never silently demoted by an advisory re-promotion.
    if (prior && prior.authority === 'human-reviewed' && !humanReviewed) {
      return structuredClone(prior);
    }
    const lesson: AgentLesson = {
      id: priorId,
      statement: statement.trim(),
      evidenceEventIds: uniqueEventIds,
      promotedBy,
      promotedAt: this.now().toISOString(),
      authority: humanReviewed ? 'human-reviewed' : 'advisory',
      evidenceFingerprint,
    };
    this.lessons = [
      ...this.lessons.filter((candidate) => candidate.id !== lesson.id),
      lesson,
    ].slice(-this.lessonBound);
    return structuredClone(lesson);
  }
}

function importIdentity(event: Pick<AgentCausalEvent, 'commandId' | 'kind' | 'wallTime'>): string {
  return `${event.commandId}|${event.kind}|${event.wallTime}`;
}

/**
 * Identity of an imported event that had no wallTime: its content as the
 * source gave it, never the import clock that stamped it. Re-importing the same
 * legacy export later must still find it a duplicate.
 */
function untimedImportIdentity(event: AgentCausalEvent): string {
  const content = revisionFor({
    correlationId: event.correlationId,
    causationId: event.causationId,
    actorUri: event.actorUri,
    grantId: event.grantId,
    domain: event.domain,
    simulationTime: event.simulationTime,
    beforeRevision: event.beforeRevision,
    afterRevision: event.afterRevision,
    targetUri: event.targetUri,
    payload: event.payload,
  });
  return `${event.commandId}|${event.kind}|untimed|${content}`;
}

function normalizeImportedEvent(
  candidate: unknown,
  schemaVersion: unknown,
  now: Date
): AgentCausalEvent | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const source = candidate as Record<string, unknown>;
  if (typeof source.commandId !== 'string' || typeof source.kind !== 'string') return null;
  const simulationTime = source.simulationTime as { day?: unknown; hour?: unknown } | undefined;
  return {
    eventId: '',
    schemaVersion: 2,
    correlationId:
      typeof source.correlationId === 'string' ? source.correlationId : source.commandId,
    causationId: typeof source.causationId === 'string' ? source.causationId : null,
    commandId: source.commandId,
    actorUri:
      typeof source.actorUri === 'string'
        ? source.actorUri
        : typeof source.actorId === 'string'
          ? `millos://actor/${encodeURIComponent(source.actorId)}`
          : 'millos://actor/imported-unknown',
    grantId: typeof source.grantId === 'string' ? source.grantId : 'imported-v1-unverified',
    domain:
      typeof source.domain === 'string'
        ? (source.domain as AgentCausalEvent['domain'])
        : 'evidence',
    kind: schemaVersion === 1 ? `imported.v1.${source.kind}` : source.kind,
    wallTime: typeof source.wallTime === 'string' ? source.wallTime : now.toISOString(),
    simulationTime: {
      day: typeof simulationTime?.day === 'number' ? simulationTime.day : 0,
      hour: typeof simulationTime?.hour === 'number' ? simulationTime.hour : 0,
    },
    beforeRevision: typeof source.beforeRevision === 'string' ? source.beforeRevision : 'unknown',
    afterRevision: typeof source.afterRevision === 'string' ? source.afterRevision : 'unknown',
    targetUri:
      typeof source.targetUri === 'string' ? source.targetUri : 'millos://evidence/imported',
    payload: jsonValue(source.payload),
    provenance: [
      { kind: 'import', source: schemaVersion === 1 ? 'causal-event-v1' : 'causal-event-v2' },
    ],
  };
}

function jsonValue(value: unknown): AgentCausalEvent['payload'] {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as AgentCausalEvent['payload'];
  } catch {
    return null;
  }
}
