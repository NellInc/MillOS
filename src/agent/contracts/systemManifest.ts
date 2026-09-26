export type AgentDomainId =
  | 'simulation'
  | 'production'
  | 'material'
  | 'quality'
  | 'maintenance'
  | 'campaign'
  | 'logistics'
  | 'safety'
  | 'scada'
  | 'experience'
  | 'evidence';

export type AgentEntityKind =
  | 'machine'
  | 'order'
  | 'batch'
  | 'manifest'
  | 'incident'
  | 'alarm'
  | 'tag'
  | 'decision'
  | 'breakdown'
  | 'simulation'
  | 'dispatch'
  | 'actor'
  | 'grant'
  | 'receipt'
  | 'event'
  | 'lesson'
  | 'capability'
  | 'invariant';

export type AgentRuntimeMode = 'simulation' | 'shadow' | 'replay' | 'live-external';

export type AgentEvidenceLevel =
  | 'source'
  | 'unit'
  | 'integration'
  | 'runtime'
  | 'human'
  | 'external';

export type AgentRisk = 'read' | 'low' | 'medium' | 'high' | 'critical';

export type RegistryStatus = 'current' | 'candidate' | 'historical';

export interface AgentSourceRef {
  kind: 'source' | 'test' | 'scenario' | 'ui' | 'runtime' | 'doc';
  path: string;
  symbol?: string;
  evidenceLevel: AgentEvidenceLevel;
  note?: string;
}

export interface AgentRelationDescriptor {
  predicate: string;
  target: string;
}

export interface AgentEntitySeed {
  uri: string;
  kind: AgentEntityKind;
  currentId: string;
  ownerDomainId: AgentDomainId;
  label: string;
  aliases: string[];
  dynamic: boolean;
  relations: AgentRelationDescriptor[];
  sourceRefs: AgentSourceRef[];
}

export interface AgentDomainDescriptor {
  id: AgentDomainId;
  label: string;
  status: RegistryStatus;
  stateOwners: string[];
  writeScope: string[];
  internalTransitions: string[];
  readProjection: string;
  operationalCommandCandidates: string[];
  eventTypes: string[];
  invariantIds: string[];
  sourceRefs: AgentSourceRef[];
}

export interface AgentInvariantDescriptor {
  id: string;
  uri: string;
  title: string;
  family:
    | 'physical'
    | 'safety'
    | 'quality'
    | 'truth'
    | 'authority'
    | 'bilateral'
    | 'resource'
    | 'privacy';
  ownerDomainId: AgentDomainId;
  severity: 'warning' | 'blocking' | 'critical';
  status: 'documented' | 'executable' | 'partially-executable';
  checker: string | null;
  applicableModes: AgentRuntimeMode[];
  remediation: string;
  sourceRefs: AgentSourceRef[];
}

export interface AgentJsonSchema {
  type: 'object';
  additionalProperties: boolean;
  required: string[];
  properties: Record<string, Readonly<Record<string, unknown>>>;
}

export interface AgentResourceCostModel {
  latencyClass: 'local' | 'interactive' | 'long-running';
  computeClass: 'trivial' | 'bounded' | 'intensive';
  externalCalls: boolean;
  boundedCollectionWrites: number;
}

export interface AgentCapabilityDescriptor {
  id: string;
  uri: string;
  version: number;
  status: 'candidate' | 'implemented' | 'retired';
  title: string;
  ownerDomainId: AgentDomainId;
  modes: AgentRuntimeMode[];
  risk: AgentRisk;
  targetKinds: AgentEntityKind[];
  parameters: AgentJsonSchema;
  result: AgentJsonSchema;
  reads: string[];
  writes: string[];
  preconditions: string[];
  invariantIds: string[];
  sideEffects: string[];
  reversible: boolean;
  compensationCapability: string | null;
  supportsPreview: boolean;
  expectedLatencyMs: number;
  costModel: AgentResourceCostModel;
  verifier: string;
  currentCallers: string[];
  sourceRefs: AgentSourceRef[];
}

export interface AgentAliasDescriptor {
  alias: string;
  canonicalUri: string;
}

export interface AgentQueryPlaneDescriptor {
  version: 2;
  level0MaximumBytes: number;
  level1MaximumBytes: number;
  maximumPageSize: number;
  snapshotHistorySize: number;
  runtimeMethods: Array<
    | 'brief'
    | 'query'
    | 'capabilities'
    | 'trace'
    | 'legalOptions'
    | 'draft'
    | 'preview'
    | 'approve'
    | 'commit'
    | 'actors'
    | 'grants'
    | 'policy'
    | 'revokeGrant'
    | 'object'
    | 'resolveObjection'
    | 'evidence'
    | 'importEvidence'
    | 'promoteLesson'
  >;
  authority: {
    observationOnly: false;
    commandExecution: true;
    externalWrites: false;
  };
}

export interface AgentSystemRegistrySource {
  schemaVersion: 1;
  product: {
    id: 'millos';
    version: string;
  };
  semanticUri: {
    scheme: 'millos';
    maximumLocalIdLength: number;
  };
  queryPlane: AgentQueryPlaneDescriptor;
  domains: AgentDomainDescriptor[];
  invariants: AgentInvariantDescriptor[];
  entities: AgentEntitySeed[];
  aliases: AgentAliasDescriptor[];
  capabilities: AgentCapabilityDescriptor[];
}

export interface AgentGeneratedManifest extends AgentSystemRegistrySource {
  generation: {
    generatorVersion: 1;
    sourceFingerprint: string;
    sourceFiles: string[];
  };
}

export interface AgentRegistryProblem {
  code: string;
  path: string;
  message: string;
}

export interface AgentRegistryValidationResult {
  valid: boolean;
  problems: AgentRegistryProblem[];
}
