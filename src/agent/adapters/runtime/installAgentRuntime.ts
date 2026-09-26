import type { AgentRuntimeApi } from '../../contracts/commandContracts';
import type { AgentObservationEnvelope } from '../../contracts/queryContracts';
import {
  AgentAuthorityEngine,
  createDefaultActors,
  createDefaultGrants,
  createDefaultPolicy,
  DEFAULT_AGENT_ACTOR_URI,
  HUMAN_OPERATOR_URI,
} from '../../command/authority';
import { AgentCausalLedger } from '../../command/causalLedger';
import { createAgentCommandKernel } from '../../command/commandKernel';
import { createAgentQueryService } from '../../query/queryService.js';
import { SYSTEM_REGISTRY_SOURCE } from '../../registry/systemRegistrySource.js';
import { captureMillOSAgentState } from './runtimeProjection';
import { createMillOSRuntimeCommandHandlers } from './runtimeCommandHandlers';

declare global {
  interface Window {
    __MILLOS_AGENT__?: AgentRuntimeApi;
  }
}

/**
 * One composed agent plane per window. The installer runs inside a React
 * effect that re-fires whenever the default camera controls change (every
 * first-person toggle). Rebuilding the authority engine, ledger and kernel on
 * each re-install would silently restore revoked grants, drop objections and
 * lessons, reset the command budget, empty the causal ledger, and invalidate
 * any open preview, so the composition outlives the install and is reused.
 */
const compositions = new WeakMap<Window, AgentRuntimeApi>();

/**
 * Install the versioned agent plane without altering the legacy runtime
 * telemetry object. The global property is read-only; every mutation still
 * passes a capability, revision, authority, preview, receipt, and verifier.
 */
export function installMillOSAgentRuntime(target: Window = window): () => void {
  let composed = compositions.get(target);
  if (!composed) {
    composed = composeMillOSAgentRuntime();
    compositions.set(target, composed);
  }
  const service = composed;

  Object.defineProperty(target, '__MILLOS_AGENT__', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: service,
  });

  return () => {
    if (target.__MILLOS_AGENT__ === service) delete target.__MILLOS_AGENT__;
  };
}

function composeMillOSAgentRuntime(): AgentRuntimeApi {
  const now = () => new Date();
  const capture = () => captureMillOSAgentState();
  const readService = createAgentQueryService({
    registry: SYSTEM_REGISTRY_SOURCE,
    capture,
    now,
  });
  const authority = new AgentAuthorityEngine({
    actors: createDefaultActors(),
    grants: createDefaultGrants(now()),
    policy: createDefaultPolicy(),
    now,
  });
  const ledger = new AgentCausalLedger({ now });
  const kernel = createAgentCommandKernel({
    registry: SYSTEM_REGISTRY_SOURCE,
    capture,
    handlers: createMillOSRuntimeCommandHandlers(),
    authority,
    ledger,
    now,
  });

  /**
   * The read service reports itself as observation only because it installs
   * no kernel. Once the kernel is composed here, every surface that names
   * authority must say so, or a cold agent reading brief() would plan around a
   * boundary that does not exist (INV.TRUTH.MODE_LABEL).
   */
  const liveAuthority = () => ({
    observationOnly: false as const,
    commandExecution: true as const,
    externalWrites: false as const,
    defaultActorUri: DEFAULT_AGENT_ACTOR_URI,
    activeGrantIds: authority.grants.filter((grant) => !grant.revokedAt).map((grant) => grant.id),
    policyRevision: authority.policy.revision,
  });

  const service: AgentRuntimeApi = {
    version: 2,
    brief: (request) => {
      const observation = readService.brief(request);
      const data = observation.data as Record<string, unknown>;
      const priorAuthority =
        data.authority && typeof data.authority === 'object'
          ? (data.authority as Record<string, unknown>)
          : {};
      const live = liveAuthority();
      return immutable({
        ...observation,
        data: {
          ...data,
          authority: {
            ...priorAuthority,
            ...live,
            grantCount: live.activeGrantIds.length,
            executableCapabilityCount: SYSTEM_REGISTRY_SOURCE.capabilities.filter(
              (capability) => capability.status === 'implemented'
            ).length,
            reason:
              'Scoped simulation command execution is installed. External writes, commit, push, and deploy remain denied.',
          },
        },
      }) as AgentObservationEnvelope;
    },
    query: readService.query,
    capabilities: () => {
      const observation = readService.capabilities();
      return immutable({
        ...observation,
        data: {
          authority: liveAuthority(),
          items: SYSTEM_REGISTRY_SOURCE.capabilities.map((capability) => ({
            ...structuredClone(capability),
            executable: capability.status === 'implemented',
            authorityReason:
              capability.risk === 'high' || capability.risk === 'critical'
                ? 'Executable after an exact current preview receives bound human approval.'
                : 'Executable through a current scoped simulation grant.',
          })),
        },
      });
    },
    trace: (request) => {
      const observation = readService.trace(request);
      const trace = ledger.trace(request);
      return immutable({
        ...observation,
        completeness: 'complete',
        data: JSON.parse(
          JSON.stringify({
            completeCausalChain: true,
            filters: {
              uri: request?.uri ?? null,
              correlationId: request?.correlationId ?? null,
            },
            records: trace.records,
            page: trace.page,
            evidenceFingerprint: ledger.export().evidenceFingerprint,
          })
        ),
        warnings: observation.warnings.filter(
          (warning) => warning.code !== 'CAUSAL_CHAIN_UNAVAILABLE'
        ),
      }) as AgentObservationEnvelope;
    },
    legalOptions: kernel.legalOptions,
    draft: kernel.draft,
    preview: kernel.preview,
    approve: (previewId, reason) => kernel.approve(previewId, reason, HUMAN_OPERATOR_URI),
    commit: kernel.commit,
    actors: () => immutable(authority.actors),
    grants: () => immutable(authority.grants),
    policy: () => immutable(authority.policy),
    revokeGrant: (grantId, reason) => authority.revoke(grantId, reason),
    object: (capabilityIds, statement, requestedDisposition, modes) =>
      immutable(authority.object(capabilityIds, statement, requestedDisposition, modes)),
    resolveObjection: (objectionId, resolution) =>
      authority.resolveObjection(objectionId, resolution),
    evidence: () => immutable(ledger.export()),
    importEvidence: (value) => immutable(ledger.import(value)),
    promoteLesson: (statement, evidenceEventIds, promotedBy, humanReviewed = false) =>
      immutable(ledger.promoteLesson(statement, evidenceEventIds, promotedBy, humanReviewed)),
  };

  return Object.freeze(service);
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value);
  freeze(clone);
  return clone;
}

function freeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
}
