// @ts-check

import { canonicalStringify } from '../contracts/registryValidation.js';
import { parseSemanticUri, resolveSemanticAlias } from '../ontology/semanticUri.js';

/** @typedef {import('../contracts/queryContracts').AgentBriefRequest} AgentBriefRequest */
/** @typedef {import('../contracts/queryContracts').AgentDomainCapture} AgentDomainCapture */
/** @typedef {import('../contracts/queryContracts').AgentJsonValue} AgentJsonValue */
/** @typedef {import('../contracts/queryContracts').AgentLink} AgentLink */
/** @typedef {import('../contracts/queryContracts').AgentObservationEnvelope} AgentObservationEnvelope */
/** @typedef {import('../contracts/queryContracts').AgentQueryRequest} AgentQueryRequest */
/** @typedef {import('../contracts/queryContracts').AgentStructuredProblem} AgentStructuredProblem */
/** @typedef {import('../contracts/queryContracts').AgentTraceRequest} AgentTraceRequest */
/** @typedef {import('../contracts/systemManifest').AgentDomainId} AgentDomainId */
/** @typedef {import('../contracts/systemManifest').AgentSystemRegistrySource} AgentSystemRegistrySource */

export const AGENT_QUERY_SCHEMA_VERSION = 1;
export const AGENT_LEVEL0_MAXIMUM_BYTES = 4096;
export const AGENT_LEVEL1_MAXIMUM_BYTES = 12288;
export const AGENT_MAXIMUM_PAGE_SIZE = 100;
export const AGENT_SNAPSHOT_HISTORY_SIZE = 16;

/** @type {readonly AgentDomainId[]} */
const DOMAIN_IDS = Object.freeze([
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
]);

const SEVERITY_RANK = Object.freeze({ blocking: 0, warning: 1, info: 2 });

/**
 * Authority of THIS surface, not of the registry contract. The read service
 * installs no command kernel, so its own brief and capability listing must say
 * observation only even when the registry's query plane (v2) declares scoped
 * command execution. The runtime adapter that composes the kernel replaces
 * these fields with the live grant state; see installAgentRuntime.ts.
 */
const READ_SURFACE_AUTHORITY = Object.freeze({
  observationOnly: true,
  commandExecution: false,
  externalWrites: false,
});
const READ_SURFACE_REASON =
  'This read surface installs no command kernel, execution grant, or external write path. Command execution is available only through the installed runtime adapter.';

/**
 * @typedef {{
 *   capture: () => AgentDomainCapture,
 *   now?: () => Date,
 *   registry: AgentSystemRegistrySource,
 * }} AgentQueryServiceDependencies
 */

/**
 * @typedef {{
 *   capture: AgentDomainCapture,
 *   domainRevisions: Record<AgentDomainId, string>,
 *   revision: string,
 * }} InternalSnapshot
 */

/**
 * Build a read-only query service over injected canonical projections.
 * The service retains only bounded immutable snapshots. It never subscribes to,
 * renders from, or invokes actions on the source stores.
 *
 * @param {AgentQueryServiceDependencies} dependencies
 */
export function createAgentQueryService(dependencies) {
  const now = dependencies.now ?? (() => new Date());
  const registry = dependencies.registry;
  const configured = registry.queryPlane;
  /** @type {Map<string, InternalSnapshot>} */
  const history = new Map();
  /** @type {string | undefined} */
  let latestDistinctRevision;

  const aliasMap = Object.fromEntries(
    registry.aliases.map((alias) => [alias.alias, alias.canonicalUri])
  );

  function observe() {
    const capture = jsonClone(dependencies.capture());
    const observedAt = now().toISOString();
    if (capture.freshness.length === 0) {
      capture.freshness.push({
        source: 'agent-query-capture',
        observedAt,
        staleAfterMs: 1000,
        quality: 'unknown',
      });
    }
    /** @type {Record<AgentDomainId, string>} */
    const domainRevisions = /** @type {Record<AgentDomainId, string>} */ ({});
    for (const domainId of DOMAIN_IDS) {
      domainRevisions[domainId] = revisionFor(capture.domains[domainId]);
    }
    const revision = revisionFor(domainRevisions);
    const previousRevision =
      latestDistinctRevision !== revision ? latestDistinctRevision : undefined;
    if (latestDistinctRevision !== revision) latestDistinctRevision = revision;

    /** @type {InternalSnapshot} */
    const snapshot = deepFreeze({ capture, domainRevisions, revision });
    if (history.has(revision)) history.delete(revision);
    history.set(revision, snapshot);
    while (history.size > configured.snapshotHistorySize) {
      const oldest = history.keys().next().value;
      if (typeof oldest === 'string') history.delete(oldest);
    }
    return { snapshot, previousRevision };
  }

  /** @param {AgentBriefRequest} [request] */
  function brief(request = {}) {
    const { snapshot, previousRevision } = observe();
    const previous = findSnapshot(request.sinceRevision);
    const changedDomains = request.sinceRevision
      ? changedDomainIds(previous, snapshot)
      : previousRevision
        ? changedDomainIds(history.get(previousRevision), snapshot)
        : [...DOMAIN_IDS];
    const data = buildBriefData(snapshot, registry, changedDomains, request.sinceRevision);
    /** @type {AgentObservationEnvelope} */
    let envelope = makeEnvelope(
      snapshot,
      ['brief'],
      data,
      previousRevision,
      snapshot.capture.warnings,
      standardLinks()
    );
    envelope = fitBriefBudget(envelope, configured.level0MaximumBytes);
    return immutableResponse(envelope);
  }

  /** @param {AgentQueryRequest} request */
  function query(request) {
    if (!request || typeof request !== 'object') {
      return errorObservation('QUERY_REQUEST_REQUIRED', 'A structured query request is required.');
    }
    if (request.view === 'causal') {
      return trace({
        uri: request.uri,
        cursor: request.cursor,
        limit: request.limit,
      });
    }
    const { snapshot, previousRevision } = observe();
    if (request.view === 'domain') {
      return queryDomain(snapshot, previousRevision, request);
    }
    if (request.view === 'entity' || request.view === 'relationship') {
      return queryEntity(snapshot, previousRevision, request);
    }
    return errorEnvelope(
      snapshot,
      previousRevision,
      'QUERY_VIEW_UNKNOWN',
      `Unknown query view: ${String(request.view)}`
    );
  }

  function capabilities() {
    const { snapshot, previousRevision } = observe();
    return immutableResponse(
      fitObservationBudget(
        makeEnvelope(
          snapshot,
          ['capabilities'],
          {
            authority: { ...READ_SURFACE_AUTHORITY, reason: READ_SURFACE_REASON },
            items: registry.capabilities.map((capability) => ({
              ...capability,
              executable: false,
              authorityReason: READ_SURFACE_REASON,
            })),
          },
          previousRevision,
          snapshot.capture.warnings,
          [link('self', 'millos://query/capabilities', 'Read-only capability discovery')]
        ),
        configured.level1MaximumBytes,
        'evidence'
      )
    );
  }

  /** @param {AgentTraceRequest} [request] */
  function trace(request = {}) {
    const { snapshot, previousRevision } = observe();
    const evidence = asRecord(snapshot.capture.domains.evidence);
    const commands = Array.isArray(evidence.commands) ? evidence.commands : [];
    const filtered = commands.filter((/** @type {unknown} */ candidate) => {
      const command = asRecord(candidate);
      if (request.uri && command.targetUri !== request.uri && command.targetId !== request.uri) {
        return false;
      }
      if (request.correlationId && command.correlationId !== request.correlationId) return false;
      return true;
    });
    const page = paginate(filtered, request.cursor, request.limit, configured.maximumPageSize);
    const warnings = [
      ...snapshot.capture.warnings,
      problem(
        'CAUSAL_CHAIN_UNAVAILABLE',
        'warning',
        'The read surface exposes bounded diagnostic records only. Correlation and causation events come from the causal ledger of the installed runtime adapter.',
        'evidence',
        'Use the diagnostic records as partial evidence. Do not infer a complete causal chain.'
      ),
    ];
    return immutableResponse(
      fitObservationBudget(
        makeEnvelope(
          snapshot,
          ['trace'],
          {
            completeCausalChain: false,
            filters: {
              uri: request.uri ?? null,
              correlationId: request.correlationId ?? null,
            },
            records: page.items,
            page: page.metadata,
            available: {
              diagnosticCommands: commands.length,
              replayFrames: numberValue(evidence.replayFrameCount),
              decisionHistory: numberValue(evidence.decisionHistoryCount),
            },
          },
          previousRevision,
          warnings,
          [
            link('domain', 'millos://query/domain/evidence', 'Inspect bounded evidence state'),
            link('capabilities', 'millos://query/capabilities', 'Inspect capabilities'),
          ],
          'partial'
        ),
        configured.level1MaximumBytes,
        'evidence'
      )
    );
  }

  /** @param {InternalSnapshot} snapshot @param {string | undefined} previousRevision @param {AgentQueryRequest} request */
  function queryDomain(snapshot, previousRevision, request) {
    if (!request.domainId || !DOMAIN_IDS.includes(request.domainId)) {
      return errorEnvelope(
        snapshot,
        previousRevision,
        'DOMAIN_REQUIRED',
        'A known domainId is required for a domain query.'
      );
    }
    const domainId = request.domainId;
    const prior = findSnapshotForDomainRevision(request.sinceRevision, domainId);
    if (request.sinceRevision && request.sinceRevision === snapshot.domainRevisions[domainId]) {
      return immutableResponse(
        fitObservationBudget(
          makeEnvelope(
            snapshot,
            ['domain', domainId],
            { domainId, changed: false, changes: {} },
            request.sinceRevision,
            snapshot.capture.warnings,
            domainLinks(domainId)
          ),
          configured.level1MaximumBytes,
          domainId
        )
      );
    }
    if (request.sinceRevision && prior) {
      const changes = diffJson(prior.capture.domains[domainId], snapshot.capture.domains[domainId]);
      return immutableResponse(
        fitObservationBudget(
          makeEnvelope(
            snapshot,
            ['domain', domainId],
            { domainId, changed: changes !== undefined, changes: changes ?? {} },
            request.sinceRevision,
            snapshot.capture.warnings,
            domainLinks(domainId)
          ),
          configured.level1MaximumBytes,
          domainId
        )
      );
    }

    const warnings = [...snapshot.capture.warnings];
    if (request.sinceRevision) {
      warnings.push(
        problem(
          'REVISION_OUTSIDE_HISTORY',
          'warning',
          'The requested revision is outside the bounded snapshot history. A full domain observation was returned.',
          domainId
        )
      );
    }
    const projected = selectFields(snapshot.capture.domains[domainId], request.fields);
    const data = request.collection
      ? collectionPage(domainId, projected, request.collection, request, configured.maximumPageSize)
      : {
          domainId,
          changed: true,
          state: boundArrays(projected, normalizeLimit(request.limit, configured.maximumPageSize)),
        };
    const bounded = fitDomainBudget(data, configured.level1MaximumBytes, warnings, domainId);
    return immutableResponse(
      fitObservationBudget(
        makeEnvelope(
          snapshot,
          ['domain', domainId],
          bounded,
          previousRevision,
          warnings,
          domainLinks(domainId)
        ),
        configured.level1MaximumBytes,
        domainId
      )
    );
  }

  /** @param {InternalSnapshot} snapshot @param {string | undefined} previousRevision @param {AgentQueryRequest} request */
  function queryEntity(snapshot, previousRevision, request) {
    if (!request.uri) {
      return errorEnvelope(
        snapshot,
        previousRevision,
        'ENTITY_URI_REQUIRED',
        'A semantic URI or registered alias is required for an entity query.'
      );
    }
    let canonicalUri;
    try {
      canonicalUri = resolveSemanticAlias(request.uri, aliasMap);
    } catch (error) {
      return errorEnvelope(
        snapshot,
        previousRevision,
        'ENTITY_URI_INVALID',
        error instanceof Error ? error.message : String(error)
      );
    }
    const parsed = parseSemanticUri(canonicalUri);
    const resolved = resolveEntity(snapshot, canonicalUri, parsed.kind, parsed.localId, registry);
    if (!resolved) {
      return errorEnvelope(
        snapshot,
        previousRevision,
        'ENTITY_NOT_FOUND',
        `No current or seeded entity resolves from ${canonicalUri}.`
      );
    }
    const data =
      request.view === 'relationship'
        ? {
            uri: canonicalUri,
            ownerDomainId: resolved.ownerDomainId,
            relations: dynamicRelations(canonicalUri, resolved.state, resolved.relations),
          }
        : {
            uri: canonicalUri,
            kind: parsed.kind,
            ownerDomainId: resolved.ownerDomainId,
            evidence: resolved.evidence,
            state: selectFields(resolved.state, request.fields),
          };
    return immutableResponse(
      fitObservationBudget(
        makeEnvelope(
          snapshot,
          [request.view, canonicalUri],
          data,
          previousRevision,
          snapshot.capture.warnings,
          [
            link('entity', canonicalUri, 'Canonical entity identity'),
            link(
              'domain',
              `millos://query/domain/${resolved.ownerDomainId}`,
              'Inspect owner domain'
            ),
            link(
              'relationship',
              `millos://query/relationship/${encodeURIComponent(canonicalUri)}`,
              'Inspect relationships'
            ),
          ]
        ),
        configured.level1MaximumBytes,
        resolved.ownerDomainId
      )
    );
  }

  /** @param {string | undefined} revision */
  function findSnapshot(revision) {
    return revision ? history.get(revision) : undefined;
  }

  /** @param {string | undefined} revision @param {AgentDomainId} domainId */
  function findSnapshotForDomainRevision(revision, domainId) {
    if (!revision) return undefined;
    const world = history.get(revision);
    if (world) return world;
    return [...history.values()].find(
      (candidate) => candidate.domainRevisions[domainId] === revision
    );
  }

  /** @param {string} code @param {string} message */
  function errorObservation(code, message) {
    const { snapshot, previousRevision } = observe();
    return errorEnvelope(snapshot, previousRevision, code, message);
  }

  /** @param {InternalSnapshot} snapshot @param {string | undefined} previousRevision @param {string} code @param {string} message */
  function errorEnvelope(snapshot, previousRevision, code, message) {
    return immutableResponse(
      makeEnvelope(
        snapshot,
        ['error'],
        { accepted: false },
        previousRevision,
        [...snapshot.capture.warnings, problem(code, 'blocking', message)],
        standardLinks(),
        'partial'
      )
    );
  }

  return Object.freeze({
    version: 1,
    brief,
    query,
    capabilities,
    trace,
  });
}

/** @param {InternalSnapshot} snapshot @param {AgentSystemRegistrySource} registry @param {AgentDomainId[]} changedDomains @param {string | undefined} sinceRevision */
function buildBriefData(snapshot, registry, changedDomains, sinceRevision) {
  const domains = snapshot.capture.domains;
  const campaign = asRecord(domains.campaign);
  const production = asRecord(domains.production);
  const simulation = asRecord(domains.simulation);
  const quality = asRecord(domains.quality);
  const maintenance = asRecord(domains.maintenance);
  const safety = asRecord(domains.safety);
  const scada = asRecord(domains.scada);
  const orders = arrayOfRecords(campaign.orders);
  const activeOrderId = stringOrNull(campaign.activeOrderId);
  const activeOrder = orders.find((order) => order.id === activeOrderId);
  // Only an open order can be the objective; a fulfilled or cancelled one
  // would send a cold agent after work that is already finished.
  const plannedOrder = orders
    .filter((order) => order.status !== 'fulfilled' && order.status !== 'cancelled')
    .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority))[0];
  const objectiveOrder = activeOrder ?? plannedOrder;
  const exceptions = collectHealthExceptions({
    simulation,
    production,
    quality,
    maintenance,
    campaign,
    safety,
    scada,
  });
  const constraints = arrayOfRecords(campaign.constraints).slice(0, 8);
  const execution = asRecord(campaign.execution);
  return {
    purpose: 'Bounded Level 0 driver orientation from canonical operational projections.',
    status: exceptions.some((item) => item.severity === 'blocking')
      ? 'attention-required'
      : exceptions.length > 0
        ? 'attention'
        : 'nominal',
    objectives: objectiveOrder
      ? [
          {
            id: stringValue(objectiveOrder.id),
            label: `Fulfil ${stringValue(objectiveOrder.id)} for ${stringValue(objectiveOrder.customer)}`,
            priority: stringValue(objectiveOrder.priority),
            status: stringValue(objectiveOrder.status),
            successCriteria: [
              `Ship ${numberValue(objectiveOrder.requiredKg)} kg before simulation minute ${numberValue(objectiveOrder.dueAtMinute)}.`,
              `Meet recipe quality floor ${numberValue(asRecord(objectiveOrder.recipe).minimumQuality)}.`,
              'Dispatch only quality-released finished goods.',
            ],
          },
        ]
      : [],
    health: {
      overall: exceptions.length === 0 ? 'nominal' : 'exceptions-present',
      exceptions,
      nominalDomainCount: DOMAIN_IDS.length - new Set(exceptions.map((item) => item.domainId)).size,
    },
    authority: {
      ...READ_SURFACE_AUTHORITY,
      grantCount: 0,
      discoveryOnlyCapabilityCount: registry.capabilities.filter(
        (item) => item.status === 'candidate'
      ).length,
      reason: READ_SURFACE_REASON,
    },
    budgets: {
      level0MaximumBytes: registry.queryPlane.level0MaximumBytes,
      level1MaximumBytes: registry.queryPlane.level1MaximumBytes,
      maximumPageSize: registry.queryPlane.maximumPageSize,
      retainedSnapshotCount: registry.queryPlane.snapshotHistorySize,
      externalCallBudget: 0,
    },
    criticalPath: {
      activeOrderId,
      fulfillmentStage: stringOrNull(execution.stage),
      lineSetpointPercent: numberValue(execution.lineSetpointPercent),
      blockingConstraints: constraints.map((constraint) => ({
        id: stringValue(constraint.id),
        severity: stringValue(constraint.severity),
        label: stringValue(constraint.label),
        relatedId: stringOrNull(constraint.relatedId),
      })),
    },
    evidence: {
      mode: snapshot.capture.mode,
      build: snapshot.capture.build,
      seed: snapshot.capture.seed,
      completeness: snapshot.capture.completeness,
      sourceProof: 'runtime projections over current domain-owner stores',
      runtimeProof: 'query path only; no scenario outcome is claimed',
      humanReview: false,
      staleSources: snapshot.capture.freshness
        .filter((item) => item.quality !== 'good')
        .map((item) => item.source),
    },
    changeSummary: {
      sinceRevision: sinceRevision ?? null,
      changedDomains,
      unchanged: Boolean(sinceRevision) && changedDomains.length === 0,
    },
    recommendedQueries: [
      'millos://query/domain/campaign',
      'millos://query/domain/safety',
      'millos://query/domain/quality',
      'millos://query/capabilities',
      'millos://query/trace',
    ],
  };
}

/** @param {Record<string, Record<string, unknown>>} input */
function collectHealthExceptions(input) {
  /** @type {Array<{id:string,domainId:AgentDomainId,severity:'blocking'|'warning'|'info',summary:string,relatedId:string|null}>} */
  const items = [];
  if (input.simulation.emergencyActive === true) {
    items.push(
      exception(
        'simulation-emergency',
        'simulation',
        'blocking',
        'Facility emergency is active.',
        stringOrNull(input.simulation.emergencyMachineId)
      )
    );
  }
  if (asRecord(input.simulation.crisis).active === true) {
    const crisis = asRecord(input.simulation.crisis);
    items.push(
      exception(
        'simulation-crisis',
        'simulation',
        crisis.severity === 'critical' ? 'blocking' : 'warning',
        `Simulation crisis active: ${stringValue(crisis.type)}.`,
        stringOrNull(crisis.affectedMachineId)
      )
    );
  }
  for (const machine of arrayOfRecords(input.production.machines)) {
    if (machine.status === 'critical' || machine.status === 'warning') {
      items.push(
        exception(
          `machine-${stringValue(machine.id)}`,
          'production',
          machine.status === 'critical' ? 'blocking' : 'warning',
          `${stringValue(machine.name)} is ${stringValue(machine.status)}.`,
          stringOrNull(machine.id)
        )
      );
    }
  }
  if (input.quality.dispatchReleased === false) {
    items.push(
      exception(
        'quality-dispatch-hold',
        'quality',
        'blocking',
        `Dispatch quality hold: ${stringValue(input.quality.dispatchHoldReason)}.`,
        null
      )
    );
  }
  for (const incident of arrayOfRecords(input.campaign.incidents)) {
    if (incident.phase !== 'resolved') {
      items.push(
        exception(
          `incident-${stringValue(incident.id)}`,
          'campaign',
          incident.severity === 'critical' ? 'blocking' : 'warning',
          stringValue(incident.title),
          stringOrNull(incident.id)
        )
      );
    }
  }
  for (const breakdown of arrayOfRecords(input.maintenance.activeBreakdowns)) {
    items.push(
      exception(
        `breakdown-${stringValue(breakdown.id)}`,
        'maintenance',
        'blocking',
        `${stringValue(breakdown.machineName)} breakdown is active.`,
        stringOrNull(breakdown.id)
      )
    );
  }
  if (input.safety.forkliftEmergencyStop === true) {
    items.push(
      exception(
        'forklift-emergency-stop',
        'safety',
        'blocking',
        'Forklift emergency stop is active.',
        null
      )
    );
  }
  if (input.scada.externalObservationClaimed === true && input.scada.connectionVerified !== true) {
    items.push(
      exception(
        'scada-unverified',
        'scada',
        'warning',
        'SCADA is flagged live without a verified connection observation in the query projection.',
        null
      )
    );
  }
  return items
    .sort(
      (left, right) =>
        SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
        left.id.localeCompare(right.id)
    )
    .slice(0, 12);
}

/** @param {string} id @param {AgentDomainId} domainId @param {'blocking'|'warning'|'info'} severity @param {string} summary @param {string | null} relatedId */
function exception(id, domainId, severity, summary, relatedId) {
  return { id, domainId, severity, summary, relatedId };
}

/** @param {InternalSnapshot | undefined} previous @param {InternalSnapshot} current */
function changedDomainIds(previous, current) {
  if (!previous) return [...DOMAIN_IDS];
  return DOMAIN_IDS.filter(
    (domainId) => previous.domainRevisions[domainId] !== current.domainRevisions[domainId]
  );
}

/** @param {InternalSnapshot} snapshot @param {string[]} scope @param {any} data @param {string | undefined} previousRevision @param {AgentStructuredProblem[]} warnings @param {AgentLink[]} links @param {'complete'|'partial'|'degraded'} [completeness] */
function makeEnvelope(snapshot, scope, data, previousRevision, warnings, links, completeness) {
  return {
    schemaVersion: /** @type {1} */ (AGENT_QUERY_SCHEMA_VERSION),
    snapshotId: `millos-snapshot:${snapshot.revision}`,
    scope,
    revision: snapshot.revision,
    ...(previousRevision ? { previousRevision } : {}),
    domainRevisions: snapshot.domainRevisions,
    wallTime: latestObservedAt(snapshot.capture.freshness),
    simulationTime: snapshot.capture.simulationTime,
    mode: snapshot.capture.mode,
    build: snapshot.capture.build,
    seed: snapshot.capture.seed,
    completeness: completeness ?? snapshot.capture.completeness,
    freshness: snapshot.capture.freshness,
    data,
    warnings,
    links,
  };
}

/** @param {AgentObservationEnvelope} envelope @param {number} maximumBytes */
function fitBriefBudget(envelope, maximumBytes) {
  const value = jsonClone(envelope);
  const data = asRecord(value.data);
  const health = asRecord(data.health);
  const criticalPath = asRecord(data.criticalPath);
  const reductions = [
    () => {
      health.exceptions = arrayValue(health.exceptions).slice(0, 8);
    },
    () => {
      criticalPath.blockingConstraints = arrayValue(criticalPath.blockingConstraints).slice(0, 4);
    },
    () => {
      value.links = value.links.slice(0, 4);
    },
    () => {
      health.exceptions = arrayValue(health.exceptions).slice(0, 4);
    },
    () => {
      value.freshness = value.freshness.slice(0, 4);
    },
  ];
  for (const reduce of reductions) {
    if (byteLength(value) <= maximumBytes) break;
    reduce();
  }
  if (byteLength(value) > maximumBytes) {
    value.warnings = [
      problem(
        'LEVEL0_TRUNCATED',
        'warning',
        'Level 0 content was reduced to its safety, authority, objective, and critical-path core.'
      ),
    ];
    value.links = value.links.slice(0, 2);
  }
  if (byteLength(value) > maximumBytes) {
    health.exceptions = arrayValue(health.exceptions).slice(0, 2);
    value.freshness = value.freshness.slice(0, 2);
  }
  if (byteLength(value) > maximumBytes) {
    value.data = {
      status: /** @type {AgentJsonValue} */ (data.status ?? 'unknown'),
      authority: /** @type {AgentJsonValue} */ (data.authority ?? {}),
      budgets: /** @type {AgentJsonValue} */ (data.budgets ?? {}),
      changeSummary: /** @type {AgentJsonValue} */ (data.changeSummary ?? {}),
      recommendedQueries: /** @type {AgentJsonValue} */ (
        arrayValue(data.recommendedQueries).slice(0, 3)
      ),
    };
  }
  return value;
}

/**
 * Apply the Level 1 budget to the complete envelope rather than only its data.
 *
 * @param {AgentObservationEnvelope} envelope
 * @param {number} maximumBytes
 * @param {AgentDomainId} domainId
 */
function fitObservationBudget(envelope, maximumBytes, domainId) {
  const value = jsonClone(envelope);
  if (byteLength(value) <= maximumBytes) return value;
  value.warnings = [
    problem(
      'LEVEL1_TRUNCATED',
      'warning',
      `Observation for ${domainId} exceeded the Level 1 byte budget. Request one collection or narrower fields.`,
      domainId,
      `Use field selection or cursor pagination from millos://query/domain/${domainId}.`
    ),
  ];
  value.data = /** @type {AgentJsonValue} */ (boundArrays(value.data, 5));
  value.links = value.links.slice(0, 3);
  value.freshness = value.freshness.slice(0, 4);
  if (byteLength(value) > maximumBytes) {
    value.data = {
      domainId,
      truncated: true,
      reason: 'Narrow the request with fields or collection plus cursor.',
    };
  }
  return value;
}

/** @param {any} data @param {number} maximumBytes @param {AgentStructuredProblem[]} warnings @param {AgentDomainId} domainId */
function fitDomainBudget(data, maximumBytes, warnings, domainId) {
  if (byteLength(data) <= maximumBytes) return data;
  warnings.push(
    problem(
      'LEVEL1_TRUNCATED',
      'warning',
      `Domain ${domainId} exceeded the Level 1 byte budget. Collections were reduced.`,
      domainId,
      `Request one collection with cursor pagination from millos://query/domain/${domainId}.`
    )
  );
  return boundArrays(data, 5);
}

/** @param {AgentDomainId} domainId @param {any} projected @param {string} collection @param {AgentQueryRequest} request @param {number} maximumPageSize */
function collectionPage(domainId, projected, collection, request, maximumPageSize) {
  const source = getPath(projected, collection);
  const page = paginate(
    Array.isArray(source) ? source : [],
    request.cursor,
    request.limit,
    maximumPageSize
  );
  return {
    domainId,
    collection,
    items: page.items,
    page: page.metadata,
    collectionFound: Array.isArray(source),
  };
}

/** @param {unknown[]} values @param {string | undefined} cursor @param {number | undefined} requestedLimit @param {number} maximumPageSize */
function paginate(values, cursor, requestedLimit, maximumPageSize) {
  const offset = parseCursor(cursor);
  const limit = normalizeLimit(requestedLimit, maximumPageSize);
  const items = values.slice(offset, offset + limit);
  const nextOffset = offset + items.length;
  return {
    items,
    metadata: {
      cursor: String(offset),
      limit,
      returned: items.length,
      total: values.length,
      truncated: nextOffset < values.length,
      nextCursor: nextOffset < values.length ? String(nextOffset) : null,
    },
  };
}

/** @param {string | undefined} cursor */
function parseCursor(cursor) {
  if (!cursor || !/^\d+$/.test(cursor)) return 0;
  return Math.max(0, Number.parseInt(cursor, 10));
}

/** @param {number | undefined} limit @param {number} maximumPageSize */
function normalizeLimit(limit, maximumPageSize) {
  if (!Number.isSafeInteger(limit)) return Math.min(25, maximumPageSize);
  return Math.max(1, Math.min(Number(limit), maximumPageSize));
}

/** @param {AgentJsonValue} value @param {string[] | undefined} fields */
function selectFields(value, fields) {
  if (!fields || fields.length === 0) return value;
  /** @type {Record<string, AgentJsonValue>} */
  const selected = {};
  for (const field of [...new Set(fields)].sort()) {
    if (!/^[a-zA-Z0-9_.]+$/.test(field)) continue;
    const found = getPath(value, field);
    if (found !== undefined) setPath(selected, field, /** @type {AgentJsonValue} */ (found));
  }
  return selected;
}

/** @param {unknown} value @param {string} path @returns {unknown} */
function getPath(value, path) {
  let current = value;
  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = asRecord(current)[segment];
  }
  return current;
}

/** @param {Record<string, AgentJsonValue>} target @param {string} path @param {AgentJsonValue} value */
function setPath(target, path, value) {
  const segments = path.split('.');
  let current = target;
  segments.forEach((/** @type {string} */ segment, /** @type {number} */ index) => {
    if (index === segments.length - 1) current[segment] = value;
    else {
      const next = /** @type {Record<string, AgentJsonValue>} */ (asRecord(current[segment]));
      current[segment] = /** @type {AgentJsonValue} */ (next);
      current = next;
    }
  });
}

/** @param {unknown} value @param {number} limit @returns {unknown} */
function boundArrays(value, limit) {
  if (Array.isArray(value)) return value.slice(0, limit).map((item) => boundArrays(item, limit));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, boundArrays(item, limit)])
  );
}

/** @param {unknown} before @param {unknown} after @returns {AgentJsonValue | undefined} */
function diffJson(before, after) {
  if (canonicalStringify(before) === canonicalStringify(after)) return undefined;
  if (Array.isArray(before) && Array.isArray(after)) return diffArray(before, after);
  if (isRecord(before) && isRecord(after)) {
    /** @type {Record<string, AgentJsonValue>} */
    const changes = {};
    for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
      if (!(key in after)) changes[key] = { removed: true };
      else {
        const change = diffJson(before[key], after[key]);
        if (change !== undefined) changes[key] = change;
      }
    }
    return changes;
  }
  return /** @type {AgentJsonValue} */ (jsonClone(after));
}

/** @param {unknown[]} before @param {unknown[]} after @returns {AgentJsonValue} */
function diffArray(before, after) {
  const keyed = [...before, ...after].every(
    (item) => isRecord(item) && typeof item.id === 'string'
  );
  if (!keyed) return /** @type {AgentJsonValue} */ (jsonClone(after));
  const beforeById = new Map(before.map((item) => [String(asRecord(item).id), item]));
  const afterById = new Map(after.map((item) => [String(asRecord(item).id), item]));
  /** @type {AgentJsonValue[]} */
  const changed = [];
  for (const [id, item] of afterById) {
    const prior = beforeById.get(id);
    if (!prior) changed.push({ id, added: /** @type {AgentJsonValue} */ (jsonClone(item)) });
    else {
      const changes = diffJson(prior, item);
      if (changes !== undefined) changed.push({ id, changes });
    }
  }
  const removedIds = [...beforeById.keys()].filter((id) => !afterById.has(id));
  return { changed, removedIds };
}

/** @param {InternalSnapshot} snapshot @param {string} uri @param {string} kind @param {string} localId @param {AgentSystemRegistrySource} registry */
function resolveEntity(snapshot, uri, kind, localId, registry) {
  const seeded = registry.entities.find((entity) => entity.uri === uri);
  const lookup = entityLookup(snapshot.capture.domains, kind);
  const current = lookup.find((candidate) => String(candidate.id) === localId);
  if (current) {
    return {
      ownerDomainId: seeded?.ownerDomainId ?? ownerForKind(kind),
      state: /** @type {AgentJsonValue} */ (current),
      relations: seeded?.relations ?? [],
      evidence: 'canonical-runtime-projection',
    };
  }
  if (seeded) {
    return {
      ownerDomainId: seeded.ownerDomainId,
      state: /** @type {AgentJsonValue} */ ({
        id: seeded.currentId,
        label: seeded.label,
        dynamic: seeded.dynamic,
      }),
      relations: seeded.relations,
      evidence: 'seeded-registry-identity',
    };
  }
  return undefined;
}

/** @param {Record<AgentDomainId, AgentJsonValue>} domains @param {string} kind */
function entityLookup(domains, kind) {
  const production = asRecord(domains.production);
  const campaign = asRecord(domains.campaign);
  const material = asRecord(domains.material);
  const quality = asRecord(domains.quality);
  const maintenance = asRecord(domains.maintenance);
  const scada = asRecord(domains.scada);
  switch (kind) {
    case 'machine':
      return arrayOfRecords(production.machines);
    case 'decision':
      return arrayOfRecords(production.aiDecisions);
    case 'breakdown':
      return arrayOfRecords(maintenance.activeBreakdowns);
    case 'tag':
      return arrayOfRecords(scada.writableTags);
    case 'order':
      return arrayOfRecords(campaign.orders);
    case 'batch':
      return arrayOfRecords(material.productionBatches);
    case 'manifest':
      return arrayOfRecords(material.manifests);
    case 'incident':
      return arrayOfRecords(campaign.incidents);
    case 'alarm':
      return [
        ...arrayOfRecords(scada.activeAlarms),
        ...arrayOfRecords(quality.contaminationAlerts),
      ];
    default:
      return [];
  }
}

/** @param {string} kind @returns {AgentDomainId} */
function ownerForKind(kind) {
  switch (kind) {
    case 'machine':
    case 'decision':
      return 'production';
    case 'order':
    case 'incident':
      return 'campaign';
    case 'batch':
    case 'manifest':
      return 'material';
    case 'breakdown':
      return 'maintenance';
    case 'alarm':
    case 'tag':
      return 'scada';
    default:
      return 'evidence';
  }
}

/** @param {string} uri @param {AgentJsonValue} state @param {Array<{predicate:string,target:string}>} seeded */
function dynamicRelations(uri, state, seeded) {
  const relations = [...seeded];
  const record = asRecord(state);
  const candidates = [
    ['machineId', 'affects', 'machine'],
    ['orderId', 'fulfils', 'order'],
    ['batchId', 'describes', 'batch'],
  ];
  for (const [field, predicate, kind] of candidates) {
    if (typeof record[field] === 'string')
      relations.push({
        predicate,
        target: `millos://${kind}/${encodeURIComponent(String(record[field]))}`,
      });
  }
  for (const [field, predicate, kind] of [
    ['batchIds', 'contains', 'batch'],
    ['manifestIds', 'documented-by', 'manifest'],
  ]) {
    if (Array.isArray(record[field])) {
      for (const id of record[field])
        if (typeof id === 'string')
          relations.push({ predicate, target: `millos://${kind}/${encodeURIComponent(id)}` });
    }
  }
  return [{ predicate: 'self', target: uri }, ...relations].filter(
    (relation, index, values) =>
      values.findIndex(
        (candidate) =>
          candidate.predicate === relation.predicate && candidate.target === relation.target
      ) === index
  );
}

/** @param {unknown} value */
export function revisionFor(value) {
  // canonicalStringify(undefined) is undefined; an absent domain must hash, not throw.
  const input = canonicalStringify(value) ?? 'undefined';
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `r1-${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`;
}

/** @template T @param {T} value @returns {T} */
function immutableResponse(value) {
  return deepFreeze(jsonClone(value));
}

/** @template T @param {T} value @returns {T} */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(/** @type {object} */ (value))) deepFreeze(child);
  }
  return value;
}

/** @template T @param {T} value @returns {T} */
function jsonClone(value) {
  return JSON.parse(canonicalStringify(value));
}

/** @param {unknown} value */
export function byteLength(value) {
  return new globalThis.TextEncoder().encode(canonicalStringify(value)).byteLength;
}

/** @param {import('../contracts/queryContracts').AgentFreshness[]} freshness */
function latestObservedAt(freshness) {
  return (
    freshness
      .map((item) => item.observedAt)
      .sort()
      .at(-1) ?? new Date(0).toISOString()
  );
}

/** @param {string} code @param {'info'|'warning'|'blocking'} severity @param {string} message @param {string | undefined} [scope] @param {string | undefined} [remediation] @returns {AgentStructuredProblem} */
function problem(code, severity, message, scope, remediation) {
  return {
    code,
    severity,
    message,
    ...(scope ? { scope } : {}),
    ...(remediation ? { remediation } : {}),
  };
}

/** @param {AgentLink['rel']} rel @param {string} href @param {string} title @returns {AgentLink} */
function link(rel, href, title) {
  return { rel, href, title };
}

function standardLinks() {
  return [
    link('domain', 'millos://query/domain/campaign', 'Inspect objectives and constraints'),
    link('domain', 'millos://query/domain/safety', 'Inspect safety state'),
    link('domain', 'millos://query/domain/quality', 'Inspect quality release state'),
    link('capabilities', 'millos://query/capabilities', 'Inspect capabilities'),
    link('trace', 'millos://query/trace', 'Inspect bounded diagnostic evidence'),
  ];
}

/** @param {AgentDomainId} domainId @returns {AgentLink[]} */
function domainLinks(domainId) {
  return [
    link('self', `millos://query/domain/${domainId}`, `Current ${domainId} observation`),
    link('capabilities', 'millos://query/capabilities', 'Inspect capabilities'),
    link('trace', 'millos://query/trace', 'Inspect bounded diagnostic evidence'),
  ];
}

/** @param {unknown} value */
function priorityRank(value) {
  return value === 'critical' ? 0 : value === 'high' ? 1 : 2;
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function asRecord(value) {
  return isRecord(value) ? value : {};
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {Record<string, unknown>[]} */
function arrayOfRecords(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** @param {unknown} value @returns {unknown[]} */
function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

/** @param {unknown} value */
function numberValue(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** @param {unknown} value */
function stringValue(value) {
  return typeof value === 'string' ? value : '';
}

/** @param {unknown} value */
function stringOrNull(value) {
  return typeof value === 'string' ? value : null;
}
