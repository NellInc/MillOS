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
  rehearseWithheldDispatch,
  packingPredictionReview,
  packingInspectionPrompts,
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

describe('packing prediction evidence', () => {
  it('distinguishes separated, overlapping and numerically touching ranges without changing evidence', () => {
    const result = runPackingRehearsals(fixture().capture());
    const before = structuredClone(result);
    for (const [ordinary, buffer, observation] of [
      [[10, 20], [30, 40], 'higher'],
      [[30, 40], [10, 20], 'lower'],
      [[10, 30], [20, 40], 'overlap'],
      [[0, 0], [0, 0], 'overlap'],
      [[10, 20], [20.005, 30], 'overlap'],
    ] as const) {
      const compared = {
        ...result,
        arms: result.arms.map((arm) => {
          const range = arm.arrangement === 'steady' ? ordinary : buffer;
          return { ...arm, packedLowKg: range[0], packedHighKg: range[1] };
        }),
      };
      const review = packingPredictionReview(compared, 'higher');
      expect(review.observation).toBe(observation);
      expect(review.reflection).toContain(observation === 'higher' ? 'support' : 'differ');
      if (observation === 'overlap') expect(review.evidence).toContain('do not establish');
    }
    expect(result).toEqual(before);
    expect(packingPredictionReview(result, null).reflection).toBeNull();
    expect(packingPredictionReview(result, 'unsure').reflection).toContain(
      'left the prediction open'
    );
  });

  it('leaves abstaining, mismatched, missing or invalid evidence ungraded', () => {
    const result = runPackingRehearsals(fixture().capture());
    const buffer = result.arms.find((arm) => arm.arrangement === 'buffer')!;
    for (const invalid of [
      { ...buffer, reasonToAbstain: 'Quality evidence missing.' },
      { ...buffer, fingerprint: 'another-input' },
      { ...buffer, packedLowKg: Number.NaN },
      { ...buffer, packedHighKg: Infinity },
      { ...buffer, packedLowKg: -1 },
      { ...buffer, packedLowKg: buffer.packedHighKg + 1 },
    ]) {
      const review = packingPredictionReview(
        {
          ...result,
          arms: result.arms.map((arm) => (arm.arrangement === 'buffer' ? invalid : arm)),
        },
        'overlap'
      );
      expect(review.observation).toBe('unavailable');
      expect(review.reflection).not.toContain('support');
      expect(review.question).toContain('missing fact');
    }
    for (const arms of [
      result.arms.filter((arm) => arm.arrangement !== 'steady'),
      [...result.arms, buffer],
    ])
      expect(packingPredictionReview({ ...result, arms }, 'higher').observation).toBe(
        'unavailable'
      );
  });
});

describe('role-led captured evidence inspection', () => {
  it('keeps open release, machine flags and ready load separate from actual flow and departure', () => {
    const f = fixture();
    f.context.dispatchLoad!.status = 'ready';
    f.context.dispatchLoad!.loadedKg = f.context.dispatchLoad!.capacityKg;
    const advice = derivePackingAdvice(f.capture(), 'buffer');
    expect(advice.reasonToAbstain).toBeNull();
    const before = JSON.stringify(advice);
    const roles = packingInspectionPrompts(advice);
    expect(roles.map((r) => r.role)).toEqual(['Packing', 'Quality', 'Maintenance', 'Coordinator']);
    expect(roles[0].question).toContain('proves no departure');
    expect(roles[1].fact).toBe('Dispatch release at capture: open.');
    expect(roles[2].question).toContain('do not establish material flow');
    expect(roles[3].fact).toContain('ready; 1000 kg loaded / 1000 kg capacity');
    expect(roles[3].question).toContain('actual departure receipt');
    expect(JSON.stringify(advice)).toBe(before);
  });

  it('treats a known held release and away truck as captured constraints, without inventing permission', () => {
    const f = fixture();
    f.context.qualityRelease = false;
    f.context.dispatchLoad!.status = 'away';
    const advice = derivePackingAdvice(f.capture(), 'briefing');
    const roles = packingInspectionPrompts(advice);
    expect(advice.reasonToAbstain).toBeNull();
    expect(roles[1].fact).toBe('Dispatch release at capture: held.');
    expect(roles[1].question).toContain('vote cannot clear a hold');
    expect(roles[3].fact).toContain('away;');
    expect(roles[3].view).toBe('Shipping');
  });

  it('quarantines every numeric observation during abstention, including sanitised missing values', () => {
    const f = fixture();
    f.context.order = null;
    f.context.qualityRelease = null;
    f.context.dispatchLoad = null;
    const advice = derivePackingAdvice(f.capture(), 'steady');
    expect(advice.reasonToAbstain).toBeTruthy();
    const before = JSON.stringify(advice);
    const roles = packingInspectionPrompts(advice);
    expect(roles.every((r) => r.fact.includes('unavailable'))).toBe(true);
    expect(roles.every((r) => !/\d/.test(r.fact))).toBe(true);
    expect(roles[1].question).toContain('qualified batch');
    expect(JSON.stringify(advice)).toBe(before);
  });
});

describe('cooperative withheld-dispatch experiment', () => {
  it('uses real cloned flow for every pacing arm, withholds eligibility and leaves all live inputs intact', () => {
    const f = fixture(180);
    const capture = f.capture();
    const inputBefore = cloneMaterialFlowData(f.store.getState());
    const singletonBefore = cloneMaterialFlowData(useMaterialFlowStore.getState());
    const contextBefore = structuredClone(f.context);
    const original = runPackingRehearsals(capture);
    expect(original.arms.some((arm) => arm.dispatchUpperKg > 0)).toBe(true);
    const held = rehearseWithheldDispatch(capture);
    expect(held.baseFingerprint).toBe(capture.fingerprint);
    expect(held.releaseAtCapture).toBe(true);
    expect(held.reasonToAbstain).toBeNull();
    expect(held.arms).toHaveLength(3);
    for (const [index, arm] of held.arms.entries()) {
      expect(arm.evidence.qualityRelease).toBe(false);
      expect(validPackingAdvice(arm)).toEqual(arm);
      expect(arm.packedHighKg).toBeGreaterThan(0);
      expect(arm.packedLowKg).toBe(original.arms[index].packedLowKg);
      expect(arm.packedHighKg).toBe(original.arms[index].packedHighKg);
      expect(arm.dispatchLowerKg).toBe(0);
      expect(arm.dispatchUpperKg).toBe(0);
      expect(arm.genealogyErrorKg).toBeLessThan(0.01);
    }
    expect(cloneMaterialFlowData(f.store.getState())).toEqual(inputBefore);
    expect(cloneMaterialFlowData(useMaterialFlowStore.getState())).toEqual(singletonBefore);
    expect(f.context).toEqual(contextBefore);
    expect(capture.context.qualityRelease).toBe(true);
    expect(capture.data.manifests).toEqual([]);
  });

  it('preserves an already-held release and never releases held source lots', () => {
    const f = fixture();
    f.context.qualityRelease = false;
    for (const lot of f.store.getState().sourceLots.values()) lot.disposition = 'hold';
    const capture = f.capture();
    const before = structuredClone(capture);
    const result = rehearseWithheldDispatch(capture);
    expect(result.reasonToAbstain).toBeNull();
    expect(result.releaseAtCapture).toBe(false);
    expect(result.arms.every((arm) => arm.dispatchUpperKg === 0)).toBe(true);
    expect(capture).toEqual(before);
  });

  it('abstains on unknown evidence without fabricated zero-result arms', () => {
    const f = fixture();
    f.context.qualityRelease = null;
    const capture = f.capture();
    const result = rehearseWithheldDispatch(capture);
    expect(result.reasonToAbstain).toContain('quality release');
    expect(result.arms).toEqual([]);
    expect(result.releaseAtCapture).toBeNull();
  });
});

describe('first additional packing observations', () => {
  it('matches first-output observations to the unchanged real-engine grids and saved advice', () => {
    for (const speed of [180, 30]) {
      const f = fixture(speed),
        capture = f.capture();
      const before = structuredClone(capture);
      const result = runPackingRehearsals(capture);
      expect(result.firstPacking).toHaveLength(3);
      for (const observation of result.firstPacking) {
        const advice = result.arms.find((arm) => arm.arrangement === observation.arrangement)!;
        expect(advice).toEqual(derivePackingAdvice(capture, observation.arrangement));
        expect(validPackingAdvice(advice)).toEqual(advice);
        for (const [step, observed] of [
          [0.5, observation.coarseFirstMinute],
          [0.25, observation.fineFirstMinute],
        ]) {
          const store = createMaterialFlowStore(capture.data);
          const packed = () =>
            store
              .getState()
              .productionBatches.reduce(
                (n, b) =>
                  n + (b.materialType === capture.evidence.finishedMaterial ? b.producedKg : 0),
                0
              );
          const initial = packed();
          const boundary = (advice.briefingMinutes * 60) / speed;
          let elapsed = 0,
            first: number | null = null;
          while (elapsed < advice.physicalSeconds - 1e-10) {
            const paused = elapsed < boundary - 1e-10;
            const delta = Math.min(
              step!,
              advice.physicalSeconds - elapsed,
              paused ? boundary - elapsed : Infinity
            );
            store.getState().tickMaterialFlow(delta, paused ? 0 : advice.linePacing, {
              ...capture.context.order!.recipe,
              remainingFinishedKg: capture.evidence.remainingOrderKg!,
            });
            elapsed += delta;
            if (first === null && packed() > initial) first = (elapsed * speed) / 60;
          }
          expect(observed).toBe(first);
          expect(observed).toBeGreaterThanOrEqual(advice.briefingMinutes);
          expect(packed() - initial).toBeGreaterThanOrEqual(advice.packedLowKg);
          expect(packed() - initial).toBeLessThanOrEqual(advice.packedHighKg);
          expect(store.getState().manifests).toEqual([]);
        }
      }
      expect(capture).toEqual(before);
    }
  });

  it('retains absent first-output observations when machinery produces no new packed stock', () => {
    const f = fixture();
    for (const buffer of f.store.getState().machineBuffers.values()) buffer.isProcessing = false;
    const result = runPackingRehearsals(f.capture());
    expect(result.arms.every((arm) => !arm.reasonToAbstain && arm.packedHighKg === 0)).toBe(true);
    expect(result.firstPacking).toHaveLength(3);
    expect(
      result.firstPacking.every((o) => o.coarseFirstMinute === null && o.fineFirstMinute === null)
    ).toBe(true);
  });

  it('quarantines first-output samples when the real genealogy balance fails', () => {
    const f = fixture();
    f.store.setState({ initialInventoryKg: f.store.getState().initialInventoryKg + 1 });
    const capture = f.capture();
    expect(capture.reasonToAbstain).toBeNull();
    const result = runPackingRehearsals(capture);
    expect(
      result.arms.every((arm) => arm.reasonToAbstain === 'Engine genealogy conservation failed.')
    ).toBe(true);
    expect(result.firstPacking).toEqual([]);
  });

  it('quarantines missing facts without fabricated zero-minute observations', () => {
    const f = fixture();
    f.context.qualityRelease = null;
    const result = runPackingRehearsals(f.capture());
    expect(result.arms.every((arm) => arm.reasonToAbstain)).toBe(true);
    expect(result.firstPacking).toEqual([]);
  });
});
