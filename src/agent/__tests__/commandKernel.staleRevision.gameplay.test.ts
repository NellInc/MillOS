import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installMillOSAgentRuntime } from '../adapters/runtime/installAgentRuntime';
import { useOperationsCampaignStore } from '../../stores/operationsCampaignStore';
import { useBreakdownStore } from '../../stores/breakdownStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { setLocale } from '../../i18n';

// A preview is read by a person before it is committed. The central tick moves
// the line's running quantities (remaining, staged and released kg) every half
// second, and activate-order declares only execution.orderId, recipeId,
// materials and stage. Hashing the whole execution record made every
// cockpit preview of the default command stale before the player could commit.
// Working if a tick that moves only running quantities leaves the preview
// committable, while a change to a declared field still makes it stale.

const api = () => window.__MILLOS_AGENT__!;

const breakdown = {
  id: 'bd-1',
  workOrderId: 'wo-1',
  machineId: 'rm-101',
  machineName: 'R.M. 101',
  type: 'bearing_failure',
  startTime: 0,
  estimatedRepairTime: 40,
  severity: 'minor',
  repairProgress: 0,
  resolved: false,
  description: 'Bearing failure',
  downtimeSeconds: 60,
};
const workOrder = {
  id: 'wo-1',
  breakdownId: 'bd-1',
  machineId: 'rm-101',
  machineName: 'R.M. 101',
  cause: 'bearing_failure',
  requiredParts: ['bearings'],
  consumedParts: [],
  phase: 'diagnosed',
  openedAt: 0,
  downtimeSeconds: 60,
  audit: [],
};
const batch = {
  id: 'batch-1',
  packerId: 'packer-1',
  materialType: 'flour',
  producedKg: 100,
  availableKg: 100,
  simulationTime: 0,
  sourceContributions: [{ lotId: 'lot-1', amount: 100, path: ['silo-alpha'] }],
  disposition: 'hold',
  dispositionReason: 'Awaiting QC.',
  qcTestIds: [],
  dispatchManifestIds: [],
  sealed: false,
};

function seedRunningPlant() {
  useBreakdownStore.setState({
    activeBreakdowns: [breakdown],
    workOrders: [workOrder],
  } as never);
  useMaterialFlowStore.setState({ productionBatches: [batch] } as never);
}

/** What the central tick moves every half second on a running plant. */
function tickRunningQuantities() {
  useBreakdownStore.setState((state) => ({
    activeBreakdowns: state.activeBreakdowns.map((item) => ({
      ...item,
      downtimeSeconds: item.downtimeSeconds + 30,
    })),
    workOrders: state.workOrders.map((item) => ({
      ...item,
      downtimeSeconds: item.downtimeSeconds + 30,
    })),
  }));
  useOperationsCampaignStore.setState((state) => ({
    shiftMetrics: {
      ...state.shiftMetrics,
      commitmentMinutes: state.shiftMetrics.commitmentMinutes + 0.5,
      energyCost: state.shiftMetrics.energyCost + 3,
    },
  }));
  useMaterialFlowStore.setState((state) => ({
    productionBatches: state.productionBatches.map((item) => ({
      ...item,
      producedKg: item.producedKg + 25,
      availableKg: item.availableKg + 25,
    })),
  }));
}

describe('a previewed command against a running plant', () => {
  const removals: Array<() => void> = [];
  beforeEach(() => {
    setLocale('en');
    useOperationsCampaignStore.getState().resetCampaign();
    useOperationsCampaignStore.getState().initializeCampaign();
    removals.push(installMillOSAgentRuntime(window));
  });
  const breakdownsBefore = useBreakdownStore.getState();
  const batchesBefore = useMaterialFlowStore.getState().productionBatches;
  afterEach(() => {
    removals.splice(0).forEach((remove) => remove());
    useOperationsCampaignStore.getState().resetCampaign();
    useBreakdownStore.setState({
      activeBreakdowns: breakdownsBefore.activeBreakdowns,
      workOrders: breakdownsBefore.workOrders,
    });
    useMaterialFlowStore.setState({ productionBatches: batchesBefore });
  });

  const previewActivation = async () => {
    const order = useOperationsCampaignStore
      .getState()
      .orders.find((candidate) => candidate.status === 'planned')!;
    expect(order).toBeTruthy();
    const targetUri = `millos://order/${order.id}`;
    const command = api().draft({
      capabilityId: 'operations.activate-order',
      targetUri,
      parameters: { orderUri: targetUri },
      reason: 'Run this order next.',
    });
    const preview = await api().preview(command);
    expect(preview.status).not.toBe('denied');
    return preview;
  };

  it('commits after a tick that only moved the line quantities', async () => {
    const preview = await previewActivation();
    // What one central tick writes while the line runs.
    useOperationsCampaignStore.setState((state) => ({
      execution: {
        ...state.execution,
        remainingKg: state.execution.remainingKg + 125,
        sourceInventoryKg: state.execution.sourceInventoryKg + 40,
        finishedAvailableKg: state.execution.finishedAvailableKg + 12,
      },
    }));
    const receipt = await api().commit(preview);
    expect(receipt.problems.map((problem) => problem.code)).not.toContain('STALE_REVISION');
    expect(receipt.status).toBe('verified');
  });

  // Every running quantity the central tick moves while the player reads a
  // preview: a down machine's downtime, the shift's accruing costs and
  // commitment minutes, and the open batch's packed kg. None is a field the
  // command acts on, so none may make its preview stale.
  it.each([
    ['incident.mitigate', 'millos://incident/incident-0001'],
    ['maintenance.request-repair', 'millos://breakdown/bd-1'],
    ['maintenance.request-restart', 'millos://breakdown/bd-1'],
    ['quality.hold-batch', 'millos://batch/batch-1'],
    ['quality.release-batch', 'millos://batch/batch-1'],
  ])('%s keeps its observed revision across a running tick', (capabilityId, targetUri) => {
    seedRunningPlant();
    const before = api().draft({ capabilityId, targetUri, parameters: {}, reason: 'Check.' });
    tickRunningQuantities();
    const after = api().draft({ capabilityId, targetUri, parameters: {}, reason: 'Check.' });
    expect(after.observedRevision).toBe(before.observedRevision);
  });

  it('still refuses a preview whose declared fields changed', async () => {
    const preview = await previewActivation();
    useOperationsCampaignStore.setState((state) => ({
      execution: { ...state.execution, stage: 'dispatch' as typeof state.execution.stage },
    }));
    const receipt = await api().commit(preview);
    expect(receipt.status).toBe('rejected');
    expect(receipt.problems.map((problem) => problem.code)).toContain('STALE_REVISION');
  });
});
