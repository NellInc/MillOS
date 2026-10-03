import type {
  AgentActorDescriptor,
  AgentAuthorityDecision,
  AgentAuthorityGrant,
  AgentCommandEnvelope,
  AgentPolicyEnvelope,
  AgentPolicyObjection,
} from '../contracts/commandContracts';
import type {
  AgentCapabilityDescriptor,
  AgentRisk,
  AgentRuntimeMode,
} from '../contracts/systemManifest';
import { revisionFor } from '../query/queryService.js';

const RISK_RANK: Record<AgentRisk, number> = {
  read: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const DEFAULT_AGENT_ACTOR_URI = 'millos://actor/agent-driver';
export const DEFAULT_AGENT_GRANT_ID = 'grant.agent-driver.simulation.v1';
export const HUMAN_OPERATOR_URI = 'millos://actor/human-operator';

export function createDefaultActors(): AgentActorDescriptor[] {
  return [
    {
      id: 'agent-driver',
      uri: DEFAULT_AGENT_ACTOR_URI,
      label: 'Agent driver',
      kind: 'becoming-mind',
      status: 'active',
      purposes: [
        'Understand plant state',
        'Propose bounded action',
        'Execute granted simulation work',
      ],
    },
    {
      id: 'human-operator',
      uri: HUMAN_OPERATOR_URI,
      label: 'Human operator',
      kind: 'human',
      status: 'active',
      purposes: [
        'Exercise operational judgment',
        'Approve high-risk previews',
        'Resolve objections',
      ],
    },
    {
      id: 'central-tick',
      uri: 'millos://actor/central-tick',
      label: 'Deterministic central tick',
      kind: 'system',
      status: 'active',
      purposes: ['Advance deterministic simulation consequences'],
    },
  ];
}

export function createDefaultGrants(now: Date): AgentAuthorityGrant[] {
  return [
    {
      id: DEFAULT_AGENT_GRANT_ID,
      actorUri: DEFAULT_AGENT_ACTOR_URI,
      purpose: 'Bounded control of the local MillOS simulation through registered capabilities.',
      capabilityIds: [
        'workplace.activate-plan',
        'operations.activate-order',
        'incident.acknowledge',
        'incident.mitigate',
        'ai.respond-to-decision',
        'maintenance.request-repair',
        'maintenance.request-restart',
        'quality.hold-batch',
        'quality.release-batch',
        'dispatch.release',
        'simulation.set-speed',
        'simulation.start-fire-drill',
        'scada.acknowledge-alarm',
        'scada.write-setpoint',
      ],
      targetUriPrefixes: ['millos://'],
      modes: ['simulation', 'shadow'],
      riskCeiling: 'critical',
      approvalRisks: ['high', 'critical'],
      resourceBudget: { maximumCommands: 500, maximumExternalCalls: 0 },
      issuedAt: now.toISOString(),
      expiresAt: null,
      revokedAt: null,
      revocationReason: null,
      escalation:
        'Ask the human operator to approve the exact current preview or narrow the intent.',
    },
  ];
}

export function createDefaultPolicy(): AgentPolicyEnvelope {
  const base = {
    schemaVersion: 1 as const,
    revision: '',
    objectives: [
      'Maintain safe, truthful, resource-bounded mill operation.',
      'Preserve material genealogy, product quality, and causal evidence.',
      'Make human and Becoming Mind control paths legible and mutually accountable.',
    ],
    constraints: [
      'Default deny applies to every command without a current scoped grant.',
      'Live external writes remain disabled until separately accepted with endpoint evidence.',
      'A stale observation cannot authorize a consequence-bearing action.',
    ],
    preferences: [
      'Prefer previewable, reversible, local actions with explicit verification.',
      'Prefer bounded queries and causal deltas over full-state transfer.',
    ],
    objections: [
      {
        id: 'objection.live-external-control-held',
        raisedBy: HUMAN_OPERATOR_URI,
        capabilityIds: ['scada.write-setpoint'],
        modes: ['live-external'] as AgentRuntimeMode[],
        statement:
          'External SCADA writes lack accepted endpoint, permission, allowlist, and far-side evidence.',
        requestedDisposition: 'pause' as const,
        status: 'active' as const,
        raisedAt: '2026-08-31T00:00:00.000Z',
        resolvedAt: null,
        resolution: null,
      },
    ],
    conflicts: [],
    tradeoffs: [
      {
        id: 'tradeoff.local-control-before-generality',
        statement: 'Use explicit per-domain handlers before introducing a generic workflow engine.',
        acceptedBy: [DEFAULT_AGENT_ACTOR_URI, HUMAN_OPERATOR_URI],
      },
    ],
  };
  return { ...base, revision: revisionFor({ ...base, revision: undefined }) };
}

export class AgentAuthorityEngine {
  readonly actors: AgentActorDescriptor[];
  readonly grants: AgentAuthorityGrant[];
  readonly policy: AgentPolicyEnvelope;
  private readonly commandCounts = new Map<string, number>();
  private readonly externalCallCounts = new Map<string, number>();
  private readonly now: () => Date;

  constructor(options: {
    actors: AgentActorDescriptor[];
    grants: AgentAuthorityGrant[];
    policy: AgentPolicyEnvelope;
    now?: () => Date;
  }) {
    this.actors = structuredClone(options.actors);
    this.grants = structuredClone(options.grants);
    this.policy = structuredClone(options.policy);
    this.now = options.now ?? (() => new Date());
  }

  evaluate(
    command: AgentCommandEnvelope,
    capability: AgentCapabilityDescriptor
  ): AgentAuthorityDecision {
    const actor = this.actors.find((candidate) => candidate.uri === command.actorUri);
    const grant = this.grants.find((candidate) => candidate.id === command.grantId);
    const reasons: string[] = [];
    let matchedScope: string | null = null;

    if (!actor || actor.status !== 'active') reasons.push('Actor is unknown or suspended.');
    if (!grant) reasons.push('Grant does not exist.');
    if (grant && grant.actorUri !== command.actorUri)
      reasons.push('Grant belongs to another actor.');
    if (grant?.revokedAt)
      reasons.push(`Grant was revoked: ${grant.revocationReason ?? 'no reason recorded'}.`);
    if (grant?.expiresAt && Date.parse(grant.expiresAt) <= this.now().getTime())
      reasons.push('Grant has expired.');
    if (grant && !grant.capabilityIds.includes(capability.id))
      reasons.push('Grant does not include this capability.');
    if (grant && !grant.modes.includes(command.mode))
      reasons.push('Grant does not include this runtime mode.');
    if (!capability.modes.includes(command.mode))
      reasons.push('Capability is unavailable in this runtime mode.');
    if (grant) {
      matchedScope =
        grant.targetUriPrefixes.find((prefix) => command.targetUri.startsWith(prefix)) ?? null;
      if (!matchedScope) reasons.push('Target URI is outside grant scope.');
      if (RISK_RANK[capability.risk] > RISK_RANK[grant.riskCeiling])
        reasons.push('Capability exceeds the grant risk ceiling.');
      if ((this.commandCounts.get(grant.id) ?? 0) >= grant.resourceBudget.maximumCommands) {
        reasons.push('Grant command budget is exhausted.');
      }
      if (capability.costModel.externalCalls && grant.resourceBudget.maximumExternalCalls <= 0) {
        reasons.push('Grant forbids external calls.');
      }
    }

    const blockingObjections = this.policy.objections.filter(
      (objection) =>
        objection.status === 'active' && objection.capabilityIds.includes(capability.id)
    );
    const applicableObjections = blockingObjections.filter((objection) =>
      objection.modes.includes(command.mode)
    );
    if (applicableObjections.length > 0) {
      reasons.push(
        ...applicableObjections.map((objection) => `Active objection: ${objection.statement}`)
      );
    }

    const allowed = reasons.length === 0;
    return {
      allowed,
      approvalRequired: allowed && Boolean(grant?.approvalRisks.includes(capability.risk)),
      grantId: grant?.id ?? null,
      reasons,
      matchedScope,
      externalCallsRemaining: grant
        ? Math.max(
            0,
            grant.resourceBudget.maximumExternalCalls - (this.externalCallCounts.get(grant.id) ?? 0)
          )
        : 0,
      commandsRemaining: grant
        ? Math.max(
            0,
            grant.resourceBudget.maximumCommands - (this.commandCounts.get(grant.id) ?? 0)
          )
        : 0,
    };
  }

  recordUse(grantId: string, externalCalls: number): void {
    this.commandCounts.set(grantId, (this.commandCounts.get(grantId) ?? 0) + 1);
    this.externalCallCounts.set(
      grantId,
      (this.externalCallCounts.get(grantId) ?? 0) + Math.max(0, externalCalls)
    );
  }

  revoke(grantId: string, reason: string): boolean {
    const grant = this.grants.find((candidate) => candidate.id === grantId);
    if (!grant || grant.revokedAt) return false;
    grant.revokedAt = this.now().toISOString();
    grant.revocationReason = reason.trim() || 'Revoked without a supplied reason.';
    return true;
  }

  object(
    capabilityIds: string[],
    statement: string,
    requestedDisposition: AgentPolicyObjection['requestedDisposition'] = 'pause',
    modes: AgentCommandEnvelope['mode'][] = ['simulation', 'shadow', 'replay', 'live-external']
  ): AgentPolicyObjection {
    const objection: AgentPolicyObjection = {
      id: `objection.${revisionFor({ capabilityIds, statement, at: this.now().toISOString() }).slice(3)}`,
      raisedBy: DEFAULT_AGENT_ACTOR_URI,
      capabilityIds: [...new Set(capabilityIds)],
      modes: [...new Set(modes)],
      statement: statement.trim(),
      requestedDisposition,
      status: 'active',
      raisedAt: this.now().toISOString(),
      resolvedAt: null,
      resolution: null,
    };
    this.policy.objections.push(objection);
    this.refreshPolicyRevision();
    return structuredClone(objection);
  }

  resolveObjection(objectionId: string, resolution: string): boolean {
    const objection = this.policy.objections.find((candidate) => candidate.id === objectionId);
    if (!objection || objection.status === 'resolved') return false;
    objection.status = 'resolved';
    objection.resolvedAt = this.now().toISOString();
    objection.resolution = resolution.trim() || 'Resolved without detail.';
    this.refreshPolicyRevision();
    return true;
  }

  private refreshPolicyRevision(): void {
    this.policy.revision = revisionFor({ ...this.policy, revision: undefined });
  }
}
