import { describe, expect, it } from 'vitest';
import {
  cloneMaterialFlowData,
  createMaterialFlowStore,
  useMaterialFlowStore,
} from '../stores/materialFlowStore';
import {
  capturePackingPlant,
  derivePackingAdvice,
  runPackingRehearsals,
  validPackingAdvice,
  type PackingContext,
} from './workplaceAdvice';

function fixture(gameSpeed = 180) {
  const store = createMaterialFlowStore();
  const context: PackingContext = {
    order: {
      id: 'order-one',
      customer: 'Private name',
      recipe: {
        id: 'wheat',
        label: 'Wheat flour',
        finishedMaterial: 'flour',
        sourceMaterial: 'wheat_grain',
        minimumQuality: 80,
      },
      requiredKg: 10000,
      shippedKg: 0,
      qualityFailureKg: 0,
      dueAtMinute: 100,
      priority: 'normal',
      revenuePerKg: 2,
      latePenaltyPerKgHour: 1,
      status: 'active',
      batchIds: [],
      manifestIds: [],
      completedAtMinute: null,
    },
    missionMaterialSessionId: store.getState().sessionId,
    productionSpeed: 1,
    campaignMultiplier: 1,
    gameSpeed,
    qualityRelease: true,
    dispatchLoad: {
      cycleId: 'truck-1',
      status: 'loading',
      loadedKg: 0,
      capacityKg: 1000,
      materialType: 'flour',
      blockReason: null,
      lastDispatchKg: 0,
    },
    executionFresh: true,
  };
  return { store, context, capture: () => capturePackingPlant(store.getState(), context) };
}
describe('isolated packing advice', () => {
  it('clones data and action closures deeply without touching singleton or input', () => {
    const f = fixture();
    const source = cloneMaterialFlowData(f.store.getState());
    const first = createMaterialFlowStore(source),
      second = createMaterialFlowStore(source);
    first
      .getState()
      .machineBuffers.get('silo-0')!
      .outputBuffer[0].sourceContributions![0].path.push('isolated');
    expect(
      second.getState().machineBuffers.get('silo-0')!.outputBuffer[0].sourceContributions![0].path
    ).not.toContain('isolated');
    expect(
      source.machineBuffers.get('silo-0')!.outputBuffer[0].sourceContributions![0].path
    ).not.toContain('isolated');
    const liveBefore = cloneMaterialFlowData(useMaterialFlowStore.getState());
    let notifications = 0;
    const unsubscribe = useMaterialFlowStore.subscribe(() => notifications++);
    const before = cloneMaterialFlowData(f.store.getState());
    const result = runPackingRehearsals(f.capture());
    unsubscribe();
    expect(notifications).toBe(0);
    expect(cloneMaterialFlowData(useMaterialFlowStore.getState())).toEqual(liveBefore);
    expect(cloneMaterialFlowData(f.store.getState())).toEqual(before);
    expect(result.arms).toHaveLength(3);
    expect(result.arms.every((a) => a.genealogyErrorKg! < 0.01)).toBe(true);
  });
  it('matches clock and real engine packed deltas at named default and teaching pace', () => {
    for (const speed of [180, 30]) {
      const f = fixture(speed),
        capture = f.capture();
      expect(capture.reasonToAbstain).toBeNull();
      const advice = derivePackingAdvice(capture, 'steady');
      expect(advice.physicalSeconds).toBe(5400 / speed);
      const manual = createMaterialFlowStore(capture.data);
      for (let t = 0; t < advice.physicalSeconds; t += 0.5)
        manual.getState().tickMaterialFlow(0.5, 0.78, {
          sourceMaterial: 'wheat_grain',
          finishedMaterial: 'flour',
          remainingFinishedKg: 10000,
        });
      const packed = manual
        .getState()
        .productionBatches.filter((b) => b.materialType === 'flour')
        .reduce((n, b) => n + b.producedKg, 0);
      expect(packed).toBeGreaterThan(0);
      expect(packed).toBeGreaterThanOrEqual(advice.packedLowKg);
      expect(packed).toBeLessThanOrEqual(advice.packedHighKg);
      expect(manual.getState().shippedKg).toBe(0);
      expect(manual.getState().manifests).toEqual([]);
      expect(validPackingAdvice(advice)).toEqual(advice);
      expect(derivePackingAdvice(capture, 'steady')).toEqual(advice);
    }
  });
  it('splits five paid workplace minutes at the physical briefing boundary', () => {
    const f = fixture(180),
      capture = f.capture();
    const advice = derivePackingAdvice(capture, 'briefing');
    const manual = createMaterialFlowStore(capture.data);
    const boundary = (5 * 60) / 180;
    let elapsed = 0;
    while (elapsed < 30 - 1e-10) {
      const pause = elapsed < boundary - 1e-10;
      const delta = Math.min(0.5, 30 - elapsed, pause ? boundary - elapsed : Infinity);
      manual.getState().tickMaterialFlow(delta, pause ? 0 : 0.9, {
        sourceMaterial: 'wheat_grain',
        finishedMaterial: 'flour',
        remainingFinishedKg: 10000,
      });
      elapsed += delta;
    }
    expect(manual.getState().simulationTime).toBeCloseTo((30 - boundary) * 0.9, 8);
    const packed = manual
      .getState()
      .productionBatches.reduce((n, b) => n + (b.materialType === 'flour' ? b.producedKg : 0), 0);
    expect([advice.packedLowKg, advice.packedHighKg]).toContain(packed);
  });
  it('does not invent output with stopped machinery or measured empty supply', () => {
    for (const exhausted of [false, true]) {
      const f = fixture();
      if (exhausted) {
        f.store.getState().machineBuffers.forEach((b) => {
          b.inputBuffer = [];
          b.outputBuffer = [];
        });
        f.store.setState({ initialInventoryKg: 0, sourceLots: new Map() });
      } else
        f.store
          .getState()
          .syncMachineProcessing(
            [...f.store.getState().machineBuffers.keys()].map((id) => ({ id, status: 'idle' }))
          );
      const result = runPackingRehearsals(f.capture());
      expect(result.arms.every((a) => a.reasonToAbstain === null && a.packedHighKg === 0)).toBe(
        true
      );
    }
  });
  it('rejects missing provenance and buffers, stale execution/session and invalid controls', () => {
    const mutations = [
      (f: ReturnType<typeof fixture>) => {
        f.context.executionFresh = false;
      },
      (f: ReturnType<typeof fixture>) => {
        f.context.missionMaterialSessionId = 'other';
      },
      (f: ReturnType<typeof fixture>) => {
        f.context.productionSpeed = NaN;
      },
      (f: ReturnType<typeof fixture>) => {
        f.context.gameSpeed = 0;
      },
      (f: ReturnType<typeof fixture>) => {
        f.context.order = null;
      },
      (f: ReturnType<typeof fixture>) => {
        f.context.qualityRelease = null;
      },
      (f: ReturnType<typeof fixture>) => {
        f.context.dispatchLoad = null;
      },
      (f: ReturnType<typeof fixture>) => {
        f.store.getState().machineBuffers.delete('silo-0');
      },
      (f: ReturnType<typeof fixture>) => {
        f.store.getState().sourceLots.clear();
      },
    ];
    for (const mutate of mutations) {
      const f = fixture();
      mutate(f);
      const advice = derivePackingAdvice(f.capture(), 'buffer');
      expect(advice.reasonToAbstain).not.toBeNull();
      expect(advice.packedHighKg).toBe(0);
      expect(advice.dispatchUpperKg).toBe(0);
    }
  });
  it('detects changed paused inventory, provenance, order, quality and dispatch facts', () => {
    const f = fixture();
    let prior = f.capture().fingerprint;
    for (const mutate of [
      () => {
        f.context.order!.shippedKg = 1;
      },
      () => {
        f.context.qualityRelease = false;
      },
      () => {
        f.context.dispatchLoad!.loadedKg = 50;
      },
      () => {
        f.context.campaignMultiplier = 0.9;
      },
      () => {
        f.store.getState().sourceLots.values().next().value!.disposition = 'hold';
      },
      () => {
        f.store.getState().machineBuffers.get('packer-0')!.isProcessing = false;
      },
    ]) {
      mutate();
      const next = f.capture().fingerprint;
      expect(next).not.toBe(prior);
      prior = next;
    }
  });
  it('reports held packed goods separately and never dispatches held quality', () => {
    const f = fixture(30);
    f.store.getState().tickMaterialFlow(180, 1, {
      sourceMaterial: 'wheat_grain',
      finishedMaterial: 'flour',
      remainingFinishedKg: 10000,
    });
    const ids = f.store.getState().productionBatches.map((b) => b.id);
    expect(ids.length).toBeGreaterThan(0);
    f.store.getState().setBatchDisposition(ids, 'hold', 'test hold');
    f.context.qualityRelease = false;
    const capture = f.capture();
    expect(capture.evidence.heldPackedKg).toBeGreaterThan(0);
    expect(capture.evidence.releasedPackedKg).toBe(0);
    const advice = derivePackingAdvice(capture, 'steady');
    expect(advice.dispatchLowerKg).toBe(0);
    expect(advice.dispatchUpperKg).toBe(0);
    expect(advice.packedLowKg).toBeLessThanOrEqual(advice.packedHighKg);
  });
  it('includes an already loaded truck in the total conditional departure bound', () => {
    const f = fixture(30);
    f.store.getState().tickMaterialFlow(180, 1, {
      sourceMaterial: 'wheat_grain',
      finishedMaterial: 'flour',
      remainingFinishedKg: 10000,
    });
    f.context.dispatchLoad = { ...f.context.dispatchLoad!, status: 'ready', loadedKg: 1000 };
    const a = derivePackingAdvice(f.capture(), 'buffer');
    expect(a.reasonToAbstain).toBeNull();
    expect(a.dispatchUpperKg).toBe(1000);
    expect(validPackingAdvice(a)).toEqual(a);
  });
  it('sanitizes optional persisted evidence without raw plant or customer payloads', () => {
    const advice = derivePackingAdvice(fixture().capture(), 'buffer');
    const dirty = {
      ...advice,
      rawPlant: { private: true },
      evidence: { ...advice.evidence, customer: 'private' },
    };
    const restored = validPackingAdvice(dirty)!;
    expect(restored).toEqual(advice);
    expect(JSON.stringify(restored)).not.toContain('private');
    expect(validPackingAdvice({ ...advice, packedHighKg: Infinity })).toBeUndefined();
    expect(validPackingAdvice({ ...advice, dispatchUpperKg: 1001 })).toBeUndefined();
    expect(
      validPackingAdvice({
        ...advice,
        evidence: { ...advice.evidence, qualityRelease: false },
        dispatchUpperKg: 1,
      })
    ).toBeUndefined();
  });
});
