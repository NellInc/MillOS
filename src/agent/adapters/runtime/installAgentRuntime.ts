import type { AgentOperatorRuntime, AgentRuntimeApi } from '../../contracts/commandContracts';
import type { AgentObservationEnvelope } from '../../contracts/queryContracts';
import {
  AgentAuthorityEngine,
  createDefaultActors,
  createDefaultGrants,
  createDefaultPolicy,
  DEFAULT_AGENT_ACTOR_URI,
  DEFAULT_AGENT_GRANT_ID,
  HUMAN_OPERATOR_URI,
  isAgentSideActor,
} from '../../command/authority';
import { bindAgentRuntime } from '../../client/operatorRuntime';
import { AgentCausalLedger } from '../../command/causalLedger';
import { createAgentCommandKernel } from '../../command/commandKernel';
import { createAgentQueryService } from '../../query/queryService.js';
import { SYSTEM_REGISTRY_SOURCE } from '../../registry/systemRegistrySource.js';
import { captureMillOSAgentState } from './runtimeProjection';
import { createMillOSRuntimeCommandHandlers } from './runtimeCommandHandlers';
import { useWorkplaceStore } from '../../../stores/workplaceStore';

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
 *
 * The composition has two faces. The handle goes on the window, where any
 * script can call or replace it, so it cannot approve or attest a person. The
 * operator runtime, which can, is bound in module scope
 * (`src/agent/client/operatorRuntime.ts`) for the interface to use.
 */
const compositions = new WeakMap<
  Window,
  { handle: AgentRuntimeApi; setInstalled: (installed: boolean) => void; installs: number }
>();

/**
 * Install the versioned agent plane without altering the legacy runtime
 * telemetry object. The global property is not writable, but it is
 * configurable so a re-install can redefine it, which means a script can also
 * replace it; the interface therefore never reads it. Every mutation still
 * passes a capability, revision, authority, preview, receipt, and verifier.
 */
export function installMillOSAgentRuntime(target: Window = window): () => void {
  let composed = compositions.get(target);
  if (!composed) {
    // Composes only when this window has no bound runtime. After a development
    // hot update this module's map is empty but the binding survives, and the
    // runtime built before is reused.
    const bound = bindAgentRuntime(target, composeMillOSAgentRuntime);
    composed = { handle: bound.handle, setInstalled: bound.setInstalled, installs: 0 };
    compositions.set(target, composed);
  }
  const entry = composed;
  const service = entry.handle;

  Object.defineProperty(target, '__MILLOS_AGENT__', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: service,
  });
  entry.installs += 1;
  entry.setInstalled(true);

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    entry.installs = Math.max(0, entry.installs - 1);
    if (entry.installs === 0) entry.setInstalled(false);
    if (target.__MILLOS_AGENT__ === service) delete target.__MILLOS_AGENT__;
  };
}

function composeMillOSAgentRuntime(): {
  handle: AgentRuntimeApi;
  internalHandle: AgentRuntimeApi;
  operator: AgentOperatorRuntime;
} {
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
    // RuntimeController's diagnostic recorder appends to the incident replay
    // log in the same tick as a speed, weather, safety-event, AI-decision or
    // truck change; that log is projected as evidence.commands.
    observerWrittenPaths: { evidence: ['commands'] },
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

  const shared: Omit<AgentRuntimeApi, 'approve' | 'resolveObjection' | 'promoteLesson'> = {
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
              'Scoped simulation command execution is installed. High- and critical-risk previews ' +
              'are approved by the person at the controls in the Agent Cockpit; this handle cannot ' +
              'approve. External writes, commit, push, and deploy remain denied.',
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
                ? 'Executable after the person at the controls approves the exact current ' +
                  'preview in the Agent Cockpit. This handle cannot approve.'
                : 'Executable through a current scoped simulation grant.',
          })),
        },
      });
    },
    trace: (request) => {
      const observation = readService.trace(request);
      const trace = ledger.trace(request);
      const completeness =
        observation.completeness === 'degraded'
          ? 'degraded'
          : trace.completeCausalChain
            ? 'complete'
            : 'partial';
      const warnings = observation.warnings.filter(
        (warning) => warning.code !== 'CAUSAL_CHAIN_UNAVAILABLE'
      );
      if (!trace.completeCausalChain) {
        warnings.push({
          code: 'CAUSAL_HISTORY_UNCERTIFIED',
          severity: 'warning',
          message: 'Complete causal history cannot be certified from retained evidence.',
          scope: 'evidence',
          remediation:
            'Treat these records as partial evidence. History may be compacted, imported, ' +
            'or have unresolved predecessors; loss for this particular query is unknown.',
        });
      }

      return immutable({
        ...observation,
        completeness,
        data: JSON.parse(
          JSON.stringify({
            completeCausalChain: trace.completeCausalChain,
            filters: {
              uri: request?.uri ?? null,
              correlationId: request?.correlationId ?? null,
            },
            records: trace.records,
            page: trace.page,
            evidenceFingerprint: ledger.export().evidenceFingerprint,
          })
        ),
        warnings,
      }) as AgentObservationEnvelope;
    },
    legalOptions: kernel.legalOptions,
    draft: kernel.draft,
    preview: kernel.preview,
    commit: kernel.commit,
    actors: () => immutable(authority.actors),
    grants: () => immutable(authority.grants),
    policy: () => immutable(authority.policy),
    revokeGrant: (grantId, reason) => {
      const revoked = authority.revoke(grantId, reason);
      if (
        revoked &&
        authority.grants
          .find((grant) => grant.id === grantId)
          ?.capabilityIds.includes('workplace.activate-plan')
      ) {
        useWorkplaceStore.getState().stop();
      }
      return revoked;
    },
    object: (capabilityIds, statement, requestedDisposition, modes) => {
      const objection = authority.object(capabilityIds, statement, requestedDisposition, modes);
      if (
        capabilityIds.includes('workplace.activate-plan') &&
        objection.modes.includes('simulation')
      ) {
        useWorkplaceStore.getState().stop();
      }
      return immutable(objection);
    },
    evidence: () => immutable(ledger.export()),
    // The ledger imports events only; it never brings a lesson in, so an
    // export cannot introduce a 'human-reviewed' lesson.
    importEvidence: (value) => immutable(ledger.import(value)),
  };

  // Any script on the page can call window.__MILLOS_AGENT__, so pin it strictly
  // to the default agent-driver actor and grant: it cannot impersonate the
  // on-device operator (which bypasses human approval for incident.mitigate) or
  // attest a person. Trusted module-scoped callers (executeAgentCommand) use
  // internalHandle, which still cannot approve.
  const assertHandleActorAndGrant = (actorUri?: string, grantId?: string) => {
    if (actorUri !== undefined && actorUri !== DEFAULT_AGENT_ACTOR_URI) {
      throw new Error(
        `ACTOR_NOT_ALLOWED_ON_HANDLE: window.__MILLOS_AGENT__ acts only as ${DEFAULT_AGENT_ACTOR_URI}, not ${actorUri}.`
      );
    }
    if (grantId !== undefined && grantId !== DEFAULT_AGENT_GRANT_ID) {
      throw new Error(
        `GRANT_NOT_ALLOWED_ON_HANDLE: window.__MILLOS_AGENT__ uses only ${DEFAULT_AGENT_GRANT_ID}, not ${grantId}.`
      );
    }
  };

  const internalHandle: AgentRuntimeApi = {
    ...shared,
    approve: () => {
      throw new Error(
        'APPROVAL_NOT_AVAILABLE_ON_HANDLE: this handle cannot approve. A high- or critical-risk ' +
          'preview is approved by the person at the controls, in the Agent Cockpit. Leave the ' +
          'preview for them, or narrow the intent.'
      );
    },
    resolveObjection: (objectionId, resolution) => {
      const objection = authority.policy.objections.find(
        (candidate) => candidate.id === objectionId
      );
      if (
        objection &&
        !isAgentSideActor(authority.actors.find((actor) => actor.uri === objection.raisedBy))
      ) {
        throw new Error(
          `OBJECTION_NOT_RESOLVABLE_ON_HANDLE: ${objectionId} was raised by ${objection.raisedBy}. ` +
            'Only its raiser or the person at the controls can resolve it, in the interface; ' +
            'this handle resolves objections the agent side raised.'
        );
      }
      return authority.resolveObjection(objectionId, resolution);
    },
    promoteLesson: (statement, evidenceEventIds, promotedBy, humanReviewed = false) => {
      if (humanReviewed) {
        throw new Error(
          'LESSON_REVIEW_NOT_AVAILABLE_ON_HANDLE: this handle promotes advisory lessons only. ' +
            'A human-reviewed lesson is promoted by the person at the controls, in the interface.'
        );
      }
      if (!isAgentSideActor(authority.actors.find((actor) => actor.uri === promotedBy))) {
        throw new Error(
          `LESSON_PROMOTER_NOT_ALLOWED_ON_HANDLE: promotedBy must be a registered non-human ` +
            `actor, not ${promotedBy}.`
        );
      }
      return immutable(ledger.promoteLesson(statement, evidenceEventIds, promotedBy, false));
    },
  };

  const handle: AgentRuntimeApi = {
    ...internalHandle,
    legalOptions: (request) => {
      assertHandleActorAndGrant(request.actorUri, request.grantId);
      return kernel.legalOptions({
        ...request,
        actorUri: DEFAULT_AGENT_ACTOR_URI,
        grantId: DEFAULT_AGENT_GRANT_ID,
      });
    },
    draft: (request) => {
      assertHandleActorAndGrant(request.actorUri, request.grantId);
      return kernel.draft({
        ...request,
        actorUri: DEFAULT_AGENT_ACTOR_URI,
        grantId: DEFAULT_AGENT_GRANT_ID,
      });
    },
    preview: (command) => {
      assertHandleActorAndGrant(command.actorUri, command.grantId);
      return kernel.preview(command);
    },
    commit: (previewOrCommand, approval) => {
      const command = 'previewId' in previewOrCommand ? previewOrCommand.command : previewOrCommand;
      assertHandleActorAndGrant(command.actorUri, command.grantId);
      return kernel.commit(previewOrCommand, approval);
    },
  };

  // The person at the controls, acting in the interface. Never put on window.
  const operator: AgentOperatorRuntime = {
    ...shared,
    approve: (previewId, reason) => kernel.approve(previewId, reason, HUMAN_OPERATOR_URI),
    listPendingPreviews: () => kernel.listPendingPreviews(),
    object: (capabilityIds, statement, requestedDisposition, modes) => {
      const objection = authority.object(
        capabilityIds,
        statement,
        requestedDisposition,
        modes,
        HUMAN_OPERATOR_URI
      );
      if (
        capabilityIds.includes('workplace.activate-plan') &&
        objection.modes.includes('simulation')
      ) {
        useWorkplaceStore.getState().stop();
      }
      return immutable(objection);
    },
    resolveObjection: (objectionId, resolution) =>
      authority.resolveObjection(objectionId, resolution),
    promoteReviewedLesson: (statement, evidenceEventIds) =>
      immutable(ledger.promoteLesson(statement, evidenceEventIds, HUMAN_OPERATOR_URI, true)),
  };

  return {
    handle: Object.freeze(handle),
    internalHandle: Object.freeze(internalHandle),
    operator: Object.freeze(operator),
  };
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
