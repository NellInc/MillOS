// @ts-check

import {
  formatSemanticUri,
  isSemanticEntityKind,
  MAX_SEMANTIC_LOCAL_ID_LENGTH,
  parseSemanticUri,
} from '../ontology/semanticUri.js';

/** @typedef {import('./systemManifest').AgentRegistryProblem} AgentRegistryProblem */
/** @typedef {import('./systemManifest').AgentRegistryValidationResult} AgentRegistryValidationResult */
/** @typedef {import('./systemManifest').AgentSystemRegistrySource} AgentSystemRegistrySource */

const DOMAIN_IDS = new Set([
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
const MODES = new Set(['simulation', 'shadow', 'replay', 'live-external']);
const REGISTRY_STATUSES = new Set(['current', 'candidate', 'historical']);
const INVARIANT_FAMILIES = new Set([
  'physical',
  'safety',
  'quality',
  'truth',
  'authority',
  'bilateral',
  'resource',
  'privacy',
]);
const INVARIANT_SEVERITIES = new Set(['warning', 'blocking', 'critical']);
const INVARIANT_STATUSES = new Set(['documented', 'executable', 'partially-executable']);
const CAPABILITY_STATUSES = new Set(['candidate', 'implemented', 'retired']);
const CAPABILITY_RISKS = new Set(['read', 'low', 'medium', 'high', 'critical']);
const EVIDENCE_LEVELS = new Set(['source', 'unit', 'integration', 'runtime', 'human', 'external']);
const SOURCE_KINDS = new Set(['source', 'test', 'scenario', 'ui', 'runtime', 'doc']);
const MAX_REGISTRY_ITEMS = 512;
const QUERY_RUNTIME_METHODS = [
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
];

/**
 * Validate the executable registry without mutating or normalizing it.
 * Problems are sorted so the same invalid input produces stable diagnostics.
 *
 * @param {unknown} value
 * @returns {AgentRegistryValidationResult}
 */
export function validateSystemRegistry(value) {
  /** @type {AgentRegistryProblem[]} */
  const problems = [];
  /** @type {(code: string, path: string, message: string) => void} */
  const add = (code, path, message) => {
    problems.push({ code, path, message });
  };

  if (!isRecord(value)) {
    add('REGISTRY_ROOT', '$', 'Registry must be an object.');
    return { valid: false, problems };
  }
  if (value.schemaVersion !== 1) {
    add('SCHEMA_VERSION', '$.schemaVersion', 'Only registry schema version 1 is supported.');
  }
  if (!isRecord(value.product)) {
    add('PRODUCT', '$.product', 'Product metadata must be an object.');
  } else {
    if (value.product.id !== 'millos')
      add('PRODUCT_ID', '$.product.id', 'Product ID must be millos.');
    if (!isNonEmptyString(value.product.version)) {
      add('PRODUCT_VERSION', '$.product.version', 'Product version must be a non-empty string.');
    }
  }
  if (!isRecord(value.semanticUri)) {
    add('SEMANTIC_URI', '$.semanticUri', 'Semantic URI settings must be an object.');
  } else {
    if (value.semanticUri.scheme !== 'millos') {
      add('SEMANTIC_SCHEME', '$.semanticUri.scheme', 'Semantic URI scheme must be millos.');
    }
    if (value.semanticUri.maximumLocalIdLength !== MAX_SEMANTIC_LOCAL_ID_LENGTH) {
      add(
        'SEMANTIC_LIMIT',
        '$.semanticUri.maximumLocalIdLength',
        `Semantic local ID limit must be ${MAX_SEMANTIC_LOCAL_ID_LENGTH}.`
      );
    }
  }
  if (!isRecord(value.queryPlane)) {
    add('QUERY_PLANE', '$.queryPlane', 'Query plane metadata must be an object.');
  } else {
    if (value.queryPlane.version !== 2) {
      add('QUERY_VERSION', '$.queryPlane.version', 'Only agent plane version 2 is supported.');
    }
    validatePositiveBound(
      value.queryPlane.level0MaximumBytes,
      '$.queryPlane.level0MaximumBytes',
      add
    );
    validatePositiveBound(
      value.queryPlane.level1MaximumBytes,
      '$.queryPlane.level1MaximumBytes',
      add
    );
    validatePositiveBound(value.queryPlane.maximumPageSize, '$.queryPlane.maximumPageSize', add);
    validatePositiveBound(
      value.queryPlane.snapshotHistorySize,
      '$.queryPlane.snapshotHistorySize',
      add
    );
    const methods = requireStrings(
      value.queryPlane.runtimeMethods,
      '$.queryPlane.runtimeMethods',
      add,
      true
    );
    if (
      methods.length !== QUERY_RUNTIME_METHODS.length ||
      methods.some((method, index) => method !== QUERY_RUNTIME_METHODS[index])
    ) {
      add(
        'QUERY_METHODS',
        '$.queryPlane.runtimeMethods',
        `Runtime methods must be ${QUERY_RUNTIME_METHODS.join(', ')} in contract order.`
      );
    }
    if (!isRecord(value.queryPlane.authority)) {
      add('QUERY_AUTHORITY', '$.queryPlane.authority', 'Query authority must be an object.');
    } else if (
      value.queryPlane.authority.observationOnly !== false ||
      value.queryPlane.authority.commandExecution !== true ||
      value.queryPlane.authority.externalWrites !== false
    ) {
      add(
        'QUERY_AUTHORITY_BOUNDARY',
        '$.queryPlane.authority',
        'Agent plane v2 must enable scoped command execution while external writes remain denied.'
      );
    }
  }

  const domains = boundedArray(value.domains, '$.domains', add);
  const invariants = boundedArray(value.invariants, '$.invariants', add);
  const entities = boundedArray(value.entities, '$.entities', add);
  const aliases = boundedArray(value.aliases, '$.aliases', add);
  const capabilities = boundedArray(value.capabilities, '$.capabilities', add);

  const domainIds = uniqueIds(domains, '$.domains', 'id', 'DOMAIN', add);
  const invariantIds = uniqueIds(invariants, '$.invariants', 'id', 'INVARIANT', add);
  const entityUris = uniqueIds(entities, '$.entities', 'uri', 'ENTITY', add);
  const capabilityIds = uniqueIds(capabilities, '$.capabilities', 'id', 'CAPABILITY', add);

  domains.forEach((domain, index) => {
    const path = `$.domains[${index}]`;
    if (!isRecord(domain)) return add('DOMAIN_SHAPE', path, 'Domain descriptor must be an object.');
    if (!DOMAIN_IDS.has(String(domain.id))) add('DOMAIN_ID', `${path}.id`, 'Domain ID is unknown.');
    if (!REGISTRY_STATUSES.has(String(domain.status))) {
      add('DOMAIN_STATUS', `${path}.status`, 'Domain status is unknown.');
    }
    requireStrings(domain.stateOwners, `${path}.stateOwners`, add, true);
    requireStrings(domain.writeScope, `${path}.writeScope`, add, true);
    requireStrings(domain.internalTransitions, `${path}.internalTransitions`, add, true);
    if (!isNonEmptyString(domain.readProjection)) {
      add('DOMAIN_PROJECTION', `${path}.readProjection`, 'Read projection must be described.');
    }
    for (const capabilityId of requireStrings(
      domain.operationalCommandCandidates,
      `${path}.operationalCommandCandidates`,
      add
    )) {
      if (!capabilityIds.has(capabilityId)) {
        add(
          'DOMAIN_CAPABILITY_REF',
          `${path}.operationalCommandCandidates`,
          `${capabilityId} is unknown.`
        );
      }
    }
    validateInvariantRefs(domain.invariantIds, `${path}.invariantIds`, invariantIds, add);
    validateSourceRefs(domain.sourceRefs, `${path}.sourceRefs`, add);
  });

  invariants.forEach((invariant, index) => {
    const path = `$.invariants[${index}]`;
    if (!isRecord(invariant)) {
      add('INVARIANT_SHAPE', path, 'Invariant descriptor must be an object.');
      return;
    }
    if (!/^INV(?:\.[A-Z0-9_]+){2,}$/.test(String(invariant.id))) {
      add('INVARIANT_ID', `${path}.id`, 'Invariant ID must use INV.FAMILY.NAME form.');
    }
    validateDescriptorUri(invariant.uri, 'invariant', invariant.id, `${path}.uri`, add);
    if (!domainIds.has(String(invariant.ownerDomainId))) {
      add('INVARIANT_OWNER', `${path}.ownerDomainId`, 'Invariant owner domain is unknown.');
    }
    if (!INVARIANT_FAMILIES.has(String(invariant.family))) {
      add('INVARIANT_FAMILY', `${path}.family`, 'Invariant family is unknown.');
    }
    if (!INVARIANT_SEVERITIES.has(String(invariant.severity))) {
      add('INVARIANT_SEVERITY', `${path}.severity`, 'Invariant severity is unknown.');
    }
    if (!INVARIANT_STATUSES.has(String(invariant.status))) {
      add('INVARIANT_STATUS', `${path}.status`, 'Invariant status is unknown.');
    }
    validateModes(invariant.applicableModes, `${path}.applicableModes`, add);
    validateSourceRefs(invariant.sourceRefs, `${path}.sourceRefs`, add);
    if (!isNonEmptyString(invariant.remediation)) {
      add('INVARIANT_REMEDIATION', `${path}.remediation`, 'Invariant remediation is required.');
    }
  });

  entities.forEach((entity, index) => {
    const path = `$.entities[${index}]`;
    if (!isRecord(entity)) return add('ENTITY_SHAPE', path, 'Entity seed must be an object.');
    if (!isSemanticEntityKind(entity.kind)) {
      add('ENTITY_KIND', `${path}.kind`, 'Entity kind is unknown.');
    } else if (isNonEmptyString(entity.currentId)) {
      validateDescriptorUri(entity.uri, entity.kind, entity.currentId, `${path}.uri`, add);
    } else {
      add('ENTITY_CURRENT_ID', `${path}.currentId`, 'Current domain ID is required.');
    }
    if (!domainIds.has(String(entity.ownerDomainId))) {
      add('ENTITY_OWNER', `${path}.ownerDomainId`, 'Entity owner domain is unknown.');
    }
    if (typeof entity.dynamic !== 'boolean') {
      add('ENTITY_DYNAMIC', `${path}.dynamic`, 'Entity dynamic marker must be boolean.');
    }
    requireStrings(entity.aliases, `${path}.aliases`, add);
    validateSourceRefs(entity.sourceRefs, `${path}.sourceRefs`, add);
  });

  const aliasKeys = new Set();
  aliases.forEach((alias, index) => {
    const path = `$.aliases[${index}]`;
    if (!isRecord(alias)) return add('ALIAS_SHAPE', path, 'Alias descriptor must be an object.');
    if (!isNonEmptyString(alias.alias)) add('ALIAS_ID', `${path}.alias`, 'Alias is required.');
    else if (aliasKeys.has(alias.alias))
      add('ALIAS_DUPLICATE', `${path}.alias`, 'Alias is duplicated.');
    else aliasKeys.add(alias.alias);
    if (!entityUris.has(String(alias.canonicalUri))) {
      add('ALIAS_TARGET', `${path}.canonicalUri`, 'Alias target must be a seeded entity URI.');
    }
  });

  capabilities.forEach((capability, index) => {
    const path = `$.capabilities[${index}]`;
    if (!isRecord(capability)) {
      add('CAPABILITY_SHAPE', path, 'Capability descriptor must be an object.');
      return;
    }
    if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/.test(String(capability.id))) {
      add('CAPABILITY_ID', `${path}.id`, 'Capability ID must use lower-case dotted form.');
    }
    validateDescriptorUri(capability.uri, 'capability', capability.id, `${path}.uri`, add);
    if (!domainIds.has(String(capability.ownerDomainId))) {
      add('CAPABILITY_OWNER', `${path}.ownerDomainId`, 'Capability owner domain is unknown.');
    }
    if (!CAPABILITY_STATUSES.has(String(capability.status))) {
      add('CAPABILITY_STATUS', `${path}.status`, 'Capability status is unknown.');
    }
    if (!CAPABILITY_RISKS.has(String(capability.risk))) {
      add('CAPABILITY_RISK', `${path}.risk`, 'Capability risk is unknown.');
    }
    if (!Number.isSafeInteger(capability.version) || Number(capability.version) < 1) {
      add(
        'CAPABILITY_VERSION',
        `${path}.version`,
        'Capability version must be a positive integer.'
      );
    }
    validateModes(capability.modes, `${path}.modes`, add);
    for (const kind of requireStrings(capability.targetKinds, `${path}.targetKinds`, add, true)) {
      if (!isSemanticEntityKind(kind)) {
        add('CAPABILITY_TARGET_KIND', `${path}.targetKinds`, `${kind} is unknown.`);
      }
    }
    validateJsonSchema(capability.parameters, `${path}.parameters`, add);
    validateJsonSchema(capability.result, `${path}.result`, add);
    validateInvariantRefs(capability.invariantIds, `${path}.invariantIds`, invariantIds, add);
    const writes = requireStrings(capability.writes, `${path}.writes`, add, true);
    for (const write of writes) {
      if (!write.startsWith(`${capability.ownerDomainId}.`)) {
        add(
          'CAPABILITY_WRITE_OWNER',
          `${path}.writes`,
          `${write} is outside owner domain ${capability.ownerDomainId}.`
        );
      }
    }
    requireStrings(capability.reads, `${path}.reads`, add, true);
    requireStrings(capability.preconditions, `${path}.preconditions`, add, true);
    requireStrings(capability.currentCallers, `${path}.currentCallers`, add);
    validateSourceRefs(capability.sourceRefs, `${path}.sourceRefs`, add);
  });

  problems.sort((left, right) =>
    `${left.path}\u0000${left.code}\u0000${left.message}`.localeCompare(
      `${right.path}\u0000${right.code}\u0000${right.message}`
    )
  );
  return { valid: problems.length === 0, problems };
}

/**
 * Deterministic JSON serialization for fingerprints and generated artifacts.
 * Object keys are sorted recursively. Array order remains an authored contract.
 *
 * @param {unknown} value
 * @param {number} [space]
 * @returns {string}
 */
export function canonicalStringify(value, space = 0) {
  return JSON.stringify(sortObjectKeys(value), null, space);
}

/** @param {unknown} value @returns {unknown} */
function sortObjectKeys(value) {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortObjectKeys(value[key])])
  );
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is string} */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {(code: string, path: string, message: string) => void} add
 */
function validatePositiveBound(value, path, add) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    add('QUERY_BOUND', path, 'Query bounds must be positive safe integers.');
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {(code: string, path: string, message: string) => void} add
 * @returns {unknown[]}
 */
function boundedArray(value, path, add) {
  if (!Array.isArray(value)) {
    add('ARRAY_REQUIRED', path, 'Value must be an array.');
    return [];
  }
  if (value.length > MAX_REGISTRY_ITEMS) {
    add('ARRAY_BOUND', path, `Array exceeds ${MAX_REGISTRY_ITEMS} entries.`);
  }
  return value;
}

/**
 * @param {unknown[]} values
 * @param {string} path
 * @param {string} property
 * @param {string} prefix
 * @param {(code: string, path: string, message: string) => void} add
 * @returns {Set<string>}
 */
function uniqueIds(values, path, property, prefix, add) {
  const ids = new Set();
  values.forEach((value, index) => {
    const id = isRecord(value) ? value[property] : undefined;
    if (!isNonEmptyString(id)) {
      add(
        `${prefix}_ID_REQUIRED`,
        `${path}[${index}].${property}`,
        'ID must be a non-empty string.'
      );
    } else if (ids.has(id)) {
      add(`${prefix}_ID_DUPLICATE`, `${path}[${index}].${property}`, `${id} is duplicated.`);
    } else {
      ids.add(id);
    }
  });
  return ids;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {(code: string, path: string, message: string) => void} add
 * @param {boolean} [nonEmpty]
 * @returns {string[]}
 */
function requireStrings(value, path, add, nonEmpty = false) {
  if (!Array.isArray(value) || value.some((entry) => !isNonEmptyString(entry))) {
    add('STRING_ARRAY', path, 'Value must be an array of non-empty strings.');
    return [];
  }
  if (nonEmpty && value.length === 0)
    add('STRING_ARRAY_EMPTY', path, 'At least one entry is required.');
  return /** @type {string[]} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {(code: string, path: string, message: string) => void} add
 */
function validateModes(value, path, add) {
  const modes = requireStrings(value, path, add, true);
  for (const mode of modes) if (!MODES.has(mode)) add('MODE_UNKNOWN', path, `${mode} is unknown.`);
  if (new Set(modes).size !== modes.length) add('MODE_DUPLICATE', path, 'Modes must be unique.');
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {Set<string>} known
 * @param {(code: string, path: string, message: string) => void} add
 */
function validateInvariantRefs(value, path, known, add) {
  for (const id of requireStrings(value, path, add, true)) {
    if (!known.has(id)) add('INVARIANT_REF', path, `${id} is unknown.`);
  }
}

/**
 * @param {unknown} value
 * @param {string} kind
 * @param {unknown} localId
 * @param {string} path
 * @param {(code: string, path: string, message: string) => void} add
 */
function validateDescriptorUri(value, kind, localId, path, add) {
  if (!isSemanticEntityKind(kind) || !isNonEmptyString(localId) || !isNonEmptyString(value)) {
    add('SEMANTIC_URI_DESCRIPTOR', path, 'Descriptor URI, kind, and local ID are required.');
    return;
  }
  try {
    const parsed = parseSemanticUri(value);
    const expected = formatSemanticUri(kind, localId);
    if (parsed.uri !== expected) add('SEMANTIC_URI_MISMATCH', path, `Expected ${expected}.`);
  } catch (error) {
    add('SEMANTIC_URI_INVALID', path, error instanceof Error ? error.message : String(error));
  }
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {(code: string, path: string, message: string) => void} add
 */
function validateSourceRefs(value, path, add) {
  if (!Array.isArray(value) || value.length === 0) {
    add('SOURCE_REFS', path, 'At least one source reference is required.');
    return;
  }
  value.forEach((sourceRef, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(sourceRef))
      return add('SOURCE_REF_SHAPE', itemPath, 'Source reference must be an object.');
    if (!SOURCE_KINDS.has(String(sourceRef.kind))) {
      add('SOURCE_REF_KIND', `${itemPath}.kind`, 'Source reference kind is unknown.');
    }
    if (
      !isNonEmptyString(sourceRef.path) ||
      sourceRef.path.startsWith('/') ||
      sourceRef.path.includes('..')
    ) {
      add(
        'SOURCE_REF_PATH',
        `${itemPath}.path`,
        'Source path must be repository-relative and traversal-free.'
      );
    }
    if (!EVIDENCE_LEVELS.has(String(sourceRef.evidenceLevel))) {
      add('SOURCE_REF_EVIDENCE', `${itemPath}.evidenceLevel`, 'Evidence level is unknown.');
    }
  });
}

/**
 * @param {unknown} value
 * @param {string} path
 * @param {(code: string, path: string, message: string) => void} add
 */
function validateJsonSchema(value, path, add) {
  if (!isRecord(value)) return add('JSON_SCHEMA', path, 'JSON Schema must be an object.');
  if (value.type !== 'object')
    add('JSON_SCHEMA_TYPE', `${path}.type`, 'Root schema type must be object.');
  if (value.additionalProperties !== false) {
    add(
      'JSON_SCHEMA_ADDITIONAL',
      `${path}.additionalProperties`,
      'Additional properties must be denied.'
    );
  }
  const required = requireStrings(value.required, `${path}.required`, add);
  if (!isRecord(value.properties)) {
    add('JSON_SCHEMA_PROPERTIES', `${path}.properties`, 'Properties must be an object.');
    return;
  }
  for (const name of required) {
    if (!(name in value.properties))
      add('JSON_SCHEMA_REQUIRED', `${path}.required`, `${name} has no schema.`);
  }
}
