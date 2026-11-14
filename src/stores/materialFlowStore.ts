/**
 * Material Flow Store
 *
 * Tracks actual material flow through the mill network:
 * - Silos (raw grain storage) -> Roller Mills (grinding)
 * - Roller Mills -> Plansifters (sifting/separation)
 * - Plansifters -> Packers (packaging)
 *
 * Zone Layout (matches the live scene in MillScene.tsx / factoryLayout.ts):
 * - Zone 1 (z=-22): 5 Silos (silo-0..silo-4)
 * - Zone 2 (z=-6): 4 Roller Mills (rm-101 to rm-104)
 * - Zone 3 (z=6, y=9 elevated): 3 Plansifters (sifter-a..c)
 * - Zone 4 (z=25): 3 Packers (packer-0..packer-2)
 *
 * Buffer ids MUST match the live machine ids from MillScene's machine roster —
 * syncMachineProcessing() joins on them to couple machine status to flow.
 */

import type { PlantClock } from '../utils/timeFormatting';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { CropAttributes } from '../chronicle/types';
import type { ShipmentLoad } from '../simulation/shipmentPlan';
import { spoutMachineKey, type SpoutMachine } from '../components/flow/spoutRoutes';
import {
  canonicalProcessMachines,
  resolveMaterialTransport,
} from '../simulation/materialTransport';
import { translate } from '../i18n';
import { materialFlowStoreMessages } from './materialFlowStore.messages';
import { toSimulationMinutes } from '../simulation/simulationClock';
import { PLANT_SECONDS_PER_GAME_SECOND } from '../simulation/pace';

// =============================================================================
// MATERIAL TYPES
// =============================================================================

export type MaterialType =
  | 'wheat_grain'
  | 'corn_grain'
  | 'flour'
  | 'bran'
  | 'middlings'
  | 'semolina';

export interface SourceContribution {
  /** Receiving or opening-stock lot that supplied this mass. */
  lotId: string;
  /** Conserved mass from this source lot. */
  amount: number;
  /** Ordered machine path already traversed by this contribution. */
  path: string[];
}

export interface ProductBatchContribution {
  batchId: string;
  amount: number;
}

export interface MaterialAmount {
  type: MaterialType;
  amount: number; // kg
  /** Optional only for backwards-compatible fixtures. Live material always carries it. */
  sourceContributions?: SourceContribution[];
  /** Present on packed output so prohibited batches can never be dispatched by aggregation. */
  productBatches?: ProductBatchContribution[];
}

/**
 * The active customer recipe expressed as a physical routing instruction.
 * Selects new source grain at the silo valves. Material already admitted
 * finishes its own typed conversions and conveyor route during changeover;
 * freezing it would fill the hoppers needed by the next recipe.
 */
export interface MaterialFlowProductionPlan {
  sourceMaterial: Extract<MaterialType, 'wheat_grain' | 'corn_grain'>;
  finishedMaterial: Extract<MaterialType, 'flour' | 'semolina'>;
  /** Ephemeral order demand, excluding departed manifests. Omission retains free production. */
  remainingFinishedKg?: number;
}

export type MaterialDisposition = 'released' | 'hold' | 'recalled' | 'shipped';

/**
 * A canned disposition reason kept as a message key beside its text, so Batch
 * Genealogy renders it in the current language (OverviewPanel). `catalog`
 * names the message catalogue; a param may itself be a key (a canned note in a
 * hold reason) or plain text (an operator's note, which stays as written).
 * Optional: records written before it, or by an agent or operator, carry only
 * their text.
 */
export interface DispositionReasonKey {
  catalog: 'materialFlow' | 'qcLab' | 'overview';
  key: string;
  params?: Record<string, string | number | DispositionReasonKey>;
}

export interface SourceLot {
  id: string;
  materialType: MaterialType;
  origin: 'opening_stock' | 'receiving';
  sourceManifestId: string | null;
  supplier: string;
  /**
   * Set when `supplier` is the canned delivery name, so the trace renders it in
   * the current language. Opening stock is always the canned opening name.
   */
  supplierKey?: 'scheduledFarmIntake' | 'earlierStock';
  receivedKg: number;
  simulationTime: number;
  disposition: Exclude<MaterialDisposition, 'shipped'>;
  dispositionReason: string | null;
  dispositionReasonKey?: DispositionReasonKey;
  /** Crop-year attributes stamped by a signed Mill Chronicle; absent otherwise. */
  crop?: CropAttributes;
  /**
   * The game minute it was received, read from its receiving manifest's clock
   * (genealogy retention, GENEALOGY_RETENTION_MINUTES). Absent on lots from
   * before it, and on opening stock.
   */
  receivedAtMinute?: number;
  /**
   * Merged into its grain's earlier-stock lot by the retention rule; the record
   * stays only while a batch that has begun to ship still names it.
   */
  mergedInto?: string;
}

export interface ProductionBatch {
  id: string;
  packerId: string;
  materialType: Extract<MaterialType, 'flour' | 'semolina'>;
  producedKg: number;
  availableKg: number;
  simulationTime: number;
  sourceContributions: SourceContribution[];
  disposition: MaterialDisposition;
  dispositionReason: string | null;
  dispositionReasonKey?: DispositionReasonKey;
  qcTestIds: string[];
  dispatchManifestIds: string[];
  sealed: boolean;
  /** Mass scrapped when the batch was recalled. Absent on batches never recalled. */
  writtenOffKg?: number;
  /**
   * Product quality score (0-100) of the flour in this batch, averaged over the
   * mass as it was packed. Absent on batches saved before it was recorded.
   */
  qualityScore?: number;
  /**
   * Packed but not yet through the lab's bench (plan item 3.2): it ships only
   * once tested. Absent on batches saved before the bench, and on batches
   * formed in a benchmark run, which read as tested.
   */
  awaitingTest?: boolean;
}

export interface ProcessGenealogyRecord {
  id: string;
  machineId: string;
  inputType: MaterialType;
  inputKg: number;
  outputs: MaterialAmount[];
  wasteKg: number;
  sourceContributions: SourceContribution[];
  simulationTime: number;
}

export interface BatchTrace {
  batch: ProductionBatch;
  sourceLots: Array<{
    lot: SourceLot;
    amount: number;
    paths: string[][];
  }>;
}

export interface GenealogyBalance {
  expectedKg: number;
  inventoryKg: number;
  inTransitKg: number;
  wasteKg: number;
  /** Bran and middlings discharged from the mills as millfeed. */
  byproductKg: number;
  shippedKg: number;
  accountedKg: number;
  errorKg: number;
}

export interface MaterialManifest {
  id: string;
  kind: 'receiving' | 'shipping';
  dock: 'receiving' | 'shipping';
  requestedKg: number;
  actualKg: number;
  materials: MaterialAmount[];
  sourceLots: SourceContribution[];
  productBatches: ProductBatchContribution[];
  simulationTime: number;
  /**
   * The plant clock it was made at, which traceability shows like every
   * other plant stamp. The tick passes it in (reading it here would close an
   * import cycle). Absent on manifests made before it.
   */
  gameClock?: PlantClock;
  /**
   * Shipping only: the order the shipment plan credits first
   * (src/simulation/shipmentPlan.ts). Absent on manifests made before it,
   * which credit by the dispatch queue alone.
   */
  orderId?: string;
  /**
   * Shipping only: which order each part of the load was loaded for, by batch
   * (plan item 3.4). Crediting still reads each batch's stamp against the
   * order's minimum itself. Absent on manifests made before it.
   */
  orderLoads?: ShipmentLoad[];
}

export interface MaterialBalance {
  initialKg: number;
  receivedKg: number;
  inventoryKg: number;
  inTransitKg: number;
  wasteKg: number;
  /** Bran and middlings discharged from the mills as millfeed. */
  byproductKg: number;
  shippedKg: number;
  expectedKg: number;
  accountedKg: number;
  errorKg: number;
}

// =============================================================================
// MACHINE BUFFERS - Input/Output storage for each machine
// =============================================================================

export interface MachineBuffer {
  machineId: string;
  machineType: 'silo' | 'roller_mill' | 'plansifter' | 'packer';
  inputBuffer: MaterialAmount[];
  outputBuffer: MaterialAmount[];
  inputCapacity: number; // kg
  outputCapacity: number; // kg
  processingRate: number; // kg per second at production speed 1.0
  /** Conversion ratios: input material -> output materials */
  conversionRatios: ConversionRatio[];
  /** Whether this machine is currently processing */
  isProcessing: boolean;
}

export interface ConversionRatio {
  inputType: MaterialType;
  outputs: { type: MaterialType; ratio: number }[];
}

// =============================================================================
// CONVEYOR SEGMENTS - Links between machines
// =============================================================================

export interface ConveyorSegment {
  id: string;
  fromMachineId: string;
  toMachineId: string;
  fromOutputType: MaterialType;
  capacity: number; // kg max on conveyor at once
  currentLoad: number; // kg currently on conveyor
  flowRate: number; // kg per second at production speed 1.0
  /** Transit time in seconds at production speed 1.0 */
  transitTime: number;
  /** Missing geometry stops new departures; existing parcels still drain. */
  routeProvenance?: 'rendered' | 'modeled' | 'unresolved';
  routeLengthMetres?: number | null;
  /** Material in transit with arrival timestamps */
  inTransit: Array<{
    amount: number;
    arrivalTime: number;
    type: MaterialType;
    sourceContributions?: SourceContribution[];
  }>;
}

// =============================================================================
// NETWORK TOPOLOGY
// =============================================================================

export interface NetworkTopology {
  /** All conveyor connections */
  segments: ConveyorSegment[];
  /** Machine ID -> downstream machine IDs */
  downstreamMap: Map<string, string[]>;
  /** Machine ID -> upstream machine IDs */
  upstreamMap: Map<string, string[]>;
}

// =============================================================================
// STORE STATE
// =============================================================================

export interface MaterialFlowState {
  /** Distinguishes physical runs when deterministic lot/batch counters restart. */
  sessionId: string;
  // Machine buffers indexed by machine ID
  machineBuffers: Map<string, MachineBuffer>;

  // Network topology
  network: NetworkTopology;

  // Cumulative stats
  totalMaterialProcessed: number; // kg total
  totalFlourProduced: number; // kg flour output
  currentFlowRate: number; // kg/sec instantaneous (summed across ALL stages)
  currentPackerFlowRate: number; // kg/sec processed at the final packing stage only

  // Conserved material ledger
  initialInventoryKg: number;
  receivedKg: number;
  wasteKg: number;
  /**
   * Bran and middlings discharged from the roller mills to the millfeed
   * system. A conserved co-product, not waste: it is sold as feed.
   */
  byproductKg: number;
  shippedKg: number;
  manifests: MaterialManifest[];
  manifestSequence: number;

  // Lot and batch genealogy
  sourceLots: Map<string, SourceLot>;
  productionBatches: ProductionBatch[];
  processGenealogy: ProcessGenealogyRecord[];
  wasteSourceContributions: SourceContribution[];
  byproductSourceContributions: SourceContribution[];
  shippedSourceContributions: SourceContribution[];
  lotSequence: number;
  batchSequence: number;
  processSequence: number;

  // Time tracking for transit
  simulationTime: number; // seconds elapsed

  // Actions
  tickMaterialFlow: (
    deltaSeconds: number,
    productionSpeed: number,
    productionPlan?: MaterialFlowProductionPlan,
    /**
     * Quality score (0-100) of product packed this tick; stamped on its batch.
     * Per product where they differ: a Chronicle crop year marks down flour
     * (wheat), not semolina (corn), whichever grain the mills are on now.
     */
    productQuality?: number | Partial<Record<'flour' | 'semolina', number>>,
    /**
     * labBench: new batches form awaiting the lab's bench (plan item 3.2).
     * planFeed: grain leaves a silo only for the line's plan, and a mill's
     * hopper takes one grain at a time (PLAN_ONLY_SILO_FEED).
     * flourPenalty: under a Chronicle charter, the points a packed portion of
     * flour loses for the grain it was milled from (simulation/lotQuality.ts),
     * taken off `productQuality`'s flour figure, which then carries none.
     */
    options?: {
      labBench?: boolean;
      planFeed?: boolean;
      flourPenalty?: (contributions: readonly SourceContribution[]) => number;
    }
  ) => void;
  /**
   * Couple machine status to flow: stopped/idle/critical machines stop
   * processing material. Joined on the live machine ids from the scene.
   */
  syncMachineProcessing: (machines: ReadonlyArray<{ id: string; status: string }>) => void;
  syncTransportGeometry: (machines: readonly SpoutMachine[]) => void;
  /**
   * A receiving truck delivers grain: tops up the emptiest silo (wheat for
   * even silo indices, corn for odd, matching the initial fill pattern).
   */
  receiveGrainDelivery: (
    amountKg: number,
    details?: {
      supplier?: string;
      materialType?: Extract<MaterialType, 'wheat_grain' | 'corn_grain'>;
      crop?: CropAttributes;
      gameClock?: PlantClock;
      /**
       * The silo the lot goes into (plan item 3.1, intake): taken when it
       * stores this grain and has room, else the emptiest silo, as without it.
       */
      siloId?: string;
    }
  ) => number;
  /**
   * A shipping truck removes completed flour or semolina from packer output.
   * Returns the amount actually loaded, which may be lower than requested.
   */
  shipFinishedGoods: (
    amountKg: number,
    preferredMaterial?: Extract<MaterialType, 'flour' | 'semolina'>,
    details?: {
      gameClock?: PlantClock;
      orderId?: string;
      /**
       * The shipment plan's allocation (plan item 3.4): only these batches, up
       * to these kilograms each, are loaded, and the manifest records which
       * order each part was loaded for. Absent, any tested, released stock.
       */
      loads?: readonly ShipmentLoad[];
    }
  ) => number;
  /** Close a batch to more flour: the bench has taken its sample (plan item 3.2). */
  sealBatch: (batchId: string) => void;
  /** Send batches back to the bench: released without a test of their own. */
  setAwaitingTest: (batchIds: readonly string[]) => string[];
  setBatchDisposition: (
    batchIds: readonly string[],
    disposition: Exclude<MaterialDisposition, 'shipped'>,
    reason: string,
    qcTestId?: string,
    /** The canned reason `reason` was rendered from; omit for free text. */
    reasonKey?: DispositionReasonKey
  ) => string[];
  setLotDisposition: (
    lotIds: readonly string[],
    disposition: Exclude<MaterialDisposition, 'shipped'>,
    reason: string,
    /** Held batches whose own evidence keeps them held when their lots are released. */
    retainedHolds?: ReadonlySet<string>,
    /** The canned reason `reason` was rendered from; omit for free text. */
    reasonKey?: DispositionReasonKey
  ) => string[];
  getBatchTrace: (batchId: string) => BatchTrace | null;
  getDispatchableFinishedGoods: () => number;
  getGenealogyBalance: () => GenealogyBalance;
  getMaterialBalance: () => MaterialBalance;
  getMachineBuffer: (machineId: string) => MachineBuffer | undefined;
  /**
   * Mass a machine processed per PLANT second over the last few plant
   * seconds (FEED_WINDOW_PLANT_SECONDS); zero for a machine that processed
   * nothing in that window. SCADA feed tags read it.
   */
  getMachineFeedRate: (machineId: string) => number;
  /**
   * True when a full feed window of this session is on record and the machine
   * processed nothing in it. Before the window fills (a fresh session or a
   * reload) the hopper decides instead (bufferWorksNothing).
   */
  isMachineUnfed: (machineId: string) => boolean;
  /** True once a full feed window of this session is on record. */
  hasFeedRecord: () => boolean;
  getConveyorLoad: (segmentId: string) => number;
  getTotalInputBuffer: (machineId: string) => number;
  getTotalOutputBuffer: (machineId: string) => number;
  resetMaterialFlow: () => void;
}

// =============================================================================
// INITIAL STATE FACTORY
// =============================================================================

// This threshold removes only numerical dust. It must stay far below the
// operator-facing 0.01 kg reconciliation tolerance because it is applied to
// many lot/path contributions over a long simulation run.
export const GENEALOGY_EPSILON_KG = 0.000000001;
const PRODUCT_BATCH_TARGET_KG = 1000;
/**
 * The silos feed only the line's plan, one grain to a hopper (the tick passes
 * `planFeed`; benchmarks keep the old open valves). With no order open the
 * line now stands rather than building stock. False turns it back.
 */
export const PLAN_ONLY_SILO_FEED = true;
const GRAIN_TYPES: ReadonlySet<MaterialType> = new Set(['wheat_grain', 'corn_grain']);
// Bran and middlings have no conveyor lane: a mill discharges them to the
// millfeed system whenever its co-product bin reaches this level. Without the
// outlet they filled the mill's output buffer and stopped the line for good.
const MILLFEED_DISCHARGE_KG = 500;
// The process log is an in-memory diagnostic window (about four plant minutes
// at this rate); the physical save does not carry it. Batch traces read each
// batch's own contributions instead.
const MAX_PROCESS_GENEALOGY_RECORDS = 500;
// Retained history windows. Each record carries lot contributions (~1.4 K chars),
// and the physical save must fit its 1.5 M-char gate with the rest of the shift.
// The panels show the newest 3 manifests and 4 settled batches; the campaign's
// processed-receipt window follows the manifest window. From plan item 3.4
// manifests keep 8 and shipped batches 4 (both were 32): a plant that keeps
// delivering filled both to their caps and the save passed its budget. The
// SCADA panel reads the latest receiving and shipping manifest, so the
// manifest window keeps a few of each; crediting reads both in the tick
// they are made.
export const MAX_MATERIAL_MANIFESTS = 8;
/**
 * Shipped batches retained as dispatch history. Only shipped batches are ever
 * dropped, oldest first: stock, holds and recalls stay until they settle, and
 * are bounded by packer capacity and the controller's own dispositions.
 */
export const MAX_PRODUCTION_BATCHES = 4;
export function retainShippedBatchWindow<T extends { disposition: MaterialDisposition }>(
  batches: T[]
): T[] {
  let toDrop = batches.filter((batch) => batch.disposition === 'shipped').length;
  toDrop -= MAX_PRODUCTION_BATCHES;
  if (toDrop <= 0) return batches;
  return batches.filter((batch) => {
    if (toDrop > 0 && batch.disposition === 'shipped') {
      toDrop -= 1;
      return false;
    }
    return true;
  });
}
// The SCADA mill feed tags average this many plant seconds of processing, so a
// conveyor parcel arriving between two ticks does not read as a step change.
// It is held beside the store, not in it: the physical save checks every data
// key, and the window refills within seconds of a reload.
export const FEED_WINDOW_PLANT_SECONDS = 10;
/**
 * Whether a unit's hopper this instant leaves it nothing to work: its input is
 * empty, or its output has no room. The feed judgement falls back to this
 * until a full feed window is on record (a fresh session or a reload), so the
 * load, the bill and the 3D pose all read the same evidence then too.
 */
export function bufferWorksNothing(buffer: MachineBuffer | undefined): boolean {
  if (!buffer) return false;
  let inputKg = 0;
  for (const material of buffer.inputBuffer) inputKg += material.amount;
  if (inputKg <= 0.01) return true;
  let outputKg = 0;
  for (const material of buffer.outputBuffer) outputKg += material.amount;
  return outputKg >= buffer.outputCapacity - 0.01;
}
/** A record's reason with `reason` in place of the old one, key and all. */
function withDispositionReason<T extends { dispositionReasonKey?: DispositionReasonKey }>(
  record: T,
  reason: string | null,
  reasonKey: DispositionReasonKey | undefined
): T & { dispositionReason: string | null } {
  const { dispositionReasonKey: _previous, ...rest } = record;
  return {
    ...(rest as T),
    dispositionReason: reason,
    ...(reasonKey ? { dispositionReasonKey: reasonKey } : {}),
  };
}

const newMaterialSessionId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `flow-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const MAX_SOURCE_LOTS = 1000;

function contributionKey(contribution: SourceContribution): string {
  return `${contribution.lotId}|${contribution.path.join('>')}`;
}

function cloneSourceContributions(
  contributions: readonly SourceContribution[] | undefined
): SourceContribution[] {
  return (contributions ?? []).map((contribution) => ({
    ...contribution,
    path: [...contribution.path],
  }));
}

function mergeSourceContributions(
  current: readonly SourceContribution[] | undefined,
  additions: readonly SourceContribution[] | undefined
): SourceContribution[] {
  const merged = new Map<string, SourceContribution>();
  const merge = (contribution: SourceContribution) => {
    if (!Number.isFinite(contribution.amount) || contribution.amount <= GENEALOGY_EPSILON_KG)
      return;
    const key = contributionKey(contribution);
    const existing = merged.get(key);
    if (existing) {
      existing.amount += contribution.amount;
    } else {
      merged.set(key, { ...contribution, path: [...contribution.path] });
    }
  };
  current?.forEach(merge);
  additions?.forEach(merge);
  return [...merged.values()];
}

function subtractSourceContributions(
  current: readonly SourceContribution[] | undefined,
  removals: readonly SourceContribution[]
): SourceContribution[] {
  const remaining = new Map(
    cloneSourceContributions(current).map((contribution) => [
      contributionKey(contribution),
      contribution,
    ])
  );
  for (const removal of removals) {
    const key = contributionKey(removal);
    const existing = remaining.get(key);
    if (!existing) continue;
    existing.amount = Math.max(0, existing.amount - removal.amount);
    if (existing.amount <= GENEALOGY_EPSILON_KG) remaining.delete(key);
  }
  return [...remaining.values()];
}

function scaleSourceContributions(
  contributions: readonly SourceContribution[] | undefined,
  scale: number
): SourceContribution[] {
  if (!Number.isFinite(scale) || scale <= 0) return [];
  return (contributions ?? [])
    .map((contribution) => ({
      ...contribution,
      path: [...contribution.path],
      amount: contribution.amount * scale,
    }))
    .filter((contribution) => contribution.amount > GENEALOGY_EPSILON_KG);
}

function withdrawSourceContributions(
  material: MaterialAmount,
  amountKg: number
): SourceContribution[] {
  if (amountKg <= 0 || material.amount <= 0 || !material.sourceContributions?.length) return [];
  const fraction = Math.min(1, amountKg / material.amount);
  const withdrawn = scaleSourceContributions(material.sourceContributions, fraction);
  material.sourceContributions = scaleSourceContributions(
    material.sourceContributions,
    1 - fraction
  );
  return withdrawn;
}

function appendMachineToPath(
  contributions: readonly SourceContribution[],
  machineId: string
): SourceContribution[] {
  return contributions.map((contribution) => ({
    ...contribution,
    path:
      contribution.path.at(-1) === machineId
        ? [...contribution.path]
        : [...contribution.path, machineId],
  }));
}

function mergeProductBatchContributions(
  current: readonly ProductBatchContribution[] | undefined,
  additions: readonly ProductBatchContribution[] | undefined
): ProductBatchContribution[] {
  const merged = new Map<string, number>();
  const merge = (contribution: ProductBatchContribution) => {
    if (!Number.isFinite(contribution.amount) || contribution.amount <= GENEALOGY_EPSILON_KG)
      return;
    merged.set(contribution.batchId, (merged.get(contribution.batchId) ?? 0) + contribution.amount);
  };
  current?.forEach(merge);
  additions?.forEach(merge);
  return [...merged.entries()].map(([batchId, amount]) => ({ batchId, amount }));
}

/**
 * A recall is terminal, so the recalled mass is scrapped where it sits: drained
 * from packer output the way shipFinishedGoods drains it, and booked as waste
 * with its source genealogy. Kept in the buffer, it held a fifth of a packer's
 * capacity for the rest of the session. Working if both balances stay closed
 * and the batch reads 'recalled' with no available mass.
 */
function writeOffRecalledMass(
  state: Pick<MaterialFlowState, 'machineBuffers' | 'wasteKg' | 'wasteSourceContributions'>,
  productionBatches: ProductionBatch[],
  batchIds: ReadonlySet<string>
): Pick<MaterialFlowState, 'machineBuffers' | 'wasteKg' | 'wasteSourceContributions'> | null {
  if (batchIds.size === 0) return null;
  const machineBuffers = new Map(state.machineBuffers);
  let wasteKg = state.wasteKg;
  let wasteSourceContributions = state.wasteSourceContributions;
  machineBuffers.forEach((buffer, machineId) => {
    if (!buffer.outputBuffer.some((m) => m.productBatches?.some((p) => batchIds.has(p.batchId))))
      return;
    const outputBuffer = buffer.outputBuffer.map((material) => {
      if (!material.productBatches?.some((p) => batchIds.has(p.batchId))) return material;
      let amount = material.amount;
      let sourceContributions = cloneSourceContributions(material.sourceContributions);
      const productBatches = material.productBatches.map((p) => ({ ...p }));
      for (const contribution of productBatches) {
        const batch = batchIds.has(contribution.batchId)
          ? productionBatches.find((candidate) => candidate.id === contribution.batchId)
          : undefined;
        if (!batch) continue;
        const writtenOff = Math.min(contribution.amount, batch.availableKg);
        if (writtenOff <= 0) continue;
        const sources = scaleSourceContributions(
          batch.sourceContributions,
          batch.producedKg > 0 ? writtenOff / batch.producedKg : 0
        );
        amount -= writtenOff;
        contribution.amount -= writtenOff;
        sourceContributions = subtractSourceContributions(sourceContributions, sources);
        wasteSourceContributions = mergeSourceContributions(wasteSourceContributions, sources);
        wasteKg += writtenOff;
        batch.availableKg -= writtenOff;
        batch.writtenOffKg = (batch.writtenOffKg ?? 0) + writtenOff;
        if (batch.availableKg <= GENEALOGY_EPSILON_KG) batch.availableKg = 0;
      }
      return {
        ...material,
        amount,
        sourceContributions,
        productBatches: productBatches.filter((p) => p.amount > GENEALOGY_EPSILON_KG),
      };
    });
    machineBuffers.set(machineId, {
      ...buffer,
      outputBuffer: outputBuffer.filter((material) => material.amount > GENEALOGY_EPSILON_KG),
    });
  });
  return { machineBuffers, wasteKg, wasteSourceContributions };
}

/** Below this, a recalled lot's remaining genealogy is rounding, not stock. */
const RECALLED_STOCK_TOLERANCE_KG = 1;

export interface RecalledStock {
  /** Mass from recalled source lots still in machine buffers or in transit. */
  kg: number;
  /** Recalled lots that still have more than the tolerance in the plant. */
  lotIds: ReadonlySet<string>;
}

const NO_RECALLED_STOCK: RecalledStock = { kg: 0, lotIds: new Set() };
let recalledStockCache: {
  machineBuffers: MaterialFlowState['machineBuffers'];
  segments: MaterialFlowState['network']['segments'];
  sourceLots: MaterialFlowState['sourceLots'];
  value: RecalledStock;
} | null = null;

/**
 * Recalled stock the plant is still dealing with. Product is written off when
 * it is recalled or packed (writeOffRecalledMass, appendPackedBatch), so what
 * remains of a recall is its lots' material upstream, on its way to the packer
 * and the scrap bin. Working if this is non-zero exactly while that material
 * is in the plant. Memoised on the state it reads, because readers poll it per
 * frame while the flow changes per tick.
 */
export function getRecalledStock(
  state: Pick<MaterialFlowState, 'machineBuffers' | 'network' | 'sourceLots'>
): RecalledStock {
  const cache = recalledStockCache;
  if (
    cache &&
    cache.machineBuffers === state.machineBuffers &&
    cache.segments === state.network.segments &&
    cache.sourceLots === state.sourceLots
  )
    return cache.value;
  const recalledKgByLot = new Map<string, number>();
  for (const lot of state.sourceLots.values())
    if (lot.disposition === 'recalled') recalledKgByLot.set(lot.id, 0);
  if (recalledKgByLot.size > 0) {
    const count = (contributions: readonly SourceContribution[] | undefined) => {
      for (const contribution of contributions ?? []) {
        const kg = recalledKgByLot.get(contribution.lotId);
        if (kg !== undefined) recalledKgByLot.set(contribution.lotId, kg + contribution.amount);
      }
    };
    state.machineBuffers.forEach((buffer) => {
      buffer.inputBuffer.forEach((material) => count(material.sourceContributions));
      buffer.outputBuffer.forEach((material) => count(material.sourceContributions));
    });
    state.network.segments.forEach((segment) =>
      segment.inTransit.forEach((transit) => count(transit.sourceContributions))
    );
  }
  let kg = 0;
  const lotIds = new Set<string>();
  recalledKgByLot.forEach((lotKg, lotId) => {
    if (lotKg <= RECALLED_STOCK_TOLERANCE_KG) return;
    kg += lotKg;
    lotIds.add(lotId);
  });
  const value = lotIds.size > 0 ? { kg, lotIds } : NO_RECALLED_STOCK;
  recalledStockCache = {
    machineBuffers: state.machineBuffers,
    segments: state.network.segments,
    sourceLots: state.sourceLots,
    value,
  };
  return value;
}

/**
 * Lots with more than the tolerance of grain or meal anywhere in the process
 * now, as a supplier notice names them: the silos, and the mills', sifters'
 * and packers' buffers and the spouts between them, which carry each parcel's
 * lots (plan 1.9 (c)). Packed flour is held by its batches as well. Only lots
 * still on record and not recalled: a quality alert may only bind a lot the
 * save can carry ('Unbound source hold').
 */
export function getNotifiedLotIds(
  state: Pick<MaterialFlowState, 'machineBuffers' | 'sourceLots'> & {
    network?: Pick<NetworkTopology, 'segments'>;
  }
): string[] {
  const kgByLot = new Map<string, number>();
  const add = (sources: readonly SourceContribution[] | undefined) => {
    for (const source of sources ?? [])
      kgByLot.set(source.lotId, (kgByLot.get(source.lotId) ?? 0) + source.amount);
  };
  state.machineBuffers.forEach((buffer) => {
    for (const material of [...buffer.inputBuffer, ...buffer.outputBuffer])
      add(material.sourceContributions);
  });
  for (const segment of state.network?.segments ?? [])
    for (const parcel of segment.inTransit) add(parcel.sourceContributions);
  return [...kgByLot]
    .filter(([lotId, kg]) => {
      const lot = state.sourceLots.get(lotId);
      return kg > RECALLED_STOCK_TOLERANCE_KG && !!lot && lot.disposition !== 'recalled';
    })
    .map(([lotId]) => lotId);
}

// =============================================================================
// GENEALOGY RETENTION (plan wave 3d)
// =============================================================================

/**
 * How long a lot keeps its own genealogy: three game days from its receipt.
 *
 * The silos mix: every draw takes each lot's share, so almost every lot ever
 * received is still on site in some measure. Measured on the worst-case save
 * (physicalSession.worstCase.test.ts, SAVE_PROBE): 230 of 241 lots on site at
 * shift 39, 214 of them over 150 kg. Kept whole, the lot contributions on
 * every parcel, belt load and batch grew with each delivery and the autosave
 * stopped at about game day 13. So a released lot older than this is merged
 * into its grain's one earlier-stock lot (EARLIER_STOCK_LOT_IDS) everywhere
 * it is still on record: the mass stays, on the same paths, and the genealogy
 * balance stays closed; only which delivery it came from is lost.
 *
 * What keeps its own lots: everything received in the last three game days;
 * a held or recalled lot (an open quality alert binds them), which is never
 * merged; a batch that is held, or that has begun to ship (its credit key
 * digests its lots), which is never rewritten, and whose lots' records stay
 * (marked `mergedInto`) until the batch leaves the record. A recall or a
 * supplier notice can therefore name a lot received in the last three game
 * days, and anything earlier as that grain's earlier stock.
 */
export const GENEALOGY_RETENTION_MINUTES = 3 * 24 * 60;
/** Switch for the rule: false keeps every lot's genealogy (the measurement turns it off). */
export const GENEALOGY_RETENTION = { enabled: true };
/**
 * Each grain's earlier stock, as one lot. Once a hold or a recall stands on
 * it, later merges go to a fresh one (`<id>-2`, `-3`, ...), so a notice on old
 * stock never stops the rule.
 */
export const EARLIER_STOCK_LOT_IDS = {
  wheat_grain: 'lot-earlier-wheat',
  corn_grain: 'lot-earlier-corn',
} as const;
const isEarlierStock = (id: string) => id.startsWith('lot-earlier-');
/** The earlier-stock lot a grain's aged lots merge into now. */
function earlierStockTarget(
  lots: ReadonlyMap<string, SourceLot>,
  grain: keyof typeof EARLIER_STOCK_LOT_IDS
): string {
  const base = EARLIER_STOCK_LOT_IDS[grain];
  const id = (generation: number) => (generation === 1 ? base : `${base}-${generation}`);
  let generation = 1;
  while (lots.has(id(generation))) generation += 1;
  const newest = generation > 1 ? lots.get(id(generation - 1)) : undefined;
  return newest && newest.disposition === 'released' ? newest.id : id(generation);
}
/** Material seconds between checks: a game hour at the boot line rate (0.8). */
const GENEALOGY_RETENTION_INTERVAL_SECONDS = 96;
/**
 * A lot with no receipt minute (opening stock, a lot from before it was
 * stamped) is aged on the material clock, which runs at plant seconds times
 * the line rate: at the rate the record's own manifests show (material
 * seconds per game minute between the first and last of them), never faster
 * than the boot rate's, and at the fastest line rate (2.0) when they cannot
 * say. Each errs young, so a lot is never merged early.
 */
const MATERIAL_SECONDS_PER_GAME_MINUTE = {
  boot: 60 * PLANT_SECONDS_PER_GAME_SECOND * 0.8,
  fastest: 60 * PLANT_SECONDS_PER_GAME_SECOND * 2,
} as const;

type RetentionState = Pick<
  MaterialFlowState,
  | 'machineBuffers'
  | 'network'
  | 'sourceLots'
  | 'productionBatches'
  | 'manifests'
  | 'wasteSourceContributions'
  | 'byproductSourceContributions'
  | 'shippedSourceContributions'
>;

/** A batch whose lots are kept as they are: held, recalled, or begun to ship. */
const batchKeepsItsLots = (batch: ProductionBatch) =>
  batch.disposition !== 'released' || batch.dispatchManifestIds.length > 0;

/**
 * The record with the retention rule applied, or null when it changes
 * nothing. Pure. "Now" is the newest game clock the record carries (its
 * latest manifest); a record with none is left as it is.
 */
export function retainGenealogy(state: RetentionState): Partial<RetentionState> | null {
  let anchor: { minute: number; time: number } | null = null;
  let first: { minute: number; time: number } | null = null;
  const receiptMinute = new Map<string, number>();
  for (const manifest of state.manifests) {
    if (!manifest.gameClock) continue;
    const minute = toSimulationMinutes(manifest.gameClock);
    if (manifest.kind === 'receiving') receiptMinute.set(manifest.id, minute);
    if (!anchor || manifest.simulationTime >= anchor.time)
      anchor = { minute, time: manifest.simulationTime };
    if (!first || manifest.simulationTime < first.time)
      first = { minute, time: manifest.simulationTime };
  }
  if (!anchor || !first) return null;
  const now = anchor;
  const spanMinutes = now.minute - first.minute;
  const secondsPerMinute =
    spanMinutes >= 30 && now.time > first.time
      ? Math.max(MATERIAL_SECONDS_PER_GAME_MINUTE.boot, (now.time - first.time) / spanMinutes)
      : MATERIAL_SECONDS_PER_GAME_MINUTE.fastest;
  let lots = state.sourceLots;
  const editLots = () => (lots === state.sourceLots ? (lots = new Map(lots)) : lots);
  // Stamp each lot's receipt while its manifest is still in the record.
  for (const lot of state.sourceLots.values()) {
    if (lot.receivedAtMinute !== undefined || !lot.sourceManifestId) continue;
    const minute = receiptMinute.get(lot.sourceManifestId);
    if (minute !== undefined) editLots().set(lot.id, { ...lot, receivedAtMinute: minute });
  }
  const minuteOf = (lot: SourceLot) =>
    lot.receivedAtMinute ??
    now.minute - Math.max(0, now.time - lot.simulationTime) / secondsPerMinute;
  const merge = new Map<string, string>();
  const targets = {
    wheat_grain: earlierStockTarget(lots, 'wheat_grain'),
    corn_grain: earlierStockTarget(lots, 'corn_grain'),
  };
  for (const lot of lots.values()) {
    if (isEarlierStock(lot.id) || lot.mergedInto || lot.disposition !== 'released') continue;
    if (lot.materialType !== 'wheat_grain' && lot.materialType !== 'corn_grain') continue;
    if (now.minute - minuteOf(lot) >= GENEALOGY_RETENTION_MINUTES)
      merge.set(lot.id, targets[lot.materialType]);
  }
  const rewrite = <T extends readonly SourceContribution[] | undefined>(list: T): T =>
    list && merge.size > 0 && list.some((c) => merge.has(c.lotId))
      ? (mergeSourceContributions(
          [],
          list.map((c) => (merge.has(c.lotId) ? { ...c, lotId: merge.get(c.lotId)! } : c))
        ) as unknown as T)
      : list;
  const update: Partial<RetentionState> = {};
  if (merge.size > 0) {
    let buffersChanged = false;
    const machineBuffers = new Map(state.machineBuffers);
    machineBuffers.forEach((buffer, id) => {
      const material = (list: MaterialAmount[]) => {
        let changed = false;
        const next = list.map((m) => {
          const sourceContributions = rewrite(m.sourceContributions);
          if (sourceContributions === m.sourceContributions) return m;
          changed = true;
          return { ...m, sourceContributions };
        });
        return changed ? next : list;
      };
      const inputBuffer = material(buffer.inputBuffer);
      const outputBuffer = material(buffer.outputBuffer);
      if (inputBuffer === buffer.inputBuffer && outputBuffer === buffer.outputBuffer) return;
      buffersChanged = true;
      machineBuffers.set(id, { ...buffer, inputBuffer, outputBuffer });
    });
    if (buffersChanged) update.machineBuffers = machineBuffers;
    let segmentsChanged = false;
    const segments = state.network.segments.map((segment) => {
      let changed = false;
      const inTransit = segment.inTransit.map((parcel) => {
        const sourceContributions = rewrite(parcel.sourceContributions);
        if (sourceContributions === parcel.sourceContributions) return parcel;
        changed = true;
        return { ...parcel, sourceContributions };
      });
      if (!changed) return segment;
      segmentsChanged = true;
      return { ...segment, inTransit };
    });
    if (segmentsChanged) update.network = { ...state.network, segments };
    let batchesChanged = false;
    const productionBatches = state.productionBatches.map((batch) => {
      if (batchKeepsItsLots(batch)) return batch;
      const sourceContributions = rewrite(batch.sourceContributions);
      if (sourceContributions === batch.sourceContributions) return batch;
      batchesChanged = true;
      return { ...batch, sourceContributions };
    });
    if (batchesChanged) update.productionBatches = productionBatches;
    let manifestsChanged = false;
    const manifests = state.manifests.map((manifest) => {
      const sourceLots = rewrite(manifest.sourceLots);
      if (sourceLots === manifest.sourceLots) return manifest;
      manifestsChanged = true;
      return { ...manifest, sourceLots };
    });
    if (manifestsChanged) update.manifests = manifests;
    for (const key of [
      'wasteSourceContributions',
      'byproductSourceContributions',
      'shippedSourceContributions',
    ] as const) {
      const next = rewrite(state[key]);
      if (next !== state[key]) update[key] = next;
    }
    // Each grain's earlier stock takes the merged lots' mass and, under a
    // charter, their crop readings weighted by it.
    for (const [lotId, target] of merge) {
      const lot = lots.get(lotId)!;
      const into = lots.get(target);
      const kg = into?.receivedKg ?? 0;
      const total = kg + lot.receivedKg;
      const weigh = (a: number, b: number) =>
        total > 0 ? (a * kg + b * lot.receivedKg) / total : b;
      const crop =
        into?.crop && lot.crop
          ? {
              ...lot.crop,
              moisturePct: weigh(into.crop.moisturePct, lot.crop.moisturePct),
              proteinPct: weigh(into.crop.proteinPct, lot.crop.proteinPct),
              fallingNumberS: weigh(into.crop.fallingNumberS, lot.crop.fallingNumberS),
            }
          : (into?.crop ?? lot.crop);
      editLots().set(target, {
        id: target,
        materialType: lot.materialType,
        origin: into?.origin ?? lot.origin,
        sourceManifestId: null,
        supplier: translate(materialFlowStoreMessages, 'earlierStock'),
        supplierKey: 'earlierStock',
        receivedKg: total,
        simulationTime: Math.min(into?.simulationTime ?? lot.simulationTime, lot.simulationTime),
        disposition: into?.disposition ?? 'released',
        dispositionReason: into?.dispositionReason ?? null,
        ...(into?.dispositionReasonKey ? { dispositionReasonKey: into.dispositionReasonKey } : {}),
        ...(crop ? { crop: { ...crop } } : {}),
        receivedAtMinute: Math.max(into?.receivedAtMinute ?? -Infinity, minuteOf(lot)),
      });
      editLots().set(lotId, { ...lot, mergedInto: target });
    }
  }
  // A merged lot's record goes once no kept batch names it, and never while a
  // hold or recall stands on it (an open alert must find its lots).
  const named = new Set<string>();
  for (const batch of update.productionBatches ?? state.productionBatches)
    for (const c of batch.sourceContributions) named.add(c.lotId);
  for (const lot of lots.values())
    if (lot.mergedInto && lot.disposition === 'released' && !named.has(lot.id))
      editLots().delete(lot.id);
  if (lots !== state.sourceLots) update.sourceLots = lots;
  return Object.keys(update).length > 0 ? update : null;
}

function openingMaterial(machineId: string, type: MaterialType, amount: number): MaterialAmount {
  return {
    type,
    amount,
    sourceContributions: [{ lotId: `lot-opening-${machineId}`, amount, path: [machineId] }],
  };
}

function createInitialMachineBuffers(): Map<string, MachineBuffer> {
  const buffers = new Map<string, MachineBuffer>();

  // Silos - 5 silos with initial grain storage (20 tons each).
  // Ids match the live scene roster (MillScene creates silo-0..silo-4).
  const siloIds = ['silo-0', 'silo-1', 'silo-2', 'silo-3', 'silo-4'];
  siloIds.forEach((id, index) => {
    const grainType: MaterialType = index % 2 === 0 ? 'wheat_grain' : 'corn_grain';
    buffers.set(id, {
      machineId: id,
      machineType: 'silo',
      inputBuffer: [], // Silos receive from trucks (external)
      outputBuffer: [openingMaterial(id, grainType, 20000)], // 20 tons initial
      inputCapacity: 50000, // 50 ton capacity
      outputCapacity: 50000,
      processingRate: 200, // 200 kg/sec discharge rate
      conversionRatios: [], // Silos just store, no conversion
      isProcessing: true,
    });
  });

  // Roller Mills - 4 mills that grind grain to flour/bran/middlings
  const millIds = ['rm-101', 'rm-102', 'rm-103', 'rm-104'];
  millIds.forEach((id) => {
    buffers.set(id, {
      machineId: id,
      machineType: 'roller_mill',
      inputBuffer: [openingMaterial(id, 'wheat_grain', 500)], // Start with some grain
      outputBuffer: [],
      inputCapacity: 2000, // 2 ton input buffer
      outputCapacity: 2000,
      processingRate: 50, // 50 kg/sec processing rate (per mill, across the 4 mills)
      conversionRatios: [
        {
          inputType: 'wheat_grain',
          outputs: [
            { type: 'flour', ratio: 0.72 }, // 72% flour extraction
            { type: 'bran', ratio: 0.18 }, // 18% bran
            { type: 'middlings', ratio: 0.1 }, // 10% middlings
          ],
        },
        {
          inputType: 'corn_grain',
          outputs: [
            { type: 'semolina', ratio: 0.65 }, // 65% semolina from corn
            { type: 'bran', ratio: 0.25 },
            { type: 'middlings', ratio: 0.1 },
          ],
        },
      ],
      isProcessing: true,
    });
  });

  // Plansifters - 3 sifters that separate flour grades
  const sifterIds = ['sifter-a', 'sifter-b', 'sifter-c'];
  sifterIds.forEach((id) => {
    buffers.set(id, {
      machineId: id,
      machineType: 'plansifter',
      inputBuffer: [openingMaterial(id, 'flour', 300)], // Start with some flour
      outputBuffer: [],
      inputCapacity: 3000, // 3 ton buffer
      outputCapacity: 3000,
      processingRate: 80, // 80 kg/sec - faster than mills
      conversionRatios: [
        {
          inputType: 'flour',
          outputs: [{ type: 'flour', ratio: 0.95 }], // 95% passes through (5% lost to dust)
        },
        {
          inputType: 'semolina',
          outputs: [{ type: 'semolina', ratio: 0.95 }],
        },
      ],
      isProcessing: true,
    });
  });

  // Packers - 3 packing lines. Ids match the live scene roster
  // (MillScene creates packer-0..packer-2).
  const packerIds = ['packer-0', 'packer-1', 'packer-2'];
  packerIds.forEach((id) => {
    buffers.set(id, {
      machineId: id,
      machineType: 'packer',
      inputBuffer: [openingMaterial(id, 'flour', 200)], // Start with some flour
      outputBuffer: [],
      inputCapacity: 1000, // 1 ton hopper
      outputCapacity: 5000, // Packed bags accumulate
      processingRate: 25, // 25 kg/sec = ~60 bags/min at 25kg/bag
      conversionRatios: [
        {
          inputType: 'flour',
          outputs: [{ type: 'flour', ratio: 1.0 }], // 1:1 packing
        },
        {
          inputType: 'semolina',
          outputs: [{ type: 'semolina', ratio: 1.0 }],
        },
      ],
      isProcessing: true,
    });
  });

  return buffers;
}

function createInitialSourceLots(
  buffers: ReadonlyMap<string, MachineBuffer>
): Map<string, SourceLot> {
  const lots = new Map<string, SourceLot>();
  buffers.forEach((buffer) => {
    for (const material of [...buffer.inputBuffer, ...buffer.outputBuffer]) {
      for (const contribution of material.sourceContributions ?? []) {
        const existing = lots.get(contribution.lotId);
        if (existing) {
          existing.receivedKg += contribution.amount;
        } else {
          lots.set(contribution.lotId, {
            id: contribution.lotId,
            materialType: material.type,
            origin: 'opening_stock',
            sourceManifestId: null,
            supplier: translate(materialFlowStoreMessages, 'openingInventory'),
            receivedKg: contribution.amount,
            simulationTime: 0,
            disposition: 'released',
            dispositionReason: null,
          });
        }
      }
    }
  });
  return lots;
}

function sumMachineInventory(buffers: ReadonlyMap<string, MachineBuffer>): number {
  let total = 0;
  buffers.forEach((buffer) => {
    total += buffer.inputBuffer.reduce((sum, material) => sum + material.amount, 0);
    total += buffer.outputBuffer.reduce((sum, material) => sum + material.amount, 0);
  });
  return total;
}

const INITIAL_INVENTORY_KG = sumMachineInventory(createInitialMachineBuffers());

function createInitialNetwork(): NetworkTopology {
  const segments: ConveyorSegment[] = [];
  const downstreamMap = new Map<string, string[]>();
  const upstreamMap = new Map<string, string[]>();

  // Helper to add a segment
  const addSegment = (
    fromId: string,
    toId: string,
    materialType: MaterialType,
    flowRate: number = 30,
    idSuffix = ''
  ) => {
    const segmentId = `conv-${fromId}-${toId}${idSuffix}`;
    segments.push({
      id: segmentId,
      fromMachineId: fromId,
      toMachineId: toId,
      fromOutputType: materialType,
      capacity: 500, // 500 kg max on conveyor
      currentLoad: 0,
      flowRate: flowRate, // kg/sec
      transitTime: 0, // Resolved from the shared service routes below.
      inTransit: [],
    });

    // Update maps
    const downstream = downstreamMap.get(fromId) ?? [];
    downstream.push(toId);
    downstreamMap.set(fromId, downstream);

    const upstream = upstreamMap.get(toId) ?? [];
    upstream.push(fromId);
    upstreamMap.set(toId, upstream);
  };

  // Silos -> Mills (5 silos distribute across the 4 roller mills for load balancing)
  addSegment('silo-0', 'rm-101', 'wheat_grain', 40);
  addSegment('silo-0', 'rm-102', 'wheat_grain', 40);
  addSegment('silo-1', 'rm-102', 'corn_grain', 40);
  addSegment('silo-1', 'rm-103', 'corn_grain', 40);
  addSegment('silo-2', 'rm-103', 'wheat_grain', 40);
  addSegment('silo-2', 'rm-104', 'wheat_grain', 40);
  addSegment('silo-3', 'rm-104', 'corn_grain', 40);
  addSegment('silo-3', 'rm-101', 'corn_grain', 40);
  addSegment('silo-4', 'rm-102', 'wheat_grain', 40);
  addSegment('silo-4', 'rm-103', 'wheat_grain', 40);

  // Mills -> Sifters (flour output); mirrors the physical spouting (rm[i] -> sifter[i % 3]),
  // so every sifter is fed by the 4 mills (sifter-a by rm-101 & rm-104).
  addSegment('rm-101', 'sifter-a', 'flour', 50);
  addSegment('rm-102', 'sifter-b', 'flour', 50);
  addSegment('rm-103', 'sifter-c', 'flour', 50);
  addSegment('rm-104', 'sifter-a', 'flour', 50);
  addSegment('rm-101', 'sifter-a', 'semolina', 50, '-semolina');
  addSegment('rm-102', 'sifter-b', 'semolina', 50, '-semolina');
  addSegment('rm-103', 'sifter-c', 'semolina', 50, '-semolina');
  addSegment('rm-104', 'sifter-a', 'semolina', 50, '-semolina');

  // Sifters -> Packers
  // Each sifter feeds one packer primarily
  addSegment('sifter-a', 'packer-0', 'flour', 80);
  addSegment('sifter-b', 'packer-1', 'flour', 80);
  addSegment('sifter-c', 'packer-2', 'flour', 80);
  addSegment('sifter-a', 'packer-0', 'semolina', 80, '-semolina');
  addSegment('sifter-b', 'packer-1', 'semolina', 80, '-semolina');
  addSegment('sifter-c', 'packer-2', 'semolina', 80, '-semolina');

  const routes = resolveMaterialTransport(canonicalProcessMachines(), segments);
  routes.forEach((route, index) => {
    segments[index].transitTime = route.transitSeconds ?? 0;
    segments[index].routeLengthMetres = route.lengthMetres;
    segments[index].routeProvenance = route.provenance;
  });
  return { segments, downstreamMap, upstreamMap };
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

/** Data-only snapshots preserve Maps and genealogy, never live action closures. */
export type MaterialFlowData = {
  [K in keyof MaterialFlowState as MaterialFlowState[K] extends (...args: never[]) => unknown
    ? never
    : K]: MaterialFlowState[K];
};

export function cloneMaterialFlowData(
  state: MaterialFlowState | MaterialFlowData
): MaterialFlowData {
  return structuredClone(
    Object.fromEntries(Object.entries(state).filter(([, value]) => typeof value !== 'function'))
  ) as MaterialFlowData;
}

function createMaterialFlowInitializer(snapshot?: MaterialFlowData) {
  return subscribeWithSelector<MaterialFlowState>((set, get) => {
    const initialMachineBuffers = createInitialMachineBuffers();
    let transportKey = '';
    let transportRoutes: ReturnType<typeof resolveMaterialTransport> = [];
    // Ticks of the feed window, oldest first: plant seconds and kg processed
    // per machine. Keyed to the material session, so a restored or reset run
    // never reads the previous run's flow.
    let feedWindow: Array<{ plantSeconds: number; kgByMachine: Map<string, number> }> = [];
    let feedWindowSession = '';
    let feedWindowSeconds = 0;
    // The genealogy retention check (retainGenealogy): on the first tick of a
    // session in this page (a restored record is trimmed at once), then every
    // GENEALOGY_RETENTION_INTERVAL_SECONDS of the material clock. Only the live
    // plant's tick asks for it (planFeed): never a benchmark, never a sandbox.
    let retentionSession = '';
    let retentionAt = 0;
    const recordFeedWindow = (
      sessionId: string,
      plantSeconds: number,
      kgByMachine: Map<string, number>
    ) => {
      if (feedWindowSession !== sessionId) {
        feedWindow = [];
        feedWindowSeconds = 0;
        feedWindowSession = sessionId;
      }
      feedWindow.push({ plantSeconds, kgByMachine });
      feedWindowSeconds += plantSeconds;
      while (
        feedWindow.length > 1 &&
        feedWindowSeconds - feedWindow[0].plantSeconds >= FEED_WINDOW_PLANT_SECONDS
      ) {
        feedWindowSeconds -= feedWindow[0].plantSeconds;
        feedWindow.shift();
      }
    };
    return {
      sessionId: newMaterialSessionId(),
      machineBuffers: initialMachineBuffers,
      network: createInitialNetwork(),
      totalMaterialProcessed: 0,
      totalFlourProduced: 0,
      currentFlowRate: 0,
      currentPackerFlowRate: 0,
      initialInventoryKg: INITIAL_INVENTORY_KG,
      receivedKg: 0,
      wasteKg: 0,
      byproductKg: 0,
      shippedKg: 0,
      manifests: [],
      manifestSequence: 0,
      sourceLots: createInitialSourceLots(initialMachineBuffers),
      productionBatches: [],
      processGenealogy: [],
      wasteSourceContributions: [],
      byproductSourceContributions: [],
      shippedSourceContributions: [],
      lotSequence: 0,
      batchSequence: 0,
      processSequence: 0,
      simulationTime: 0,

      tickMaterialFlow: (
        deltaSeconds,
        productionSpeed,
        productionPlan,
        productQuality,
        options
      ) => {
        const labBench = options?.labBench === true;
        const planFeed = PLAN_ONLY_SILO_FEED && options?.planFeed === true;
        if (options?.planFeed === true && GENEALOGY_RETENTION.enabled) {
          const current = get();
          if (
            retentionSession !== current.sessionId ||
            current.simulationTime < retentionAt ||
            current.simulationTime - retentionAt >= GENEALOGY_RETENTION_INTERVAL_SECONDS
          ) {
            retentionSession = current.sessionId;
            retentionAt = current.simulationTime;
            const retained = retainGenealogy(current);
            if (retained) set(retained);
          }
        }
        if (
          !Number.isFinite(deltaSeconds) ||
          !Number.isFinite(productionSpeed) ||
          deltaSeconds <= 0
        ) {
          return;
        }

        const state = get();
        if (productionSpeed <= 0) {
          // Stopped production processes nothing for these plant seconds.
          recordFeedWindow(state.sessionId, deltaSeconds, new Map());
          if (state.currentFlowRate !== 0 || state.currentPackerFlowRate !== 0) {
            set({ currentFlowRate: 0, currentPackerFlowRate: 0 });
          }
          return;
        }

        const effectiveDelta = deltaSeconds * productionSpeed;
        const newTime = state.simulationTime + effectiveDelta;

        // Reserve the order against all admitted work, not just packed stock.
        // Derive yields from the actual conversions and routes, including sifter
        // loss. Silos are uncommitted stock; every other buffer and belt is WIP.
        // Working if waiting for a physical truck cannot fill the packers with
        // surplus old product and block the following recipe.
        // Keyed by the existing id strings: committedFor asks once per held
        // material per packer, and building a composite string key for every
        // call was most of this tick's cost in the long replay tests. Yields
        // are never negative, so -1 marks a key whose resolution is under way.
        type YieldCache = Map<string, Map<MaterialType, number>>;
        const VISITING = -1;
        const yieldCache = new Map<string, { input: YieldCache; output: YieldCache }>();
        // Outgoing segments per machine, in network order, built on first use.
        let segmentsFrom: Map<string, ConveyorSegment[]> | null = null;
        const finishedYield = (
          machineId: string,
          type: MaterialType,
          input: boolean,
          packerId?: string
        ): number => {
          let packerCache = yieldCache.get(packerId ?? '');
          if (!packerCache) {
            packerCache = { input: new Map(), output: new Map() };
            yieldCache.set(packerId ?? '', packerCache);
          }
          const scopeCache = input ? packerCache.input : packerCache.output;
          let machineCache = scopeCache.get(machineId);
          if (!machineCache) {
            machineCache = new Map();
            scopeCache.set(machineId, machineCache);
          }
          const cached = machineCache.get(type);
          // A cycle back to a key still being resolved contributes nothing.
          if (cached === VISITING) return 0;
          if (cached !== undefined) return cached;
          machineCache.set(type, VISITING);
          const buffer = state.machineBuffers.get(machineId);
          let yieldKg = 0;
          // A machine that is not processing (broken, stopped) converts
          // nothing, so its hopper and the belts into it commit nothing to the
          // order. Counting them starved every lane: a broken mill's full
          // hopper covered the remainder and closed the silos to the healthy
          // mills. Once it runs again the hopper counts on the next tick.
          // Its output buffer still leaves on the belts, so it still counts.
          if (input && buffer?.isProcessing === false) {
            yieldKg = 0;
          } else if (input) {
            const conversion = buffer?.conversionRatios.find((c) => c.inputType === type);
            const total =
              conversion?.outputs.reduce((sum, o) => sum + Math.max(0, o.ratio), 0) ?? 0;
            for (const output of conversion?.outputs ?? []) {
              yieldKg +=
                (Math.max(0, output.ratio) / Math.max(1, total)) *
                finishedYield(machineId, output.type, false, packerId);
            }
          } else if (buffer?.machineType === 'packer') {
            yieldKg =
              type === productionPlan?.finishedMaterial && (!packerId || machineId === packerId)
                ? 1
                : 0;
          } else {
            // A split routes each kg once. The highest yield conservatively
            // reserves it; actual losses reopen demand on the following tick.
            if (!segmentsFrom) {
              segmentsFrom = new Map();
              for (const segment of state.network.segments) {
                const from = segmentsFrom.get(segment.fromMachineId);
                if (from) from.push(segment);
                else segmentsFrom.set(segment.fromMachineId, [segment]);
              }
            }
            for (const segment of segmentsFrom.get(machineId) ?? []) {
              if (segment.fromOutputType === type) {
                yieldKg = Math.max(
                  yieldKg,
                  finishedYield(segment.toMachineId, type, true, packerId)
                );
              }
            }
          }
          machineCache.set(type, yieldKg);
          return yieldKg;
        };
        let feedBudgetKg = Infinity;
        const packerBudgets = new Map<string, number>();
        if (Number.isFinite(productionPlan?.remainingFinishedKg)) {
          const committedFor = (packerId?: string) => {
            let committedKg = 0;
            for (const buffer of state.machineBuffers.values()) {
              if (buffer.machineType === 'silo') continue;
              for (const material of buffer.inputBuffer)
                committedKg +=
                  material.amount * finishedYield(buffer.machineId, material.type, true, packerId);
              for (const material of buffer.outputBuffer)
                committedKg +=
                  material.amount * finishedYield(buffer.machineId, material.type, false, packerId);
            }
            for (const segment of state.network.segments) {
              for (const material of segment.inTransit)
                committedKg +=
                  material.amount *
                  finishedYield(segment.toMachineId, material.type, true, packerId);
            }
            return committedKg;
          };
          const remainingKg = Math.max(0, productionPlan?.remainingFinishedKg ?? 0);
          feedBudgetKg = Math.max(0, remainingKg - committedFor());
          // Share fresh work by rated packing capacity. Two mills feed line 0;
          // an aggregate-only cap leaves it overfilled while other lines idle.
          // Departed stock still reduces the overall cap, so rebalancing cannot
          // admit surplus merely because dispatch withdrew from one line first.
          // Only lines a silo lane can still reach take a share: rm-102 alone
          // feeds sifter-b, and while it is down packer-1's share could never
          // be admitted, capping the live lines at a third each per truck.
          const sourceLanes = state.network.segments.filter(
            (segment) =>
              state.machineBuffers.get(segment.fromMachineId)?.machineType === 'silo' &&
              (!productionPlan?.sourceMaterial ||
                segment.fromOutputType === productionPlan.sourceMaterial)
          );
          const packers = [...state.machineBuffers.values()].filter(
            (b) =>
              b.machineType === 'packer' &&
              sourceLanes.some(
                (segment) =>
                  finishedYield(segment.toMachineId, segment.fromOutputType, true, b.machineId) > 0
              )
          );
          const rate = packers.reduce((sum, b) => sum + Math.max(0, b.processingRate), 0);
          for (const packer of packers)
            packerBudgets.set(
              packer.machineId,
              Math.max(
                0,
                (remainingKg * Math.max(0, packer.processingRate)) / Math.max(1, rate) -
                  committedFor(packer.machineId)
              )
            );
        }

        // Clone buffers for mutation
        const newBuffers = new Map<string, MachineBuffer>();
        state.machineBuffers.forEach((buffer, id) => {
          newBuffers.set(id, {
            ...buffer,
            inputBuffer: buffer.inputBuffer.map((material) => ({
              ...material,
              sourceContributions: cloneSourceContributions(material.sourceContributions),
              productBatches: material.productBatches?.map((batch) => ({ ...batch })),
            })),
            outputBuffer: buffer.outputBuffer.map((material) => ({
              ...material,
              sourceContributions: cloneSourceContributions(material.sourceContributions),
              productBatches: material.productBatches?.map((batch) => ({ ...batch })),
            })),
          });
        });

        // Clone network segments
        const newSegments = state.network.segments.map((seg) => ({
          ...seg,
          inTransit: seg.inTransit.map((transit) => ({
            ...transit,
            sourceContributions: cloneSourceContributions(transit.sourceContributions),
          })),
        }));

        const productionBatches = state.productionBatches.map((batch) => ({
          ...batch,
          sourceContributions: cloneSourceContributions(batch.sourceContributions),
          qcTestIds: [...batch.qcTestIds],
          dispatchManifestIds: [...batch.dispatchManifestIds],
        }));
        const newProcessRecords: ProcessGenealogyRecord[] = [];
        let batchSequence = state.batchSequence;
        let processSequence = state.processSequence;
        let wasteSourceContributions = cloneSourceContributions(state.wasteSourceContributions);
        let byproductSourceContributions = state.byproductSourceContributions;
        let byproductThisTick = 0;

        let instantFlowRate = 0;
        let instantPackerFlowRate = 0;
        const processedKgByMachine = new Map<string, number>();
        let flourProducedThisTick = 0;
        let wasteThisTick = 0;

        const appendPackedBatch = (
          packerId: string,
          materialType: Extract<MaterialType, 'flour' | 'semolina'>,
          amountKg: number,
          sourceContributions: readonly SourceContribution[]
        ): {
          assignments: ProductBatchContribution[];
          writtenOffKg: number;
          writtenOffSources: SourceContribution[];
        } => {
          const assignments: ProductBatchContribution[] = [];
          let writtenOffKg = 0;
          let writtenOffSources: SourceContribution[] = [];
          // Material only joins an open batch of the same disposition, so a
          // held lot never dilutes into a released batch, and held output
          // fills one batch toward the target instead of a fragment per tick.
          const sourceDispositions = sourceContributions.map(
            (contribution) => state.sourceLots.get(contribution.lotId)?.disposition ?? 'released'
          );
          const disposition: MaterialDisposition = sourceDispositions.includes('recalled')
            ? 'recalled'
            : sourceDispositions.includes('hold')
              ? 'hold'
              : 'released';
          let remaining = amountKg;
          while (remaining > GENEALOGY_EPSILON_KG) {
            let batch: ProductionBatch | undefined;
            for (let index = productionBatches.length - 1; index >= 0; index -= 1) {
              const candidate = productionBatches[index];
              if (
                candidate.packerId === packerId &&
                candidate.materialType === materialType &&
                !candidate.sealed &&
                candidate.disposition === disposition &&
                // Untested flour joins only untested flour: on the bench a
                // batch forms awaiting its test, and outside it (a benchmark)
                // it never joins one that is.
                !!candidate.awaitingTest === labBench &&
                // A recalled batch is written off as it forms, so it never
                // holds its produced mass; it still fills toward the target.
                (disposition === 'recalled' || candidate.availableKg === candidate.producedKg)
              ) {
                batch = candidate;
                break;
              }
            }
            if (!batch) {
              batchSequence += 1;
              batch = {
                id: `batch-${String(batchSequence).padStart(5, '0')}`,
                packerId,
                materialType,
                producedKg: 0,
                availableKg: 0,
                simulationTime: newTime,
                sourceContributions: [],
                disposition,
                dispositionReason:
                  disposition === 'released'
                    ? null
                    : translate(materialFlowStoreMessages, 'inheritedDisposition'),
                ...(disposition === 'released'
                  ? {}
                  : {
                      dispositionReasonKey: {
                        catalog: 'materialFlow' as const,
                        key: 'inheritedDisposition',
                      },
                    }),
                qcTestIds: [],
                dispatchManifestIds: [],
                sealed: false,
                ...(labBench ? { awaitingTest: true } : {}),
              };
              productionBatches.push(batch);
            }

            const availableCapacity = Math.max(0, PRODUCT_BATCH_TARGET_KG - batch.producedKg);
            const portion = Math.min(remaining, availableCapacity || remaining);
            const portionSources = scaleSourceContributions(
              sourceContributions,
              amountKg > 0 ? portion / amountKg : 0
            );
            // Mass-weighted, so a batch carries the quality its flour was
            // made at rather than whatever the plant reads when it ships.
            const lineStamp =
              typeof productQuality === 'number'
                ? productQuality
                : productQuality?.[materialType as 'flour' | 'semolina'];
            // Intake (plan item 3.1): flour carries the penalty of its own grain.
            const stamp =
              lineStamp !== undefined && materialType === 'flour' && options?.flourPenalty
                ? Math.max(0, lineStamp - options.flourPenalty(portionSources))
                : lineStamp;
            if (stamp !== undefined && Number.isFinite(stamp)) {
              const previousKg = batch.producedKg;
              batch.qualityScore =
                ((batch.qualityScore ?? stamp) * previousKg + stamp * portion) /
                Math.max(GENEALOGY_EPSILON_KG, previousKg + portion);
            }
            batch.producedKg += portion;
            batch.sourceContributions = mergeSourceContributions(
              batch.sourceContributions,
              portionSources
            );
            batch.sealed = batch.producedKg >= PRODUCT_BATCH_TARGET_KG - GENEALOGY_EPSILON_KG;
            if (disposition === 'recalled') {
              // A recall is terminal, so product packed from a recalled lot is
              // scrapped at formation with the accounting writeOffRecalledMass
              // applies: no available mass, written-off kg on the batch, and
              // the exact portion sources booked to waste by the caller.
              batch.writtenOffKg = (batch.writtenOffKg ?? 0) + portion;
              writtenOffKg += portion;
              writtenOffSources = mergeSourceContributions(writtenOffSources, portionSources);
            } else {
              batch.availableKg += portion;
              assignments.push({ batchId: batch.id, amount: portion });
            }
            remaining -= portion;
          }
          return { assignments, writtenOffKg, writtenOffSources };
        };

        // 1. Process each machine: convert input -> output
        newBuffers.forEach((buffer) => {
          if (!buffer.isProcessing) return;

          // The processing rate is a machine-level budget. Sharing it across
          // material types prevents a multi-material buffer from multiplying
          // the machine's rated throughput.
          let remainingProcessCapacity = buffer.processingRate * effectiveDelta;

          // Process each input material type
          buffer.inputBuffer.forEach((inputMaterial) => {
            if (inputMaterial.amount <= 0 || remainingProcessCapacity <= 0) return;

            const conversion = buffer.conversionRatios.find(
              (c) => c.inputType === inputMaterial.type
            );
            if (!conversion) return;

            const declaredOutputRatio = conversion.outputs.reduce(
              (sum, output) => sum + Math.max(0, output.ratio),
              0
            );
            if (declaredOutputRatio <= 0) return;

            // Defensive normalization prevents malformed ratios above 100%
            // from creating material. Ratios below 100% become recorded waste.
            const outputScale = declaredOutputRatio > 1 ? 1 / declaredOutputRatio : 1;
            const effectiveOutputRatio = Math.min(1, declaredOutputRatio);
            const existingOutputKg = buffer.outputBuffer.reduce(
              (sum, material) => sum + material.amount,
              0
            );
            const outputSpaceKg = Math.max(0, buffer.outputCapacity - existingOutputKg);
            const capacityLimitedInput =
              effectiveOutputRatio > 0 ? outputSpaceKg / effectiveOutputRatio : 0;

            // Calculate how much we can process
            const available = inputMaterial.amount;
            const toProcess = Math.min(available, remainingProcessCapacity, capacityLimitedInput);

            if (toProcess <= 0) return;

            // Withdraw the exact source contribution before changing the aggregate
            // amount, then append this machine to the path carried downstream.
            const inputContributions = appendMachineToPath(
              withdrawSourceContributions(inputMaterial, toProcess),
              buffer.machineId
            );

            // Subtract from input
            inputMaterial.amount -= toProcess;
            remainingProcessCapacity -= toProcess;

            // Add to output based on conversion ratios
            const processOutputs: MaterialAmount[] = [];
            conversion.outputs.forEach(({ type, ratio }) => {
              const outputAmount = toProcess * Math.max(0, ratio) * outputScale;
              const outputContributions = scaleSourceContributions(
                inputContributions,
                toProcess > 0 ? outputAmount / toProcess : 0
              );
              const existingOutput = buffer.outputBuffer.find((o) => o.type === type);
              if (existingOutput) {
                existingOutput.amount += outputAmount;
                existingOutput.sourceContributions = mergeSourceContributions(
                  existingOutput.sourceContributions,
                  outputContributions
                );
              } else {
                buffer.outputBuffer.push({
                  type,
                  amount: outputAmount,
                  sourceContributions: cloneSourceContributions(outputContributions),
                });
              }

              if (buffer.machineType === 'packer' && (type === 'flour' || type === 'semolina')) {
                const packed = appendPackedBatch(
                  buffer.machineId,
                  type,
                  outputAmount,
                  outputContributions
                );
                const packedOutput = buffer.outputBuffer.find((output) => output.type === type);
                if (packedOutput) {
                  packedOutput.productBatches = mergeProductBatchContributions(
                    packedOutput.productBatches,
                    packed.assignments
                  );
                  // Recalled product leaves the packer as waste the moment it
                  // forms; left in the buffer it would hold packer capacity.
                  if (packed.writtenOffKg > 0) {
                    packedOutput.amount -= packed.writtenOffKg;
                    packedOutput.sourceContributions = subtractSourceContributions(
                      packedOutput.sourceContributions,
                      packed.writtenOffSources
                    );
                    wasteThisTick += packed.writtenOffKg;
                    wasteSourceContributions = mergeSourceContributions(
                      wasteSourceContributions,
                      packed.writtenOffSources
                    );
                  }
                }
              }

              processOutputs.push({
                type,
                amount: outputAmount,
                sourceContributions: cloneSourceContributions(outputContributions),
              });

              // Track flour production
              if (type === 'flour' && buffer.machineType === 'plansifter') {
                flourProducedThisTick += outputAmount;
              }
            });
            const processWasteKg = toProcess * (1 - effectiveOutputRatio);
            wasteThisTick += processWasteKg;
            wasteSourceContributions = mergeSourceContributions(
              wasteSourceContributions,
              scaleSourceContributions(
                inputContributions,
                toProcess > 0 ? processWasteKg / toProcess : 0
              )
            );
            processSequence += 1;
            newProcessRecords.push({
              id: `process-${String(processSequence).padStart(7, '0')}`,
              machineId: buffer.machineId,
              inputType: inputMaterial.type,
              inputKg: toProcess,
              outputs: processOutputs,
              wasteKg: processWasteKg,
              sourceContributions: cloneSourceContributions(inputContributions),
              simulationTime: newTime,
            });

            // Defensive check: avoid division by zero (early return already guards this,
            // but add explicit check at point of use for safety)
            processedKgByMachine.set(
              buffer.machineId,
              (processedKgByMachine.get(buffer.machineId) ?? 0) + toProcess
            );
            if (deltaSeconds > 0) {
              instantFlowRate += toProcess / deltaSeconds;
              // Track the final-stage rate separately: only packers represent
              // finished-goods output. The headline throughput must use this, not
              // the all-stage sum (which triple-counts mill + sifter + packer).
              if (buffer.machineType === 'packer') {
                instantPackerFlowRate += toProcess / deltaSeconds;
              }
            }
          });
        });

        // 1b. Millfeed discharge: once a mill's bran + middlings bin reaches
        // MILLFEED_DISCHARGE_KG it empties to the conserved co-product ledger.
        newBuffers.forEach((buffer) => {
          if (buffer.machineType !== 'roller_mill') return;
          let millfeedKg = 0;
          for (const material of buffer.outputBuffer) {
            if (material.type === 'bran' || material.type === 'middlings') {
              millfeedKg += material.amount;
            }
          }
          if (millfeedKg < MILLFEED_DISCHARGE_KG) return;
          for (const material of buffer.outputBuffer) {
            if (material.type !== 'bran' && material.type !== 'middlings') continue;
            byproductSourceContributions = mergeSourceContributions(
              byproductSourceContributions,
              withdrawSourceContributions(material, material.amount)
            );
            byproductThisTick += material.amount;
            material.amount = 0;
          }
        });

        // 2. Move material along conveyors
        newSegments.forEach((segment) => {
          const fromBuffer = newBuffers.get(segment.fromMachineId);
          const toBuffer = newBuffers.get(segment.toMachineId);
          if (!fromBuffer || !toBuffer) return;

          // Check for material arrivals
          const arrivedMaterial = segment.inTransit.filter((t) => t.arrivalTime <= newTime);
          segment.inTransit = segment.inTransit.filter((t) => t.arrivalTime > newTime);

          // Add arrived material to destination input buffer.
          // Mass conservation: a parcel only leaves the belt (currentLoad -= ...)
          // for the amount the destination actually ACCEPTS. Any remainder stays
          // on the belt as a re-queued in-transit parcel that retries shortly.
          // Previously the whole parcel was removed from inTransit while
          // currentLoad was only decremented by the accepted amount - when a
          // destination buffer filled up, currentLoad ratcheted upward until
          // spaceOnConveyor hit 0 and the belt stalled PERMANENTLY (and the
          // rejected material was silently destroyed). With the re-queue, a
          // jammed belt backs up and then recovers once downstream drains.
          // A full destination rejects every arriving parcel; their remainders
          // wait at the belt end together, so this tick's retries of one type
          // share one parcel. Without that a jammed belt re-queued one parcel
          // per tick and an idle plant's save grew by ~3 K chars per game hour.
          const retries = new Map<MaterialType, ConveyorSegment['inTransit'][number]>();
          arrivedMaterial.forEach((arrived) => {
            const totalInput = toBuffer.inputBuffer.reduce((sum, m) => sum + m.amount, 0);
            const spaceAvailable = toBuffer.inputCapacity - totalInput;
            const toAdd = Math.max(0, Math.min(arrived.amount, spaceAvailable));

            if (toAdd > 0) {
              const acceptedContributions = scaleSourceContributions(
                arrived.sourceContributions,
                arrived.amount > 0 ? toAdd / arrived.amount : 0
              );
              const existingInput = toBuffer.inputBuffer.find((m) => m.type === arrived.type);
              if (existingInput) {
                existingInput.amount += toAdd;
                existingInput.sourceContributions = mergeSourceContributions(
                  existingInput.sourceContributions,
                  acceptedContributions
                );
              } else {
                toBuffer.inputBuffer.push({
                  type: arrived.type,
                  amount: toAdd,
                  sourceContributions: acceptedContributions,
                });
              }
              segment.currentLoad = Math.max(0, segment.currentLoad - toAdd);
            }

            const remainder = arrived.amount - toAdd;
            if (remainder > GENEALOGY_EPSILON_KG) {
              // Destination full: keep the remainder on the belt (currentLoad
              // still includes it) and retry in 1s of sim time.
              const remainderContributions = scaleSourceContributions(
                arrived.sourceContributions,
                arrived.amount > 0 ? remainder / arrived.amount : 0
              );
              const retry = retries.get(arrived.type);
              if (retry) {
                retry.amount += remainder;
                retry.sourceContributions = mergeSourceContributions(
                  retry.sourceContributions,
                  remainderContributions
                );
              } else {
                const parcel = {
                  amount: remainder,
                  arrivalTime: newTime + 1,
                  type: arrived.type,
                  sourceContributions: remainderContributions,
                };
                retries.set(arrived.type, parcel);
                segment.inTransit.push(parcel);
              }
            }
          });

          // Select fresh grain at the silo valves. Finished-type lanes also
          // drain earlier grist, retaining the product type and its genealogy.
          const routedMaterial =
            fromBuffer.machineType === 'silo' ? productionPlan?.sourceMaterial : undefined;
          if (routedMaterial && segment.fromOutputType !== routedMaterial) return;
          if (planFeed && fromBuffer.machineType === 'silo') {
            // No plan, no grain: unbudgeted, every valve fed both grains to
            // every mill, and at the slider's top the packers filled with
            // semolina no order took until a lane jammed (PLAN_ONLY_SILO_FEED).
            if (!productionPlan) return;
            // One grain to a hopper: the next waits until the last is milled
            // and off the belts into it.
            if (
              toBuffer.inputBuffer.some(
                (m) =>
                  m.type !== segment.fromOutputType &&
                  GRAIN_TYPES.has(m.type) &&
                  m.amount > GENEALOGY_EPSILON_KG
              ) ||
              newSegments.some(
                (other) =>
                  other.toMachineId === segment.toMachineId &&
                  other.inTransit.some(
                    (parcel) =>
                      parcel.type !== segment.fromOutputType &&
                      GRAIN_TYPES.has(parcel.type) &&
                      parcel.amount > GENEALOGY_EPSILON_KG
                  )
              )
            )
              return;
          }
          // A silo valve stays shut to a machine that is not processing, with
          // or without an order: grain admitted there would sit in its hopper.
          if (fromBuffer.machineType === 'silo' && !toBuffer.isProcessing) return;
          if (
            segment.routeProvenance === 'unresolved' ||
            !Number.isFinite(segment.transitTime) ||
            segment.transitTime <= 0
          )
            return;

          // Move material from source output to conveyor
          const outputMaterial = fromBuffer.outputBuffer.find(
            (m) => m.type === segment.fromOutputType
          );
          if (outputMaterial && outputMaterial.amount > 0) {
            const spaceOnConveyor = segment.capacity - segment.currentLoad;
            const flowThisTick = segment.flowRate * effectiveDelta;
            const sourceYield =
              fromBuffer.machineType === 'silo' && Number.isFinite(feedBudgetKg)
                ? finishedYield(segment.toMachineId, segment.fromOutputType, true)
                : 0;
            const orderFeedLimit =
              fromBuffer.machineType === 'silo' && Number.isFinite(feedBudgetKg)
                ? sourceYield > 0
                  ? feedBudgetKg / sourceYield
                  : 0
                : Infinity;
            let toMove = Math.min(
              outputMaterial.amount,
              flowThisTick,
              spaceOnConveyor,
              orderFeedLimit
            );
            if (sourceYield > 0) {
              for (const [packerId, budget] of packerBudgets) {
                const yieldKg = finishedYield(
                  segment.toMachineId,
                  segment.fromOutputType,
                  true,
                  packerId
                );
                if (yieldKg > 0) toMove = Math.min(toMove, budget / yieldKg);
              }
              feedBudgetKg = Math.max(0, feedBudgetKg - toMove * sourceYield);
              for (const [packerId, budget] of packerBudgets) {
                packerBudgets.set(
                  packerId,
                  Math.max(
                    0,
                    budget -
                      toMove *
                        finishedYield(segment.toMachineId, segment.fromOutputType, true, packerId)
                  )
                );
              }
            }

            if (toMove > 0) {
              const sourceContributions = withdrawSourceContributions(outputMaterial, toMove);
              outputMaterial.amount -= toMove;
              segment.currentLoad += toMove;
              segment.inTransit.push({
                amount: toMove,
                arrivalTime: newTime + segment.transitTime,
                type: segment.fromOutputType,
                sourceContributions,
              });
            }
          }
        });

        // Clean up zero-amount materials
        newBuffers.forEach((buffer) => {
          buffer.inputBuffer = buffer.inputBuffer.filter(
            (material) => material.amount > GENEALOGY_EPSILON_KG
          );
          buffer.outputBuffer = buffer.outputBuffer.filter(
            (material) => material.amount > GENEALOGY_EPSILON_KG
          );
        });

        const boundedProductionBatches = retainShippedBatchWindow(productionBatches);
        recordFeedWindow(state.sessionId, deltaSeconds, processedKgByMachine);

        set({
          machineBuffers: newBuffers,
          network: { ...state.network, segments: newSegments },
          simulationTime: newTime,
          totalMaterialProcessed: state.totalMaterialProcessed + instantFlowRate * deltaSeconds,
          totalFlourProduced: state.totalFlourProduced + flourProducedThisTick,
          currentFlowRate: instantFlowRate,
          currentPackerFlowRate: instantPackerFlowRate,
          wasteKg: state.wasteKg + wasteThisTick,
          byproductKg: state.byproductKg + byproductThisTick,
          productionBatches: boundedProductionBatches,
          batchSequence,
          processSequence,
          processGenealogy: [...state.processGenealogy, ...newProcessRecords].slice(
            -MAX_PROCESS_GENEALOGY_RECORDS
          ),
          wasteSourceContributions,
          byproductSourceContributions,
        });
      },

      syncTransportGeometry: (machines) => {
        const state = get();
        const key =
          spoutMachineKey(machines) +
          state.network.segments
            .map(({ fromMachineId, toMachineId }) => `${fromMachineId}>${toMachineId}`)
            .join('|');
        if (key !== transportKey) {
          transportRoutes = resolveMaterialTransport(machines, state.network.segments);
          transportKey = key;
        }
        const changed = state.network.segments.some((segment, index) => {
          const route = transportRoutes[index];
          return (
            segment.transitTime !== (route.transitSeconds ?? 0) ||
            segment.routeLengthMetres !== route.lengthMetres ||
            segment.routeProvenance !== route.provenance
          );
        });
        if (!changed) return;
        // Keep parcel arrival timestamps and genealogy unchanged. Only future
        // departures use the new route duration. Working if relocation cannot
        // teleport material already traveling through the prior layout.
        set({
          network: {
            ...state.network,
            segments: state.network.segments.map((segment, index) => ({
              ...segment,
              transitTime: transportRoutes[index].transitSeconds ?? 0,
              routeLengthMetres: transportRoutes[index].lengthMetres,
              routeProvenance: transportRoutes[index].provenance,
            })),
          },
        });
      },

      syncMachineProcessing: (machines) => {
        const state = get();
        let changed = false;
        const newBuffers = new Map(state.machineBuffers);

        for (const machine of machines) {
          const buffer = newBuffers.get(machine.id);
          if (!buffer) continue;
          // 'running' and 'warning' machines process; idle/critical/stopped don't.
          const shouldProcess = machine.status === 'running' || machine.status === 'warning';
          if (buffer.isProcessing !== shouldProcess) {
            newBuffers.set(machine.id, { ...buffer, isProcessing: shouldProcess });
            changed = true;
          }
        }

        if (changed) {
          set({ machineBuffers: newBuffers });
        }
      },

      receiveGrainDelivery: (amountKg: number, details) => {
        if (!Number.isFinite(amountKg) || amountKg <= 0) return 0;
        const state = get();

        // Find the emptiest silo (least total stored grain)
        let emptiest: MachineBuffer | null = null;
        let emptiestTotal = Infinity;
        state.machineBuffers.forEach((buffer) => {
          if (buffer.machineType !== 'silo') return;
          const siloIndex = Number.parseInt(buffer.machineId.replace('silo-', ''), 10) || 0;
          const siloMaterial: Extract<MaterialType, 'wheat_grain' | 'corn_grain'> =
            siloIndex % 2 === 0 ? 'wheat_grain' : 'corn_grain';
          if (details?.materialType && details.materialType !== siloMaterial) return;
          const total = buffer.outputBuffer.reduce((sum, m) => sum + m.amount, 0);
          if (total < emptiestTotal) {
            emptiestTotal = total;
            emptiest = buffer;
          }
        });
        if (!emptiest) return 0;

        // Intake's named silo, where it stores this grain and has room.
        const named = details?.siloId ? state.machineBuffers.get(details.siloId) : undefined;
        if (named && named.machineType === 'silo') {
          const namedIndex = Number.parseInt(named.machineId.replace('silo-', ''), 10) || 0;
          const namedMaterial = namedIndex % 2 === 0 ? 'wheat_grain' : 'corn_grain';
          const namedTotal = named.outputBuffer.reduce((sum, m) => sum + m.amount, 0);
          if (
            (!details?.materialType || details.materialType === namedMaterial) &&
            named.outputCapacity - namedTotal > 0
          ) {
            emptiest = named;
            emptiestTotal = namedTotal;
          }
        }

        const target: MachineBuffer = emptiest;
        // Even silo indices store wheat, odd store corn (matches initial fill)
        const siloIndex = Number.parseInt(target.machineId.replace('silo-', ''), 10) || 0;
        const grainType: MaterialType = siloIndex % 2 === 0 ? 'wheat_grain' : 'corn_grain';
        const space = target.outputCapacity - emptiestTotal;
        const toAdd = Math.max(0, Math.min(amountKg, space));
        if (toAdd <= 0) return 0;

        const newBuffers = new Map(state.machineBuffers);
        const newOutput: MaterialAmount[] = target.outputBuffer.map((material) => ({
          ...material,
          sourceContributions: cloneSourceContributions(material.sourceContributions),
          productBatches: material.productBatches?.map((batch) => ({ ...batch })),
        }));
        const manifestSequence = state.manifestSequence + 1;
        const lotSequence = state.lotSequence + 1;
        const manifestId = `receiving-${String(manifestSequence).padStart(4, '0')}`;
        const lotId = `lot-${String(lotSequence).padStart(5, '0')}`;
        const contribution: SourceContribution = {
          lotId,
          amount: toAdd,
          path: [target.machineId],
        };
        const existing = newOutput.find((m) => m.type === grainType);
        if (existing) {
          existing.amount += toAdd;
          existing.sourceContributions = mergeSourceContributions(existing.sourceContributions, [
            contribution,
          ]);
        } else {
          newOutput.push({ type: grainType, amount: toAdd, sourceContributions: [contribution] });
        }
        newBuffers.set(target.machineId, { ...target, outputBuffer: newOutput });
        const manifest: MaterialManifest = {
          id: manifestId,
          kind: 'receiving',
          dock: 'receiving',
          requestedKg: amountKg,
          actualKg: toAdd,
          materials: [{ type: grainType, amount: toAdd }],
          sourceLots: [contribution],
          productBatches: [],
          simulationTime: state.simulationTime,
          ...(details?.gameClock ? { gameClock: { ...details.gameClock } } : {}),
        };
        const sourceLots = new Map(state.sourceLots);
        sourceLots.set(lotId, {
          id: lotId,
          materialType: grainType,
          origin: 'receiving',
          sourceManifestId: manifestId,
          supplier:
            details?.supplier?.trim() ||
            translate(materialFlowStoreMessages, 'scheduledFarmIntake'),
          ...(details?.supplier?.trim() ? {} : { supplierKey: 'scheduledFarmIntake' as const }),
          receivedKg: toAdd,
          simulationTime: state.simulationTime,
          disposition: 'released',
          dispositionReason: null,
          ...(details?.crop ? { crop: { ...details.crop } } : {}),
        });
        // Evict the oldest released lots only. A held or recalled lot is bound
        // by its quality alert, and the save rejects an open alert whose lot is
        // missing ('Unbound source hold'), so it stays until it is released,
        // as held and recalled batches do; those are bounded by QC actions.
        if (sourceLots.size > MAX_SOURCE_LOTS) {
          let excess = sourceLots.size - MAX_SOURCE_LOTS;
          for (const [id, lot] of sourceLots) {
            if (excess <= 0) break;
            if (lot.disposition !== 'released') continue;
            sourceLots.delete(id);
            excess -= 1;
          }
        }
        set({
          machineBuffers: newBuffers,
          receivedKg: state.receivedKg + toAdd,
          manifests: [...state.manifests.slice(-(MAX_MATERIAL_MANIFESTS - 1)), manifest],
          manifestSequence,
          sourceLots,
          lotSequence,
        });
        return toAdd;
      },

      shipFinishedGoods: (amountKg, preferredMaterial, details) => {
        if (!Number.isFinite(amountKg) || amountKg <= 0) return 0;
        const state = get();
        const newBuffers = new Map(state.machineBuffers);
        const materials = new Map<MaterialType, number>();
        const productBatches = state.productionBatches.map((batch) => ({
          ...batch,
          sourceContributions: cloneSourceContributions(batch.sourceContributions),
          qcTestIds: [...batch.qcTestIds],
          dispatchManifestIds: [...batch.dispatchManifestIds],
        }));
        const shippedBatchContributions: ProductBatchContribution[] = [];
        let shippedSourceContributions: SourceContribution[] = [];
        let remaining = amountKg;
        // The plan's allocation, by batch: what may still be taken of each.
        const wanted = details?.loads ? new Map<string, number>() : null;
        for (const load of details?.loads ?? [])
          if (load.kg > 0) wanted!.set(load.batchId, (wanted!.get(load.batchId) ?? 0) + load.kg);

        // Prefer the requested product across every packer before mixed fallback.
        // Both product order and machine order remain deterministic.
        const materialOrder: ReadonlyArray<Extract<MaterialType, 'flour' | 'semolina'>> =
          preferredMaterial === 'semolina' ? ['semolina', 'flour'] : ['flour', 'semolina'];
        for (const materialType of materialOrder) {
          if (remaining <= 0) break;
          for (const machineId of ['packer-0', 'packer-1', 'packer-2']) {
            if (remaining <= 0) break;
            const buffer = newBuffers.get(machineId);
            if (!buffer) continue;

            const outputBuffer = buffer.outputBuffer.map((material) => ({
              ...material,
              sourceContributions: cloneSourceContributions(material.sourceContributions),
              productBatches: material.productBatches?.map((batch) => ({ ...batch })),
            }));
            const material = outputBuffer.find((entry) => entry.type === materialType);
            if (!material || material.amount <= 0) continue;
            const batchContributions = material.productBatches ?? [];
            for (const contribution of batchContributions) {
              if (remaining <= 0) break;
              const batch = productBatches.find(
                (candidate) => candidate.id === contribution.batchId
              );
              if (
                !batch ||
                batch.disposition !== 'released' ||
                batch.awaitingTest ||
                batch.availableKg <= 0
              )
                continue;
              const toShip = Math.min(
                contribution.amount,
                batch.availableKg,
                remaining,
                wanted ? (wanted.get(batch.id) ?? 0) : Infinity
              );
              if (toShip <= 0) continue;
              if (wanted) wanted.set(batch.id, (wanted.get(batch.id) ?? 0) - toShip);

              contribution.amount -= toShip;
              material.amount -= toShip;
              remaining -= toShip;
              batch.availableKg -= toShip;
              batch.sealed = true;
              if (batch.availableKg <= GENEALOGY_EPSILON_KG) {
                batch.availableKg = 0;
                batch.disposition = 'shipped';
                batch.dispositionReason = translate(materialFlowStoreMessages, 'fullyDispatched');
                batch.dispositionReasonKey = { catalog: 'materialFlow', key: 'fullyDispatched' };
              }
              materials.set(materialType, (materials.get(materialType) ?? 0) + toShip);
              shippedBatchContributions.push({ batchId: batch.id, amount: toShip });
              const batchShipmentSources = scaleSourceContributions(
                batch.sourceContributions,
                batch.producedKg > 0 ? toShip / batch.producedKg : 0
              );
              shippedSourceContributions = mergeSourceContributions(
                shippedSourceContributions,
                batchShipmentSources
              );
              material.sourceContributions = subtractSourceContributions(
                material.sourceContributions,
                batchShipmentSources
              );
            }

            material.productBatches = batchContributions.filter(
              (contribution) => contribution.amount > GENEALOGY_EPSILON_KG
            );

            newBuffers.set(machineId, {
              ...buffer,
              outputBuffer: outputBuffer.filter(
                (material) => material.amount > GENEALOGY_EPSILON_KG
              ),
            });
          }
        }

        const actualKg = amountKg - remaining;
        if (actualKg <= 0) return 0;

        const manifestSequence = state.manifestSequence + 1;
        const manifestId = `shipping-${String(manifestSequence).padStart(4, '0')}`;
        // What each order was loaded with: the plan's parts, in its order, up
        // to what of each batch actually left.
        let orderLoads: ShipmentLoad[] | undefined;
        if (details?.loads) {
          const left = new Map<string, number>();
          for (const shipped of shippedBatchContributions)
            left.set(shipped.batchId, (left.get(shipped.batchId) ?? 0) + shipped.amount);
          orderLoads = [];
          for (const load of details.loads) {
            const kg = Math.min(load.kg, left.get(load.batchId) ?? 0);
            if (kg <= GENEALOGY_EPSILON_KG) continue;
            left.set(load.batchId, (left.get(load.batchId) ?? 0) - kg);
            orderLoads.push({ batchId: load.batchId, orderId: load.orderId, kg });
          }
        }
        for (const shippedBatch of shippedBatchContributions) {
          const batch = productBatches.find((candidate) => candidate.id === shippedBatch.batchId);
          if (batch && !batch.dispatchManifestIds.includes(manifestId)) {
            batch.dispatchManifestIds.push(manifestId);
          }
        }
        const manifest: MaterialManifest = {
          id: manifestId,
          kind: 'shipping',
          dock: 'shipping',
          requestedKg: amountKg,
          actualKg,
          materials: [...materials.entries()].map(([type, amount]) => ({ type, amount })),
          sourceLots: shippedSourceContributions,
          productBatches: mergeProductBatchContributions([], shippedBatchContributions),
          simulationTime: state.simulationTime,
          ...(details?.gameClock ? { gameClock: { ...details.gameClock } } : {}),
          ...(details?.orderId ? { orderId: details.orderId } : {}),
          ...(orderLoads ? { orderLoads } : {}),
        };
        const cumulativeShippedSources = mergeSourceContributions(
          state.shippedSourceContributions,
          shippedSourceContributions
        );
        set({
          machineBuffers: newBuffers,
          shippedKg: state.shippedKg + actualKg,
          manifests: [...state.manifests.slice(-(MAX_MATERIAL_MANIFESTS - 1)), manifest],
          manifestSequence,
          productionBatches: productBatches,
          shippedSourceContributions: cumulativeShippedSources,
        });
        return actualKg;
      },

      setBatchDisposition: (batchIds, disposition, reason, qcTestId, reasonKey) => {
        const requested = new Set(batchIds);
        const changed: string[] = [];
        set((state) => {
          const newlyRecalled = new Set<string>();
          const productionBatches = state.productionBatches.map((batch) => {
            if (!requested.has(batch.id) || batch.disposition === 'shipped') return batch;
            // A recall is a terminal product disposition. A later passing retest
            // may release a hold, but must never reverse a recall - not even in
            // two steps (recalled -> hold -> released).
            if (batch.disposition === 'recalled' && disposition !== 'recalled') return batch;
            changed.push(batch.id);
            if (disposition === 'recalled' && batch.disposition !== 'recalled')
              newlyRecalled.add(batch.id);
            // A test's result is the test the bench was waiting for.
            const { awaitingTest: _tested, ...untagged } = batch;
            return {
              ...withDispositionReason(qcTestId ? untagged : batch, reason, reasonKey),
              disposition,
              sealed: batch.sealed || disposition !== 'released',
              qcTestIds:
                qcTestId && !batch.qcTestIds.includes(qcTestId)
                  ? [...batch.qcTestIds, qcTestId]
                  : batch.qcTestIds,
            };
          });
          return {
            productionBatches,
            ...writeOffRecalledMass(state, productionBatches, newlyRecalled),
          };
        });
        return changed;
      },

      setLotDisposition: (lotIds, disposition, reason, retainedHolds, reasonKey) => {
        const requested = new Set(lotIds);
        // A lot merged into earlier stock (genealogy retention) goes with it.
        for (const lot of get().sourceLots.values())
          if (lot.mergedInto && requested.has(lot.mergedInto)) requested.add(lot.id);
        const affectedBatchIds: string[] = [];
        set((state) => {
          const sourceLots = new Map(state.sourceLots);
          for (const lotId of requested) {
            const lot = sourceLots.get(lotId);
            if (!lot) continue;
            if (lot.disposition === 'recalled' && disposition !== 'recalled') continue;
            sourceLots.set(lotId, {
              ...withDispositionReason(lot, reason, reasonKey),
              disposition,
            });
          }

          const newlyRecalled = new Set<string>();
          const productionBatches = state.productionBatches.map((batch) => {
            if (batch.disposition === 'shipped' || batch.disposition === 'recalled') return batch;
            if (!batch.sourceContributions.some((source) => requested.has(source.lotId)))
              return batch;
            const sourceDispositions = batch.sourceContributions.map(
              (source) => sourceLots.get(source.lotId)?.disposition ?? 'released'
            );
            const nextDisposition = sourceDispositions.includes('recalled')
              ? 'recalled'
              : sourceDispositions.includes('hold')
                ? 'hold'
                : disposition;
            // Releasing lots only ever releases. A batch that still draws on a
            // lot held elsewhere (an open supplier alert) keeps the disposition
            // it has: a retest that released it stays released.
            if (disposition === 'released' && nextDisposition !== 'released') return batch;
            // Releasing a lot does not release a batch held on its own evidence
            // (a failed test of that batch, or its own open investigation).
            if (
              nextDisposition === 'released' &&
              batch.disposition === 'hold' &&
              retainedHolds?.has(batch.id)
            )
              return batch;
            affectedBatchIds.push(batch.id);
            if (nextDisposition === 'recalled') newlyRecalled.add(batch.id);
            return {
              ...withDispositionReason(batch, reason, reasonKey),
              disposition: nextDisposition,
              sealed: batch.sealed || nextDisposition !== 'released',
            };
          });
          return {
            sourceLots,
            productionBatches,
            ...writeOffRecalledMass(state, productionBatches, newlyRecalled),
          };
        });
        return affectedBatchIds;
      },

      getBatchTrace: (batchId) => {
        const state = get();
        const batch = state.productionBatches.find((candidate) => candidate.id === batchId);
        if (!batch) return null;
        const grouped = new Map<string, { amount: number; paths: string[][] }>();
        for (const contribution of batch.sourceContributions) {
          const current = grouped.get(contribution.lotId) ?? { amount: 0, paths: [] };
          current.amount += contribution.amount;
          if (!current.paths.some((path) => path.join('>') === contribution.path.join('>'))) {
            current.paths.push([...contribution.path]);
          }
          grouped.set(contribution.lotId, current);
        }
        return {
          batch,
          sourceLots: [...grouped.entries()].flatMap(([lotId, contribution]) => {
            const lot = state.sourceLots.get(lotId);
            return lot ? [{ lot, ...contribution }] : [];
          }),
        };
      },

      sealBatch: (batchId) =>
        set((state) => {
          const index = state.productionBatches.findIndex((batch) => batch.id === batchId);
          if (index < 0 || state.productionBatches[index].sealed) return state;
          const productionBatches = [...state.productionBatches];
          productionBatches[index] = { ...productionBatches[index], sealed: true };
          return { productionBatches };
        }),

      setAwaitingTest: (batchIds) => {
        const requested = new Set(batchIds);
        const changed: string[] = [];
        set((state) => {
          const productionBatches = state.productionBatches.map((batch) => {
            if (!requested.has(batch.id) || batch.awaitingTest) return batch;
            if (batch.disposition !== 'released' || batch.availableKg <= 0) return batch;
            changed.push(batch.id);
            return { ...batch, awaitingTest: true, sealed: true };
          });
          return changed.length > 0 ? { productionBatches } : state;
        });
        return changed;
      },

      getDispatchableFinishedGoods: () =>
        get().productionBatches.reduce(
          (sum, batch) =>
            sum + (batch.disposition === 'released' && !batch.awaitingTest ? batch.availableKg : 0),
          0
        ),

      getGenealogyBalance: () => {
        const state = get();
        const sumContributions = (contributions: readonly SourceContribution[] | undefined) =>
          (contributions ?? []).reduce((sum, contribution) => sum + contribution.amount, 0);
        let inventoryKg = 0;
        state.machineBuffers.forEach((buffer) => {
          for (const material of buffer.inputBuffer) {
            inventoryKg += sumContributions(material.sourceContributions);
          }
          for (const material of buffer.outputBuffer) {
            inventoryKg += sumContributions(material.sourceContributions);
          }
        });
        const inTransitKg = state.network.segments.reduce(
          (segmentTotal, segment) =>
            segmentTotal +
            segment.inTransit.reduce(
              (parcelTotal, parcel) => parcelTotal + sumContributions(parcel.sourceContributions),
              0
            ),
          0
        );
        const wasteKg = sumContributions(state.wasteSourceContributions);
        const byproductKg = sumContributions(state.byproductSourceContributions);
        const shippedKg = sumContributions(state.shippedSourceContributions);
        const expectedKg = state.initialInventoryKg + state.receivedKg;
        const accountedKg = inventoryKg + inTransitKg + wasteKg + byproductKg + shippedKg;
        return {
          expectedKg,
          inventoryKg,
          inTransitKg,
          wasteKg,
          byproductKg,
          shippedKg,
          accountedKg,
          errorKg: expectedKg - accountedKg,
        };
      },

      getMaterialBalance: () => {
        const state = get();
        const inventoryKg = sumMachineInventory(state.machineBuffers);
        // currentLoad is the conserved mass represented by inTransit parcels.
        // Summing both would double-count the same material.
        const inTransitKg = state.network.segments.reduce(
          (sum, segment) => sum + segment.currentLoad,
          0
        );
        const expectedKg = state.initialInventoryKg + state.receivedKg;
        const accountedKg =
          inventoryKg + inTransitKg + state.wasteKg + state.byproductKg + state.shippedKg;
        return {
          initialKg: state.initialInventoryKg,
          receivedKg: state.receivedKg,
          inventoryKg,
          inTransitKg,
          wasteKg: state.wasteKg,
          byproductKg: state.byproductKg,
          shippedKg: state.shippedKg,
          expectedKg,
          accountedKg,
          errorKg: expectedKg - accountedKg,
        };
      },

      getMachineBuffer: (machineId: string) => {
        return get().machineBuffers.get(machineId);
      },

      getMachineFeedRate: (machineId: string) => {
        if (feedWindowSession !== get().sessionId || feedWindowSeconds <= 0) return 0;
        let kg = 0;
        for (const entry of feedWindow) kg += entry.kgByMachine.get(machineId) ?? 0;
        return kg / feedWindowSeconds;
      },

      isMachineUnfed: (machineId: string) => {
        if (!get().hasFeedRecord()) return bufferWorksNothing(get().machineBuffers.get(machineId));
        for (const entry of feedWindow)
          if ((entry.kgByMachine.get(machineId) ?? 0) > 0) return false;
        return true;
      },

      hasFeedRecord: () =>
        feedWindowSession === get().sessionId &&
        feedWindowSeconds >= FEED_WINDOW_PLANT_SECONDS - 1e-9,

      getConveyorLoad: (segmentId: string) => {
        const segment = get().network.segments.find((s) => s.id === segmentId);
        return segment?.currentLoad ?? 0;
      },

      getTotalInputBuffer: (machineId: string) => {
        const buffer = get().machineBuffers.get(machineId);
        if (!buffer) return 0;
        return buffer.inputBuffer.reduce((sum, m) => sum + m.amount, 0);
      },

      getTotalOutputBuffer: (machineId: string) => {
        const buffer = get().machineBuffers.get(machineId);
        if (!buffer) return 0;
        return buffer.outputBuffer.reduce((sum, m) => sum + m.amount, 0);
      },

      resetMaterialFlow: () => {
        feedWindow = [];
        feedWindowSeconds = 0;
        const machineBuffers = createInitialMachineBuffers();
        set({
          sessionId: newMaterialSessionId(),
          machineBuffers,
          network: createInitialNetwork(),
          totalMaterialProcessed: 0,
          totalFlourProduced: 0,
          currentFlowRate: 0,
          currentPackerFlowRate: 0,
          initialInventoryKg: INITIAL_INVENTORY_KG,
          receivedKg: 0,
          wasteKg: 0,
          byproductKg: 0,
          shippedKg: 0,
          manifests: [],
          manifestSequence: 0,
          sourceLots: createInitialSourceLots(machineBuffers),
          productionBatches: [],
          processGenealogy: [],
          wasteSourceContributions: [],
          byproductSourceContributions: [],
          shippedSourceContributions: [],
          lotSequence: 0,
          batchSequence: 0,
          processSequence: 0,
          simulationTime: 0,
        });
      },
      ...(snapshot ? cloneMaterialFlowData(snapshot) : {}),
    };
  });
}

export const createMaterialFlowStore = (snapshot?: MaterialFlowData) =>
  create<MaterialFlowState>()(createMaterialFlowInitializer(snapshot));

export const useMaterialFlowStore = createMaterialFlowStore();
