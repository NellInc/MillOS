import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceStore } from './workplaceStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useMaterialFlowStore, type ProductionBatch } from './materialFlowStore';
import { BENCH_TEST_MINUTES, stepLabBench, useQCLabStore } from './qcLabStore';
import { shipmentOrdersFrom } from '../simulation/shipmentPlan';
import {
  createWorkplace,
  restoreWorkplace,
  saveWorkplace,
  workplaceCapacity,
} from '../simulation/bilateralWorkplace';
import {
  WORKPLACE_CHECKS,
  campaignAgreementHonoured,
  campaignStory,
  mondayMinute,
  requiredChecks,
} from '../simulation/workplaceCampaign';
import { endReplayClock } from '../simulation/workplaceReplayRuntime';
import { useWorkplaceAutoplay } from '../simulation/workplaceAutoplay';
import { fulfilFirstDelivery } from '../test/firstDelivery';
import { setLocale } from '../i18n';

// Plan item 5.7. Monday's quality hold was scripted at a drawn minute, and
// "inspect" ran five modelled minutes that read no batch. Working if Monday
// holds only while a real batch of the season's order awaits its bench test,
// inspecting puts that batch first on the lab's bench, the hold ends when the
// bench has read it (its own stamp against the order's minimum), and a season
// with no sample still finishes, honoured.

const FIXTURES = join(__dirname, '../simulation/__tests__/fixtures/workplace-saves');
const fixture = (name: string) => JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));

beforeEach(() => {
  setLocale('en');
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  useGameSimulationStore.setState({
    emergencyActive: false,
    emergencyDrillMode: false,
    preEmergencyMachineStatuses: new Map(),
  });
  useMaterialFlowStore.getState().resetMaterialFlow();
  useQCLabStore.getState().resetQCLab();
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  fulfilFirstDelivery();
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
    completedCampaigns: [],
    leftCampaigns: [],
  });
});

const store = () => useWorkplaceStore.getState();
const workplace = () => store().workplace;
const lab = () => useQCLabStore.getState().qcLab;
const must = (result: { changed: boolean; reason: string | null }) => {
  expect(result.changed, result.reason ?? '').toBe(true);
};

function agreeAsPacking() {
  for (const id of requiredChecks('packing')) {
    const q = WORKPLACE_CHECKS.find((c) => c.id === id)!;
    if (workplace().campaign?.checks.packing?.[id] !== q.correct)
      must(store().answerCheck('packing', id, q.correct));
  }
  if (!workplace().members[0].understood) must(store().understand('packing'));
  if (workplace().members[0].ballot !== true) must(store().vote('packing', true));
  store().simulateResponses({});
}

/** A batch of the season's order (order-002, semolina) awaiting its bench test. */
const sample = (id: string, qualityScore: number): ProductionBatch => ({
  id,
  disposition: 'released',
  packerId: 'packer-2',
  materialType: 'semolina',
  producedKg: 800,
  availableKg: 800,
  simulationTime: 1,
  sourceContributions: [{ lotId: 'lot-00001', amount: 800, path: ['silo-4', 'packer-2'] }],
  dispositionReason: null,
  qcTestIds: [],
  dispatchManifestIds: [],
  sealed: true,
  qualityScore,
  awaitingTest: true,
});

const bench = (minutes: number) =>
  stepLabBench(
    minutes,
    shipmentOrdersFrom(useOperationsCampaignStore.getState().orders),
    () => false
  );

/** Through the first shift, then Monday's agreement, active at minute 0. */
function toMonday() {
  must(store().startMission('team', 17));
  expect(workplace().campaign?.mission?.orderId).toBe('order-002');
  agreeAsPacking();
  must(store().activate(workplace().revision));
  for (let i = 0; i < 40 && workplace().phase === 'active'; i++) store().tick(5, 0, false);
  must(store().nextCampaignShift());
  agreeAsPacking();
  must(store().activate(workplace().revision));
  expect(workplace().campaign?.shift).toBe(1);
}

describe('5.7: Monday holds for a real sample', () => {
  it('with no batch of the order awaiting a test, Monday never holds the line', () => {
    toMonday();
    const monday = mondayMinute(workplace());
    store().tick(monday + 10, 0, false);
    const s = workplace();
    expect(s.campaign?.mondaySample).toBeNull();
    expect(s.campaign?.decision).toBeNull();
    expect(workplaceCapacity(s)).toBe(1);
  });

  it('a pending sample holds the line; inspecting runs the lab test on it, and its stamp ends the hold', () => {
    toMonday();
    const monday = mondayMinute(workplace());
    // Before Monday's minute a pending batch holds nothing.
    useMaterialFlowStore.setState({ productionBatches: [sample('batch-00042', 88)] });
    store().tick(monday - 5, 0, false);
    expect(workplaceCapacity(workplace())).toBe(1);
    store().tick(6, 0, false);
    let s = workplace();
    expect(s.campaign?.mondaySample).toEqual({ batchId: 'batch-00042', heldAtMinute: monday + 1 });
    expect(workplaceCapacity(s)).toBe(0);
    // Quality inspects by itself, and the sample goes first on the bench.
    expect(s.campaign?.decision).toBe('inspect');
    expect(s.events.find((e) => e.kind === 'inspection-started')?.actorId).toBe('quality');
    expect(lab().benchFirst).toBe('batch-00042');
    // Five minutes on, the bench has not read it: the line still holds.
    store().tick(5, 0, false);
    expect(workplace().campaign?.inspectionComplete).toBe(false);
    expect(workplaceCapacity(workplace())).toBe(0);
    // The lab's real test: the batch's own stamp against the order's minimum (90).
    for (let i = 0; i <= BENCH_TEST_MINUTES; i++) bench(1);
    const test = lab().testHistory.at(-1)!;
    expect(test).toMatchObject({
      batchId: 'batch-00042',
      orderId: 'order-002',
      minimumQuality: 90,
    });
    expect(test.passed).toBe(false);
    store().tick(1, 0, false);
    s = workplace();
    expect(s.campaign?.inspectionComplete).toBe(true);
    expect(workplaceCapacity(s)).toBe(1);
    const read = s.events.filter((e) => e.kind === 'inspection-completed').at(-1)!;
    expect(read.detail).toBe(
      'Monday’s sample batch-00042 read on the bench: quality 88.0 is under the order’s minimum of 90.'
    );
  });

  it('a sample that leaves the bench untested releases the hold', () => {
    toMonday();
    const monday = mondayMinute(workplace());
    useMaterialFlowStore.setState({ productionBatches: [sample('batch-00042', 95)] });
    store().tick(monday + 1, 0, false);
    expect(workplaceCapacity(workplace())).toBe(0);
    // Recalled before the bench reached it.
    useMaterialFlowStore.setState({
      productionBatches: [{ ...sample('batch-00042', 95), disposition: 'recalled' }],
    });
    store().tick(6, 0, false);
    expect(workplace().campaign?.inspectionComplete).toBe(true);
    expect(workplaceCapacity(workplace())).toBe(1);
  });

  it('a season with no sample still finishes, and its agreement reads honoured', () => {
    must(store().startMission('team', 17));
    for (let shift = 0; shift < 3; shift++) {
      agreeAsPacking();
      must(store().activate(workplace().revision));
      for (let i = 0; i < 40 && workplace().phase === 'active'; i++) store().tick(5, 0, false);
      if (shift < 2) must(store().nextCampaignShift());
    }
    const s = workplace();
    expect(s.campaign?.shift).toBe(2);
    expect(s.campaign?.history[1].mondaySample).toBeNull();
    expect(campaignAgreementHonoured(s)).toBe(true);
    expect(campaignStory(s).join(' ')).toMatch(/never held for one/);
  });

  it('a Monday saved mid-hold restores and finishes; one saved scripted by the build before finishes too', () => {
    toMonday();
    useMaterialFlowStore.setState({ productionBatches: [sample('batch-00042', 95)] });
    store().tick(mondayMinute(workplace()) + 1, 0, false);
    const restored = restoreWorkplace(saveWorkplace(workplace()));
    expect(restored.campaign?.mondaySample?.batchId).toBe('batch-00042');
    expect(restored.campaign?.decision).toBe('inspect');
    // A scripted inspection under way in a save from before the bench was read.
    const legacy = restoreWorkplace(fixture('2026-11-13-pre-5c-monday-scripted-inspection.json'));
    expect(legacy.campaign?.shift).toBe(1);
    expect(legacy.campaign?.decision).toBe('inspect');
    expect(legacy.campaign?.mondaySample).toBeUndefined();
    useWorkplaceStore.setState({ workplace: legacy });
    must(store().resumeShift(workplace().revision));
    agreeAsPacking();
    must(store().activate(workplace().revision));
    for (let i = 0; i < 40 && workplace().phase === 'active'; i++) store().tick(5, 0, false);
    expect(workplace().campaign?.inspectionComplete).toBe(true);
  });
});
