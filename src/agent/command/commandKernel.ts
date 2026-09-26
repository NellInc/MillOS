import type {
  AgentApprovalToken,
  AgentCommandDraftRequest,
  AgentCommandEnvelope,
  AgentCommandPreview,
  AgentExecutionReceipt,
  AgentLegalOption,
  AgentLegalOptionSet,
  AgentLegalOptionsRequest,
  AgentRuntimeApi,
  AgentVerificationResult,
} from '../contracts/commandContracts';
import type {
  AgentDomainCapture,
  AgentJsonValue,
  AgentStructuredProblem,
} from '../contracts/queryContracts';
import type {
  AgentCapabilityDescriptor,
  AgentDomainId,
  AgentEntityKind,
  AgentSystemRegistrySource,
} from '../contracts/systemManifest';
import { canonicalStringify } from '../contracts/registryValidation.js';
import { revisionFor } from '../query/queryService.js';
import { parseSemanticUri } from '../ontology/semanticUri.js';
import { AgentAuthorityEngine, DEFAULT_AGENT_ACTOR_URI, DEFAULT_AGENT_GRANT_ID } from './authority';
import { AgentCausalLedger } from './causalLedger';

export interface AgentCommandInspection {
  effects: string[];
  uncertainties: string[];
  preconditions: Array<{ id: string; satisfied: boolean; detail: string }>;
  invariants: Array<{ id: string; satisfied: boolean; detail: string }>;
}

export interface AgentCommandHandler {
  capabilityId: string;
  allowedDomains: AgentDomainId[];
  inspect: (
    command: AgentCommandEnvelope,
    capture: AgentDomainCapture
  ) => AgentCommandInspection | Promise<AgentCommandInspection>;
  execute: (command: AgentCommandEnvelope) => AgentJsonValue | Promise<AgentJsonValue>;
  verify: (
    command: AgentCommandEnvelope,
    before: AgentDomainCapture,
    after: AgentDomainCapture,
    result: AgentJsonValue
  ) => AgentVerificationResult[] | Promise<AgentVerificationResult[]>;
}

interface KernelDependencies {
  registry: AgentSystemRegistrySource;
  capture: () => AgentDomainCapture;
  handlers: AgentCommandHandler[];
  authority: AgentAuthorityEngine;
  ledger: AgentCausalLedger;
  now?: () => Date;
  idFactory?: () => string;
}

const PREVIEW_LIFETIME_MS = 5 * 60 * 1000;
const MAX_PREVIEWS = 100;
const MAX_RECEIPTS = 500;
// Idempotency keys stay known long after their receipt is evicted, so a late
// retry is refused rather than executed a second time.
const MAX_CONSUMED_KEYS = 5000;
// Free-running clock fields. They change on every tick, so hashing them into
// the observed revision would make every preview stale before it could be
// committed; they never gate whether a command is safe to run.
const VOLATILE_FIELDS = new Set(['gameTime', 'gameDay', 'elapsedMinutes', 'simulationTime']);

export function createAgentCommandKernel(dependencies: KernelDependencies) {
  const now = dependencies.now ?? (() => new Date());
  const idFactory = dependencies.idFactory ?? defaultId;
  const capabilities = new Map(
    dependencies.registry.capabilities.map((capability) => [capability.id, capability])
  );
  const handlers = new Map(dependencies.handlers.map((handler) => [handler.capabilityId, handler]));
  const previews = new Map<string, AgentCommandPreview>();
  const approvals = new Map<string, AgentApprovalToken>();
  const receipts = new Map<string, AgentExecutionReceipt>();
  const consumedKeys = new Map<string, string>();
  const inFlight = new Set<string>();

  function draft(request: AgentCommandDraftRequest): AgentCommandEnvelope {
    const capability = capabilities.get(request.capabilityId);
    if (!capability) throw new Error(`Unknown capability: ${request.capabilityId}`);
    const capture = dependencies.capture();
    const commandId = `cmd-${idFactory()}`;
    return immutable({
      schemaVersion: 1,
      commandId,
      idempotencyKey: request.idempotencyKey?.trim() || commandId,
      capabilityId: capability.id,
      capabilityVersion: capability.version,
      actorUri: request.actorUri ?? DEFAULT_AGENT_ACTOR_URI,
      grantId: request.grantId ?? DEFAULT_AGENT_GRANT_ID,
      targetUri: request.targetUri,
      parameters: { ...(request.parameters ?? {}) },
      reason: request.reason.trim(),
      observedRevision: observedRevisionFor(capability, capture),
      mode: capture.mode,
      requestedAt: now().toISOString(),
    } satisfies AgentCommandEnvelope);
  }

  /**
   * Enumerate the commands that would pass every current check on one target,
   * so a chooser picks from a closed set instead of composing a command. It
   * never calls preview(): that would write the ledger and could evict real
   * previews from the bounded history. All candidates share one capture.
   */
  async function legalOptions(request: AgentLegalOptionsRequest): Promise<AgentLegalOptionSet> {
    const capture = dependencies.capture();
    const actorUri = request.actorUri ?? DEFAULT_AGENT_ACTOR_URI;
    const grantId = request.grantId ?? DEFAULT_AGENT_GRANT_ID;
    let targetKind: AgentEntityKind | null = null;
    try {
      targetKind = parseSemanticUri(request.targetUri).kind;
    } catch {
      targetKind = null;
    }
    const options: AgentLegalOption[] = [];
    const needsInput: AgentLegalOptionSet['needsInput'] = [];
    const excluded: AgentLegalOptionSet['excluded'] = [];

    for (const capability of capabilities.values()) {
      if (!targetKind || !capability.targetKinds.includes(targetKind)) continue;
      const handler = handlers.get(capability.id);
      const probe = (parameters: Record<string, AgentJsonValue>): AgentCommandEnvelope => ({
        schemaVersion: 1,
        commandId: 'legal-option-probe',
        idempotencyKey: 'legal-option-probe',
        capabilityId: capability.id,
        capabilityVersion: capability.version,
        actorUri,
        grantId,
        targetUri: request.targetUri,
        parameters,
        // Never leaves this function; a chosen option is drafted with the chooser's reason.
        reason: 'legal option probe',
        observedRevision: observedRevisionFor(capability, capture),
        mode: capture.mode,
        requestedAt: now().toISOString(),
      });

      // Authority depends on actor, grant, capability, target and mode, never
      // on parameters, so it is settled once before any parameter is filled.
      const authority = dependencies.authority.evaluate(probe({}), capability);
      if (!authority.allowed) {
        excluded.push({
          optionId: capability.id,
          capabilityId: capability.id,
          reasons: authority.reasons,
        });
        continue;
      }

      const { properties, required } = capability.parameters;
      const uriKeys = Object.keys(properties).filter((key) => key.endsWith('Uri'));
      const enumKeys = required.filter((key) => Array.isArray(properties[key]?.enum));
      const openKeys = required.filter(
        (key) => !enumKeys.includes(key) && !(uriKeys.length === 1 && key === uriKeys[0])
      );
      if (openKeys.length > 0) {
        needsInput.push({ capabilityId: capability.id, parameters: openKeys });
        continue;
      }

      let variants: Array<Record<string, AgentJsonValue>> = [
        uriKeys.length === 1 ? { [uriKeys[0]]: request.targetUri } : {},
      ];
      for (const key of enumKeys) {
        const values = properties[key].enum as AgentJsonValue[];
        variants = variants.flatMap((variant) =>
          values.map((value) => ({ ...variant, [key]: value }))
        );
      }

      for (const parameters of variants) {
        const optionId = [
          capability.id,
          ...enumKeys.map((key) => `${key}=${String(parameters[key])}`),
        ].join(':');
        const command = probe(parameters);
        const reasons = validateCommand(command, capability, handler, capture)
          .filter((problem) => problem.severity === 'blocking')
          .map((problem) => problem.message);
        let inspection: AgentCommandInspection | null = null;
        if (handler && reasons.length === 0) {
          try {
            inspection = await handler.inspect(command, capture);
            for (const check of [...inspection.preconditions, ...inspection.invariants]) {
              if (!check.satisfied) reasons.push(check.detail);
            }
          } catch (error) {
            reasons.push(error instanceof Error ? error.message : String(error));
          }
        }
        if (reasons.length > 0 || !inspection) {
          excluded.push({ optionId, capabilityId: capability.id, reasons });
          continue;
        }
        options.push({
          optionId,
          capabilityId: capability.id,
          title: capability.title,
          risk: capability.risk,
          approvalRequired: authority.approvalRequired,
          draft: {
            capabilityId: capability.id,
            targetUri: request.targetUri,
            parameters,
            actorUri,
            grantId,
          },
          effects: inspection.effects,
          uncertainties: inspection.uncertainties,
        });
      }
    }

    return immutable({
      schemaVersion: 1,
      targetUri: request.targetUri,
      actorUri,
      grantId,
      mode: capture.mode,
      generatedAt: now().toISOString(),
      options,
      needsInput,
      excluded,
    } satisfies AgentLegalOptionSet);
  }

  async function preview(command: AgentCommandEnvelope): Promise<AgentCommandPreview> {
    const capability = capabilities.get(command.capabilityId);
    const handler = handlers.get(command.capabilityId);
    const capture = dependencies.capture();
    const problems = validateCommand(command, capability, handler, capture);
    const authority = capability
      ? dependencies.authority.evaluate(command, capability)
      : deniedAuthority('Capability does not exist.');
    problems.push(
      ...authority.reasons.map((message) => ({
        code: 'AUTHORITY_DENIED',
        severity: 'blocking' as const,
        message,
        scope: command.capabilityId,
      }))
    );

    let inspection = emptyInspection(capability);
    if (handler && problems.every((problem) => problem.severity !== 'blocking')) {
      // A preview always resolves to a structured status. A handler that throws
      // becomes a blocking problem instead of rejecting the whole preview.
      try {
        inspection = await handler.inspect(command, capture);
      } catch (error) {
        problems.push(
          blocking('INSPECTION_FAILED', error instanceof Error ? error.message : String(error))
        );
      }
    }
    for (const check of [...inspection.preconditions, ...inspection.invariants]) {
      if (!check.satisfied) {
        problems.push({
          code: check.id,
          severity: 'blocking',
          message: check.detail,
          scope: command.targetUri,
        });
      }
    }
    const ownerRevision = capability
      ? revisionFor(capture.domains[capability.ownerDomainId])
      : command.observedRevision;
    const previewId = `preview-${idFactory()}`;
    const materialFingerprint = revisionFor({
      command: materialCommand(command),
      ownerRevision,
      policyRevision: dependencies.authority.policy.revision,
      authority,
      inspection,
    });
    const result: AgentCommandPreview = {
      schemaVersion: 1,
      previewId,
      status: problems.some((problem) => problem.severity === 'blocking')
        ? 'denied'
        : authority.approvalRequired
          ? 'requires-approval'
          : 'ready',
      command: structuredClone(command),
      capability: capability ?? missingCapability(command.capabilityId),
      effects: inspection.effects,
      uncertainties: inspection.uncertainties,
      preconditions: inspection.preconditions,
      invariants: inspection.invariants,
      cost: capability?.costModel ?? missingCapability('').costModel,
      authority,
      observedRevision: ownerRevision,
      materialFingerprint,
      expiresAt: new Date(now().getTime() + PREVIEW_LIFETIME_MS).toISOString(),
      problems,
    };
    rememberBounded(previews, previewId, immutable(result), MAX_PREVIEWS);
    appendEvent(
      'command.previewed',
      command,
      capture,
      ownerRevision,
      ownerRevision,
      jsonValue({
        previewId,
        status: result.status,
        materialFingerprint,
        problems,
      })
    );
    return immutable(result);
  }

  function approve(
    previewId: string,
    reason: string,
    approvedBy = 'millos://actor/human-operator'
  ): AgentApprovalToken {
    const stored = previews.get(previewId);
    if (!stored)
      throw new Error('Preview does not exist or has fallen outside the bounded preview history.');
    if (stored.status !== 'requires-approval')
      throw new Error('This preview does not require approval.');
    if (Date.parse(stored.expiresAt) <= now().getTime()) throw new Error('Preview has expired.');
    // An approval is a human attestation. The approver must be a registered
    // human actor and must not be the actor that drafted the command, or the
    // agent could self-approve its own high-risk previews through the same
    // runtime handle and the receipt would record an approval nobody gave.
    if (approvedBy === stored.command.actorUri)
      throw new Error('A command cannot be approved by the actor that requested it.');
    const approver = dependencies.authority.actors.find((actor) => actor.uri === approvedBy);
    if (!approver || approver.kind !== 'human')
      throw new Error(`Approval must come from a registered human actor, not ${approvedBy}.`);
    const token: AgentApprovalToken = {
      schemaVersion: 1,
      approvalId: `approval-${idFactory()}`,
      previewId,
      previewRevision: stored.observedRevision,
      materialFingerprint: stored.materialFingerprint,
      approvedBy,
      reason: reason.trim(),
      issuedAt: now().toISOString(),
      expiresAt: stored.expiresAt,
    };
    rememberBounded(approvals, token.approvalId, immutable(token), MAX_PREVIEWS);
    appendEvent(
      'command.approved',
      stored.command,
      dependencies.capture(),
      stored.observedRevision,
      stored.observedRevision,
      jsonValue({ approvalId: token.approvalId, approvedBy, reason: token.reason })
    );
    return immutable(token);
  }

  async function commit(
    previewOrCommand: AgentCommandPreview | AgentCommandEnvelope,
    approval?: AgentApprovalToken
  ): Promise<AgentExecutionReceipt> {
    const command = isPreview(previewOrCommand) ? previewOrCommand.command : previewOrCommand;
    const suppliedPreview = isPreview(previewOrCommand) ? previewOrCommand : null;
    const existing = receipts.get(command.idempotencyKey);
    if (existing) {
      return immutable({
        ...structuredClone(existing),
        receiptId: `receipt-${idFactory()}`,
        status: 'duplicate',
        completedAt: now().toISOString(),
        duplicateOfReceiptId: existing.receiptId,
      });
    }

    const startedAt = now().toISOString();
    const captureBefore = dependencies.capture();
    const capability = capabilities.get(command.capabilityId);
    const handler = handlers.get(command.capabilityId);
    const ownerRevision = capability
      ? revisionFor(captureBefore.domains[capability.ownerDomainId])
      : command.observedRevision;

    // The receipt lookup above and the receipt write below are separated by
    // several awaits. Two concurrent commits of one command must not both run.
    if (inFlight.has(command.idempotencyKey)) {
      return finalizeRejected(
        command,
        suppliedPreview?.previewId ?? null,
        approval?.approvalId ?? null,
        captureBefore,
        ownerRevision,
        [blocking('COMMAND_IN_FLIGHT', 'This command is already being committed.')],
        startedAt
      );
    }
    const evictedReceiptId = consumedKeys.get(command.idempotencyKey);
    if (evictedReceiptId) {
      return finalizeRejected(
        command,
        suppliedPreview?.previewId ?? null,
        approval?.approvalId ?? null,
        captureBefore,
        ownerRevision,
        [
          blocking(
            'IDEMPOTENCY_WINDOW_EXPIRED',
            `This idempotency key was already consumed by ${evictedReceiptId}; its receipt has left the bounded history.`
          ),
        ],
        startedAt
      );
    }
    inFlight.add(command.idempotencyKey);
    try {
      return await commitOnce(
        command,
        suppliedPreview,
        approval,
        startedAt,
        captureBefore,
        capability,
        handler,
        ownerRevision
      );
    } finally {
      inFlight.delete(command.idempotencyKey);
    }
  }

  async function commitOnce(
    command: AgentCommandEnvelope,
    suppliedPreview: AgentCommandPreview | null,
    approval: AgentApprovalToken | undefined,
    startedAt: string,
    captureBefore: AgentDomainCapture,
    capability: AgentCapabilityDescriptor | undefined,
    handler: AgentCommandHandler | undefined,
    ownerRevision: string
  ): Promise<AgentExecutionReceipt> {
    let activePreview = suppliedPreview;
    if (activePreview) {
      activePreview = previews.get(activePreview.previewId) ?? null;
    } else {
      activePreview = await preview(command);
    }
    const problems = validateCommit(
      command,
      capability,
      handler,
      captureBefore,
      activePreview,
      approval,
      now().getTime()
    );
    if (approval) {
      const storedApproval = approvals.get(approval.approvalId);
      if (!storedApproval || canonicalStringify(storedApproval) !== canonicalStringify(approval)) {
        problems.push(
          blocking('APPROVAL_UNKNOWN', 'Approval token is unknown or has been altered.')
        );
      }
    }
    const authority = capability
      ? dependencies.authority.evaluate(command, capability)
      : deniedAuthority('Capability does not exist.');
    problems.push(
      ...authority.reasons.map((message) => ({
        code: 'AUTHORITY_DENIED',
        severity: 'blocking' as const,
        message,
        scope: command.capabilityId,
      }))
    );
    if (authority.approvalRequired && !approval) {
      problems.push({
        code: 'APPROVAL_REQUIRED',
        severity: 'blocking',
        message: 'The exact current preview requires a bound approval token.',
      });
    }

    if (!capability || !handler || problems.some((problem) => problem.severity === 'blocking')) {
      return finalizeRejected(
        command,
        activePreview?.previewId ?? null,
        approval?.approvalId ?? null,
        captureBefore,
        ownerRevision,
        problems,
        startedAt
      );
    }

    let result: AgentJsonValue = null;
    let executionProblems: AgentStructuredProblem[] = [];
    try {
      result = await handler.execute(command);
    } catch (error) {
      executionProblems = [
        {
          code: 'COMMAND_EXECUTION_FAILED',
          severity: 'blocking',
          message: error instanceof Error ? error.message : String(error),
          scope: command.capabilityId,
        },
      ];
    }
    const captureAfter = dependencies.capture();
    const afterRevision = revisionFor(captureAfter.domains[capability.ownerDomainId]);
    const changedDomains = changedDomainIds(captureBefore, captureAfter);
    const unexpectedDomains = changedDomains.filter(
      (domainId) => !handler.allowedDomains.includes(domainId)
    );
    const verification =
      executionProblems.length === 0
        ? await handler.verify(command, captureBefore, captureAfter, result)
        : [];
    if (unexpectedDomains.length > 0) {
      verification.push({
        id: 'INV.COMMAND.DOMAIN_SCOPE',
        passed: false,
        detail: `Unexpected domain mutations: ${unexpectedDomains.join(', ')}.`,
      });
    }
    const verified = executionProblems.length === 0 && verification.every((item) => item.passed);
    const completedAt = now().toISOString();
    const receipt: AgentExecutionReceipt = {
      schemaVersion: 1,
      receiptId: `receipt-${idFactory()}`,
      status: verified ? 'verified' : 'failed',
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      capabilityId: command.capabilityId,
      targetUri: command.targetUri,
      actorUri: command.actorUri,
      grantId: command.grantId,
      mode: command.mode,
      correlationId: command.commandId,
      previewId: activePreview?.previewId ?? null,
      approvalId: approval?.approvalId ?? null,
      beforeRevision: ownerRevision,
      afterRevision,
      changedDomains,
      effects: activePreview?.effects ?? [],
      result,
      verification,
      problems: executionProblems,
      startedAt,
      completedAt,
      duplicateOfReceiptId: null,
    };
    rememberBounded(receipts, command.idempotencyKey, immutable(receipt), MAX_RECEIPTS);
    rememberBounded(consumedKeys, command.idempotencyKey, receipt.receiptId, MAX_CONSUMED_KEYS);
    // An approval backs exactly one execution.
    if (approval) approvals.delete(approval.approvalId);
    dependencies.authority.recordUse(command.grantId, capability.costModel.externalCalls ? 1 : 0);
    appendEvent(
      verified ? 'command.verified' : 'command.failed',
      command,
      captureAfter,
      ownerRevision,
      afterRevision,
      jsonValue({
        receiptId: receipt.receiptId,
        result,
        verification,
        changedDomains,
        problems: executionProblems,
      })
    );
    return immutable(receipt);
  }

  function finalizeRejected(
    command: AgentCommandEnvelope,
    previewId: string | null,
    approvalId: string | null,
    capture: AgentDomainCapture,
    revision: string,
    problems: AgentStructuredProblem[],
    startedAt: string
  ): AgentExecutionReceipt {
    const receipt: AgentExecutionReceipt = {
      schemaVersion: 1,
      receiptId: `receipt-${idFactory()}`,
      status: 'rejected',
      commandId: command.commandId,
      idempotencyKey: command.idempotencyKey,
      capabilityId: command.capabilityId,
      targetUri: command.targetUri,
      actorUri: command.actorUri,
      grantId: command.grantId,
      mode: command.mode,
      correlationId: command.commandId,
      previewId,
      approvalId,
      beforeRevision: revision,
      afterRevision: revision,
      changedDomains: [],
      effects: [],
      result: null,
      verification: [],
      problems,
      startedAt,
      completedAt: now().toISOString(),
      duplicateOfReceiptId: null,
    };
    appendEvent(
      'command.rejected',
      command,
      capture,
      revision,
      revision,
      jsonValue({
        receiptId: receipt.receiptId,
        problems,
      })
    );
    return immutable(receipt);
  }

  function appendEvent(
    kind: string,
    command: AgentCommandEnvelope,
    capture: AgentDomainCapture,
    beforeRevision: string,
    afterRevision: string,
    payload: AgentJsonValue
  ): void {
    const capability = capabilities.get(command.capabilityId);
    dependencies.ledger.append({
      correlationId: command.commandId,
      causationId: dependencies.ledger.lastEventIdFor(command.commandId),
      commandId: command.commandId,
      actorUri: command.actorUri,
      grantId: command.grantId,
      domain: capability?.ownerDomainId ?? 'evidence',
      kind,
      wallTime: now().toISOString(),
      simulationTime: capture.simulationTime,
      beforeRevision,
      afterRevision,
      targetUri: command.targetUri,
      payload,
      provenance: [{ kind: 'runtime', source: `capability:${command.capabilityId}` }],
    });
  }

  return {
    legalOptions,
    draft,
    preview,
    approve,
    commit,
    getPreview: (previewId: string) => previews.get(previewId),
    authority: dependencies.authority,
    ledger: dependencies.ledger,
  };
}

function validateCommand(
  command: AgentCommandEnvelope,
  capability: AgentCapabilityDescriptor | undefined,
  handler: AgentCommandHandler | undefined,
  capture: AgentDomainCapture
): AgentStructuredProblem[] {
  const problems: AgentStructuredProblem[] = [];
  if (command.schemaVersion !== 1)
    problems.push(blocking('COMMAND_SCHEMA_UNSUPPORTED', 'Command schema version must be 1.'));
  if (!capability)
    return [
      ...problems,
      blocking('CAPABILITY_UNKNOWN', `Unknown capability: ${command.capabilityId}.`),
    ];
  if (capability.status !== 'implemented')
    problems.push(blocking('CAPABILITY_NOT_IMPLEMENTED', 'Capability is not marked implemented.'));
  if (!handler)
    problems.push(blocking('CAPABILITY_HANDLER_MISSING', 'No runtime handler is registered.'));
  if (command.capabilityVersion !== capability.version)
    problems.push(
      blocking(
        'CAPABILITY_VERSION_MISMATCH',
        'Command capability version does not match the registry.'
      )
    );
  if (command.mode !== capture.mode)
    problems.push(
      blocking('MODE_MISMATCH', 'Command mode does not match the current runtime mode.')
    );
  const currentRevision = observedRevisionFor(capability, capture);
  if (command.observedRevision !== currentRevision)
    problems.push(
      blocking(
        'STALE_REVISION',
        `Observed revision ${command.observedRevision} is stale. Current revision is ${currentRevision}.`
      )
    );
  if (!command.reason.trim())
    problems.push(blocking('COMMAND_REASON_REQUIRED', 'A non-empty reason is required.'));
  // Handlers resolve the target through parseSemanticUri, which throws on a
  // non-canonical id or an unknown kind; reject those here as a structured problem.
  let targetKind: AgentEntityKind | null = null;
  try {
    targetKind = parseSemanticUri(command.targetUri).kind;
  } catch {
    targetKind = null;
  }
  if (!targetKind || !capability.targetKinds.includes(targetKind))
    problems.push(
      blocking(
        'TARGET_URI_INVALID',
        `Target must be a canonical MillOS URI of kind ${capability.targetKinds.join('/')}.`
      )
    );
  problems.push(...validateSchema(command.parameters, capability.parameters));
  const targetParameters = Object.keys(capability.parameters.properties).filter((key) =>
    key.endsWith('Uri')
  );
  // Whatever the target parameters are called, one of them must be the
  // command target, because targetUri is what grant scoping is checked against.
  if (
    targetParameters.length > 0 &&
    !targetParameters.some((key) => command.parameters[key] === command.targetUri)
  ) {
    problems.push(
      blocking(
        'TARGET_PARAMETER_MISMATCH',
        `${targetParameters.join(' or ')} must equal the command target URI.`
      )
    );
  }
  return problems;
}

/**
 * The revision a command observes covers the owner-domain fields the
 * capability declares it reads, minus free-running clock fields. Hashing the
 * whole domain made every preview stale within one game tick.
 */
function observedRevisionFor(
  capability: AgentCapabilityDescriptor,
  capture: AgentDomainCapture
): string {
  const domain = capture.domains[capability.ownerDomainId];
  if (!domain || typeof domain !== 'object' || Array.isArray(domain)) return revisionFor(domain);
  const prefix = `${capability.ownerDomainId}.`;
  // Reads and writes both count: a field the command changes must be current
  // too, and the declared reads lists have not been audited against handlers.
  const readKeys = new Set(
    [...capability.reads, ...capability.writes]
      .filter((path) => path.startsWith(prefix))
      .map((path) => path.slice(prefix.length).split('.')[0].replace(/\[\]$/, ''))
      .filter((key) => key.length > 0 && !VOLATILE_FIELDS.has(key))
  );
  const record = domain as Record<string, AgentJsonValue>;
  const keys =
    readKeys.size > 0
      ? [...readKeys].filter((key) => key in record)
      : Object.keys(record).filter((key) => !VOLATILE_FIELDS.has(key));
  const scoped: Record<string, AgentJsonValue> = {};
  for (const key of keys.sort()) scoped[key] = record[key];
  return revisionFor(scoped);
}

function validateCommit(
  command: AgentCommandEnvelope,
  capability: AgentCapabilityDescriptor | undefined,
  handler: AgentCommandHandler | undefined,
  capture: AgentDomainCapture,
  preview: AgentCommandPreview | null,
  approval: AgentApprovalToken | undefined,
  currentTime = Date.now()
): AgentStructuredProblem[] {
  const problems = validateCommand(command, capability, handler, capture);
  if (!preview)
    return [...problems, blocking('PREVIEW_REQUIRED', 'A current preview is required.')];
  if (preview.status === 'denied')
    problems.push(blocking('PREVIEW_DENIED', 'The supplied preview is denied.'));
  if (Date.parse(preview.expiresAt) <= currentTime)
    problems.push(blocking('PREVIEW_EXPIRED', 'The supplied preview has expired.'));
  if (
    canonicalStringify(materialCommand(command)) !==
    canonicalStringify(materialCommand(preview.command))
  ) {
    problems.push(blocking('PREVIEW_COMMAND_MISMATCH', 'The command changed after preview.'));
  }
  if (approval) {
    if (approval.previewId !== preview.previewId)
      problems.push(blocking('APPROVAL_PREVIEW_MISMATCH', 'Approval is bound to another preview.'));
    if (approval.previewRevision !== preview.observedRevision)
      problems.push(
        blocking('APPROVAL_REVISION_MISMATCH', 'Approval is bound to another revision.')
      );
    if (approval.materialFingerprint !== preview.materialFingerprint)
      problems.push(
        blocking(
          'APPROVAL_MATERIAL_MISMATCH',
          'Approval is bound to materially different parameters.'
        )
      );
    if (Date.parse(approval.expiresAt) <= currentTime)
      problems.push(blocking('APPROVAL_EXPIRED', 'Approval has expired.'));
  }
  return problems;
}

function validateSchema(
  parameters: Record<string, AgentJsonValue>,
  schema: AgentCapabilityDescriptor['parameters']
): AgentStructuredProblem[] {
  const problems: AgentStructuredProblem[] = [];
  for (const required of schema.required) {
    if (parameters[required] === undefined)
      problems.push(blocking('PARAMETER_REQUIRED', `Missing required parameter: ${required}.`));
  }
  if (!schema.additionalProperties) {
    for (const key of Object.keys(parameters)) {
      if (!(key in schema.properties))
        problems.push(blocking('PARAMETER_UNKNOWN', `Unknown parameter: ${key}.`));
    }
  }
  for (const [key, rawRules] of Object.entries(schema.properties)) {
    if (!(key in parameters)) continue;
    const rules = rawRules as Record<string, unknown>;
    const value = parameters[key];
    if (rules.type === 'string' && typeof value !== 'string')
      problems.push(blocking('PARAMETER_TYPE', `${key} must be a string.`));
    if (rules.type === 'number' && typeof value !== 'number')
      problems.push(blocking('PARAMETER_TYPE', `${key} must be a number.`));
    if (rules.type === 'integer' && (!Number.isInteger(value) || typeof value !== 'number'))
      problems.push(blocking('PARAMETER_TYPE', `${key} must be an integer.`));
    if (rules.type === 'boolean' && typeof value !== 'boolean')
      problems.push(blocking('PARAMETER_TYPE', `${key} must be a boolean.`));
    if (rules.type === 'array' && !Array.isArray(value))
      problems.push(blocking('PARAMETER_TYPE', `${key} must be an array.`));
    if (
      rules.type === 'object' &&
      (value === null || typeof value !== 'object' || Array.isArray(value))
    )
      problems.push(blocking('PARAMETER_TYPE', `${key} must be an object.`));
    if (Array.isArray(rules.enum) && !rules.enum.includes(value))
      problems.push(blocking('PARAMETER_ENUM', `${key} is outside the allowed values.`));
    if (
      typeof rules.pattern === 'string' &&
      typeof value === 'string' &&
      !new RegExp(rules.pattern).test(value)
    )
      problems.push(blocking('PARAMETER_PATTERN', `${key} does not match its semantic pattern.`));
    if (typeof value === 'number' && typeof rules.minimum === 'number' && value < rules.minimum)
      problems.push(blocking('PARAMETER_MINIMUM', `${key} is below its minimum.`));
    if (typeof value === 'number' && typeof rules.maximum === 'number' && value > rules.maximum)
      problems.push(blocking('PARAMETER_MAXIMUM', `${key} exceeds its maximum.`));
  }
  return problems;
}

function changedDomainIds(before: AgentDomainCapture, after: AgentDomainCapture): AgentDomainId[] {
  return (Object.keys(before.domains) as AgentDomainId[]).filter(
    (domainId) => revisionFor(before.domains[domainId]) !== revisionFor(after.domains[domainId])
  );
}

function materialCommand(command: AgentCommandEnvelope) {
  return {
    capabilityId: command.capabilityId,
    capabilityVersion: command.capabilityVersion,
    actorUri: command.actorUri,
    grantId: command.grantId,
    targetUri: command.targetUri,
    parameters: command.parameters,
    reason: command.reason,
    observedRevision: command.observedRevision,
    mode: command.mode,
    // Re-keying a previewed command must read as a different command, or one
    // approval could back a second execution under a fresh idempotency key.
    idempotencyKey: command.idempotencyKey,
  };
}

function emptyInspection(capability?: AgentCapabilityDescriptor): AgentCommandInspection {
  return {
    effects: capability?.sideEffects ?? [],
    uncertainties: ['No executable handler inspection was available.'],
    preconditions: (capability?.preconditions ?? []).map((detail, index) => ({
      id: `precondition.${index + 1}`,
      satisfied: false,
      detail,
    })),
    invariants: (capability?.invariantIds ?? []).map((id) => ({
      id,
      satisfied: false,
      detail: 'Invariant was not evaluated.',
    })),
  };
}

function missingCapability(id: string): AgentCapabilityDescriptor {
  return {
    id,
    uri: `millos://capability/${id}`,
    version: 0,
    status: 'retired',
    title: 'Missing capability',
    ownerDomainId: 'evidence',
    modes: [],
    risk: 'critical',
    targetKinds: [],
    parameters: { type: 'object', additionalProperties: false, required: [], properties: {} },
    result: { type: 'object', additionalProperties: false, required: [], properties: {} },
    reads: [],
    writes: [],
    preconditions: [],
    invariantIds: [],
    sideEffects: [],
    reversible: false,
    compensationCapability: null,
    supportsPreview: false,
    expectedLatencyMs: 0,
    costModel: {
      latencyClass: 'local',
      computeClass: 'trivial',
      externalCalls: false,
      boundedCollectionWrites: 0,
    },
    verifier: 'Unavailable',
    currentCallers: [],
    sourceRefs: [],
  };
}

function deniedAuthority(reason: string) {
  return {
    allowed: false,
    approvalRequired: false,
    grantId: null,
    reasons: [reason],
    matchedScope: null,
    externalCallsRemaining: 0,
    commandsRemaining: 0,
  };
}

function blocking(code: string, message: string): AgentStructuredProblem {
  return { code, severity: 'blocking', message };
}

function rememberBounded<K, V>(map: Map<K, V>, key: K, value: V, maximum: number): void {
  if (map.has(key)) map.delete(key);
  map.set(key, value);
  while (map.size > maximum) map.delete(map.keys().next().value as K);
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value);
  deepFreeze(clone);
  return clone;
}

function deepFreeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
}

function defaultId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function isPreview(
  value: AgentCommandPreview | AgentCommandEnvelope
): value is AgentCommandPreview {
  return 'previewId' in value;
}

function jsonValue(value: unknown): AgentJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as AgentJsonValue;
}

export type AgentCommandKernel = ReturnType<typeof createAgentCommandKernel>;
export type AgentCommandRuntimeMethods = Pick<
  AgentRuntimeApi,
  'legalOptions' | 'draft' | 'preview' | 'approve' | 'commit'
>;
