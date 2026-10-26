import {
  cloneMaterialFlowData,
  createMaterialFlowStore,
  GENEALOGY_EPSILON_KG,
  type MaterialFlowState,
  type SourceContribution,
} from '../stores/materialFlowStore';
import { PLANT_SECONDS_PER_GAME_SECOND, plantSecondsForGameSeconds } from './pace';
import type {
  PackingAdvice,
  PackingArrangement,
  PackingCapture,
  PackingContext,
  PackingEvidence,
  PackingRehearsals,
  PackingFirstObservation,
} from '../types/workplaceAdvice';
import { formatFixed, translate } from '../i18n';
import { workplaceAdviceMessages as msg } from './workplaceAdvice.messages';
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
// Resolved when advice is modeled, so frozen advice keeps the language it was captured in.
const assumptions = () => [
  translate(msg, 'assumptionHorizon', {
    minutes: formatFixed(90, 0),
    seconds: formatFixed(plantSecondsForGameSeconds(5400), 0),
  }),
  translate(msg, 'assumptionEngine'),
  translate(msg, 'assumptionFixed'),
  translate(msg, 'assumptionPacing'),
  translate(msg, 'assumptionDispatch'),
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
    missing.push(translate(msg, 'missingOrder'));
  if (!context.executionFresh) missing.push(translate(msg, 'missingExecution'));
  if (!context.missionMaterialSessionId || context.missionMaterialSessionId !== data.sessionId)
    missing.push(translate(msg, 'missingSession'));
  if (
    !nonnegative(context.productionSpeed) ||
    context.productionSpeed > 10 ||
    !nonnegative(context.campaignMultiplier) ||
    context.campaignMultiplier > 10 ||
    !finite(context.gameSpeed) ||
    context.gameSpeed < 9 ||
    context.gameSpeed > 3600
  )
    missing.push(translate(msg, 'missingControls'));
  if (!nonnegative(data.simulationTime)) missing.push(translate(msg, 'missingClock'));
  if (context.qualityRelease !== true && context.qualityRelease !== false)
    missing.push(translate(msg, 'missingRelease'));
  const load = context.dispatchLoad;
  const loadKnown =
    !!load &&
    nonnegative(load.capacityKg) &&
    nonnegative(load.loadedKg) &&
    load.loadedKg <= load.capacityKg &&
    nonnegative(load.lastDispatchKg) &&
    ['away', 'loading', 'held', 'ready', 'departed'].includes(load.status) &&
    typeof load.cycleId === 'string';
  if (!loadKnown) missing.push(translate(msg, 'missingLoad'));
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
  // One empty-provenance residue budget for the whole capture. The engine prunes
  // numerical dust from genealogy, but retains its physical buffer/transit mass.
  // Positive batches remain strict; an empty batch must never look released.
  let residueKg = 0;
  let residueCorrectionKg = 0;
  const checkSources = (
    mass: number,
    sources: SourceContribution[] | undefined,
    allowEmptyResidue = false
  ) => {
    if (!nonnegative(mass)) {
      provenanceValid = false;
      return;
    }
    if (mass === 0) return;
    if (
      allowEmptyResidue &&
      (sources === undefined || (Array.isArray(sources) && !sources.length))
    ) {
      // Compensated positive sum keeps a tiny excess visible at the exact budget
      // boundary, regardless of row order (for example epsilon followed by 1e-28).
      const next = residueKg + mass;
      residueCorrectionKg += residueKg >= mass ? residueKg - next + mass : mass - next + residueKg;
      residueKg = next;
      if (!Number.isFinite(residueKg) || residueCorrectionKg > GENEALOGY_EPSILON_KG - residueKg)
        provenanceValid = false;
      return;
    }
    if (
      !Array.isArray(sources) ||
      !sources.length ||
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
    missing.push(translate(msg, 'missingBuffers'));
  for (const buffer of data.machineBuffers.values()) {
    if (
      ![buffer.inputCapacity, buffer.outputCapacity, buffer.processingRate].every(nonnegative) ||
      typeof buffer.isProcessing !== 'boolean' ||
      buffer.conversionRatios.some((c) => c.outputs.some((o) => !nonnegative(o.ratio)))
    )
      missing.push(translate(msg, 'invalidMachines'));
    for (const m of [...buffer.inputBuffer, ...buffer.outputBuffer])
      checkSources(m.amount, m.sourceContributions, true);
  }
  for (const segment of data.network.segments) {
    if (
      !data.machineBuffers.has(segment.fromMachineId) ||
      !data.machineBuffers.has(segment.toMachineId) ||
      ![segment.capacity, segment.currentLoad, segment.flowRate, segment.transitTime].every(
        nonnegative
      )
    )
      missing.push(translate(msg, 'invalidConveyors'));
    for (const t of segment.inTransit) {
      checkSources(t.amount, t.sourceContributions, true);
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
  if (!provenanceValid) missing.push(translate(msg, 'invalidGenealogy'));
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
  // Plant time is a fixed fraction of game time (src/simulation/pace.ts), so a
  // 90-minute workplace shift is the same plant span at every pace.
  const seconds = plantSecondsForGameSeconds(5400);
  const boundary = plantSecondsForGameSeconds(ARRANGEMENTS[arrangement].briefing * 60);
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
      firstPackedMinute = elapsed / PLANT_SECONDS_PER_GAME_SECOND / 60;
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
      finite(evidence.gameSpeed) && evidence.gameSpeed >= 9 ? plantSecondsForGameSeconds(5400) : 0,
    stepSeconds: 0.5,
    briefingMinutes: params.briefing,
    linePacing: params.pacing,
    packedLowKg: 0,
    packedHighKg: 0,
    dispatchLowerKg: 0,
    dispatchUpperKg: 0,
    genealogyErrorKg: null,
    assumptions: assumptions(),
  };
  if (base.reasonToAbstain) return { advice: base, firstPacking: null };
  const coarse = simulate(capture, arrangement, 0.5),
    fine = simulate(capture, arrangement, 0.25);
  base.genealogyErrorKg = Math.max(coarse.error, fine.error);
  if (base.genealogyErrorKg > 0.01) {
    base.reasonToAbstain = translate(msg, 'conservationFailed');
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

const TRUCK_STATUS_KEYS = {
  away: 'truckAway',
  loading: 'truckLoading',
  held: 'truckHeld',
  ready: 'truckReady',
  departed: 'truckDeparted',
} as const satisfies Record<NonNullable<PackingEvidence['truckStatus']>, string>;

/** Public inspection questions use captured facts, never authorise a plant action.
 * Working if abstention supplies no numeric observations and every view stays observational.
 */
export function packingInspectionPrompts(advice: PackingAdvice) {
  const e = advice.evidence;
  const known = advice.reasonToAbstain === null && e.missingFacts.length === 0;
  // `view` names a camera preset and stays untranslated; the rest is copy.
  return [
    {
      role: translate(msg, 'rolePacking'),
      view: 'Packing',
      action: translate(msg, 'viewPackingFloor'),
      fact: known
        ? translate(msg, 'stockFact', {
            released: formatFixed(e.releasedPackedKg, 0),
            held: formatFixed(e.heldPackedKg, 0),
          })
        : translate(msg, 'stockUnavailable'),
      question: translate(msg, 'packingQuestion'),
    },
    {
      role: translate(msg, 'roleQuality'),
      view: 'Packing',
      action: translate(msg, 'viewQualityPoint'),
      fact: known
        ? translate(msg, 'releaseFact', {
            state: translate(
              msg,
              e.qualityRelease === true
                ? 'releaseOpen'
                : e.qualityRelease === false
                  ? 'releaseHeld'
                  : 'releaseUnknown'
            ),
          })
        : translate(msg, 'releaseUnavailable'),
      question:
        known && e.qualityRelease === true
          ? translate(msg, 'qualityQuestionOpen')
          : translate(msg, 'qualityQuestionHeld'),
    },
    {
      role: translate(msg, 'roleMaintenance'),
      view: 'Milling',
      action: translate(msg, 'viewMillingLine'),
      fact: known
        ? translate(msg, 'machineFact', {
            processing: formatFixed(e.processingMachines, 0),
            total: formatFixed(e.totalMachines, 0),
          })
        : translate(msg, 'machineUnavailable'),
      question: translate(msg, 'maintenanceQuestion'),
    },
    {
      role: translate(msg, 'roleCoordinator'),
      view: 'Shipping',
      action: translate(msg, 'viewShippingDock'),
      fact:
        known && e.truckStatus !== null && e.truckLoadedKg !== null && e.truckCapacityKg !== null
          ? translate(msg, 'truckFact', {
              status: translate(msg, TRUCK_STATUS_KEYS[e.truckStatus]),
              loaded: formatFixed(e.truckLoadedKg, 0),
              capacity: formatFixed(e.truckCapacityKg, 0),
            })
          : translate(msg, 'collectionUnavailable'),
      question: translate(msg, 'coordinatorQuestion'),
    },
  ] as const;
}

// Labels are getters so a module-level list still reads in the current language.
export const PACKING_PREDICTIONS = [
  {
    id: 'higher',
    get label() {
      return translate(msg, 'predictionHigher');
    },
  },
  {
    id: 'overlap',
    get label() {
      return translate(msg, 'predictionOverlap');
    },
  },
  {
    id: 'lower',
    get label() {
      return translate(msg, 'predictionLower');
    },
  },
  {
    id: 'unsure',
    get label() {
      return translate(msg, 'predictionUnsure');
    },
  },
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
    higher: 'evidenceHigher',
    lower: 'evidenceLower',
    overlap: 'evidenceOverlap',
    unavailable: 'evidenceUnavailable',
  } as const;
  return {
    observation,
    evidence: translate(msg, evidence[observation]),
    reflection:
      observation === 'unavailable'
        ? translate(msg, 'reflectionUnavailable')
        : prediction === 'unsure'
          ? translate(msg, 'reflectionUnsure')
          : prediction
            ? observation === prediction
              ? translate(msg, 'reflectionSupport')
              : translate(msg, 'reflectionDiffer')
            : null,
    question:
      observation === 'unavailable'
        ? translate(msg, 'questionUnavailable')
        : observation === 'overlap'
          ? translate(msg, 'questionOverlap')
          : translate(msg, 'questionDifference'),
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
        // A 90-minute shift is one fixed plant span at every pace; advice
        // saved under the old real-second model no longer matches and is
        // re-derived rather than trusted.
        Math.abs(a.physicalSeconds - plantSecondsForGameSeconds(5400)) > 1e-9 ||
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
