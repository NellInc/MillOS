import type {
  AgentCapabilityDescriptor,
  AgentDomainId,
  AgentRisk,
  AgentRuntimeMode,
} from './systemManifest';
import type { AgentJsonValue, AgentRuntimeReadApi, AgentStructuredProblem } from './queryContracts';

export type AgentCommandStatus =
  | 'rejected'
  | 'previewed'
  | 'committed'
  | 'verified'
  | 'failed'
  | 'duplicate';

export interface AgentCommandEnvelope {
  schemaVersion: 1;
  commandId: string;
  idempotencyKey: string;
  capabilityId: string;
  capabilityVersion: number;
  actorUri: string;
  grantId: string;
  targetUri: string;
  parameters: Record<string, AgentJsonValue>;
  reason: string;
  observedRevision: string;
  mode: AgentRuntimeMode;
  requestedAt: string;
}

export interface AgentCommandDraftRequest {
  capabilityId: string;
  targetUri: string;
  parameters?: Record<string, AgentJsonValue>;
  reason: string;
  actorUri?: string;
  grantId?: string;
  idempotencyKey?: string;
}

export interface AgentLegalOptionsRequest {
  targetUri: string;
  actorUri?: string;
  grantId?: string;
}

/**
 * One command that would pass every current check for the requesting actor.
 * It carries no reason: the chooser must supply its own before draft(), and
 * draft -> preview -> commit still re-checks everything.
 */
export interface AgentLegalOption {
  optionId: string;
  capabilityId: string;
  title: string;
  risk: AgentRisk;
  approvalRequired: boolean;
  draft: Omit<AgentCommandDraftRequest, 'reason' | 'idempotencyKey'>;
  effects: string[];
  uncertainties: string[];
}

export interface AgentLegalOptionSet {
  schemaVersion: 1;
  targetUri: string;
  actorUri: string;
  grantId: string;
  mode: AgentRuntimeMode;
  generatedAt: string;
  options: AgentLegalOption[];
  /** Permitted, but a required parameter has no closed set of values to offer. */
  needsInput: Array<{ capabilityId: string; parameters: string[] }>;
  excluded: Array<{ optionId: string; capabilityId: string; reasons: string[] }>;
}

export interface AgentActorDescriptor {
  id: string;
  uri: string;
  label: string;
  kind: 'human' | 'becoming-mind' | 'system';
  status: 'active' | 'suspended';
  purposes: string[];
}

export interface AgentAuthorityGrant {
  id: string;
  actorUri: string;
  purpose: string;
  capabilityIds: string[];
  targetUriPrefixes: string[];
  modes: AgentRuntimeMode[];
  riskCeiling: AgentRisk;
  approvalRisks: AgentRisk[];
  resourceBudget: {
    maximumCommands: number;
    maximumExternalCalls: number;
  };
  issuedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
  escalation: string;
}

export interface AgentPolicyObjection {
  id: string;
  raisedBy: string;
  capabilityIds: string[];
  modes: AgentRuntimeMode[];
  statement: string;
  requestedDisposition: 'pause' | 'narrow' | 'escalate';
  status: 'active' | 'resolved';
  raisedAt: string;
  resolvedAt: string | null;
  resolution: string | null;
}

export interface AgentPolicyEnvelope {
  schemaVersion: 1;
  revision: string;
  objectives: string[];
  constraints: string[];
  preferences: string[];
  objections: AgentPolicyObjection[];
  conflicts: Array<{ id: string; statement: string; status: 'open' | 'resolved' }>;
  tradeoffs: Array<{ id: string; statement: string; acceptedBy: string[] }>;
}

export interface AgentAuthorityDecision {
  allowed: boolean;
  approvalRequired: boolean;
  grantId: string | null;
  reasons: string[];
  matchedScope: string | null;
  externalCallsRemaining: number;
  commandsRemaining: number;
}

export interface AgentCommandPreview {
  schemaVersion: 1;
  previewId: string;
  status: 'ready' | 'requires-approval' | 'denied';
  command: AgentCommandEnvelope;
  capability: AgentCapabilityDescriptor;
  effects: string[];
  uncertainties: string[];
  preconditions: Array<{ id: string; satisfied: boolean; detail: string }>;
  invariants: Array<{ id: string; satisfied: boolean; detail: string }>;
  cost: AgentCapabilityDescriptor['costModel'];
  authority: AgentAuthorityDecision;
  observedRevision: string;
  materialFingerprint: string;
  expiresAt: string;
  problems: AgentStructuredProblem[];
}

export interface AgentApprovalToken {
  schemaVersion: 1;
  approvalId: string;
  previewId: string;
  previewRevision: string;
  materialFingerprint: string;
  approvedBy: string;
  reason: string;
  issuedAt: string;
  expiresAt: string;
}

export interface AgentVerificationResult {
  id: string;
  passed: boolean;
  detail: string;
}

export interface AgentExecutionReceipt {
  schemaVersion: 1;
  receiptId: string;
  status: AgentCommandStatus;
  commandId: string;
  idempotencyKey: string;
  capabilityId: string;
  targetUri: string;
  actorUri: string;
  grantId: string;
  mode: AgentRuntimeMode;
  correlationId: string;
  previewId: string | null;
  approvalId: string | null;
  beforeRevision: string;
  afterRevision: string;
  changedDomains: AgentDomainId[];
  effects: string[];
  result: AgentJsonValue;
  verification: AgentVerificationResult[];
  problems: AgentStructuredProblem[];
  startedAt: string;
  completedAt: string;
  duplicateOfReceiptId: string | null;
}

export interface AgentCausalEvent {
  eventId: string;
  schemaVersion: 2;
  correlationId: string;
  causationId: string | null;
  commandId: string;
  actorUri: string;
  grantId: string;
  domain: AgentDomainId | 'authority' | 'policy';
  kind: string;
  wallTime: string;
  simulationTime: { day: number; hour: number };
  beforeRevision: string;
  afterRevision: string;
  targetUri: string;
  payload: AgentJsonValue;
  provenance: Array<{ kind: string; source: string }>;
}

export interface AgentLesson {
  id: string;
  statement: string;
  evidenceEventIds: string[];
  promotedBy: string;
  promotedAt: string;
  authority: 'advisory' | 'human-reviewed';
  evidenceFingerprint: string;
}

export interface AgentEvidenceExport {
  schemaVersion: 2;
  evidenceFingerprint: string;
  exportedAt: string;
  eventBound: number;
  events: AgentCausalEvent[];
  lessons: AgentLesson[];
  compaction: {
    discardedEvents: number;
    oldestRetainedEventId: string | null;
    newestRetainedEventId: string | null;
  };
}

export interface AgentScenarioResult {
  schemaVersion: 1;
  scenarioId: string;
  seed: string;
  deterministic: boolean;
  truthLabel: 'observed' | 'prediction' | 'counterfactual' | 'shadow';
  evidenceFingerprint: string;
  receipts: AgentExecutionReceipt[];
  assertions: AgentVerificationResult[];
}

export interface AgentRuntimeApi extends Omit<AgentRuntimeReadApi, 'version' | 'capabilities'> {
  readonly version: 2;
  capabilities: () => import('./queryContracts').AgentObservationEnvelope<{
    authority: {
      observationOnly: false;
      commandExecution: true;
      externalWrites: false;
      defaultActorUri: string;
      activeGrantIds: string[];
      policyRevision: string;
    };
    items: Array<
      AgentCapabilityDescriptor & {
        executable: boolean;
        authorityReason: string;
      }
    >;
  }>;
  /**
   * The closed set of commands currently legal on one target. Read-only: it
   * writes no preview, ledger event or budget use.
   */
  legalOptions: (request: AgentLegalOptionsRequest) => Promise<AgentLegalOptionSet>;
  draft: (request: AgentCommandDraftRequest) => AgentCommandEnvelope;
  preview: (command: AgentCommandEnvelope) => Promise<AgentCommandPreview>;
  /**
   * Approvals recorded through the browser runtime are always attributed to
   * the human operator; the surface takes no approver argument, so a script
   * holding the runtime handle cannot assert a different identity.
   */
  approve: (previewId: string, reason: string) => AgentApprovalToken;
  commit: (
    previewOrCommand: AgentCommandPreview | AgentCommandEnvelope,
    approval?: AgentApprovalToken
  ) => Promise<AgentExecutionReceipt>;
  actors: () => readonly AgentActorDescriptor[];
  grants: () => readonly AgentAuthorityGrant[];
  policy: () => AgentPolicyEnvelope;
  revokeGrant: (grantId: string, reason: string) => boolean;
  object: (
    capabilityIds: string[],
    statement: string,
    requestedDisposition?: AgentPolicyObjection['requestedDisposition'],
    modes?: AgentRuntimeMode[]
  ) => AgentPolicyObjection;
  resolveObjection: (objectionId: string, resolution: string) => boolean;
  evidence: () => AgentEvidenceExport;
  importEvidence: (value: unknown) => { imported: number; problems: AgentStructuredProblem[] };
  promoteLesson: (
    statement: string,
    evidenceEventIds: string[],
    promotedBy: string,
    humanReviewed?: boolean
  ) => AgentLesson;
}
