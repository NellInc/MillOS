import { beforeEach, describe, expect, it } from 'vitest';
import { installMillOSAgentRuntime } from '../adapters/runtime/installAgentRuntime';
import { captureMillOSAgentState } from '../adapters/runtime/runtimeProjection';
import { useWorkplaceStore } from '../../stores/workplaceStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { createWorkplace, workplaceCapacity } from '../../simulation/bilateralWorkplace';

beforeEach(() => {
  useWorkplaceStore.setState({ workplace: createWorkplace() });
  useGameSimulationStore.setState({ emergencyActive: false });
});

function fixture() {
  const target = {} as Window;
  const remove = installMillOSAgentRuntime(target);
  const api = target.__MILLOS_AGENT__!;
  const draft = () =>
    api.draft({
      capabilityId: 'workplace.activate-plan',
      targetUri: 'millos://simulation/local',
      parameters: { revision: useWorkplaceStore.getState().workplace.revision },
      reason: 'Approve the exact current fictional team agreement.',
    });
  return { api, draft, remove };
}

function prepareCover() {
  const s = useWorkplaceStore.getState();
  s.start('game');
  s.selectPlan('cover');
  s.simulateResponses();
}

describe('workplace far-side authority and consent', () => {
  it('requires explicit high-risk approval and verifies the actual funded agreement', async () => {
    prepareCover();
    const { api, draft, remove } = fixture();
    try {
      const preview = await api.preview(draft());
      expect(preview.status).toBe('requires-approval');
      expect(useWorkplaceStore.getState().workplace.phase).toBe('deliberating');
      const receipt = await api.commit(
        preview,
        api.approve(preview.previewId, 'Visible terms approved.')
      );
      expect(receipt.status).toBe('verified');
      expect(receipt.changedDomains).toEqual(['experience']);
      expect(receipt.verification.every((v) => v.passed)).toBe(true);
      expect(useWorkplaceStore.getState().workplace.finance.compensationReserve).toBe(8);
      expect(workplaceCapacity(useWorkplaceStore.getState().workplace)).toBeLessThan(1);
    } finally {
      remove();
    }
  });

  it('rejects a preview after every volunteer withdraws, without reserving or spending money', async () => {
    prepareCover();
    const { api, draft, remove } = fixture();
    try {
      const preview = await api.preview(draft());
      const approval = api.approve(preview.previewId, 'Preview approved before withdrawal.');
      for (const m of useWorkplaceStore.getState().workplace.members) {
        if (m.coverConsent) useWorkplaceStore.getState().withdraw(m.id);
      }
      const before = structuredClone(useWorkplaceStore.getState().workplace.finance);
      const receipt = await api.commit(preview, approval);
      expect(receipt.status).toBe('rejected');
      expect(useWorkplaceStore.getState().workplace.phase).toBe('deliberating');
      expect(useWorkplaceStore.getState().workplace.finance).toEqual(before);
    } finally {
      remove();
    }
  });

  it('denies pilot, workshop, advisory-only and emergency plant activation', async () => {
    for (const mode of ['pilot', 'workshop', 'game'] as const) {
      useWorkplaceStore.setState({ workplace: createWorkplace() });
      useWorkplaceStore.getState().start(mode);
      if (mode === 'game') {
        useWorkplaceStore.getState().configure({ aiAuthority: 'advice' });
        useWorkplaceStore.getState().simulateResponses();
      }
      const { api, draft, remove } = fixture();
      expect((await api.preview(draft())).status).toBe('denied');
      remove();
    }
    useWorkplaceStore.setState({ workplace: createWorkplace() });
    prepareCover();
    const { api, draft, remove } = fixture();
    const preview = await api.preview(draft());
    const approval = api.approve(preview.previewId, 'Before emergency.');
    const funds = structuredClone(useWorkplaceStore.getState().workplace.finance);
    useGameSimulationStore.setState({ emergencyActive: true });
    const blocked = await api.commit(preview, approval);
    expect(blocked.status).toBe('failed');
    expect(blocked.problems.some((problem) => problem.message.includes('safety stop'))).toBe(true);
    expect(useWorkplaceStore.getState().workplace.phase).toBe('deliberating');
    expect(useWorkplaceStore.getState().workplace.finance).toEqual(funds);
    remove();
  });

  it('revocation stops deferred optional work and retains already earned compensation', async () => {
    prepareCover();
    const { api, draft, remove } = fixture();
    const preview = await api.preview(draft());
    await api.commit(preview, api.approve(preview.previewId, 'Bounded local agreement.'));
    useWorkplaceStore.getState().tick(3, 0, false);
    const paid = useWorkplaceStore.getState().workplace.finance.compensationPaid;
    expect(paid).toBeCloseTo(2.4);
    expect(api.revokeGrant('grant.agent-driver.simulation.v1', 'Authority withdrawn.')).toBe(true);
    expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
    expect(workplaceCapacity(useWorkplaceStore.getState().workplace)).toBe(1);
    useWorkplaceStore.getState().tick(20, 0, false);
    expect(useWorkplaceStore.getState().workplace.finance.compensationPaid).toBe(paid);
    remove();
  });

  it('excludes private preference explanations from the agent plane until purpose-limited permission', () => {
    useWorkplaceStore.getState().start('game');
    const privateReason = useWorkplaceStore.getState().workplace.members[0].preference;
    expect(JSON.stringify(captureMillOSAgentState().domains.experience)).not.toContain(
      privateReason
    );
    useWorkplaceStore.getState().sharePreference('packing', true);
    expect(JSON.stringify(captureMillOSAgentState().domains.experience)).toContain(privateReason);
    useWorkplaceStore.getState().sharePreference('packing', false);
    expect(JSON.stringify(captureMillOSAgentState().domains.experience)).not.toContain(
      privateReason
    );
  });

  it('an authority objection stops future work and requires explicit resolution', async () => {
    prepareCover();
    const { api, draft, remove } = fixture();
    const preview = await api.preview(draft());
    await api.commit(preview, api.approve(preview.previewId, 'Local agreement.'));
    useWorkplaceStore.getState().tick(2, 0, false);
    const paid = useWorkplaceStore.getState().workplace.finance.compensationPaid;
    const objection = api.object(['workplace.activate-plan'], 'Review voluntary cover.', 'pause');
    expect(useWorkplaceStore.getState().workplace.phase).toBe('review');
    expect(useWorkplaceStore.getState().workplace.finance.compensationPaid).toBe(paid);
    expect(api.policy().objections.find((item) => item.id === objection.id)?.status).toBe('active');
    remove();
  });
});
