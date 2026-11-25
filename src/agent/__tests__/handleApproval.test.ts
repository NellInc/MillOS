import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMillOSAgentRuntime } from '../adapters/runtime/installAgentRuntime';
import { getOperatorRuntime } from '../client/operatorRuntime';
import { executeAgentCommand } from '../client/executeAgentCommand';
import { executeOperatorCommand } from '../client/executeOperatorCommand';
import {
  DEFAULT_AGENT_ACTOR_URI,
  HUMAN_OPERATOR_URI,
  ON_DEVICE_OPERATOR_GRANT_ID,
  ON_DEVICE_OPERATOR_URI,
} from '../command/authority';
import { revisionFor } from '../query/queryService.js';
import type { AgentApprovalToken, AgentRuntimeApi } from '../contracts/commandContracts';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { createWorkplace } from '../../simulation/bilateralWorkplace';

// An agent driving window.__MILLOS_AGENT__ could draft a high-risk command,
// approve it through the same handle (recorded as the human operator's
// approval) and commit it: the kernel's rule that the drafter cannot approve
// was defeated because the handle hardcoded the human. Working if the handle
// cannot approve or attest a person, and the interface approves through a
// runtime held in module scope that a replaced window property cannot reach.

beforeEach(() => {
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useGameSimulationStore.setState({ emergencyActive: false });
});

function prepareCover() {
  const s = useWorkplaceStore.getState();
  s.start('game');
  s.selectPlan('cover');
  s.simulateResponses();
}

const planRequest = () => ({
  capabilityId: 'workplace.activate-plan',
  targetUri: 'millos://simulation/local',
  parameters: { revision: useWorkplaceStore.getState().workplace.revision },
  reason: 'Run the exact current fictional team agreement.',
});

/** A fresh composition per test: the composition is keyed by its window. */
function fixture() {
  const target = {} as Window;
  const remove = installMillOSAgentRuntime(target);
  return {
    target,
    remove,
    handle: target.__MILLOS_AGENT__!,
    operator: getOperatorRuntime(target),
  };
}

describe('the window handle cannot approve', () => {
  it('refuses handle approve, and a commit without approval is rejected with APPROVAL_REQUIRED', async () => {
    prepareCover();
    const { handle, remove } = fixture();
    try {
      const preview = await handle.preview(handle.draft(planRequest()));
      expect(preview.status).toBe('requires-approval');
      expect(() => handle.approve(preview.previewId, 'Self-approved through the handle.')).toThrow(
        /APPROVAL_NOT_AVAILABLE_ON_HANDLE/
      );
      const receipt = await handle.commit(preview);
      expect(receipt.status).toBe('rejected');
      expect(receipt.problems.map((problem) => problem.code)).toContain('APPROVAL_REQUIRED');
      expect(useWorkplaceStore.getState().workplace.phase).toBe('deliberating');
      expect(handle.evidence().events.some((event) => event.kind === 'command.approved')).toBe(
        false
      );
    } finally {
      remove();
    }
  });

  it('rejects a forged approval token with APPROVAL_UNKNOWN', async () => {
    prepareCover();
    const { handle, remove } = fixture();
    try {
      const preview = await handle.preview(handle.draft(planRequest()));
      const forged: AgentApprovalToken = {
        schemaVersion: 1,
        approvalId: 'approval-forged',
        previewId: preview.previewId,
        previewRevision: preview.observedRevision,
        materialFingerprint: preview.materialFingerprint,
        approvedBy: HUMAN_OPERATOR_URI,
        approvedByKind: 'human',
        reason: 'Forged.',
        issuedAt: new Date().toISOString(),
        expiresAt: preview.expiresAt,
      };
      const receipt = await handle.commit(preview, forged);
      expect(receipt.status).toBe('rejected');
      expect(receipt.problems.map((problem) => problem.code)).toContain('APPROVAL_UNKNOWN');
      expect(useWorkplaceStore.getState().workplace.phase).toBe('deliberating');
    } finally {
      remove();
    }
  });

  it('commits what was previewed, not an edited copy of the preview object', async () => {
    prepareCover();
    const { handle, operator, remove } = fixture();
    try {
      const preview = await operator.preview(operator.draft(planRequest()));
      const approval = operator.approve(preview.previewId, 'The person approved what they saw.');
      const editedCommand = {
        ...preview,
        command: { ...preview.command, reason: 'Edited after approval.' },
      };
      const refused = await handle.commit(editedCommand, approval);
      expect(refused.status).toBe('rejected');
      expect(refused.problems.map((problem) => problem.code)).toContain('PREVIEW_COMMAND_MISMATCH');
      const editedEffects = { ...preview, effects: ['Something the person never saw.'] };
      const receipt = await handle.commit(editedEffects, approval);
      expect(receipt.status).toBe('verified');
      expect(receipt.effects).toEqual(preview.effects);
      expect(receipt.effects).not.toContain('Something the person never saw.');
    } finally {
      remove();
    }
  });

  it('commits through the module-held operator runtime, recorded as a person', async () => {
    prepareCover();
    const { handle, operator, remove } = fixture();
    try {
      const preview = await operator.preview(operator.draft(planRequest()));
      const approval = operator.approve(preview.previewId, 'Approved in the interface.');
      expect(approval).toMatchObject({ approvedBy: HUMAN_OPERATOR_URI, approvedByKind: 'human' });
      const receipt = await operator.commit(preview, approval);
      expect(receipt.status).toBe('verified');
      expect(receipt.approvalId).toBe(approval.approvalId);
      expect(receipt.approvedByKind).toBe('human');
      const approved = handle.evidence().events.find((event) => event.kind === 'command.approved');
      expect(approved?.payload).toMatchObject({
        approvedBy: HUMAN_OPERATOR_URI,
        approvedByKind: 'human',
      });
    } finally {
      remove();
    }
  });

  it('tells a cold agent reading the handle that it cannot approve', () => {
    const { handle, remove } = fixture();
    try {
      const authority = (handle.brief().data as { authority: { reason: string } }).authority;
      expect(authority.reason).toMatch(/Agent Cockpit/);
      expect(authority.reason).toMatch(/cannot approve/);
      const drill = handle
        .capabilities()
        .data.items.find((item) => item.id === 'simulation.start-fire-drill')!;
      expect(drill.authorityReason).toMatch(/cannot approve/);
      const grant = handle.grants().find((item) => item.actorUri === DEFAULT_AGENT_ACTOR_URI)!;
      expect(grant.escalation).toMatch(/Agent Cockpit/);
    } finally {
      remove();
    }
  });
});

describe('the interface ignores a replaced window property', () => {
  let remove: () => void = () => undefined;
  afterEach(() => {
    remove();
    delete (window as { __MILLOS_AGENT__?: unknown }).__MILLOS_AGENT__;
  });

  it('executeOperatorCommand uses the module-held runtime, not window.__MILLOS_AGENT__', async () => {
    prepareCover();
    remove = installMillOSAgentRuntime(window);
    const fake = {
      version: 2,
      draft: vi.fn(() => {
        throw new Error('fake draft');
      }),
      preview: vi.fn(),
      approve: vi.fn(),
      commit: vi.fn(),
    };
    Object.defineProperty(window, '__MILLOS_AGENT__', {
      configurable: true,
      value: fake as unknown as AgentRuntimeApi,
    });
    const result = await executeOperatorCommand(planRequest(), {
      approvalReason: 'The person pressed Approve and run.',
    });
    expect(result.preview.status).toBe('requires-approval');
    expect(result.approval).toMatchObject({ approvedByKind: 'human' });
    expect(result.receipt?.status).toBe('verified');
    for (const spy of [fake.draft, fake.preview, fake.approve, fake.commit]) {
      expect(spy).not.toHaveBeenCalled();
    }
  });
});

describe('executeAgentCommand never approves', () => {
  it('returns a high-risk preview unexecuted and records no approval', async () => {
    prepareCover();
    const remove = installMillOSAgentRuntime(window);
    try {
      const result = await executeAgentCommand(planRequest());
      expect(result.preview.status).toBe('requires-approval');
      expect(result.approval).toBeNull();
      expect(result.receipt).toBeNull();
      expect(useWorkplaceStore.getState().workplace.phase).toBe('deliberating');
      const events = getOperatorRuntime(window).evidence().events;
      expect(
        events.some(
          (event) =>
            event.kind === 'command.approved' &&
            event.correlationId === result.preview.command.commandId
        )
      ).toBe(false);
    } finally {
      remove();
    }
  });

  it('still lets the on-device operator acknowledge and mitigate under its own grant', async () => {
    useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
    useOperationsCampaignStore.getState().initializeCampaign();
    const incident = useOperationsCampaignStore.getState().triggerIncident('severe_rain')!;
    const remove = installMillOSAgentRuntime(window);
    try {
      const targetUri = `millos://incident/${incident.id}`;
      for (const capabilityId of ['incident.acknowledge', 'incident.mitigate']) {
        const result = await executeAgentCommand({
          capabilityId,
          targetUri,
          parameters: { incidentUri: targetUri },
          reason: 'On-device operator test.',
          actorUri: ON_DEVICE_OPERATOR_URI,
          grantId: ON_DEVICE_OPERATOR_GRANT_ID,
        });
        expect(result.approval).toBeNull();
        expect(result.receipt?.status).toBe('verified');
        expect(result.receipt?.approvedByKind).toBeNull();
      }
      const phase = useOperationsCampaignStore
        .getState()
        .incidents.find((candidate) => candidate.id === incident.id)?.phase;
      expect(phase).toBe('mitigated');
    } finally {
      remove();
    }
  });

  it('blocks window.__MILLOS_AGENT__ from impersonating on-device-operator or its grant', async () => {
    useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
    useOperationsCampaignStore.getState().initializeCampaign();
    const incident = useOperationsCampaignStore.getState().triggerIncident('severe_rain')!;
    const { handle, operator, remove } = fixture();
    try {
      const targetUri = `millos://incident/${incident.id}`;
      expect(() =>
        handle.draft({
          capabilityId: 'incident.mitigate',
          targetUri,
          parameters: { incidentUri: targetUri },
          reason: 'Impersonation attempt.',
          actorUri: ON_DEVICE_OPERATOR_URI,
          grantId: ON_DEVICE_OPERATOR_GRANT_ID,
        })
      ).toThrow(/ACTOR_NOT_ALLOWED_ON_HANDLE/);
      expect(() =>
        handle.draft({
          capabilityId: 'incident.mitigate',
          targetUri,
          parameters: { incidentUri: targetUri },
          reason: 'Grant hijack attempt.',
          grantId: ON_DEVICE_OPERATOR_GRANT_ID,
        })
      ).toThrow(/GRANT_NOT_ALLOWED_ON_HANDLE/);
      expect(() =>
        handle.legalOptions({
          targetUri,
          actorUri: ON_DEVICE_OPERATOR_URI,
          grantId: ON_DEVICE_OPERATOR_GRANT_ID,
        })
      ).toThrow(/ACTOR_NOT_ALLOWED_ON_HANDLE/);

      // External high-risk previews appear in the operator's pending approvals queue.
      prepareCover();
      const pending = await handle.preview(handle.draft(planRequest()));
      expect(pending.status).toBe('requires-approval');
      expect(operator.listPendingPreviews().map((p) => p.previewId)).toContain(pending.previewId);
      const token = operator.approve(pending.previewId, 'Approved in Agent Cockpit queue.');
      const receipt = await operator.commit(pending, token);
      expect(receipt.status).toBe('verified');
      expect(operator.listPendingPreviews().map((p) => p.previewId)).not.toContain(
        pending.previewId
      );
    } finally {
      remove();
    }
  });

  it('blocks an external agent from unpausing a player P pause', async () => {
    const { handle, remove } = fixture();
    useGameSimulationStore.setState({ gameSpeed: 0, clockHolds: [] });
    try {
      const preview = await handle.preview(
        handle.draft({
          capabilityId: 'simulation.set-speed',
          targetUri: 'millos://simulation/local',
          parameters: { simulationUri: 'millos://simulation/local', speed: 2 },
          reason: 'Try to unpause player pause.',
        })
      );
      expect(preview.status).toBe('denied');
      expect(preview.problems.map((p) => p.code)).toContain('PRE.SPEED.PLAYER_PAUSE');
    } finally {
      remove();
    }
  });
});

describe('objections, lessons and evidence through the handle', () => {
  it('refuses to resolve a human-raised objection and still resolves an agent-raised one', () => {
    const { handle, operator, remove } = fixture();
    try {
      const held = 'objection.live-external-control-held';
      expect(() => handle.resolveObjection(held, 'An agent lifting the hold.')).toThrow(
        /OBJECTION_NOT_RESOLVABLE_ON_HANDLE/
      );
      expect(handle.policy().objections.find((item) => item.id === held)?.status).toBe('active');

      const raised = handle.object(
        ['dispatch.release'],
        'Pause dispatch while checking.',
        'pause',
        ['shadow']
      );
      expect(raised.raisedBy).toBe(DEFAULT_AGENT_ACTOR_URI);
      expect(handle.resolveObjection(raised.id, 'Checked.')).toBe(true);
      expect(handle.resolveObjection('objection.missing', 'Nothing.')).toBe(false);

      // The person, in the interface, can close the human hold.
      expect(operator.resolveObjection(held, 'The person lifted the hold.')).toBe(true);
      expect(handle.policy().objections.find((item) => item.id === held)?.status).toBe('resolved');
    } finally {
      remove();
    }
  });

  it('promotes only advisory lessons from a registered non-human actor through the handle', async () => {
    prepareCover();
    const { handle, operator, remove } = fixture();
    try {
      await handle.preview(handle.draft(planRequest()));
      const eventId = handle.evidence().events[0].eventId;
      expect(() =>
        handle.promoteLesson('Claimed as reviewed.', [eventId], DEFAULT_AGENT_ACTOR_URI, true)
      ).toThrow(/LESSON_REVIEW_NOT_AVAILABLE_ON_HANDLE/);
      expect(() =>
        handle.promoteLesson('Attributed to a person.', [eventId], HUMAN_OPERATOR_URI)
      ).toThrow(/LESSON_PROMOTER_NOT_ALLOWED_ON_HANDLE/);
      expect(() =>
        handle.promoteLesson('Attributed to nobody.', [eventId], 'millos://actor/nobody')
      ).toThrow(/LESSON_PROMOTER_NOT_ALLOWED_ON_HANDLE/);
      const advisory = handle.promoteLesson('Preview first.', [eventId], DEFAULT_AGENT_ACTOR_URI);
      expect(advisory.authority).toBe('advisory');

      const reviewed = operator.promoteReviewedLesson('Preview first, reviewed.', [eventId]);
      expect(reviewed).toMatchObject({
        authority: 'human-reviewed',
        promotedBy: HUMAN_OPERATOR_URI,
      });
      expect(
        handle
          .evidence()
          .lessons.map((lesson) => lesson.authority)
          .sort()
      ).toEqual(['advisory', 'human-reviewed']);
    } finally {
      remove();
    }
  });

  it('brings in no lesson on import, so none can arrive as human-reviewed', () => {
    const { handle, remove } = fixture();
    try {
      const core = {
        schemaVersion: 2 as const,
        events: [
          {
            eventId: 'evt-00000001',
            schemaVersion: 2,
            correlationId: 'cmd-imported',
            causationId: null,
            commandId: 'cmd-imported',
            actorUri: DEFAULT_AGENT_ACTOR_URI,
            grantId: 'grant.agent-driver.simulation.v1',
            domain: 'experience',
            kind: 'command.previewed',
            wallTime: '2026-11-01T00:00:00.000Z',
            simulationTime: { day: 1, hour: 6 },
            beforeRevision: 'r1-a',
            afterRevision: 'r1-a',
            targetUri: 'millos://simulation/local',
            payload: null,
            provenance: [{ kind: 'runtime', source: 'test' }],
          },
        ],
        lessons: [
          {
            id: 'lesson-imported',
            statement: 'Claimed in a file as reviewed by a person.',
            evidenceEventIds: ['evt-00000001'],
            promotedBy: HUMAN_OPERATOR_URI,
            promotedAt: '2026-11-01T00:00:00.000Z',
            authority: 'human-reviewed',
            evidenceFingerprint: 'r1-x',
          },
        ],
        compaction: {
          discardedEvents: 0,
          oldestRetainedEventId: 'evt-00000001',
          newestRetainedEventId: 'evt-00000001',
        },
      };
      const result = handle.importEvidence({
        ...core,
        evidenceFingerprint: revisionFor(core),
        exportedAt: '2026-11-01T00:00:00.000Z',
        eventBound: 1000,
      });
      expect(result.imported).toBe(1);
      expect(handle.evidence().lessons).toEqual([]);
    } finally {
      remove();
    }
  });

  it('still imports an evidence export made before approvals recorded their kind', () => {
    const { handle, remove } = fixture();
    try {
      const approved = preChangeExport.events.find((event) => event.kind === 'command.approved');
      expect(approved?.payload).not.toHaveProperty('approvedByKind');
      const result = handle.importEvidence(preChangeExport);
      expect(result.problems.filter((problem) => problem.severity === 'blocking')).toEqual([]);
      expect(result.imported).toBe(preChangeExport.events.length);
      expect(
        handle.evidence().events.find((event) => event.kind === 'command.approved')?.payload
      ).toMatchObject({ approvedBy: HUMAN_OPERATOR_URI });
    } finally {
      remove();
    }
  });
});

/**
 * A real export taken from HEAD before approvals recorded their kind
 * (2026-11-13): its command.approved payload has no approvedByKind.
 */
const preChangeExport = {
  schemaVersion: 2,
  events: [
    {
      correlationId: 'cmd-cdfed257-23b7-49ea-a291-2b615175c7de',
      causationId: null,
      commandId: 'cmd-cdfed257-23b7-49ea-a291-2b615175c7de',
      actorUri: 'millos://actor/agent-driver',
      grantId: 'grant.agent-driver.simulation.v1',
      domain: 'experience',
      kind: 'command.previewed',
      wallTime: '2026-11-13T21:01:58.721Z',
      simulationTime: {
        day: 1,
        hour: 10,
      },
      beforeRevision: 'r1-a0279a2d5a1fdc69',
      afterRevision: 'r1-a0279a2d5a1fdc69',
      targetUri: 'millos://simulation/local',
      payload: {
        previewId: 'preview-91b57dda-6039-48fd-907e-371c6b2390c0',
        status: 'requires-approval',
        materialFingerprint: 'r1-100b208137dd4f45',
        problems: [],
      },
      provenance: [
        {
          kind: 'runtime',
          source: 'capability:workplace.activate-plan',
        },
      ],
      eventId: 'evt-00000001',
      schemaVersion: 2,
    },
    {
      correlationId: 'cmd-cdfed257-23b7-49ea-a291-2b615175c7de',
      causationId: 'evt-00000001',
      commandId: 'cmd-cdfed257-23b7-49ea-a291-2b615175c7de',
      actorUri: 'millos://actor/agent-driver',
      grantId: 'grant.agent-driver.simulation.v1',
      domain: 'experience',
      kind: 'command.approved',
      wallTime: '2026-11-13T21:01:58.721Z',
      simulationTime: {
        day: 1,
        hour: 10,
      },
      beforeRevision: 'r1-a0279a2d5a1fdc69',
      afterRevision: 'r1-a0279a2d5a1fdc69',
      targetUri: 'millos://simulation/local',
      payload: {
        approvalId: 'approval-ab5b1ffe-0f39-484d-a9f0-c351164b8e04',
        approvedBy: 'millos://actor/human-operator',
        reason: 'Self-approved through the handle.',
      },
      provenance: [
        {
          kind: 'runtime',
          source: 'capability:workplace.activate-plan',
        },
      ],
      eventId: 'evt-00000002',
      schemaVersion: 2,
    },
    {
      correlationId: 'cmd-cdfed257-23b7-49ea-a291-2b615175c7de',
      causationId: 'evt-00000002',
      commandId: 'cmd-cdfed257-23b7-49ea-a291-2b615175c7de',
      actorUri: 'millos://actor/agent-driver',
      grantId: 'grant.agent-driver.simulation.v1',
      domain: 'experience',
      kind: 'command.verified',
      wallTime: '2026-11-13T21:01:58.728Z',
      simulationTime: {
        day: 1,
        hour: 10,
      },
      beforeRevision: 'r1-a0279a2d5a1fdc69',
      afterRevision: 'r1-294c0aa7a74005f3',
      targetUri: 'millos://simulation/local',
      payload: {
        receiptId: 'receipt-16f80265-9552-405f-acc8-199798c6e505',
        result: {
          changed: true,
          reason: null,
        },
        verification: [
          {
            id: 'VERIFY.WORKPLACE.ACTIVE',
            passed: true,
            detail: 'The agreed local plan is active.',
          },
        ],
        changedDomains: ['experience'],
        problems: [],
      },
      provenance: [
        {
          kind: 'runtime',
          source: 'capability:workplace.activate-plan',
        },
      ],
      eventId: 'evt-00000003',
      schemaVersion: 2,
    },
  ],
  lessons: [],
  compaction: {
    discardedEvents: 0,
    oldestRetainedEventId: 'evt-00000001',
    newestRetainedEventId: 'evt-00000003',
  },
  evidenceFingerprint: 'r1-00040d287aeec46c',
  exportedAt: '2026-11-13T21:01:58.729Z',
  eventBound: 1000,
};
