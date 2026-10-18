import {
  cloneMaterialFlowData,
  createMaterialFlowStore,
  type MaterialFlowState,
  type SourceContribution,
} from '../stores/materialFlowStore';
import type {
  PackingAdvice,
  PackingArrangement,
  PackingCapture,
  PackingContext,
  PackingEvidence,
  PackingRehearsals,
  PackingFirstObservation,
} from '../types/workplaceAdvice';
export type {
  PackingAdvice,
  PackingArrangement,
  PackingCapture,
  PackingContext,
  PackingEvidence,
  PackingRehearsals,
  PackingFirstObservation,
} from '../types/workplaceAdvice';

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const nonnegative = (n: unknown): n is number => finite(n) && n >= 0;
const ARRANGEMENTS = {
  steady: { pacing: 0.78, briefing: 0 },
  briefing: { pacing: 0.9, briefing: 5 },
  buffer: { pacing: 1.02, briefing: 0 },
};
const ASSUMPTIONS = [
  '90 workplace minutes; physical seconds = 90 * 60 / selected resume game speed.',
  'Real material engine at 0.5 and 0.25 physical-second steps; bounds reflect time resolution, not statistical confidence.',
  'Fixed machinery, recipe, quality interlock and source dispositions. No arrivals, maintenance, dock movements or shipping are simulated.',
  'Whole-line pacing only; buffer arrangement adds no physical storage capacity.',
  'Dispatch lower bound is zero: no departure is simulated. Conditional upper requires release, a compatible truck and available load capacity within the horizon.',
];
function canonical(value: unknown): unknown {
  if (value instanceof Map)
    return [...value.entries()]
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([k, v]) => [k, canonical(v)]);
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  return value;
}
/** A deterministic change detector, not an authenticity signature. */
function fingerprint(value: unknown): string {
  const bytes = JSON.stringify(canonical(value));
  let a = 2166136261,
    b = 3335557771;
  for (let i = 0; i < bytes.length; i++) {
    a = Math.imul(a ^ bytes.charCodeAt(i), 16777619);
    b = Math.imul(b ^ bytes.charCodeAt(i), 2246822519);
  }
  return `packing-v1-${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
}
export function capturePackingPlant(
  flow: MaterialFlowState,
  input: PackingContext
): PackingCapture {
  const data = cloneMaterialFlowData(flow);
  const context = structuredClone(input);
  const missing: string[] = [];
  const order = context.order;
  const recipe = order?.recipe;
  const remaining =
    order && nonnegative(order.requiredKg) && nonnegative(order.shippedKg)
      ? Math.max(0, order.requiredKg - order.shippedKg)
      : null;
  if (
    !order ||
    !recipe ||
    !['flour', 'semolina'].includes(recipe.finishedMaterial) ||
    !['wheat_grain', 'corn_grain'].includes(recipe.sourceMaterial) ||
    remaining === null ||
    !['active', 'late'].includes(order.status)
  )
    missing.push('Active order and recipe are unavailable.');
  if (!context.executionFresh) missing.push('Order execution facts are stale or mismatched.');
  if (!context.missionMaterialSessionId || context.missionMaterialSessionId !== data.sessionId)
    missing.push('Mission and material session do not match.');
  if (
    !nonnegative(context.productionSpeed) ||
    context.productionSpeed > 10 ||
    !nonnegative(context.campaignMultiplier) ||
    context.campaignMultiplier > 10 ||
    !finite(context.gameSpeed) ||
    context.gameSpeed < 9 ||
    context.gameSpeed > 3600
  )
    missing.push(
      'Finite bounded production controls and a positive resume speed (9 to 3600x) are required.'
    );
  if (!nonnegative(data.simulationTime)) missing.push('Material clock is invalid.');
  if (context.qualityRelease !== true && context.qualityRelease !== false)
    missing.push('Direct quality release is unavailable.');
  const load = context.dispatchLoad;
  const loadKnown =
    !!load &&
    nonnegative(load.capacityKg) &&
    nonnegative(load.loadedKg) &&
    load.loadedKg <= load.capacityKg &&
    nonnegative(load.lastDispatchKg) &&
    ['away', 'loading', 'held', 'ready', 'departed'].includes(load.status) &&
    typeof load.cycleId === 'string';
  if (!loadKnown) missing.push('Direct dispatch load is unavailable.');
  let provenanceValid = true;
  for (const [id, lot] of data.sourceLots) {
    if (
      id !== lot.id ||
      !nonnegative(lot.receivedKg) ||
      !nonnegative(lot.simulationTime) ||
      !['released', 'hold', 'recalled'].includes(lot.disposition)
    )
      provenanceValid = false;
  }
  const checkSources = (mass: number, sources: SourceContribution[] | undefined) => {
    if (!nonnegative(mass)) {
      provenanceValid = false;
      return;
    }
    if (mass === 0) return;
    if (
      !sources?.length ||
      sources.some(
        (s) =>
          !nonnegative(s.amount) ||
          !Array.isArray(s.path) ||
          !data.sourceLots.has(s.lotId) ||
          !['released', 'hold', 'recalled'].includes(data.sourceLots.get(s.lotId)!.disposition)
      ) ||
      Math.abs(sources.reduce((n, s) => n + s.amount, 0) - mass) > 0.01
    )
      provenanceValid = false;
  };
  const requiredMachines = [
    'silo-0',
    'silo-1',
    'silo-2',
    'silo-3',
    'silo-4',
    'rm-101',
    'rm-102',
    'rm-103',
    'rm-104',
    'sifter-a',
    'sifter-b',
    'sifter-c',
    'packer-0',
    'packer-1',
    'packer-2',
  ];
  if (requiredMachines.some((id) => !data.machineBuffers.has(id)))
    missing.push('Required machine buffers are missing.');
  for (const buffer of data.machineBuffers.values()) {
    if (
      ![buffer.inputCapacity, buffer.outputCapacity, buffer.processingRate].every(nonnegative) ||
      typeof buffer.isProcessing !== 'boolean' ||
      buffer.conversionRatios.some((c) => c.outputs.some((o) => !nonnegative(o.ratio)))
    )
      missing.push('Machine capacity or conversion facts are invalid.');
    for (const m of [...buffer.inputBuffer, ...buffer.outputBuffer])
      checkSources(m.amount, m.sourceContributions);
  }
  for (const segment of data.network.segments) {
    if (
      !data.machineBuffers.has(segment.fromMachineId) ||
      !data.machineBuffers.has(segment.toMachineId) ||
      ![segment.capacity, segment.currentLoad, segment.flowRate, segment.transitTime].every(
        nonnegative
      )
    )
      missing.push('Conveyor facts are invalid.');
    for (const t of segment.inTransit) {
      checkSources(t.amount, t.sourceContributions);
      if (!nonnegative(t.arrivalTime)) provenanceValid = false;
    }
  }
  let released = 0,
    held = 0;
  for (const batch of data.productionBatches) {
    checkSources(batch.producedKg, batch.sourceContributions);
    if (
      !nonnegative(batch.availableKg) ||
      batch.availableKg > batch.producedKg ||
      !['released', 'hold', 'recalled', 'shipped'].includes(batch.disposition)
    )
      provenanceValid = false;
    if (batch.materialType !== recipe?.finishedMaterial) continue;
    const sourcesReleased = batch.sourceContributions.every(
      (s) => data.sourceLots.get(s.lotId)?.disposition === 'released'
    );
    if (batch.disposition === 'released' && sourcesReleased) released += batch.availableKg;
    else if (batch.disposition !== 'shipped') held += batch.availableKg;
  }
  if (!provenanceValid) missing.push('Source genealogy is missing, unknown or unbalanced.');
  const cleanNumber = (n: number) => (nonnegative(n) ? n : 0);
  const evidence: PackingEvidence = {
    materialSessionId: data.sessionId,
    orderId: order?.id ?? null,
    recipeId: recipe?.id ?? null,
    finishedMaterial: recipe?.finishedMaterial ?? null,
    remainingOrderKg: remaining,
    releasedPackedKg: cleanNumber(released),
    heldPackedKg: cleanNumber(held),
    processingMachines: [...data.machineBuffers.values()].filter((b) => b.isProcessing).length,
    totalMachines: data.machineBuffers.size,
    materialClockSeconds: cleanNumber(data.simulationTime),
    productionSpeed: cleanNumber(context.productionSpeed),
    campaignMultiplier: cleanNumber(context.campaignMultiplier),
    gameSpeed: cleanNumber(context.gameSpeed),
    qualityRelease: typeof context.qualityRelease === 'boolean' ? context.qualityRelease : null,
    truckCapacityKg: loadKnown ? load!.capacityKg : null,
    truckLoadedKg: loadKnown ? load!.loadedKg : null,
    truckStatus: loadKnown ? load!.status : null,
    missingFacts: [...new Set(missing)],
  };
  // Hash all physical facts, and only the relevant order fields; no customer or private role data is retained in advice.
  const id = fingerprint({
    data,
    context: {
      ...context,
      order: order
        ? {
            id: order.id,
            recipe: order.recipe,
            requiredKg: order.requiredKg,
            shippedKg: order.shippedKg,
            status: order.status,
          }
        : null,
    },
  });
  return {
    data,
    context,
    evidence,
    fingerprint: id,
    reasonToAbstain: evidence.missingFacts.length ? evidence.missingFacts.join(' ') : null,
  };
}
function simulate(capture: PackingCapture, arrangement: PackingArrangement, step: number) {
  const store = createMaterialFlowStore(capture.data);
  const recipe = capture.context.order!.recipe;
  const packed = (state: MaterialFlowState) =>
    state.productionBatches
      .filter((b) => b.materialType === recipe.finishedMaterial)
      .reduce((n, b) => n + b.producedKg, 0);
  const released = (state: MaterialFlowState) =>
    state.productionBatches
      .filter(
        (b) =>
          b.materialType === recipe.finishedMaterial &&
          b.disposition === 'released' &&
          b.sourceContributions.every(
            (s) => state.sourceLots.get(s.lotId)?.disposition === 'released'
          )
      )
      .reduce((n, b) => n + b.availableKg, 0);
  const before = packed(store.getState());
  const seconds = 5400 / capture.context.gameSpeed;
  const boundary = (ARRANGEMENTS[arrangement].briefing * 60) / capture.context.gameSpeed;
  let elapsed = 0;
  let firstPackedMinute: number | null = null;
  while (elapsed < seconds - 1e-10) {
    const paused = elapsed < boundary - 1e-10;
    const delta = Math.min(step, seconds - elapsed, paused ? boundary - elapsed : Infinity);
    store
      .getState()
      .tickMaterialFlow(
        delta,
        paused
          ? 0
          : capture.context.productionSpeed *
              capture.context.campaignMultiplier *
              ARRANGEMENTS[arrangement].pacing,
        { ...recipe, remainingFinishedKg: capture.evidence.remainingOrderKg! }
      );
    elapsed += delta;
    if (firstPackedMinute === null && packed(store.getState()) > before)
      firstPackedMinute = (elapsed * capture.context.gameSpeed) / 60;
  }
  const state = store.getState();
  return {
    packed: Math.max(0, packed(state) - before),
    released: released(state),
    error: Math.abs(state.getGenealogyBalance().errorKg),
    firstPackedMinute,
  };
}
function modelPackingAdvice(
  capture: PackingCapture,
  arrangement: PackingArrangement
): { advice: PackingAdvice; firstPacking: PackingFirstObservation | null } {
  const params = ARRANGEMENTS[arrangement];
  const evidence = structuredClone(capture.evidence);
  const base: PackingAdvice = {
    version: 1,
    fingerprint: capture.fingerprint,
    arrangement,
    evidence,
    reasonToAbstain: capture.reasonToAbstain,
    workplaceMinutes: 90,
    physicalSeconds:
      finite(evidence.gameSpeed) && evidence.gameSpeed >= 9 ? 5400 / evidence.gameSpeed : 0,
    stepSeconds: 0.5,
    briefingMinutes: params.briefing,
    linePacing: params.pacing,
    packedLowKg: 0,
    packedHighKg: 0,
    dispatchLowerKg: 0,
    dispatchUpperKg: 0,
    genealogyErrorKg: null,
    assumptions: [...ASSUMPTIONS],
  };
  if (base.reasonToAbstain) return { advice: base, firstPacking: null };
  const coarse = simulate(capture, arrangement, 0.5),
    fine = simulate(capture, arrangement, 0.25);
  base.genealogyErrorKg = Math.max(coarse.error, fine.error);
  if (base.genealogyErrorKg > 0.01) {
    base.reasonToAbstain = 'Engine genealogy conservation failed.';
    return { advice: base, firstPacking: null };
  }
  base.packedLowKg = Math.min(coarse.packed, fine.packed);
  base.packedHighKg = Math.max(coarse.packed, fine.packed);
  const load = capture.context.dispatchLoad!;
  if (
    evidence.qualityRelease &&
    load.materialType === evidence.finishedMaterial &&
    (load.status === 'loading' || load.status === 'ready') &&
    !load.blockReason
  )
    base.dispatchUpperKg = Math.min(
      evidence.remainingOrderKg!,
      Math.max(coarse.released, fine.released),
      // The shipping controller reserves the load; it removes packed stock
      // only on departure. Total departure includes the already loaded mass.
      load.capacityKg
    );
  return {
    advice: base,
    firstPacking: {
      arrangement,
      coarseFirstMinute: coarse.firstPackedMinute,
      fineFirstMinute: fine.firstPackedMinute,
    },
  };
}
export function derivePackingAdvice(
  capture: PackingCapture,
  arrangement: PackingArrangement
): PackingAdvice {
  return modelPackingAdvice(capture, arrangement).advice;
}
export function runPackingRehearsals(capture: PackingCapture): PackingRehearsals {
  const results = (['steady', 'briefing', 'buffer'] as const).map((arrangement) =>
    modelPackingAdvice(capture, arrangement)
  );
  return {
    fingerprint: capture.fingerprint,
    arms: results.map((result) => result.advice),
    firstPacking: results.flatMap((result) => (result.firstPacking ? [result.firstPacking] : [])),
  };
}

/** Hypothetical dispatch restraint only; source and batch dispositions stay intact.
 * Working if only isolated copies see the withheld gate and missing facts abstain.
 */
export function rehearseWithheldDispatch(capture: PackingCapture) {
  const base = {
    baseFingerprint: capture.fingerprint,
    releaseAtCapture: capture.evidence.qualityRelease,
    arms: [] as PackingAdvice[],
    reasonToAbstain: capture.reasonToAbstain,
  };
  if (capture.reasonToAbstain) return base;
  const copied = createMaterialFlowStore(capture.data);
  const withheld = capturePackingPlant(copied.getState(), {
    ...capture.context,
    qualityRelease: false,
  });
  const result = runPackingRehearsals(withheld);
  const reason = result.arms.find((arm) => arm.reasonToAbstain)?.reasonToAbstain ?? null;
  return { ...base, arms: reason ? [] : result.arms, reasonToAbstain: reason };
}

/** Public inspection questions use captured facts, never authorise a plant action.
 * Working if abstention supplies no numeric observations and every view stays observational.
 */
export function packingInspectionPrompts(advice: PackingAdvice) {
  const e = advice.evidence;
  const known = advice.reasonToAbstain === null && e.missingFacts.length === 0;
  return [
    {
      role: 'Packing',
      view: 'Packing',
      action: 'View packing floor',
      fact: known
        ? `At capture: ${e.releasedPackedKg.toFixed(0)} kg released; ${e.heldPackedKg.toFixed(0)} kg held or recalled.`
        : 'Usable captured stock facts are unavailable.',
      question:
        'Ask the coordinator which released bags could actually be collected. Packed stock alone proves no departure.',
    },
    {
      role: 'Quality',
      view: 'Packing',
      action: 'View quality observation point',
      fact: known
        ? `Dispatch release at capture: ${e.qualityRelease === true ? 'open' : e.qualityRelease === false ? 'held' : 'unknown'}.`
        : 'Usable captured release facts are unavailable.',
      question:
        known && e.qualityRelease === true
          ? 'Which batch and source checks support release, and what new evidence would require a hold? A view cannot certify a batch.'
          : 'Which qualified batch or source check is needed before release can be reconsidered? A team vote cannot clear a hold.',
    },
    {
      role: 'Maintenance',
      view: 'Milling',
      action: 'View milling line',
      fact: known
        ? `At capture: ${e.processingMachines}/${e.totalMachines} machines marked processing.`
        : 'Usable captured machine facts are unavailable.',
      question:
        'Ask Packing where material waits, then check upstream buffers and supply. Processing flags alone do not establish material flow.',
    },
    {
      role: 'Coordinator',
      view: 'Shipping',
      action: 'View shipping dock',
      fact:
        known && e.truckStatus !== null && e.truckLoadedKg !== null && e.truckCapacityKg !== null
          ? `Truck at capture: ${e.truckStatus}; ${e.truckLoadedKg.toFixed(0)} kg loaded / ${e.truckCapacityKg.toFixed(0)} kg capacity.`
          : 'Usable captured collection facts are unavailable.',
      question:
        'Check material compatibility, free capacity and collection timing with Quality. A ready load still needs an actual departure receipt.',
    },
  ] as const;
}

export const PACKING_PREDICTIONS = [
  { id: 'higher', label: 'Buffer range entirely above ordinary work' },
  { id: 'overlap', label: 'No clear separation between packing ranges' },
  { id: 'lower', label: 'Buffer range entirely below ordinary work' },
  { id: 'unsure', label: 'We are unsure, keep the question open' },
] as const;
export type PackingPrediction = (typeof PACKING_PREDICTIONS)[number]['id'];

/** Discuss isolated packing evidence, never grade a team or authorise work.
 * Working if overlapping or unusable evidence never becomes a claimed improvement.
 */
export function packingPredictionReview(
  result: PackingRehearsals,
  prediction: PackingPrediction | null
) {
  const ordinary = result.arms.filter((arm) => arm.arrangement === 'steady');
  const buffer = result.arms.filter((arm) => arm.arrangement === 'buffer');
  const usable = (arm: PackingAdvice) =>
    arm.fingerprint === result.fingerprint &&
    arm.reasonToAbstain === null &&
    nonnegative(arm.packedLowKg) &&
    nonnegative(arm.packedHighKg) &&
    arm.packedLowKg <= arm.packedHighKg;
  // Ten grams prevents numerical noise at a shared range boundary claiming an ordering.
  const toleranceKg = 0.01;
  const observation =
    ordinary.length !== 1 || buffer.length !== 1 || ![...ordinary, ...buffer].every(usable)
      ? 'unavailable'
      : buffer[0].packedLowKg > ordinary[0].packedHighKg + toleranceKg
        ? 'higher'
        : ordinary[0].packedLowKg > buffer[0].packedHighKg + toleranceKg
          ? 'lower'
          : 'overlap';
  const evidence = {
    higher: 'The buffer’s entire modeled packing range is above ordinary work.',
    lower: 'The buffer’s entire modeled packing range is below ordinary work.',
    overlap:
      'The modeled packing ranges overlap or meet within 0.01 kg. They do not establish a clear ordering.',
    unavailable: 'This rehearsal has insufficient matching evidence to compare the packing ranges.',
  };
  return {
    observation,
    evidence: evidence[observation],
    reflection:
      observation === 'unavailable'
        ? 'Keep the prediction open until both alternatives have usable evidence.'
        : prediction === 'unsure'
          ? 'We left the prediction open. Use these ranges to discuss what to test next.'
          : prediction
            ? observation === prediction
              ? 'These modeled packing ranges support our prediction.'
              : 'These modeled packing ranges differ from our prediction.'
            : null,
    question:
      observation === 'unavailable'
        ? 'Which missing fact needs checking before another rehearsal?'
        : observation === 'overlap'
          ? 'Which shared limit could keep extra pacing from adding packed stock? Check supply, machines and quality dispositions together.'
          : 'Which supply, machine or pacing assumption explains the difference, and what would we check before changing the working agreement?',
  };
}

/** Optional public historical evidence is quarantined independently of monetary state. */
export function validPackingAdvice(value: unknown): PackingAdvice | undefined {
  if (!value || typeof value !== 'object') return;
  const a = value as PackingAdvice;
  const e = a.evidence;
  const text = (s: unknown): s is string => typeof s === 'string' && s.length <= 2000;
  const texts = (s: unknown): s is string[] => Array.isArray(s) && s.length <= 20 && s.every(text);
  const nullableNumber = (n: unknown) => n === null || nonnegative(n);
  const nullableText = (s: unknown) => s === null || text(s);
  if (
    a.version !== 1 ||
    !text(a.fingerprint) ||
    !/^packing-v1-[0-9a-f]{16}$/.test(a.fingerprint) ||
    !['steady', 'briefing', 'buffer'].includes(a.arrangement) ||
    !e ||
    a.workplaceMinutes !== 90 ||
    a.dispatchLowerKg !== 0 ||
    !texts(a.assumptions) ||
    !nullableText(a.reasonToAbstain)
  )
    return;
  if (
    ![
      a.physicalSeconds,
      a.stepSeconds,
      a.briefingMinutes,
      a.linePacing,
      a.packedLowKg,
      a.packedHighKg,
      a.dispatchUpperKg,
    ].every(nonnegative) ||
    a.physicalSeconds > 600 ||
    a.stepSeconds !== 0.5 ||
    a.packedLowKg > a.packedHighKg ||
    !nullableNumber(a.genealogyErrorKg)
  )
    return;
  if (
    !text(e.materialSessionId) ||
    !nullableText(e.orderId) ||
    !nullableText(e.recipeId) ||
    ![null, 'flour', 'semolina'].includes(e.finishedMaterial) ||
    !nullableNumber(e.remainingOrderKg) ||
    ![
      e.releasedPackedKg,
      e.heldPackedKg,
      e.processingMachines,
      e.totalMachines,
      e.materialClockSeconds,
      e.productionSpeed,
      e.campaignMultiplier,
      e.gameSpeed,
    ].every(nonnegative) ||
    ![true, false, null].includes(e.qualityRelease) ||
    !nullableNumber(e.truckCapacityKg) ||
    !nullableNumber(e.truckLoadedKg) ||
    ![null, 'away', 'loading', 'held', 'ready', 'departed'].includes(e.truckStatus) ||
    !texts(e.missingFacts)
  )
    return;
  const params = ARRANGEMENTS[a.arrangement];
  if (
    e.processingMachines > e.totalMachines ||
    !Number.isInteger(e.totalMachines) ||
    !Number.isInteger(e.processingMachines) ||
    e.totalMachines > 1000 ||
    e.productionSpeed > 10 ||
    e.campaignMultiplier > 10 ||
    e.gameSpeed > 3600 ||
    (e.truckLoadedKg !== null &&
      e.truckCapacityKg !== null &&
      e.truckLoadedKg > e.truckCapacityKg) ||
    a.dispatchUpperKg > e.releasedPackedKg + a.packedHighKg ||
    (a.dispatchUpperKg > 0 && e.truckStatus !== 'loading' && e.truckStatus !== 'ready') ||
    (a.reasonToAbstain !== null && (a.packedLowKg !== 0 || a.packedHighKg !== 0)) ||
    (a.reasonToAbstain === null &&
      (e.gameSpeed < 9 ||
        Math.abs(a.physicalSeconds - 5400 / e.gameSpeed) > 1e-9 ||
        a.genealogyErrorKg === null ||
        a.genealogyErrorKg > 0.01 ||
        e.orderId === null ||
        e.recipeId === null ||
        e.finishedMaterial === null ||
        e.remainingOrderKg === null ||
        e.qualityRelease === null ||
        e.truckStatus === null ||
        e.missingFacts.length > 0)) ||
    a.linePacing !== params.pacing ||
    a.briefingMinutes !== params.briefing ||
    a.dispatchUpperKg > (e.remainingOrderKg ?? 0) ||
    a.dispatchUpperKg > (e.truckCapacityKg ?? 0) ||
    ((!e.qualityRelease || a.reasonToAbstain) && a.dispatchUpperKg !== 0)
  )
    return;
  // Explicit reconstruction excludes arbitrary nested keys and private plant/store payloads.
  return {
    version: 1,
    fingerprint: a.fingerprint,
    arrangement: a.arrangement,
    evidence: {
      materialSessionId: e.materialSessionId,
      orderId: e.orderId,
      recipeId: e.recipeId,
      finishedMaterial: e.finishedMaterial,
      remainingOrderKg: e.remainingOrderKg,
      releasedPackedKg: e.releasedPackedKg,
      heldPackedKg: e.heldPackedKg,
      processingMachines: e.processingMachines,
      totalMachines: e.totalMachines,
      materialClockSeconds: e.materialClockSeconds,
      productionSpeed: e.productionSpeed,
      campaignMultiplier: e.campaignMultiplier,
      gameSpeed: e.gameSpeed,
      qualityRelease: e.qualityRelease,
      truckCapacityKg: e.truckCapacityKg,
      truckLoadedKg: e.truckLoadedKg,
      truckStatus: e.truckStatus,
      missingFacts: [...e.missingFacts],
    },
    reasonToAbstain: a.reasonToAbstain,
    workplaceMinutes: 90,
    physicalSeconds: a.physicalSeconds,
    stepSeconds: a.stepSeconds,
    briefingMinutes: a.briefingMinutes,
    linePacing: a.linePacing,
    packedLowKg: a.packedLowKg,
    packedHighKg: a.packedHighKg,
    dispatchLowerKg: 0,
    dispatchUpperKg: a.dispatchUpperKg,
    genealogyErrorKg: a.genealogyErrorKg,
    assumptions: [...a.assumptions],
  };
}
