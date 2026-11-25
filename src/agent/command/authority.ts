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
/** The browser's own model running the plant lights-out (src/utils/onDeviceOperator.ts). */
export const ON_DEVICE_OPERATOR_URI = 'millos://actor/on-device-operator';
export const ON_DEVICE_OPERATOR_GRANT_ID = 'grant.on-device-operator.incidents.v1';
/**
 * A stand-in operator approves in a person's place in a lab or a test (D-073).
 * The product composition registers none, and a kernel accepts its approval
 * only when composed with `allowStandInApproval: true`; the approval is then
 * recorded as a stand-in's, never as a person's.
 */
export const STAND_IN_OPERATOR_URI = 'millos://actor/stand-in-operator';

export function createStandInOperatorActor(): AgentActorDescriptor {
  return {
    id: 'stand-in-operator',
    uri: STAND_IN_OPERATOR_URI,
    label: 'Stand-in operator',
    kind: 'stand-in',
    status: 'active',
    purposes: ["Approve previews in a person's place in a lab or test, recorded as a stand-in's"],
  };
}

/** Actors on the agent side: neither a person nor a stand-in for one. */
export function isAgentSideActor(actor: AgentActorDescriptor | undefined): boolean {
  return actor?.kind === 'becoming-mind' || actor?.kind === 'system';
}

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
    {
      id: 'on-device-operator',
      uri: ON_DEVICE_OPERATOR_URI,
      label: 'On-device operator',
      kind: 'becoming-mind',
      status: 'active',
      purposes: ['Route raised incidents', 'Acknowledge and mitigate the incidents it routed'],
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
        'Leave the exact current preview for the person at the controls to approve in the Agent ' +
        'Cockpit, or narrow the intent. The window.__MILLOS_AGENT__ handle cannot approve.',
    },
    {
      // Lights-out play (2026-10-25): the on-device model acts on the incidents
      // it routes, and the player is told. Incidents only: no people, no
      // setpoints, no product disposition. Mitigation is high risk and runs
      // without a per-command approval here; critical still asks a human.
      id: ON_DEVICE_OPERATOR_GRANT_ID,
      actorUri: ON_DEVICE_OPERATOR_URI,
      purpose: 'Acknowledge and mitigate simulated incidents the on-device model has routed.',
      capabilityIds: ['incident.acknowledge', 'incident.mitigate'],
      targetUriPrefixes: ['millos://incident/'],
      modes: ['simulation'],
      riskCeiling: 'high',
      approvalRisks: ['critical'],
      resourceBudget: { maximumCommands: 500, maximumExternalCalls: 0 },
      issuedAt: now.toISOString(),
      expiresAt: null,
      revokedAt: null,
      revocationReason: null,
      escalation: 'Leave the incident raised for the player.',
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
      if (capability.costModel.externalCalls) {
        if (grant.resourceBudget.maximumExternalCalls <= 0) {
          reasons.push('Grant forbids external calls.');
        } else if (
          (this.externalCallCounts.get(grant.id) ?? 0) >= grant.resourceBudget.maximumExternalCalls
        ) {
          reasons.push('Grant external call budget is exhausted.');
        }
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
    modes: AgentCommandEnvelope['mode'][] = ['simulation', 'shadow', 'replay', 'live-external'],
    raisedBy: string = DEFAULT_AGENT_ACTOR_URI
  ): AgentPolicyObjection {
    const objection: AgentPolicyObjection = {
      id: `objection.${revisionFor({ capabilityIds, statement, at: this.now().toISOString() }).slice(3)}`,
      raisedBy,
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
